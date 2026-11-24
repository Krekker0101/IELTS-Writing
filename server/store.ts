import fs from 'fs';
import path from 'path';
import type {
  AppDatabase,
  ErrorJournalEntry,
  LeaderboardEntry,
  Submission,
  TaskEvaluation,
  TextAnnotation,
  UserProfile,
} from '../src/types/ielts.ts';
import { INITIAL_DB } from './seedData.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readDb(): AppDatabase {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) {
    const fresh = structuredClone(INITIAL_DB);
    writeDb(fresh);
    return fresh;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppDatabase>;
    return {
      tasks: Array.isArray(parsed.tasks) && parsed.tasks.length > 0 ? parsed.tasks : structuredClone(INITIAL_DB.tasks),
      mockTests: Array.isArray(parsed.mockTests) && parsed.mockTests.length > 0 ? parsed.mockTests : structuredClone(INITIAL_DB.mockTests),
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
      errorJournal: Array.isArray(parsed.errorJournal) ? parsed.errorJournal : [],
      exercises: Array.isArray(parsed.exercises) ? parsed.exercises : [],
      flashcards: Array.isArray(parsed.flashcards) ? parsed.flashcards : [],
      complaints: Array.isArray(parsed.complaints) ? parsed.complaints : [],
      drafts: parsed.drafts && typeof parsed.drafts === 'object' ? parsed.drafts : {},
      settings: parsed.settings ?? structuredClone(INITIAL_DB.settings),
      speakingTopics:
        Array.isArray(parsed.speakingTopics) && parsed.speakingTopics.length > 0
          ? parsed.speakingTopics
          : structuredClone(INITIAL_DB.speakingTopics),
      speakingMockTests:
        Array.isArray(parsed.speakingMockTests) && parsed.speakingMockTests.length > 0
          ? parsed.speakingMockTests
          : structuredClone(INITIAL_DB.speakingMockTests),
      speakingSessions: Array.isArray(parsed.speakingSessions) ? parsed.speakingSessions : [],
      userProfile: {
        ...structuredClone(INITIAL_DB.userProfile),
        ...(parsed.userProfile ?? {}),
      },
      leaderboard:
        Array.isArray(parsed.leaderboard) && parsed.leaderboard.length > 0
          ? parsed.leaderboard
          : structuredClone(INITIAL_DB.leaderboard),
    };
  } catch {
    const fresh = structuredClone(INITIAL_DB);
    writeDb(fresh);
    return fresh;
  }
}

export function writeDb(db: AppDatabase): void {
  ensureDataDir();
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function roundToHalfBand(score: number): number {
  const clamped = Math.max(0, Math.min(9, score));
  return Math.round(clamped * 2) / 2;
}

export function calculateOverallWritingBand(task1Band: number, task2Band: number): number {
  // Official IELTS Writing weighting: Task 2 carries double weight of Task 1
  const weighted = (task1Band + task2Band * 2) / 3;
  return roundToHalfBand(weighted);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function rebuildErrorJournal(
  submissions: Submission[],
  previousJournal: ErrorJournalEntry[]
): ErrorJournalEntry[] {
  const streakMap = new Map<string, { streak: number; mastered: boolean }>();
  for (const entry of previousJournal) {
    streakMap.set(entry.key, { streak: entry.masteryStreak, mastered: entry.mastered });
  }

  let totalWordsEvaluated = 0;
  const bucket = new Map<
    string,
    {
      key: string;
      subRule: string;
      category: TextAnnotation['category'];
      occurrences: number;
      lastSeenAt: string;
      examples: ErrorJournalEntry['examples'];
    }
  >();

  for (const sub of submissions) {
    const parts = [sub.task1, sub.task2].filter(Boolean);
    for (const part of parts) {
      if (!part) continue;
      // Use latest revision for active error state, or first revision to capture original learning mistakes
      const latest = part.revisions[part.revisions.length - 1];
      if (!latest) continue;
      totalWordsEvaluated += Math.max(1, latest.wordCount);

      const confirmedErrors = latest.evaluation.annotations.filter((a) => a.severity === 'error');
      for (const ann of confirmedErrors) {
        const subRule = ann.subRule || ann.category;
        const key = `${ann.category}::${subRule}`.toLowerCase();
        const existing = bucket.get(key);
        const example = {
          submissionId: sub.id,
          taskTitle: part.taskTitle,
          originalPhrase: ann.originalPhrase,
          correction: ann.correction,
          explanation: ann.explanation,
          createdAt: latest.createdAt,
        };
        if (existing) {
          existing.occurrences += 1;
          if (latest.createdAt > existing.lastSeenAt) {
            existing.lastSeenAt = latest.createdAt;
          }
          if (existing.examples.length < 20) {
            existing.examples.unshift(example);
          }
        } else {
          bucket.set(key, {
            key,
            subRule,
            category: ann.category,
            occurrences: 1,
            lastSeenAt: latest.createdAt,
            examples: [example],
          });
        }
      }
    }
  }

  const denom = Math.max(100, totalWordsEvaluated);
  const result: ErrorJournalEntry[] = [];
  for (const item of bucket.values()) {
    const prev = streakMap.get(item.key);
    result.push({
      key: item.key,
      subRule: item.subRule,
      category: item.category,
      occurrences: item.occurrences,
      totalWordsEvaluated,
      normalizedPer1000Words: Number(((item.occurrences / denom) * 1000).toFixed(2)),
      masteryStreak: prev?.streak ?? 0,
      mastered: prev?.mastered ?? false,
      lastSeenAt: item.lastSeenAt,
      examples: item.examples,
    });
  }

  result.sort((a, b) => b.occurrences - a.occurrences);
  return result;
}

export function updateEvaluationWithServerAnchors(
  essayText: string,
  evaluation: TaskEvaluation,
  options?: {
    taskNumber?: 1 | 2;
    strictness?: 'standard' | 'strict';
  }
): TaskEvaluation {
  const anchored: TextAnnotation[] = [];
  const occupiedRanges: Array<{ start: number; end: number }> = [];
  let cursorHint = 0;

  for (let i = 0; i < (evaluation.annotations || []).length; i++) {
    const raw = evaluation.annotations[i];
    const phrase = (raw.originalPhrase || '').trim();
    if (!phrase || phrase.length > 260) continue;

    // Locate exact substring in essayText, trying near cursorHint first, then from start
    let idx = essayText.indexOf(phrase, cursorHint);
    if (idx === -1) {
      idx = essayText.indexOf(phrase);
    }
    if (idx === -1) {
      // Case-insensitive fallback
      const lowerEssay = essayText.toLowerCase();
      const lowerPhrase = phrase.toLowerCase();
      idx = lowerEssay.indexOf(lowerPhrase, cursorHint);
      if (idx === -1) {
        idx = lowerEssay.indexOf(lowerPhrase);
      }
    }
    if (idx === -1) continue;

    const end = idx + phrase.length;
    const overlaps = occupiedRanges.some(
      (r) => !(end <= r.start || idx >= r.end)
    );
    if (overlaps) continue;

    occupiedRanges.push({ start: idx, end });
    cursorHint = end;

    anchored.push({
      ...raw,
      id: raw.id || `ann-${i + 1}-${idx}`,
      startIndex: idx,
      endIndex: end,
      originalPhrase: essayText.slice(idx, end),
      correction: raw.correction || essayText.slice(idx, end),
    });
  }

  anchored.sort((a, b) => a.startIndex - b.startIndex);

  // Deterministic IELTS sanity guardrails to prevent LLM grade inflation
  const wordCount = countWords(essayText);
  const paragraphCount = essayText
    .trim()
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean).length;
  const taskNumber = options?.taskNumber ?? 2;
  const strictness = options?.strictness ?? 'standard';

  const confirmedErrors = anchored.filter((a) => a.severity === 'error');
  const grammarErrors = confirmedErrors.filter((a) =>
    ['Grammar', 'Sentence Structure', 'Punctuation'].includes(a.category)
  ).length;
  const lexicalErrors = confirmedErrors.filter((a) =>
    ['Vocabulary', 'Collocations', 'Spelling', 'Register and Style'].includes(a.category)
  ).length;
  const unmetChecklistCount = (evaluation.contentChecklist || []).filter((c) => !c.met).length;

  const normBase = taskNumber === 1 ? 150 : 250;
  const densityScale = normBase / Math.max(80, wordCount);
  const scaledGrammar = grammarErrors * densityScale;
  const scaledLexical = lexicalErrors * densityScale;

  // Compute objective upper bounds per IELTS official descriptors
  let taskCap = 9.0;
  if (taskNumber === 1) {
    if (wordCount < 75) taskCap = Math.min(taskCap, 3.5);
    else if (wordCount < 115) taskCap = Math.min(taskCap, 4.5);
    else if (wordCount < 145) taskCap = Math.min(taskCap, 5.5);
    else if (wordCount < 150) taskCap = Math.min(taskCap, 6.0);
  } else {
    if (wordCount < 100) taskCap = Math.min(taskCap, 3.5);
    else if (wordCount < 165) taskCap = Math.min(taskCap, 4.5);
    else if (wordCount < 215) taskCap = Math.min(taskCap, 5.5);
    else if (wordCount < 250) taskCap = Math.min(taskCap, 6.0);
  }
  if (unmetChecklistCount >= 3) taskCap = Math.min(taskCap, 4.5);
  else if (unmetChecklistCount === 2) taskCap = Math.min(taskCap, 5.5);
  else if (unmetChecklistCount === 1) taskCap = Math.min(taskCap, 6.5);

  let coherenceCap = 9.0;
  if (wordCount >= 120 && paragraphCount <= 1) {
    coherenceCap = 5.0;
  } else if (wordCount >= 180 && paragraphCount <= 2) {
    coherenceCap = 6.0;
  }
  if (wordCount < (taskNumber === 1 ? 90 : 140)) {
    coherenceCap = Math.min(coherenceCap, 4.5);
  }

  let grammarCap = 9.0;
  if (grammarErrors >= 7 || scaledGrammar >= 7.5) grammarCap = 5.5;
  else if (grammarErrors >= 4 || scaledGrammar >= 4.0) grammarCap = 6.5;
  else if (grammarErrors >= 2 || scaledGrammar >= 2.0) grammarCap = 7.5;

  let lexicalCap = 9.0;
  if (lexicalErrors >= 6 || scaledLexical >= 6.0) lexicalCap = 5.5;
  else if (lexicalErrors >= 3 || scaledLexical >= 3.0) lexicalCap = 6.5;
  else if (lexicalErrors >= 2 || scaledLexical >= 1.8) lexicalCap = 7.5;

  // Under-length submissions lack sufficient sample to demonstrate Band 6.5+/7.5+ lexis & grammar
  if (taskNumber === 1) {
    if (wordCount < 75) {
      grammarCap = Math.min(grammarCap, 4.5);
      lexicalCap = Math.min(lexicalCap, 4.5);
    } else if (wordCount < 115) {
      grammarCap = Math.min(grammarCap, 5.5);
      lexicalCap = Math.min(lexicalCap, 5.5);
    } else if (wordCount < 145) {
      grammarCap = Math.min(grammarCap, 6.5);
      lexicalCap = Math.min(lexicalCap, 6.5);
    }
  } else {
    if (wordCount < 100) {
      grammarCap = Math.min(grammarCap, 4.5);
      lexicalCap = Math.min(lexicalCap, 4.5);
    } else if (wordCount < 165) {
      grammarCap = Math.min(grammarCap, 5.5);
      lexicalCap = Math.min(lexicalCap, 5.5);
    } else if (wordCount < 220) {
      grammarCap = Math.min(grammarCap, 6.5);
      lexicalCap = Math.min(lexicalCap, 6.5);
    }
  }

  const validCriteria = (evaluation.criteria || []).slice(0, 4).map((c) => {
    let band = roundToHalfBand(Number(c.band) || 5.0);
    const lowerName = (c.name || '').toLowerCase();
    if (lowerName.includes('task')) {
      band = Math.min(band, taskCap);
    } else if (lowerName.includes('coherence')) {
      band = Math.min(band, coherenceCap);
    } else if (lowerName.includes('lexical')) {
      band = Math.min(band, lexicalCap);
    } else if (lowerName.includes('gramma')) {
      band = Math.min(band, grammarCap);
    }
    if (strictness === 'strict' && band >= 6.5 && (confirmedErrors.length >= 4 || unmetChecklistCount >= 1)) {
      band = Math.max(4.0, band - 0.5);
    }
    return {
      ...c,
      band: roundToHalfBand(band),
    };
  });

  let taskBand: number;
  if (validCriteria.length === 4) {
    const avg = validCriteria.reduce((acc, item) => acc + item.band, 0) / 4;
    taskBand =
      strictness === 'strict'
        ? roundToHalfBand(Math.floor((avg + 0.05) * 2) / 2)
        : roundToHalfBand(avg);
  } else {
    taskBand = roundToHalfBand(Math.min(Number(evaluation.taskBand) || 5.0, taskCap));
  }

  return {
    ...evaluation,
    taskBand,
    criteria: validCriteria,
    annotations: anchored,
  };
}

export function awardStudyXp(profile: UserProfile, earnedXp: number): UserProfile {
  const today = new Date().toISOString().slice(0, 10);
  const lastDate = profile.lastActiveDate || '';
  let streakDays = profile.streakDays || 0;
  if (lastDate !== today) {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    streakDays = lastDate === yesterday ? streakDays + 1 : Math.max(1, streakDays);
  }
  return {
    ...profile,
    xp: (profile.xp || 0) + earnedXp,
    streakDays,
    lastActiveDate: today,
  };
}

export function buildRankedLeaderboard(
  db: AppDatabase,
  overrideStreak?: number,
  overrideXp?: number
): {
  entries: Array<LeaderboardEntry & { rank: number }>;
  currentUserRank: number;
  totalParticipants: number;
} {
  const peers = db.leaderboard.filter(
    (entry) => !entry.isCurrentUser && entry.id !== 'current-user'
  );
  const showUsername = Boolean(db.userProfile.showUsernameOnLeaderboard);
  const cleanUsername = (db.userProfile.leaderboardUsername ?? '').trim();

  const currentUserEntry: LeaderboardEntry = {
    id: 'current-user',
    username: showUsername ? cleanUsername || db.userProfile.name?.trim() || undefined : undefined,
    showUsername,
    streakDays: Math.max(db.userProfile.streakDays || 0, overrideStreak ?? 0),
    xp: Math.max(db.userProfile.xp || 0, overrideXp ?? 0),
    targetBand: db.userProfile.targetBand || 7.5,
    format: db.userProfile.format || 'academic',
    lastActiveDate: db.userProfile.lastActiveDate || new Date().toISOString().slice(0, 10),
    isCurrentUser: true,
  };

  const combined = [...peers, currentUserEntry].sort((a, b) => {
    if (b.streakDays !== a.streakDays) return b.streakDays - a.streakDays;
    if (b.xp !== a.xp) return b.xp - a.xp;
    return b.targetBand - a.targetBand;
  });

  const ranked = combined.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));

  const currentUserRow = ranked.find((e) => e.isCurrentUser);
  return {
    entries: ranked,
    currentUserRank: currentUserRow?.rank ?? ranked.length,
    totalParticipants: ranked.length,
  };
}
