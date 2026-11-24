import 'dotenv/config';
import http from 'http';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import type {
  AnalysisProgressEvent,
  CoachPersona,
  CoachVoiceName,
  ComplaintRecord,
  DraftEntry,
  EvaluationSettings,
  FocusEventRecord,
  IeltsFormat,
  MockTest,
  PracticeMode,
  SpeakingMockTest,
  SpeakingMode,
  SpeakingPartNumber,
  SpeakingSessionRecord,
  SpeakingTopic,
  SpeakingTurnRecord,
  Submission,
  TaskNumber,
  TaskSubmissionPart,
  UserProfile,
  WritingTask,
} from './src/types/ielts.ts';
import {
  awardStudyXp,
  buildRankedLeaderboard,
  calculateOverallWritingBand,
  countWords,
  readDb,
  rebuildErrorJournal,
  writeDb,
} from './server/store.ts';
import {
  checkGeminiApiHealth,
  checkRevisionStreamWithAI,
  checkRevisionWithAI,
  classifyCustomTopicWithAI,
  evaluateEssayStreamWithAI,
  evaluateEssayWithAI,
  generatePersonalizedExercisesWithAI,
  generateVocabularyFlashcardsWithAI,
  type GeminiProgressUpdate,
} from './server/gemini.ts';
import {
  evaluateSpeakingSessionWithAI,
  generateExaminerSpeech,
  processSpeakingTurnWithAI,
  runCoachConversationTurnWithAI,
  suggestSpeakingQuestionsWithAI,
} from './server/speakingGemini.ts';
import { attachLiveCoachWebSocket } from './server/liveCoachBridge.ts';
import { DEFAULT_USER_PROFILE } from './server/seedData.ts';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// Simple per-IP rate limiting for AI endpoints
const aiRateWindowMs = 60_000;
const aiMaxRequestsPerMin = 30;
const aiRequestLog = new Map<string, number[]>();

function checkAiRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (aiRequestLog.get(ip) ?? []).filter((t) => now - t < aiRateWindowMs);
  if (timestamps.length >= aiMaxRequestsPerMin) {
    aiRequestLog.set(ip, timestamps);
    return false;
  }
  timestamps.push(now);
  aiRequestLog.set(ip, timestamps);
  return true;
}

function validateImagePayload(imageUrl?: string): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('/src/assets/')) return null;
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
    if (!match) {
      return 'Поддерживаются только изображения PNG, JPEG или WebP.';
    }
    const approxBytes = (match[2].length * 3) / 4;
    if (approxBytes > 5 * 1024 * 1024) {
      return 'Размер изображения не должен превышать 5 МБ.';
    }
    return null;
  }
  return 'Некорректный формат изображения.';
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('GEMINI_API_KEY')) {
    return {
      status: 500,
      message: 'Серверный ключ Gemini API не настроен. Проверьте Secrets в панели управления.',
    };
  }
  if (msg.includes('GenerateRequestsPerDay') || msg.includes('free_tier_requests')) {
    return {
      status: 429,
      message:
        'Исчерпан дневной лимит запросов бесплатного тарифа Gemini API (20 запросов/день). Повторите позже или подключите billing-ключ в Settings > Secrets.',
    };
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'Превышен лимит запросов к ИИ. Подождите 30–60 секунд и повторите попытку.',
    };
  }
  if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
    return {
      status: 503,
      message: 'Сервис ИИ временно перегружен из-за высокой нагрузки. Ваш текст сохранён — повторите отправку через несколько секунд.',
    };
  }
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'Ошибка доступа к Gemini API. Проверьте корректность API-ключа.',
    };
  }
  return {
    status: 500,
    message: `Ошибка при обращении к ИИ-проверке: ${msg}`,
  };
}

// Bootstrap all state
app.get('/api/bootstrap', (_req, res) => {
  const db = readDb();
  res.json(db);
});

// Tasks CRUD (My Topics & Admin Library)
app.post('/api/tasks', (req, res) => {
  const body = req.body as Partial<WritingTask>;
  if (!body.promptText || !body.promptText.trim()) {
    res.status(400).json({ error: 'Текст задания обязателен.' });
    return;
  }
  const imgErr = validateImagePayload(body.imageUrl);
  if (imgErr) {
    res.status(400).json({ error: imgErr });
    return;
  }

  const db = readDb();
  const newTask: WritingTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: (body.title || 'Custom Writing Topic').trim(),
    format: body.format === 'general' ? 'general' : 'academic',
    taskNumber: body.taskNumber === 1 ? 1 : 2,
    taskType: (body.taskType || 'Agree or Disagree') as WritingTask['taskType'],
    promptText: body.promptText.trim(),
    bulletPoints: Array.isArray(body.bulletPoints)
      ? body.bulletPoints.map((b) => b.trim()).filter(Boolean)
      : undefined,
    imageUrl: body.imageUrl || undefined,
    chartSpec: body.chartSpec || undefined,
    tags: Array.isArray(body.tags) ? body.tags.map((t) => t.trim()).filter(Boolean) : ['Custom'],
    difficulty: body.difficulty || 'Band 7.0',
    recommendedMinutes:
      typeof body.recommendedMinutes === 'number' && body.recommendedMinutes > 0
        ? body.recommendedMinutes
        : body.taskNumber === 1
        ? 20
        : 40,
    isCustom: body.isCustom !== false,
    aiDetectedType: body.aiDetectedType,
    createdAt: new Date().toISOString(),
    learningHints: body.learningHints,
  };

  db.tasks.unshift(newTask);
  writeDb(db);
  res.status(201).json(newTask);
});

app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const body = req.body as Partial<WritingTask>;
  const imgErr = validateImagePayload(body.imageUrl);
  if (imgErr) {
    res.status(400).json({ error: imgErr });
    return;
  }

  const db = readDb();
  const idx = db.tasks.findIndex((t) => t.id === id);
  if (idx === -1) {
    res.status(404).json({ error: 'Задание не найдено.' });
    return;
  }

  db.tasks[idx] = {
    ...db.tasks[idx],
    ...body,
    id: db.tasks[idx].id,
  };
  writeDb(db);
  res.json(db.tasks[idx]);
});

app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const exists = db.tasks.some((t) => t.id === id);
  if (!exists) {
    res.status(404).json({ error: 'Задание не найдено.' });
    return;
  }
  db.tasks = db.tasks.filter((t) => t.id !== id);
  db.mockTests = db.mockTests.filter((m) => m.task1Id !== id && m.task2Id !== id);
  writeDb(db);
  res.json({ ok: true });
});

// Mock Tests CRUD (Admin)
app.post('/api/mock-tests', (req, res) => {
  const body = req.body as Partial<MockTest>;
  if (!body.title || !body.task1Id || !body.task2Id) {
    res.status(400).json({ error: 'Укажите название и оба задания (Task 1 и Task 2).' });
    return;
  }
  const db = readDb();
  const t1 = db.tasks.find((t) => t.id === body.task1Id && t.taskNumber === 1);
  const t2 = db.tasks.find((t) => t.id === body.task2Id && t.taskNumber === 2);
  if (!t1 || !t2) {
    res.status(400).json({ error: 'Выбранные задания не найдены.' });
    return;
  }

  const mock: MockTest = {
    id: `mock-${Date.now()}`,
    title: body.title.trim(),
    format: body.format === 'general' ? 'general' : 'academic',
    description: (body.description || 'Полный тренировочный тест IELTS Writing (60 минут).').trim(),
    difficulty: body.difficulty || 'Band 7.0',
    task1Id: t1.id,
    task2Id: t2.id,
    totalMinutes: 60,
    createdAt: new Date().toISOString(),
  };

  db.mockTests.unshift(mock);
  writeDb(db);
  res.status(201).json(mock);
});

app.delete('/api/mock-tests/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.mockTests = db.mockTests.filter((m) => m.id !== id);
  writeDb(db);
  res.json({ ok: true });
});

// Draft Auto-save (with server-anchored start timestamp)
app.put('/api/drafts/:key', (req, res) => {
  const { key } = req.params;
  const body = req.body as Partial<DraftEntry>;
  const db = readDb();
  const existing = db.drafts[key];
  db.drafts[key] = {
    key,
    task1Text: body.task1Text ?? '',
    task2Text: body.task2Text ?? '',
    remainingSeconds: typeof body.remainingSeconds === 'number' ? body.remainingSeconds : 0,
    startedAtIso: existing?.startedAtIso ?? body.startedAtIso ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeDb(db);
  res.json(db.drafts[key]);
});

app.delete('/api/drafts/:key', (req, res) => {
  const { key } = req.params;
  const db = readDb();
  delete db.drafts[key];
  writeDb(db);
  res.json({ ok: true });
});

// AI: Health & active processing state
app.get('/api/ai/health', async (req, res) => {
  const forceProbe = req.query.force === '1' || req.query.force === 'true';
  const health = await checkGeminiApiHealth(forceProbe);
  res.json(health);
});

// AI: Classify custom topic & check Task 1 image legibility
app.post('/api/ai/classify-topic', async (req, res) => {
  if (!checkAiRateLimit(req.ip || 'local')) {
    res.status(429).json({ error: 'Слишком много запросов к ИИ. Попробуйте через минуту.' });
    return;
  }

  const { promptText, formatHint, taskNumberHint, imageUrl } = req.body as {
    promptText?: string;
    formatHint?: IeltsFormat;
    taskNumberHint?: TaskNumber;
    imageUrl?: string;
  };

  if (!promptText || !promptText.trim()) {
    res.status(400).json({ error: 'Введите текст условия задания для классификации.' });
    return;
  }
  const imgErr = validateImagePayload(imageUrl);
  if (imgErr) {
    res.status(400).json({ error: imgErr });
    return;
  }

  try {
    const result = await classifyCustomTopicWithAI({
      promptText: promptText.trim(),
      formatHint,
      taskNumberHint,
      imageUrl,
    });
    res.json(result);
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// AI: Evaluate single task or full Mock Test
app.post('/api/submissions/evaluate', async (req, res) => {
  if (!checkAiRateLimit(req.ip || 'local')) {
    res.status(429).json({ error: 'Слишком много запросов к ИИ. Попробуйте через минуту.' });
    return;
  }

  const body = req.body as {
    mode: 'mock' | PracticeMode;
    format: IeltsFormat;
    mockTestId?: string;
    draftKey?: string;
    task1?: { taskId: string; essayText: string; timeSpentSec: number };
    task2?: { taskId: string; essayText: string; timeSpentSec: number };
  };

  if (!body.task1 && !body.task2) {
    res.status(400).json({ error: 'Необходимо написать ответ хотя бы на одно задание.' });
    return;
  }

  const db = readDb();

  try {
    let part1: TaskSubmissionPart | undefined;
    let part2: TaskSubmissionPart | undefined;

    const taskObj1 =
      body.task1 && body.task1.essayText.trim()
        ? db.tasks.find((t) => t.id === body.task1!.taskId)
        : undefined;
    const taskObj2 =
      body.task2 && body.task2.essayText.trim()
        ? db.tasks.find((t) => t.id === body.task2!.taskId)
        : undefined;

    if (body.task1 && body.task1.essayText.trim() && !taskObj1) {
      res.status(404).json({ error: 'Задание Task 1 не найдено.' });
      return;
    }
    if (body.task2 && body.task2.essayText.trim() && !taskObj2) {
      res.status(404).json({ error: 'Задание Task 2 не найдено.' });
      return;
    }

    const [eval1, eval2] = await Promise.all([
      taskObj1 && body.task1
        ? evaluateEssayWithAI(taskObj1, body.task1.essayText, db.settings)
        : Promise.resolve(undefined),
      taskObj2 && body.task2
        ? evaluateEssayWithAI(taskObj2, body.task2.essayText, db.settings)
        : Promise.resolve(undefined),
    ]);

    if (taskObj1 && body.task1 && eval1) {
      part1 = {
        taskId: taskObj1.id,
        taskTitle: taskObj1.title,
        taskType: taskObj1.taskType,
        taskNumber: 1,
        promptSnapshot: taskObj1.promptText,
        timeSpentSec: body.task1.timeSpentSec || 0,
        revisions: [
          {
            version: 1,
            essayText: body.task1.essayText,
            wordCount: countWords(body.task1.essayText),
            createdAt: new Date().toISOString(),
            evaluation: eval1,
          },
        ],
      };
    }

    if (taskObj2 && body.task2 && eval2) {
      part2 = {
        taskId: taskObj2.id,
        taskTitle: taskObj2.title,
        taskType: taskObj2.taskType,
        taskNumber: 2,
        promptSnapshot: taskObj2.promptText,
        timeSpentSec: body.task2.timeSpentSec || 0,
        revisions: [
          {
            version: 1,
            essayText: body.task2.essayText,
            wordCount: countWords(body.task2.essayText),
            createdAt: new Date().toISOString(),
            evaluation: eval2,
          },
        ],
      };
    }

    if (!part1 && !part2) {
      res.status(400).json({ error: 'Текст ответа пустой. Напишите хотя бы несколько предложений.' });
      return;
    }

    const mockObj = body.mockTestId
      ? db.mockTests.find((m) => m.id === body.mockTestId)
      : undefined;

    // Overall Writing Band is ONLY computed when BOTH Task 1 and Task 2 are completed
    const overallWritingBand =
      part1 && part2
        ? calculateOverallWritingBand(
            part1.revisions[0].evaluation.taskBand,
            part2.revisions[0].evaluation.taskBand
          )
        : undefined;

    const now = new Date().toISOString();
    const submission: Submission = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      mode: body.mode || 'practice',
      format: body.format || 'academic',
      mockTestId: mockObj?.id,
      mockTestTitle: mockObj?.title,
      createdAt: now,
      updatedAt: now,
      task1: part1,
      task2: part2,
      overallWritingBand,
    };

    db.submissions.unshift(submission);
    db.errorJournal = rebuildErrorJournal(db.submissions, db.errorJournal);
    db.userProfile = awardStudyXp(db.userProfile, overallWritingBand ? 45 : 25);
    if (body.draftKey) {
      delete db.drafts[body.draftKey];
    }
    writeDb(db);

    res.status(201).json({
      submission,
      errorJournal: db.errorJournal,
    });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// Helper for SSE streaming evaluation progress
function computeEtaSeconds(percent: number, elapsedMs: number): number | null {
  const elapsedSec = elapsedMs / 1000;
  if (percent < 15 || elapsedSec < 1.5 || percent >= 100) return null;
  const raw = Math.round((elapsedSec * (100 - percent)) / percent);
  return Math.max(1, Math.min(90, raw));
}

function initSseResponse(res: express.Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function writeSseEvent(res: express.Response, event: string, data: unknown) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// AI: Evaluate single task or full Mock Test (SSE live progress stream)
app.post('/api/submissions/evaluate-stream', async (req, res) => {
  if (!checkAiRateLimit(req.ip || 'local')) {
    res.status(429).json({ error: 'Слишком много запросов к ИИ. Попробуйте через минуту.' });
    return;
  }

  const body = req.body as {
    mode: 'mock' | PracticeMode;
    format: IeltsFormat;
    mockTestId?: string;
    draftKey?: string;
    task1?: { taskId: string; essayText: string; timeSpentSec: number };
    task2?: { taskId: string; essayText: string; timeSpentSec: number };
  };

  const hasTask1 = Boolean(body.task1 && body.task1.essayText.trim());
  const hasTask2 = Boolean(body.task2 && body.task2.essayText.trim());

  if (!hasTask1 && !hasTask2) {
    res.status(400).json({ error: 'Текст ответа пустой. Напишите хотя бы несколько предложений.' });
    return;
  }

  const db = readDb();
  const taskObj1 = hasTask1 ? db.tasks.find((t) => t.id === body.task1!.taskId) : undefined;
  const taskObj2 = hasTask2 ? db.tasks.find((t) => t.id === body.task2!.taskId) : undefined;

  if (hasTask1 && !taskObj1) {
    res.status(404).json({ error: 'Задание Task 1 не найдено.' });
    return;
  }
  if (hasTask2 && !taskObj2) {
    res.status(404).json({ error: 'Задание Task 2 не найдено.' });
    return;
  }

  initSseResponse(res);

  let clientClosed = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
    }
  });

  const startedAt = Date.now();
  const isDualMock = hasTask1 && hasTask2;
  let lastProgress: AnalysisProgressEvent = {
    percent: 4,
    stageKey: 'connect',
    stage: 'Подготовка проверки',
    detail: isDualMock
      ? 'Запускаем параллельную экспертизу Task 1 и Task 2…'
      : 'Отправляем задание и ваш ответ в модель Gemini…',
    taskNumber: hasTask1 ? 1 : 2,
    taskStepLabel: isDualMock ? 'Параллельная проверка Task 1 + Task 2' : undefined,
    charsReceived: 0,
    annotationsDetected: 0,
    elapsedSec: 0,
    estimatedRemainingSec: null,
  };

  const emitProgress = (evt: AnalysisProgressEvent) => {
    lastProgress = evt;
    if (!clientClosed) {
      writeSseEvent(res, 'progress', evt);
    }
  };

  emitProgress(lastProgress);

  // Keep elapsed clock ticking smoothly during initial model connection
  const heartbeat = setInterval(() => {
    if (clientClosed || res.writableEnded) return;
    const elapsedMs = Date.now() - startedAt;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const nextPercent =
      lastProgress.stageKey === 'connect' && lastProgress.percent < 20
        ? lastProgress.percent + 1
        : lastProgress.percent;
    emitProgress({
      ...lastProgress,
      percent: nextPercent,
      elapsedSec,
      estimatedRemainingSec: computeEtaSeconds(nextPercent, elapsedMs),
    });
  }, 850);

  let task1Update: GeminiProgressUpdate = {
    percent: 6,
    stageKey: 'connect',
    stage: 'Подключение к модели Gemini',
    detail: 'Передаём Task 1…',
    charsReceived: 0,
    annotationsDetected: 0,
  };
  let task2Update: GeminiProgressUpdate = {
    percent: 6,
    stageKey: 'connect',
    stage: 'Подключение к модели Gemini',
    detail: 'Передаём Task 2…',
    charsReceived: 0,
    annotationsDetected: 0,
  };

  const mapProgress = (
    taskNum: TaskNumber,
    stepLabel: string | undefined,
    update: GeminiProgressUpdate
  ) => {
    if (taskNum === 1) task1Update = update;
    else task2Update = update;

    const elapsedMs = Date.now() - startedAt;
    const combinedRaw = isDualMock
      ? task1Update.percent * 0.45 + task2Update.percent * 0.55
      : update.percent;
    const scaledPercent = Math.round(4 + (91 * combinedRaw) / 100);
    const clamped = Math.max(lastProgress.percent, Math.min(95, scaledPercent));

    emitProgress({
      ...update,
      percent: clamped,
      taskNumber: taskNum,
      taskStepLabel: isDualMock ? 'Параллельная проверка Task 1 + Task 2' : stepLabel,
      charsReceived: isDualMock
        ? task1Update.charsReceived + task2Update.charsReceived
        : update.charsReceived,
      annotationsDetected: isDualMock
        ? task1Update.annotationsDetected + task2Update.annotationsDetected
        : update.annotationsDetected,
      elapsedSec: Math.floor(elapsedMs / 1000),
      estimatedRemainingSec: computeEtaSeconds(clamped, elapsedMs),
    });
  };

  try {
    const [eval1, eval2] = await Promise.all([
      hasTask1 && taskObj1 && body.task1
        ? evaluateEssayStreamWithAI(taskObj1, body.task1.essayText, db.settings, (u) =>
            mapProgress(1, 'Task 1', u)
          )
        : Promise.resolve(undefined),
      hasTask2 && taskObj2 && body.task2
        ? evaluateEssayStreamWithAI(taskObj2, body.task2.essayText, db.settings, (u) =>
            mapProgress(2, 'Task 2', u)
          )
        : Promise.resolve(undefined),
    ]);

    let part1: TaskSubmissionPart | undefined;
    let part2: TaskSubmissionPart | undefined;

    if (hasTask1 && taskObj1 && body.task1 && eval1) {
      part1 = {
        taskId: taskObj1.id,
        taskTitle: taskObj1.title,
        taskType: taskObj1.taskType,
        taskNumber: 1,
        promptSnapshot: taskObj1.promptText,
        timeSpentSec: body.task1.timeSpentSec || 0,
        revisions: [
          {
            version: 1,
            essayText: body.task1.essayText,
            wordCount: countWords(body.task1.essayText),
            createdAt: new Date().toISOString(),
            evaluation: eval1,
          },
        ],
      };
    }

    if (hasTask2 && taskObj2 && body.task2 && eval2) {
      part2 = {
        taskId: taskObj2.id,
        taskTitle: taskObj2.title,
        taskType: taskObj2.taskType,
        taskNumber: 2,
        promptSnapshot: taskObj2.promptText,
        timeSpentSec: body.task2.timeSpentSec || 0,
        revisions: [
          {
            version: 1,
            essayText: body.task2.essayText,
            wordCount: countWords(body.task2.essayText),
            createdAt: new Date().toISOString(),
            evaluation: eval2,
          },
        ],
      };
    }

    const elapsedMs = Date.now() - startedAt;
    emitProgress({
      ...lastProgress,
      percent: 97,
      stageKey: 'saving',
      stage: 'Сохранение результатов и обновление профиля ошибок',
      detail: 'Рассчитываем итоговый Band Score и обновляем журнал ошибок…',
      elapsedSec: Math.floor(elapsedMs / 1000),
      estimatedRemainingSec: 1,
    });

    const latestDb = readDb();
    const mockObj = body.mockTestId
      ? latestDb.mockTests.find((m) => m.id === body.mockTestId)
      : undefined;

    const overallWritingBand =
      part1 && part2
        ? calculateOverallWritingBand(
            part1.revisions[0].evaluation.taskBand,
            part2.revisions[0].evaluation.taskBand
          )
        : undefined;

    const focusEvents = Array.isArray((req.body as { focusEvents?: unknown }).focusEvents)
      ? ((req.body as { focusEvents: Array<{ type: 'fullscreen_exit' | 'tab_hidden' | 'window_blur'; at: string }> }).focusEvents)
      : [];

    const now = new Date().toISOString();
    const submission: Submission = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      mode: body.mode || 'practice',
      format: body.format || 'academic',
      mockTestId: mockObj?.id,
      mockTestTitle: mockObj?.title,
      createdAt: now,
      updatedAt: now,
      task1: part1,
      task2: part2,
      overallWritingBand,
      focusEvents: focusEvents.length > 0 ? focusEvents : undefined,
      sessionIntegrity: focusEvents.length > 0 ? 'interrupted' : 'standard',
    };

    latestDb.submissions.unshift(submission);
    latestDb.errorJournal = rebuildErrorJournal(latestDb.submissions, latestDb.errorJournal);
    latestDb.userProfile = awardStudyXp(latestDb.userProfile, overallWritingBand ? 45 : 25);
    if (body.draftKey) {
      delete latestDb.drafts[body.draftKey];
    }
    writeDb(latestDb);

    emitProgress({
      ...lastProgress,
      percent: 100,
      stageKey: 'done',
      stage: 'Проверка завершена',
      detail: 'Диагностический отчёт готов.',
      elapsedSec: Math.floor((Date.now() - startedAt) / 1000),
      estimatedRemainingSec: 0,
    });

    if (!clientClosed) {
      writeSseEvent(res, 'done', {
        submission,
        errorJournal: latestDb.errorJournal,
      });
    }
    res.end();
  } catch (err) {
    const formatted = formatGeminiError(err);
    const rawDetail = err instanceof Error ? err.message : String(err);
    console.error('[evaluate-stream] failed:', rawDetail);
    if (!clientClosed) {
      writeSseEvent(res, 'error', { error: formatted.message, status: formatted.status });
    }
    res.end();
  } finally {
    clearInterval(heartbeat);
  }
});

// AI: Check student's self-revision with SSE live progress stream
app.post('/api/submissions/:id/revise-stream', async (req, res) => {
  if (!checkAiRateLimit(req.ip || 'local')) {
    res.status(429).json({ error: 'Слишком много запросов к ИИ. Попробуйте через минуту.' });
    return;
  }

  const { id } = req.params;
  const { taskNumber, revisedText } = req.body as {
    taskNumber: TaskNumber;
    revisedText: string;
  };

  if (!revisedText || !revisedText.trim()) {
    res.status(400).json({ error: 'Исправленный текст не может быть пустым.' });
    return;
  }

  const db = readDb();
  const subIdx = db.submissions.findIndex((s) => s.id === id);
  if (subIdx === -1) {
    res.status(404).json({ error: 'Работа не найдена.' });
    return;
  }

  const submission = db.submissions[subIdx];
  const part = taskNumber === 1 ? submission.task1 : submission.task2;
  if (!part) {
    res.status(404).json({ error: 'Эта часть задания отсутствует в данной работе.' });
    return;
  }

  const taskObj = db.tasks.find((t) => t.id === part.taskId);
  if (!taskObj) {
    res.status(404).json({ error: 'Исходное задание не найдено в библиотеке.' });
    return;
  }

  const latestRevision = part.revisions[part.revisions.length - 1];

  initSseResponse(res);

  let clientClosed = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
    }
  });

  const startedAt = Date.now();
  let lastProgress: AnalysisProgressEvent = {
    percent: 5,
    stageKey: 'connect',
    stage: 'Подготовка сравнения версий',
    detail: 'Отправляем исходную и обновлённую редакции в Gemini…',
    taskNumber,
    taskStepLabel: `Редакция v${part.revisions.length + 1}`,
    charsReceived: 0,
    annotationsDetected: 0,
    elapsedSec: 0,
    estimatedRemainingSec: null,
  };

  const emitProgress = (evt: AnalysisProgressEvent) => {
    lastProgress = evt;
    if (!clientClosed) {
      writeSseEvent(res, 'progress', evt);
    }
  };

  emitProgress(lastProgress);

  const heartbeat = setInterval(() => {
    if (clientClosed || res.writableEnded) return;
    const elapsedMs = Date.now() - startedAt;
    const nextPercent =
      lastProgress.stageKey === 'connect' && lastProgress.percent < 11
        ? lastProgress.percent + 1
        : lastProgress.percent;
    emitProgress({
      ...lastProgress,
      percent: nextPercent,
      elapsedSec: Math.floor(elapsedMs / 1000),
      estimatedRemainingSec: computeEtaSeconds(nextPercent, elapsedMs),
    });
  }, 900);

  try {
    const newEval = await checkRevisionStreamWithAI(
      taskObj,
      latestRevision.essayText,
      latestRevision.evaluation,
      revisedText,
      db.settings,
      (update) => {
        const elapsedMs = Date.now() - startedAt;
        const clamped = Math.max(lastProgress.percent, Math.min(95, update.percent));
        emitProgress({
          ...update,
          percent: clamped,
          taskNumber,
          taskStepLabel: `Редакция v${part.revisions.length + 1}`,
          elapsedSec: Math.floor(elapsedMs / 1000),
          estimatedRemainingSec: computeEtaSeconds(clamped, elapsedMs),
        });
      }
    );

    emitProgress({
      ...lastProgress,
      percent: 97,
      stageKey: 'saving',
      stage: 'Сохранение новой редакции',
      detail: 'Пересчитываем общий балл и обновляем журнал ошибок…',
      elapsedSec: Math.floor((Date.now() - startedAt) / 1000),
      estimatedRemainingSec: 1,
    });

    const latestDb = readDb();
    const freshIdx = latestDb.submissions.findIndex((s) => s.id === id);
    if (freshIdx === -1) {
      throw new Error('Работа не найдена при сохранении.');
    }
    const freshSub = latestDb.submissions[freshIdx];
    const freshPart = taskNumber === 1 ? freshSub.task1 : freshSub.task2;
    if (!freshPart) {
      throw new Error('Часть задания не найдена при сохранении.');
    }

    freshPart.revisions.push({
      version: freshPart.revisions.length + 1,
      essayText: revisedText,
      wordCount: countWords(revisedText),
      createdAt: new Date().toISOString(),
      evaluation: newEval,
    });

    if (freshSub.task1 && freshSub.task2) {
      const t1Latest = freshSub.task1.revisions[freshSub.task1.revisions.length - 1];
      const t2Latest = freshSub.task2.revisions[freshSub.task2.revisions.length - 1];
      freshSub.overallWritingBand = calculateOverallWritingBand(
        t1Latest.evaluation.taskBand,
        t2Latest.evaluation.taskBand
      );
    }

    freshSub.updatedAt = new Date().toISOString();
    latestDb.submissions[freshIdx] = freshSub;
    latestDb.errorJournal = rebuildErrorJournal(latestDb.submissions, latestDb.errorJournal);
    writeDb(latestDb);

    emitProgress({
      ...lastProgress,
      percent: 100,
      stageKey: 'done',
      stage: 'Повторная проверка завершена',
      detail: 'Отчёт по новой редакции готов.',
      elapsedSec: Math.floor((Date.now() - startedAt) / 1000),
      estimatedRemainingSec: 0,
    });

    if (!clientClosed) {
      writeSseEvent(res, 'done', {
        submission: freshSub,
        errorJournal: latestDb.errorJournal,
      });
    }
    res.end();
  } catch (err) {
    const formatted = formatGeminiError(err);
    if (!clientClosed) {
      writeSseEvent(res, 'error', { error: formatted.message, status: formatted.status });
    }
    res.end();
  } finally {
    clearInterval(heartbeat);
  }
});

// AI: Check student's self-revision (Improve My Writing -> Check My Revision)
app.post('/api/submissions/:id/revise', async (req, res) => {
  if (!checkAiRateLimit(req.ip || 'local')) {
    res.status(429).json({ error: 'Слишком много запросов к ИИ. Попробуйте через минуту.' });
    return;
  }

  const { id } = req.params;
  const { taskNumber, revisedText } = req.body as {
    taskNumber: TaskNumber;
    revisedText: string;
  };

  if (!revisedText || !revisedText.trim()) {
    res.status(400).json({ error: 'Исправленный текст не может быть пустым.' });
    return;
  }

  const db = readDb();
  const subIdx = db.submissions.findIndex((s) => s.id === id);
  if (subIdx === -1) {
    res.status(404).json({ error: 'Работа не найдена.' });
    return;
  }

  const submission = db.submissions[subIdx];
  const part = taskNumber === 1 ? submission.task1 : submission.task2;
  if (!part) {
    res.status(404).json({ error: 'Эта часть задания отсутствует в данной работе.' });
    return;
  }

  const taskObj = db.tasks.find((t) => t.id === part.taskId);
  if (!taskObj) {
    res.status(404).json({ error: 'Исходное задание не найдено в библиотеке.' });
    return;
  }

  const latestRevision = part.revisions[part.revisions.length - 1];

  try {
    const newEval = await checkRevisionWithAI(
      taskObj,
      latestRevision.essayText,
      latestRevision.evaluation,
      revisedText,
      db.settings
    );

    part.revisions.push({
      version: part.revisions.length + 1,
      essayText: revisedText,
      wordCount: countWords(revisedText),
      createdAt: new Date().toISOString(),
      evaluation: newEval,
    });

    if (submission.task1 && submission.task2) {
      const t1Latest = submission.task1.revisions[submission.task1.revisions.length - 1];
      const t2Latest = submission.task2.revisions[submission.task2.revisions.length - 1];
      submission.overallWritingBand = calculateOverallWritingBand(
        t1Latest.evaluation.taskBand,
        t2Latest.evaluation.taskBand
      );
    }

    submission.updatedAt = new Date().toISOString();
    db.submissions[subIdx] = submission;
    db.errorJournal = rebuildErrorJournal(db.submissions, db.errorJournal);
    writeDb(db);

    res.json({
      submission,
      errorJournal: db.errorJournal,
    });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// AI: Personalized Exercises
app.post('/api/exercises/generate', async (req, res) => {
  if (!checkAiRateLimit(req.ip || 'local')) {
    res.status(429).json({ error: 'Слишком много запросов к ИИ. Попробуйте через минуту.' });
    return;
  }

  const db = readDb();
  const activeErrors = db.errorJournal.filter((e) => !e.mastered);
  if (activeErrors.length === 0) {
    res.status(400).json({
      error: 'Сначала отправьте хотя бы одну работу на проверку, чтобы ИИ сформировал персональные упражнения по вашим ошибкам.',
    });
    return;
  }

  try {
    const newExercises = await generatePersonalizedExercisesWithAI(
      db.errorJournal,
      db.settings.feedbackLanguage
    );
    db.exercises = [...newExercises, ...db.exercises].slice(0, 30);
    writeDb(db);
    res.json({ exercises: db.exercises });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// AI: Vocabulary Flashcards from past Writing & Speaking errors
app.post('/api/flashcards/generate', async (req, res) => {
  if (!checkAiRateLimit(req.ip || 'local')) {
    res.status(429).json({ error: 'Слишком много запросов к ИИ. Попробуйте через минуту.' });
    return;
  }

  const db = readDb();
  const hasWritingAnnotations = db.submissions.some((s) =>
    [s.task1, s.task2].some((p) => (p?.revisions[p.revisions.length - 1]?.evaluation.annotations.length ?? 0) > 0)
  );
  const hasSpeakingAnnotations = db.speakingSessions.some((ses) =>
    ses.turns.some((t) => t.annotations.length > 0)
  );

  if (!hasWritingAnnotations && !hasSpeakingAnnotations && db.errorJournal.length === 0) {
    res.status(400).json({
      error:
        'Сначала завершите хотя бы одну проверку Writing или Speaking, чтобы ИИ создал карточки слов по вашим реальным ошибкам.',
    });
    return;
  }

  try {
    const existingTerms = db.flashcards.map((c) => c.term);
    const created = await generateVocabularyFlashcardsWithAI({
      submissions: db.submissions,
      speakingSessions: db.speakingSessions,
      errorJournal: db.errorJournal,
      existingTerms,
      feedbackLanguage: db.settings.feedbackLanguage,
    });

    if (created.length === 0) {
      res.status(400).json({
        error: 'В последних работах не найдено ошибок для формирования словарных карточек.',
      });
      return;
    }

    const seen = new Set(db.flashcards.map((c) => c.term.toLowerCase()));
    const fresh = created.filter((c) => c.term && !seen.has(c.term.toLowerCase()));
    db.flashcards = [...fresh, ...db.flashcards].slice(0, 40);
    writeDb(db);
    res.json({ flashcards: db.flashcards, addedCount: fresh.length });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.patch('/api/flashcards/:id', (req, res) => {
  const { id } = req.params;
  const { mastered } = req.body as { mastered?: boolean };
  const db = readDb();
  const idx = db.flashcards.findIndex((c) => c.id === id);
  if (idx === -1) {
    res.status(404).json({ error: 'Карточка не найдена.' });
    return;
  }

  const current = db.flashcards[idx];
  const updated = {
    ...current,
    mastered: typeof mastered === 'boolean' ? mastered : !current.mastered,
    reviewCount: (current.reviewCount || 0) + 1,
  };
  db.flashcards[idx] = updated;
  writeDb(db);
  res.json({ flashcard: updated, flashcards: db.flashcards });
});

app.delete('/api/flashcards/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const next = db.flashcards.filter((c) => c.id !== id);
  if (next.length === db.flashcards.length) {
    res.status(404).json({ error: 'Карточка не найдена.' });
    return;
  }
  db.flashcards = next;
  writeDb(db);
  res.json({ flashcards: db.flashcards });
});

app.post('/api/exercises/:id/answer', (req, res) => {
  const { id } = req.params;
  const { selectedIndex } = req.body as { selectedIndex: number };
  const db = readDb();
  const exIdx = db.exercises.findIndex((e) => e.id === id);
  if (exIdx === -1) {
    res.status(404).json({ error: 'Упражнение не найдено.' });
    return;
  }

  const exercise = db.exercises[exIdx];
  const isCorrect = selectedIndex === exercise.correctIndex;
  exercise.completed = true;
  exercise.answeredCorrectly = isCorrect;
  db.exercises[exIdx] = exercise;

  // Update mastery streak in errorJournal: requires >= 3 independent correct exercises to mark mastered
  const jIdx = db.errorJournal.findIndex(
    (j) =>
      j.subRule.toLowerCase() === exercise.targetSubRule.toLowerCase() ||
      j.category === exercise.category
  );
  if (jIdx !== -1) {
    if (isCorrect) {
      db.errorJournal[jIdx].masteryStreak += 1;
      if (db.errorJournal[jIdx].masteryStreak >= 3) {
        db.errorJournal[jIdx].mastered = true;
      }
    } else {
      db.errorJournal[jIdx].masteryStreak = 0;
      db.errorJournal[jIdx].mastered = false;
    }
  }

  writeDb(db);
  res.json({
    exercise,
    isCorrect,
    errorJournal: db.errorJournal,
  });
});

// Complaints on AI annotations
app.post('/api/complaints', (req, res) => {
  const body = req.body as Omit<ComplaintRecord, 'id' | 'status' | 'createdAt'>;
  if (!body.reason || !body.reason.trim()) {
    res.status(400).json({ error: 'Укажите причину жалобы.' });
    return;
  }
  const db = readDb();
  const record: ComplaintRecord = {
    id: `cmp-${Date.now()}`,
    submissionId: body.submissionId,
    taskNumber: body.taskNumber,
    annotationId: body.annotationId,
    originalPhrase: body.originalPhrase,
    correction: body.correction,
    category: body.category,
    reason: body.reason.trim(),
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  db.complaints.unshift(record);
  writeDb(db);
  res.status(201).json(record);
});

app.patch('/api/complaints/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status: ComplaintRecord['status'] };
  const db = readDb();
  const idx = db.complaints.findIndex((c) => c.id === id);
  if (idx === -1) {
    res.status(404).json({ error: 'Жалоба не найдена.' });
    return;
  }
  db.complaints[idx].status = status;
  writeDb(db);
  res.json(db.complaints[idx]);
});

// Admin Evaluation Settings
app.put('/api/settings', (req, res) => {
  const body = req.body as Partial<EvaluationSettings>;
  const db = readDb();
  db.settings = {
    feedbackLanguage: body.feedbackLanguage === 'en' ? 'en' : 'ru',
    strictness: body.strictness === 'strict' ? 'strict' : 'standard',
    customExaminerNote: (body.customExaminerNote ?? '').trim(),
  };
  writeDb(db);
  res.json(db.settings);
});

// ========== SPEAKING & AI COACH ENDPOINTS ==========

// Speaking Topics CRUD
app.post('/api/speaking/topics', (req, res) => {
  const body = req.body as Partial<SpeakingTopic>;
  if (!body.title || !body.title.trim()) {
    res.status(400).json({ error: 'Укажите название Speaking-темы.' });
    return;
  }
  const db = readDb();
  const part: SpeakingPartNumber = body.part === 2 ? 2 : body.part === 3 ? 3 : 1;
  const newTopic: SpeakingTopic = {
    id: `spk-topic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: body.title.trim(),
    description: (body.description || '').trim(),
    part,
    difficulty: body.difficulty || 'Band 7.0',
    tags: Array.isArray(body.tags) ? body.tags.map((t) => t.trim()).filter(Boolean) : [`Part ${part}`],
    isCustom: body.isCustom !== false,
    sourceLabel: body.isCustom === false ? body.sourceLabel || 'Авторское задание платформы' : 'Моя тема',
    questions: Array.isArray(body.questions)
      ? body.questions
          .map((q, idx) => ({
            id: q.id || `spk-q-${Date.now()}-${idx}`,
            text: String(q.text || '').trim(),
            source: q.source || 'user',
          }))
          .filter((q) => q.text.length > 0)
      : [],
    cueCard: body.cueCard,
    linkedPart3TopicId: body.linkedPart3TopicId || undefined,
    notes: body.notes || undefined,
    createdAt: new Date().toISOString(),
  };
  db.speakingTopics.unshift(newTopic);
  writeDb(db);
  res.status(201).json(newTopic);
});

app.delete('/api/speaking/topics/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.speakingTopics = db.speakingTopics.filter((t) => t.id !== id);
  db.speakingMockTests = db.speakingMockTests.filter(
    (m) => m.part1TopicId !== id && m.part2TopicId !== id && m.part3TopicId !== id
  );
  writeDb(db);
  res.json({ ok: true });
});

app.post('/api/speaking/mock-tests', (req, res) => {
  const body = req.body as Partial<SpeakingMockTest>;
  if (!body.title || !body.part1TopicId || !body.part2TopicId || !body.part3TopicId) {
    res.status(400).json({ error: 'Выберите название и темы для всех 3 частей Speaking.' });
    return;
  }
  const db = readDb();
  const mock: SpeakingMockTest = {
    id: `spk-mock-${Date.now()}`,
    title: body.title.trim(),
    description: (body.description || 'Полный устный мок-тест IELTS Speaking (Parts 1–3).').trim(),
    difficulty: body.difficulty || 'Band 7.0',
    part1TopicId: body.part1TopicId,
    part2TopicId: body.part2TopicId,
    part3TopicId: body.part3TopicId,
    totalMinutes: 14,
    createdAt: new Date().toISOString(),
  };
  db.speakingMockTests.unshift(mock);
  writeDb(db);
  res.status(201).json(mock);
});

app.delete('/api/speaking/mock-tests/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.speakingMockTests = db.speakingMockTests.filter((m) => m.id !== id);
  writeDb(db);
  res.json({ ok: true });
});

// AI: Suggest additional questions for a custom Speaking topic
app.post('/api/speaking/suggest-questions', async (req, res) => {
  if (!checkAiRateLimit(req.ip || 'local')) {
    res.status(429).json({ error: 'Слишком много запросов к ИИ. Попробуйте через минуту.' });
    return;
  }
  const { title, part, description, existingQuestions } = req.body as {
    title?: string;
    part?: SpeakingPartNumber;
    description?: string;
    existingQuestions?: string[];
  };
  if (!title || !title.trim()) {
    res.status(400).json({ error: 'Укажите название темы для генерации вопросов.' });
    return;
  }
  try {
    const questions = await suggestSpeakingQuestionsWithAI({
      title: title.trim(),
      part: part === 2 ? 2 : part === 3 ? 3 : 1,
      description,
      existingQuestions: Array.isArray(existingQuestions) ? existingQuestions : [],
    });
    res.json({ questions });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// AI: Gemini TTS for Examiner / Coach Voice
app.post('/api/speaking/tts', async (req, res) => {
  if (!checkAiRateLimit(req.ip || 'local')) {
    res.status(429).json({ error: 'Слишком много запросов к ИИ. Попробуйте через минуту.' });
    return;
  }
  const { text, voiceName, mode, persona } = req.body as {
    text?: string;
    voiceName?: CoachVoiceName;
    mode?: SpeakingMode;
    persona?: CoachPersona;
  };
  if (!text || !text.trim()) {
    res.status(400).json({ error: 'Текст для озвучки обязателен.' });
    return;
  }
  try {
    const result = await generateExaminerSpeech({
      text: text.trim().slice(0, 1200),
      voiceName,
      mode,
      persona,
    });
    res.json(result);
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// AI: Multimodal audio turn transcription + turn annotations + examiner follow-up
app.post('/api/speaking/turn', async (req, res) => {
  if (!checkAiRateLimit(req.ip || 'local')) {
    res.status(429).json({ error: 'Слишком много запросов к ИИ. Попробуйте через минуту.' });
    return;
  }
  const body = req.body as {
    topicTitle: string;
    part: SpeakingPartNumber;
    questionText: string;
    mode: SpeakingMode;
    persona: CoachPersona;
    durationSec: number;
    history: Array<{ question: string; transcript: string }>;
    audioBase64?: string;
    mimeType?: string;
    typedFallbackText?: string;
  };

  if (!body.audioBase64 && (!body.typedFallbackText || !body.typedFallbackText.trim())) {
    res.status(400).json({ error: 'Запишите голосовой ответ или введите текстовый ответ (в режиме доступности).' });
    return;
  }

  const db = readDb();
  try {
    const result = await processSpeakingTurnWithAI({
      topicTitle: body.topicTitle || 'IELTS Speaking',
      part: body.part === 2 ? 2 : body.part === 3 ? 3 : 1,
      questionText: body.questionText || '',
      mode: body.mode || 'practice',
      persona: body.persona || db.userProfile.coachPersona,
      durationSec: Number(body.durationSec) || 10,
      history: Array.isArray(body.history) ? body.history : [],
      audioBase64: body.audioBase64,
      mimeType: body.mimeType,
      typedFallbackText: body.typedFallbackText,
      feedbackLanguage: db.settings.feedbackLanguage,
    });
    res.json(result);
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// AI: Final Speaking session evaluation & storage
app.post('/api/speaking/evaluate', async (req, res) => {
  if (!checkAiRateLimit(req.ip || 'local')) {
    res.status(429).json({ error: 'Слишком много запросов к ИИ. Попробуйте через минуту.' });
    return;
  }
  const body = req.body as {
    topicId?: string;
    mockTestId?: string;
    title: string;
    part?: SpeakingPartNumber;
    isFullMock: boolean;
    mode: SpeakingMode;
    persona?: CoachPersona;
    durationSec: number;
    turns: SpeakingTurnRecord[];
    focusEvents?: FocusEventRecord[];
  };

  if (!Array.isArray(body.turns) || body.turns.length === 0) {
    res.status(400).json({ error: 'Нет записанных ответов для оценки.' });
    return;
  }

  const db = readDb();
  try {
    const evaluation = await evaluateSpeakingSessionWithAI({
      title: body.title || 'IELTS Speaking Session',
      mode: body.mode || 'practice',
      persona: body.persona || db.userProfile.coachPersona,
      isFullMock: Boolean(body.isFullMock),
      part: body.part,
      turns: body.turns,
      settings: db.settings,
    });

    const sanitizedTurns: SpeakingTurnRecord[] = body.turns.map((t) => ({
      ...t,
      audioDataUrl: db.userProfile.storeAudioRecordings ? t.audioDataUrl : undefined,
    }));

    const focusEvents = Array.isArray(body.focusEvents) ? body.focusEvents : [];
    const sessionRecord: SpeakingSessionRecord = {
      id: `spk-ses-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      topicId: body.topicId,
      mockTestId: body.mockTestId,
      title: body.title || 'IELTS Speaking Session',
      part: body.part,
      isFullMock: Boolean(body.isFullMock),
      mode: body.mode || 'practice',
      createdAt: new Date().toISOString(),
      durationSec: Math.max(1, Math.round(body.durationSec || 0)),
      turns: sanitizedTurns,
      evaluation,
      focusEvents,
      sessionIntegrity: focusEvents.length > 0 ? 'interrupted' : 'standard',
    };

    db.speakingSessions.unshift(sessionRecord);
    db.userProfile = awardStudyXp(db.userProfile, body.isFullMock ? 45 : 25);
    writeDb(db);

    res.status(201).json({
      session: sessionRecord,
      userProfile: db.userProfile,
    });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// AI: Free AI Coach Conversation (not scored as official Mock)
app.post('/api/speaking/conversation', async (req, res) => {
  if (!checkAiRateLimit(req.ip || 'local')) {
    res.status(429).json({ error: 'Слишком много запросов к ИИ. Попробуйте через минуту.' });
    return;
  }
  const body = req.body as {
    topicTitle: string;
    persona: CoachPersona;
    mistakeStreak?: number;
    history: Array<{ role: 'coach' | 'user'; text: string }>;
    audioBase64?: string;
    mimeType?: string;
    typedText?: string;
  };
  if (!body.audioBase64 && (!body.typedText || !body.typedText.trim())) {
    res.status(400).json({ error: 'Скажите фразу или отправьте текст.' });
    return;
  }
  try {
    const result = await runCoachConversationTurnWithAI({
      topicTitle: body.topicTitle || 'Everyday English & IELTS Topics',
      persona: body.persona || 'classic',
      mistakeStreak: typeof body.mistakeStreak === 'number' ? body.mistakeStreak : 0,
      history: Array.isArray(body.history) ? body.history : [],
      audioBase64: body.audioBase64,
      mimeType: body.mimeType,
      typedText: body.typedText,
    });
    const db = readDb();
    db.userProfile = awardStudyXp(db.userProfile, 5);
    writeDb(db);
    res.json({ ...result, userProfile: db.userProfile });
  } catch (err) {
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

// Privacy: Delete stored Speaking audio recordings while preserving transcripts & analytics
app.delete('/api/speaking/audio', (_req, res) => {
  const db = readDb();
  db.speakingSessions = db.speakingSessions.map((ses) => ({
    ...ses,
    turns: ses.turns.map((turn) => ({ ...turn, audioDataUrl: undefined })),
  }));
  writeDb(db);
  res.json({ ok: true, speakingSessions: db.speakingSessions });
});

// Profile, Coach, Accessibility & Study Plan Settings
app.put('/api/profile', (req, res) => {
  const body = req.body as Partial<UserProfile>;
  const db = readDb();
  const nextCurrentBand =
    typeof body.currentBand === 'number' && Number.isFinite(body.currentBand)
      ? Math.round(Math.max(4.5, Math.min(9.0, body.currentBand)) * 2) / 2
      : db.userProfile.currentBand;
  const nextTargetBand =
    typeof body.targetBand === 'number' && Number.isFinite(body.targetBand)
      ? Math.round(Math.max(4.5, Math.min(9.0, body.targetBand)) * 2) / 2
      : db.userProfile.targetBand;
  const nextTaper =
    body.taperDaysBeforeExam === 2 || body.taperDaysBeforeExam === 3
      ? body.taperDaysBeforeExam
      : db.userProfile.taperDaysBeforeExam ?? 2;
  const nextPriorityCriteria = Array.isArray(body.priorityCriteria)
    ? body.priorityCriteria.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).slice(0, 8)
    : db.userProfile.priorityCriteria;

  const nextLeaderboardUsername =
    typeof body.leaderboardUsername === 'string'
      ? body.leaderboardUsername.trim().replace(/\s+/g, ' ').slice(0, 24)
      : db.userProfile.leaderboardUsername;
  const nextShowUsernameOnLeaderboard =
    typeof body.showUsernameOnLeaderboard === 'boolean'
      ? body.showUsernameOnLeaderboard
      : db.userProfile.showUsernameOnLeaderboard;

  db.userProfile = {
    ...db.userProfile,
    ...body,
    currentBand: nextCurrentBand,
    targetBand: nextTargetBand,
    taperDaysBeforeExam: nextTaper,
    priorityCriteria: nextPriorityCriteria,
    leaderboardUsername: nextLeaderboardUsername,
    showUsernameOnLeaderboard: nextShowUsernameOnLeaderboard,
    coachSpeed:
      typeof body.coachSpeed === 'number'
        ? Math.max(0.75, Math.min(1.25, body.coachSpeed))
        : db.userProfile.coachSpeed,
    dailyGoalMinutes:
      typeof body.dailyGoalMinutes === 'number'
        ? Math.max(5, Math.min(120, body.dailyGoalMinutes))
        : db.userProfile.dailyGoalMinutes,
  };
  writeDb(db);
  res.json(db.userProfile);
});

// Global Streak Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const db = readDb();
  const streakHint =
    typeof req.query.streak === 'string' && Number.isFinite(Number(req.query.streak))
      ? Math.max(0, Math.floor(Number(req.query.streak)))
      : undefined;
  const xpHint =
    typeof req.query.xp === 'string' && Number.isFinite(Number(req.query.xp))
      ? Math.max(0, Math.floor(Number(req.query.xp)))
      : undefined;
  res.json(buildRankedLeaderboard(db, streakHint, xpHint));
});

// Export and Delete user data (Section 21 & 31)
app.get('/api/user-data/export', (_req, res) => {
  const db = readDb();
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    userProfile: db.userProfile,
    customTopics: db.tasks.filter((t) => t.isCustom),
    customSpeakingTopics: db.speakingTopics.filter((t) => t.isCustom),
    submissions: db.submissions,
    speakingSessions: db.speakingSessions.map((ses) => ({
      ...ses,
      turns: ses.turns.map((t) => ({ ...t, audioDataUrl: t.audioDataUrl ? '[AUDIO_OMITTED_IN_JSON]' : undefined })),
    })),
    errorJournal: db.errorJournal,
    exercises: db.exercises,
    flashcards: db.flashcards,
  };
  res.setHeader('Content-Disposition', 'attachment; filename="ielts-lab-export.json"');
  res.json(exportPayload);
});

app.delete('/api/user-data', (_req, res) => {
  const db = readDb();
  db.tasks = db.tasks.filter((t) => !t.isCustom);
  db.speakingTopics = db.speakingTopics.filter((t) => !t.isCustom);
  db.submissions = [];
  db.speakingSessions = [];
  db.errorJournal = [];
  db.exercises = [];
  db.flashcards = [];
  db.complaints = [];
  db.drafts = {};
  db.userProfile = {
    ...structuredClone(DEFAULT_USER_PROFILE),
    fontSize: db.userProfile.fontSize,
    highContrast: db.userProfile.highContrast,
    reducedMotion: db.userProfile.reducedMotion,
  };
  writeDb(db);
  res.json(db);
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  httpServer.requestTimeout = 180_000;
  httpServer.keepAliveTimeout = 65_000;
  attachLiveCoachWebSocket(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`IELTS Writing Lab server listening on http://localhost:${PORT}`);
  });
}

startServer();
