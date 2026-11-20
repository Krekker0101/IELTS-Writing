import fs from 'fs';
import path from 'path';
import type {
  AppDatabase,
  ErrorJournalEntry,
  Submission,
  TaskEvaluation,
  TextAnnotation,
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
      complaints: Array.isArray(parsed.complaints) ? parsed.complaints : [],
      drafts: parsed.drafts && typeof parsed.drafts === 'object' ? parsed.drafts : {},
      settings: parsed.settings ?? structuredClone(INITIAL_DB.settings),
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
  evaluation: TaskEvaluation
): TaskEvaluation {
  const validCriteria = (evaluation.criteria || []).slice(0, 4).map((c) => ({
    ...c,
    band: roundToHalfBand(Number(c.band) || 5.5),
  }));

  const taskBand =
    validCriteria.length === 4
      ? roundToHalfBand(
          validCriteria.reduce((acc, item) => acc + item.band, 0) / 4
        )
      : roundToHalfBand(Number(evaluation.taskBand) || 5.5);

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

  return {
    ...evaluation,
    taskBand,
    criteria: validCriteria,
    annotations: anchored,
  };
}
