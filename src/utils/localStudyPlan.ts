import type { IeltsFormat } from '../types/ielts';
import type { AppRoute } from '../components/SidebarNav';

export type SkillKey = 'listening' | 'reading' | 'writing' | 'speaking';

export interface SkillBands {
  listening: number;
  reading: number;
  writing: number;
  speaking: number;
}

export interface LocalDeviceStudyProfile {
  deviceId: string;
  registeredAt: string;
  learnerName: string;
  format: IeltsFormat;
  currentBand: number;
  targetBand: number;
  skillBands: SkillBands;
  examDate: string; // YYYY-MM-DD
  dailyGoalMinutes: number;
  taperDaysBeforeExam: 2 | 3;
  restDays: string[]; // English weekday names e.g. ['Sunday']
  /** Map of `${isoDate}::${skill}` -> true */
  completedTasks: Record<string, boolean>;
  /** Map of `${isoDate}` -> user notes (e.g. Cambridge test score, difficult words) */
  dayNotes: Record<string, string>;
}

export interface SkillRoutineItem {
  skill: SkillKey;
  skillLabel: string;
  shortCode: 'L' | 'R' | 'W' | 'S';
  minutes: number;
  title: string;
  details: string;
  tip: string;
  resourceHint: string;
  siteRoute?: AppRoute;
  siteRouteLabel?: string;
  taskKey: string;
  completed: boolean;
}

export interface FourSkillScheduledDay {
  dayIndex: number; // 1-based from today
  offset: number; // 0 = today
  isoDate: string;
  dateLabel: string;
  fullDateLabel: string;
  weekdayName: string;
  weekdayShortRu: string;
  phase: 'active' | 'taper' | 'exam';
  phaseLabel: string;
  isRestDay: boolean;
  isMockDay: boolean;
  totalMinutes: number;
  projectedBand: number;
  completedCount: number;
  skills: Record<SkillKey, SkillRoutineItem>;
}

const STORAGE_KEY = 'ielts_lab_local_plan_v1';

export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(base: Date, offset: number): Date {
  const copy = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  copy.setDate(copy.getDate() + offset);
  return copy;
}

export function parseIsoDateLocal(iso: string): Date | null {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function daysBetweenToday(examDateStr: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = parseIsoDateLocal(examDateStr);
  if (!target) return 21;
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff);
}

function generateLocalDeviceId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `dev-${crypto.randomUUID().slice(0, 8)}`;
    }
  } catch {
    // ignore
  }
  return `dev-${Math.random().toString(36).slice(2, 10)}`;
}

export function roundHalfBand(val: number): number {
  return Math.round(val * 2) / 2;
}

export function createDefaultLocalPlan(seed?: {
  format?: IeltsFormat;
  currentBand?: number;
  targetBand?: number;
  examDate?: string;
  dailyGoalMinutes?: number;
  taperDaysBeforeExam?: 2 | 3;
  restDays?: string[];
  learnerName?: string;
}): LocalDeviceStudyProfile {
  const baseBand = seed?.currentBand && seed.currentBand >= 4 ? seed.currentBand : 6.0;
  const target = seed?.targetBand && seed.targetBand >= baseBand ? seed.targetBand : Math.max(7.0, baseBand + 0.5);
  const defaultExam =
    seed?.examDate && /^\d{4}-\d{2}-\d{2}$/.test(seed.examDate) && daysBetweenToday(seed.examDate) >= 1
      ? seed.examDate
      : toIsoDateLocal(addDays(new Date(), 21));

  return {
    deviceId: generateLocalDeviceId(),
    registeredAt: new Date().toISOString(),
    learnerName: seed?.learnerName?.trim() || 'Кандидат IELTS',
    format: seed?.format ?? 'academic',
    currentBand: baseBand,
    targetBand: target,
    skillBands: {
      listening: baseBand,
      reading: baseBand,
      writing: baseBand,
      speaking: baseBand,
    },
    examDate: defaultExam,
    dailyGoalMinutes:
      seed?.dailyGoalMinutes && seed.dailyGoalMinutes >= 30 ? seed.dailyGoalMinutes : 60,
    taperDaysBeforeExam: seed?.taperDaysBeforeExam === 3 ? 3 : 2,
    restDays: seed?.restDays && seed.restDays.length > 0 ? seed.restDays : ['Sunday'],
    completedTasks: {},
    dayNotes: {},
  };
}

export function loadOrCreateLocalDevicePlan(seed?: {
  format?: IeltsFormat;
  currentBand?: number;
  targetBand?: number;
  examDate?: string;
  dailyGoalMinutes?: number;
  taperDaysBeforeExam?: 2 | 3;
  restDays?: string[];
  learnerName?: string;
}): LocalDeviceStudyProfile {
  if (typeof window === 'undefined') {
    return createDefaultLocalPlan(seed);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalDeviceStudyProfile>;
      if (parsed && typeof parsed.deviceId === 'string') {
        const fallback = createDefaultLocalPlan(seed);
        const validExamDate =
          parsed.examDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.examDate) && daysBetweenToday(parsed.examDate) >= 1
            ? parsed.examDate
            : fallback.examDate;

        return {
          ...fallback,
          ...parsed,
          examDate: validExamDate,
          skillBands: {
            ...fallback.skillBands,
            ...(parsed.skillBands ?? {}),
          },
          restDays: Array.isArray(parsed.restDays) ? parsed.restDays : fallback.restDays,
          completedTasks:
            parsed.completedTasks && typeof parsed.completedTasks === 'object'
              ? parsed.completedTasks
              : {},
          dayNotes:
            parsed.dayNotes && typeof parsed.dayNotes === 'object'
              ? parsed.dayNotes
              : {},
        };
      }
    }
  } catch {
    // ignore corrupted localStorage and recreate cleanly
  }

  const created = createDefaultLocalPlan(seed);
  saveLocalDevicePlan(created);
  return created;
}

export function saveLocalDevicePlan(plan: LocalDeviceStudyProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  } catch {
    // ignore quota errors
  }
}

export function computeLocalStreakAndXp(plan: LocalDeviceStudyProfile): {
  completedSkillCount: number;
  completedFullDays: number;
  streakDays: number;
  xp: number;
} {
  const keys = Object.keys(plan.completedTasks).filter((k) => plan.completedTasks[k]);
  const completedSkillCount = keys.length;

  const byDate: Record<string, number> = {};
  for (const k of keys) {
    const [iso] = k.split('::');
    if (iso) byDate[iso] = (byDate[iso] || 0) + 1;
  }

  const completedFullDays = Object.values(byDate).filter((c) => c >= 4).length;

  // Streak ending today or yesterday if at least 1 skill checked
  let streak = 0;
  const now = new Date();
  const todayIso = toIsoDateLocal(now);
  const startOffset = byDate[todayIso] ? 0 : -1;
  for (let i = startOffset; i >= -90; i--) {
    const iso = toIsoDateLocal(addDays(now, i));
    if (byDate[iso] && byDate[iso] > 0) {
      streak++;
    } else {
      break;
    }
  }

  return {
    completedSkillCount,
    completedFullDays,
    streakDays: streak,
    xp: completedSkillCount * 10 + completedFullDays * 20,
  };
}

interface DrillTemplate {
  title: string;
  details: string;
  tip: string;
  resourceHint: string;
  siteRoute?: AppRoute;
  siteRouteLabel?: string;
}

const LISTENING_DRILLS: DrillTemplate[] = [
  {
    title: 'Section 1–2 · Детали, числа и дистракторы',
    details: 'Пройдите Part 1 и Part 2 официального теста. Выпишите все исправления дикторов (номера, даты, имена по буквам) и карты/планы.',
    tip: 'Обращайте внимание на слова-сигналы смены ответа: "actually", "sorry, I meant", "originally".',
    resourceHint: 'Cambridge IELTS 15–19 · Listening Part 1–2 (15–20 мин)',
  },
  {
    title: 'Section 3 · Академический диалог и MCQ',
    details: 'Сделайте Part 3 с вопросами Multiple Choice и Matching. После проверки переслушайте фрагменты с ошибками, читая аудиоскрипт.',
    tip: 'В Part 3 часто соглашаются не сразу: отслеживайте финальное решение обоих студентов.',
    resourceHint: 'Cambridge IELTS · Part 3 + разбор транскрипта',
  },
  {
    title: 'Section 4 · Лекция и Note Completion',
    details: 'Выполните Part 4 без пауз. За 30 сек до начала подчеркните тип пропущенного слова (сущ., глагол, число) и слова-маяки.',
    tip: 'Следите за единственным/множественным числом и ограничением "ONE WORD ONLY".',
    resourceHint: 'Cambridge IELTS · Part 4 (10 вопросов подряд)',
  },
  {
    title: 'Shadowing + Орфография ловушек',
    details: 'Возьмите сложный отрывок на 3 минуты, повторяйте за диктором с темпом и интонацией, затем проверьте 15 частых слов по орфографии.',
    tip: 'Потеря "-s" или опечатка в слове автоматически обнуляет балл за вопрос.',
    resourceHint: 'BBC 6 Minute English / TED-Ed + диктант',
  },
  {
    title: 'Контрольный Listening на скорость (1.0x)',
    details: 'Решите полный блок из 4 секций в экзаменационном режиме без перерывов и проверьте итоговое количество из 40.',
    tip: 'Если пропустили вопрос — мгновенно переходите к следующему, не теряйте всю цепочку.',
    resourceHint: 'Полный тест Listening (30 мин + 2 мин проверка)',
  },
];

function getReadingDrills(format: IeltsFormat): DrillTemplate[] {
  if (format === 'general') {
    return [
      {
        title: 'GT Section 1–2 · Сканирование и объявления',
        details: 'Пройдите Section 1 и 2 General Training (расписания, инструкции, контракты) строго за 20 минут без словаря.',
        tip: 'В GT критична скорость на первых двух секциях, чтобы оставить 25+ минут на Section 3.',
        resourceHint: 'Cambridge IELTS General Training · Sections 1–2',
      },
      {
        title: 'True / False / Not Given без домыслов',
        details: 'Отработайте 2 блока T/F/NG. Для каждого "Not Given" подчеркните в тексте точку, где информации физически нет.',
        tip: 'Разделяйте "противоречит тексту (False)" и "в тексте этого не сказано (Not Given)".',
        resourceHint: 'IELTS Liz / Cambridge GT Reading T/F/NG',
      },
      {
        title: 'Matching Headings и основная мысль абзаца',
        details: 'Выполните подбор заголовков: читайте 1–2 и последнее предложение абзаца, сформулируйте тему своими словами до взгляда на список.',
        tip: 'Не выбирайте заголовок только по совпадению одного редкого слова.',
        resourceHint: 'Cambridge GT · Section 3 Long Passage',
      },
      {
        title: 'Перефразы и таблица синонимов',
        details: 'Выпишите из выполненного текста 10 пар «слово в вопросе ↔ перефраз в тексте» и повторите ключевую лексику.',
        tip: 'Почти 90% верных ответов опираются на синоним или переформулировку.',
        resourceHint: 'Словарь синонимов из разобранного пассажа',
      },
      {
        title: 'Тайминг-спринт General Reading (20/20 мин)',
        details: 'Прорешайте сложный пассаж Section 3 на время (ровно 20 минут) с обязательным переносом ответов.',
        tip: 'Цель на Band 7.0+ в GT — от 34 из 40 верных ответов.',
        resourceHint: 'Таймер 20 мин · Cambridge GT Section 3',
      },
    ];
  }

  return [
    {
      title: 'True / False / Not Given и Yes / No / Not Given',
      details: 'Сделайте 1 научный пассаж с акцентом на T/F/NG и Y/N/NG. К каждому ответу выпишите точную цитату-доказательство.',
      tip: 'Слова-ограничители (only, always, mainly, never) чаще всего определяют грань между True и False.',
      resourceHint: 'Cambridge Academic · Passage 1–2 (20 мин)',
    },
    {
      title: 'Matching Headings & Matching Information',
      details: 'Отработайте самые времязатратные задания Reading: сначала Summary/Details, затем Headings по главной идее абзацев.',
      tip: 'Зачеркивайте использованные заголовки сразу и пропускайте спорный абзац до конца блока.',
      resourceHint: 'Cambridge Academic · Passage 2 (20 мин)',
    },
    {
      title: 'Summary Completion & Sentence Completion',
      details: 'Решите блок на заполнение пропусков. До чтения текста определите грамматическую форму (сущ./прил./причастие).',
      tip: 'Слово из текста вписывается ровно так, как оно стоит в оригинале, без изменения под формат.',
      resourceHint: 'Cambridge Academic · Summary & Diagram',
    },
    {
      title: 'Анализ ловушек и карта перефразов',
      details: 'Разберите вчерашние ошибки: выпишите 10–12 связок «формулировка вопроса ↔ научный перефраз в тексте».',
      tip: 'Разбор ошибок даёт больший рост балла, чем бездумное решение 3 тестов подряд.',
      resourceHint: 'Личный список ошибок Reading + журнал',
    },
    {
      title: 'Тайминг-спринт Academic Passage 3',
      details: 'Пройдите самый сложный Passage 3 за 20 минут с жёсткой отсечкой времени и подсчётом точности.',
      tip: 'На Band 7.0 Academic нужно минимум 30/40, на Band 7.5 — 33/40.',
      resourceHint: 'Таймер 20 мин · Cambridge Academic Passage 3',
    },
  ];
}

function getWritingDrills(format: IeltsFormat): DrillTemplate[] {
  if (format === 'general') {
    return [
      {
        title: 'GT Task 1 · Formal / Semi-formal Letter',
        details: 'Напишите письмо на 160–180 слов за 20 минут, полностью раскрыв все 3 bullet points и выдержав деловой тон.',
        tip: 'Проверьте верное обращение и концовку: Dear Sir/Madam → Yours faithfully.',
        resourceHint: 'Тренажёр Task 1 прямо на сайте',
        siteRoute: 'practice1',
        siteRouteLabel: 'Открыть Task 1',
      },
      {
        title: 'Task 2 · Планирование и Opinion / Discussion',
        details: '5 минут составьте план с 2 чёткими аргументами, затем напишите эссе 260–280 слов и отправьте на проверку ИИ.',
        tip: 'Один абзац body = одна центральная идея + конкретный пример.',
        resourceHint: 'Тренажёр Task 2 прямо на сайте',
        siteRoute: 'practice2',
        siteRouteLabel: 'Открыть Task 2',
      },
      {
        title: 'GT Task 1 · Informal Letter + идиомы',
        details: 'Потренируйте дружеское письмо (приглашение, извинение или совет) с естественными разговорными переходами и фразовыми глаголами.',
        tip: 'Избегайте канцеляризмов ("Hereby I inform you") в письме другу.',
        resourceHint: 'Тренажёр Task 1 прямо на сайте',
        siteRoute: 'practice1',
        siteRouteLabel: 'Открыть Task 1',
      },
      {
        title: 'Разбор ошибок и Improve My Writing',
        details: 'Откройте журнал ошибок: отработайте повторяющиеся грамматические паттерны (артикли, предлоги, времена) и сложные конструкции.',
        tip: 'Сделайте самостоятельную правку прошлого эссе без автоподсказок.',
        resourceHint: 'Журнал ошибок и прогресс на сайте',
        siteRoute: 'progress',
        siteRouteLabel: 'Открыть журнал',
      },
      {
        title: 'Task 2 · Problem/Solution или Two-Part Essay',
        details: 'Напишите эссе под таймер 40 минут, уделив 4 минуты финальной вычитке пунктуации и согласования подлежащего со сказуемым.',
        tip: 'Ответьте на обе части вопроса в равном объёме.',
        resourceHint: 'Тренажёр Task 2 прямо на сайте',
        siteRoute: 'practice2',
        siteRouteLabel: 'Открыть Task 2',
      },
    ];
  }

  return [
    {
      title: 'Academic Task 1 · Динамика и Overview (Графики)',
      details: 'Напишите описание линейного графика или столбчатой диаграммы за 20 минут. Сразу после вступления дайте сильный Overview без цифр.',
      tip: 'Показывайте сравнения (twice as high, marginally lower), а не перечисляйте каждую точку.',
      resourceHint: 'Тренажёр Task 1 прямо на сайте',
      siteRoute: 'practice1',
      siteRouteLabel: 'Открыть Task 1',
    },
    {
      title: 'Task 2 · Opinion / Discuss Both Views (4 абзаца)',
      details: 'За 40 минут напишите эссе 260–290 слов с чёткой позицией во вступлении, PEEL-абзацами и выводом без новых идей.',
      tip: 'Task 2 весит 67% итогового балла Writing — соблюдайте структуру и логические связки.',
      resourceHint: 'Тренажёр Task 2 прямо на сайте',
      siteRoute: 'practice2',
      siteRouteLabel: 'Открыть Task 2',
    },
    {
      title: 'Academic Task 1 · Карты (Maps) или Процессы',
      details: 'Отработайте пассивный залог для процессов и пространственные предлоги/изменения (demolished, replaced by, adjacent to) для карт.',
      tip: 'Для процессов обязательно укажите количество шагов и начало/финал в Overview.',
      resourceHint: 'Тренажёр Task 1 прямо на сайте',
      siteRoute: 'practice1',
      siteRouteLabel: 'Открыть Task 1',
    },
    {
      title: 'Грамматика C1 и работа над ошибками',
      details: 'Откройте журнал ошибок и выполните 2–3 микро-упражнения на ваши слабые правила + перепишите 3 предложения из прошлого эссе.',
      tip: 'Сочетайте простые точные фразы с complex sentences и passive voice.',
      resourceHint: 'Журнал ошибок на сайте',
      siteRoute: 'progress',
      siteRouteLabel: 'Открыть журнал',
    },
    {
      title: 'Task 2 · Advantages/Disadvantages или Problem/Solution',
      details: 'Напишите полное эссе с самопроверкой: удалите повторы слов, замените простые глаголы на точные академические коллокации.',
      tip: 'Оставляйте 4–5 минут в конце на проверку артиклей и окончаний -s/-ed.',
      resourceHint: 'Тренажёр Task 2 прямо на сайте',
      siteRoute: 'practice2',
      siteRouteLabel: 'Открыть Task 2',
    },
  ];
}

const SPEAKING_DRILLS: DrillTemplate[] = [
  {
    title: 'Part 1 · Естественные ответы на 2–3 предложения',
    details: 'Ответьте на 6–8 бытовых вопросов (дом, учёба, привычки) по формуле: Прямой ответ → Причина → Мини-пример.',
    tip: 'Не заучивайте монологи — звучите живо и уверенно с первых секунд.',
    resourceHint: 'Speaking Lab или живой AI Coach на сайте',
    siteRoute: 'speaking',
    siteRouteLabel: 'Открыть Speaking',
  },
  {
    title: 'Part 2 · Cue Card (1 мин план + 2 мин монолог)',
    details: 'Засеките ровно 1 минуту на ключевые слова (Who/When/Details/Feelings) и говорите без остановки полные 2 минуты.',
    tip: 'Рассказывайте реальную или знакомую историю — так речь течёт быстрее и естественнее.',
    resourceHint: 'Speaking Lab · Cue Card на сайте',
    siteRoute: 'speaking',
    siteRouteLabel: 'Тренировать Part 2',
  },
  {
    title: 'AI Coach · Живой диалог без пауз',
    details: 'Поговорите с голосовым AI Coach 10–15 минут в свободном режиме, отрабатывая связки (To be honest, Having said that, From my perspective).',
    tip: 'Если забыли слово — перефразируйте его простым способом вместо длинной паузы.',
    resourceHint: 'Живой голосовой тренажёр на сайте',
    siteRoute: 'coach',
    siteRouteLabel: 'Открыть AI Coach',
  },
  {
    title: 'Part 3 · Абстрактные вопросы и аргументация',
    details: 'Потренируйте развёрнутые ответы о трендах, обществе и будущем: тезис → контраст → гипотеза (If governments invested...).',
    tip: 'Part 3 проверяет гибкость грамматики и лексики на сложные темы.',
    resourceHint: 'Speaking Lab · Part 3 на сайте',
    siteRoute: 'speaking',
    siteRouteLabel: 'Открыть Part 3',
  },
  {
    title: 'Pronunciation & Fluency · Разбор речи',
    details: 'Запишите 1 короткий ответ и прослушайте себя (или пройдите оценку в Speaking Lab): проверьте интонацию, ударения и окончания.',
    tip: 'Чёткая интонация и логические паузы ценятся выше, чем «акцент носителя».',
    resourceHint: 'Speaking Lab · Диагностика речи',
    siteRoute: 'speaking',
    siteRouteLabel: 'Открыть Speaking',
  },
];

function allocateDailyMinutes(
  totalMinutes: number,
  skillBands: SkillBands,
  targetBand: number
): Record<SkillKey, number> {
  const gaps: Record<SkillKey, number> = {
    listening: Math.max(0.25, targetBand - skillBands.listening + 0.5),
    reading: Math.max(0.25, targetBand - skillBands.reading + 0.5),
    writing: Math.max(0.25, targetBand - skillBands.writing + 0.65),
    speaking: Math.max(0.25, targetBand - skillBands.speaking + 0.5),
  };
  const sum = gaps.listening + gaps.reading + gaps.writing + gaps.speaking;

  const raw: Record<SkillKey, number> = {
    listening: Math.max(5, Math.round((totalMinutes * gaps.listening) / sum / 5) * 5),
    reading: Math.max(5, Math.round((totalMinutes * gaps.reading) / sum / 5) * 5),
    writing: Math.max(10, Math.round((totalMinutes * gaps.writing) / sum / 5) * 5),
    speaking: Math.max(5, Math.round((totalMinutes * gaps.speaking) / sum / 5) * 5),
  };

  const diff = totalMinutes - (raw.listening + raw.reading + raw.writing + raw.speaking);
  raw.writing = Math.max(5, raw.writing + diff);
  return raw;
}

export function buildFourSkillSchedule(
  plan: LocalDeviceStudyProfile,
  maxDaysLimit = 90
): FourSkillScheduledDay[] {
  const now = new Date();
  const totalDaysToExam = daysBetweenToday(plan.examDate);
  const taperDays = plan.taperDaysBeforeExam === 3 ? 3 : 2;
  const activeDaysTotal = Math.max(1, totalDaysToExam - taperDays);
  const displayLimit = Math.min(totalDaysToExam, maxDaysLimit);

  const readingDrills = getReadingDrills(plan.format);
  const writingDrills = getWritingDrills(plan.format);
  const bandGap = Math.max(0, plan.targetBand - plan.currentBand);

  const days: FourSkillScheduledDay[] = [];

  for (let offset = 0; offset <= displayLimit; offset++) {
    const dateObj = addDays(now, offset);
    const isoDate = toIsoDateLocal(dateObj);
    const weekdayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const weekdayShortRu = dateObj.toLocaleDateString('ru-RU', { weekday: 'short' });
    const dateLabel = dateObj.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short',
    });
    const fullDateLabel = dateObj.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
    });

    const daysRemaining = totalDaysToExam - offset;
    const isRestDay = plan.restDays.includes(weekdayName);

    const makeItem = (
      skill: SkillKey,
      skillLabel: string,
      shortCode: 'L' | 'R' | 'W' | 'S',
      minutes: number,
      tpl: DrillTemplate
    ): SkillRoutineItem => {
      const taskKey = `${isoDate}::${skill}`;
      return {
        skill,
        skillLabel,
        shortCode,
        minutes,
        title: tpl.title,
        details: tpl.details,
        tip: tpl.tip,
        resourceHint: tpl.resourceHint,
        siteRoute: tpl.siteRoute,
        siteRouteLabel: tpl.siteRouteLabel,
        taskKey,
        completed: Boolean(plan.completedTasks[taskKey]),
      };
    };

    // 1. EXAM DAY
    if (daysRemaining === 0) {
      const skills: Record<SkillKey, SkillRoutineItem> = {
        listening: makeItem('listening', 'Listening', 'L', 5, {
          title: 'Фокус на первые 2 минуты аудио',
          details: 'Сразу читайте вопросы вперёд на 10–15 сек и ловите переключение дикторов. Не зацикливайтесь на пропуске.',
          tip: 'Спокойное дыхание и чёткое написание дат/имён.',
          resourceHint: 'Экзамен · 40 вопросов',
        }),
        reading: makeItem('reading', 'Reading', 'R', 5, {
          title: 'Жёсткий тайминг 20 / 20 / 20 минут',
          details: 'Не тратьте больше 20 минут на один пассаж. Отмечайте ключевые слова и переносите ответы сразу.',
          tip: 'Ищите синонимы, а не буквальное совпадение.',
          resourceHint: 'Экзамен · 3 секции (60 мин)',
        }),
        writing: makeItem('writing', 'Writing', 'W', 5, {
          title: 'План 4 минуты + Task 2 приоритет',
          details:
            plan.format === 'academic'
              ? 'Task 1 (20 мин): чёткий Overview без воды. Task 2 (40 мин): 4 абзаца, ясная позиция, 3 мин вычитка.'
              : 'Task 1 (20 мин): верный тон письма + все 3 пункта. Task 2 (40 мин): 4 абзаца, аргументы и 3 мин вычитка.',
          tip: 'Качество и логика важнее сложных зазубренных фраз.',
          resourceHint: 'Экзамен · Writing 60 мин',
        }),
        speaking: makeItem('speaking', 'Speaking', 'S', 5, {
          title: 'Утренний разогрев 5 минут вслух',
          details: 'Перед входом проговорите 3–4 фразы на английском с AI Coach, чтобы переключить артикуляцию без стресса.',
          tip: 'Говорите ровно, с интонацией и естественными паузами.',
          resourceHint: 'Быстрая разминка на сайте',
          siteRoute: 'coach',
          siteRouteLabel: 'Разогреться',
        }),
      };

      const completedCount = Object.values(skills).filter((s) => s.completed).length;
      days.push({
        dayIndex: offset + 1,
        offset,
        isoDate,
        dateLabel,
        fullDateLabel,
        weekdayName,
        weekdayShortRu,
        phase: 'exam',
        phaseLabel: 'День экзамена',
        isRestDay: false,
        isMockDay: true,
        totalMinutes: 20,
        projectedBand: plan.targetBand,
        completedCount,
        skills,
      });
      continue;
    }

    // 2. PRE-EXAM TAPER DAYS (2 or 3 days before exam)
    if (daysRemaining <= taperDays) {
      const taperStep = taperDays - daysRemaining + 1;
      const isLastDayBeforeExam = daysRemaining === 1;
      const skills: Record<SkillKey, SkillRoutineItem> = {
        listening: makeItem('listening', 'Listening', 'L', 10, {
          title: isLastDayBeforeExam
            ? 'Лёгкое прослушивание без тестов'
            : 'Проверка частых ошибок Listening (орфография)',
          details: isLastDayBeforeExam
            ? 'Послушайте 10 минут спокойный английский подкаст (BBC / TED), чтобы ухо было привычно к речи.'
            : 'Посмотрите свой список прошлых ошибок из Section 1 и 4: числа, множественное число, опечатки.',
          tip: 'Никакого переутомления за 1–2 дня до теста.',
          resourceHint: 'Лёгкий буферный режим',
        }),
        reading: makeItem('reading', 'Reading', 'R', 10, {
          title: isLastDayBeforeExam
            ? 'Свободное чтение 1 короткой статьи'
            : 'Повтор стратегии T/F/NG и Headings (без таймера)',
          details: isLastDayBeforeExam
            ? 'Прочитайте 1 небольшую статью для комфорта глаз. Без проверки на баллы.'
            : 'Просмотрите 5–6 разобранных ранее вопросов T/F/NG, чтобы освежить логику отбора.',
          tip: 'Свежая голова на экзамене даёт +0.5 к концентрации.',
          resourceHint: 'Лёгкое повторение стратегии',
        }),
        writing: makeItem('writing', 'Writing', 'W', 10, {
          title:
            taperStep === 1
              ? 'Повтор журнала ошибок и связок'
              : 'Просмотр 2 своих лучших эссе и плана на 5 мин',
          details:
            taperStep === 1
              ? 'Откройте журнал ошибок и пробегитесь по топ-5 частых грамматических мелочей.'
              : 'Перечитайте удачные вступления и Overview, проверьте список универсальных связок.',
          tip: 'Не пишите тяжёлые Mock-эссе накануне экзамена.',
          resourceHint: 'Журнал ошибок на сайте',
          siteRoute: 'progress',
          siteRouteLabel: 'Открыть журнал',
        }),
        speaking: makeItem('speaking', 'Speaking', 'S', 10, {
          title: 'Спокойный диалог с AI Coach (5–10 мин)',
          details: 'Короткая дружелюбная беседа для поддержания лёгкости речи и уверенности перед днём экзамена.',
          tip: 'После тренировки обязательно отдохните и выспитесь.',
          resourceHint: 'AI Coach на сайте',
          siteRoute: 'coach',
          siteRouteLabel: 'Открыть AI Coach',
        }),
      };

      const completedCount = Object.values(skills).filter((s) => s.completed).length;
      days.push({
        dayIndex: offset + 1,
        offset,
        isoDate,
        dateLabel,
        fullDateLabel,
        weekdayName,
        weekdayShortRu,
        phase: 'taper',
        phaseLabel: `Буфер · за ${daysRemaining} дн.`,
        isRestDay: false,
        isMockDay: false,
        totalMinutes: 40,
        projectedBand: plan.targetBand,
        completedCount,
        skills,
      });
      continue;
    }

    // 3. REST / RECOVERY DAY
    if (isRestDay) {
      const skills: Record<SkillKey, SkillRoutineItem> = {
        listening: makeItem('listening', 'Listening', 'L', 10, {
          title: 'Фоновый английский в удовольствие',
          details: 'Посмотрите короткое видео на YouTube или послушайте подкаст по интересам без субтитров.',
          tip: 'Пассивное погружение удерживает слух в тонусе без усталости.',
          resourceHint: '10 мин · Любимый контент на EN',
        }),
        reading: makeItem('reading', 'Reading', 'R', 5, {
          title: 'Лёгкое чтение 1 новости или поста',
          details: 'Прочитайте одну интересную заметку на английском (BBC, The Guardian, Medium) без словаря.',
          tip: 'Тренируйте привычку понимать общий смысл с первого прочтения.',
          resourceHint: '5 мин · Свободное чтение',
        }),
        writing: makeItem('writing', 'Writing', 'W', 5, {
          title: '3–4 предложения в дневник или журнал',
          details: 'Запишите пару мыслей о прошедшей неделе, используя 2 новых слова из вашего журнала.',
          tip: 'В день отдыха не пишем тесты и эссе на время.',
          resourceHint: 'Журнал ошибок / заметка дня',
          siteRoute: 'progress',
          siteRouteLabel: 'Повторить слова',
        }),
        speaking: makeItem('speaking', 'Speaking', 'S', 5, {
          title: '5-минутный лёгкий разговор с AI Coach',
          details: 'Короткий диалог без оценок и экзаменационного давления — просто чтобы не выпадать из ритма.',
          tip: 'Отдых — важная часть закрепления памяти.',
          resourceHint: 'AI Coach на сайте',
          siteRoute: 'coach',
          siteRouteLabel: 'Поговорить 5 мин',
        }),
      };

      const completedCount = Object.values(skills).filter((s) => s.completed).length;
      const progressRatio = Math.min(1, (offset + 1) / activeDaysTotal);
      days.push({
        dayIndex: offset + 1,
        offset,
        isoDate,
        dateLabel,
        fullDateLabel,
        weekdayName,
        weekdayShortRu,
        phase: 'active',
        phaseLabel: 'День отдыха',
        isRestDay: true,
        isMockDay: false,
        totalMinutes: 25,
        projectedBand: roundHalfBand(plan.currentBand + bandGap * progressRatio),
        completedCount,
        skills,
      });
      continue;
    }

    // 4. ACTIVE TRAINING DAY (Full 4-skill routine)
    const alloc = allocateDailyMinutes(plan.dailyGoalMinutes, plan.skillBands, plan.targetBand);
    const isMockDay = offset > 0 && (offset + 1) % 7 === 0 && plan.dailyGoalMinutes >= 60;

    const lDrill = isMockDay
      ? LISTENING_DRILLS[4]
      : LISTENING_DRILLS[offset % (LISTENING_DRILLS.length - 1)];
    const rDrill = isMockDay
      ? readingDrills[4]
      : readingDrills[offset % (readingDrills.length - 1)];
    const wDrill = isMockDay
      ? {
          title: 'Контрольный Writing Mock (Task 1 + Task 2)',
          details:
            plan.format === 'academic'
              ? 'Пройдите полный Writing Mock на сайте с общим таймером 60 мин (график + эссе) и проверьте итоговый Band.'
              : 'Пройдите полный General Writing Mock на сайте (письмо + эссе) в реальном тайминге 60 минут.',
          tip: 'Соблюдайте лимит 20 мин на Task 1 и 40 мин на Task 2.',
          resourceHint: 'Writing Mock прямо на сайте',
          siteRoute: 'mock' as AppRoute,
          siteRouteLabel: 'Запустить Mock',
        }
      : writingDrills[offset % writingDrills.length];
    const sDrill = isMockDay
      ? {
          title: 'Полное Speaking-интервью (Parts 1–3)',
          details: 'Пройдите полный Speaking Mock Test на сайте от знакомства до Part 3 с диагностикой Fluency и Pronunciation.',
          tip: 'Зафиксируйте средний балл и сравните с прошлым замером.',
          resourceHint: 'Speaking Lab · Full Mock на сайте',
          siteRoute: 'speaking' as AppRoute,
          siteRouteLabel: 'Пройти Mock',
        }
      : SPEAKING_DRILLS[offset % SPEAKING_DRILLS.length];

    const skills: Record<SkillKey, SkillRoutineItem> = {
      listening: makeItem('listening', 'Listening', 'L', alloc.listening, lDrill),
      reading: makeItem('reading', 'Reading', 'R', alloc.reading, rDrill),
      writing: makeItem('writing', 'Writing', 'W', alloc.writing, wDrill),
      speaking: makeItem('speaking', 'Speaking', 'S', alloc.speaking, sDrill),
    };

    const completedCount = Object.values(skills).filter((s) => s.completed).length;
    const progressRatio = Math.min(1, (offset + 1) / activeDaysTotal);

    days.push({
      dayIndex: offset + 1,
      offset,
      isoDate,
      dateLabel,
      fullDateLabel,
      weekdayName,
      weekdayShortRu,
      phase: 'active',
      phaseLabel: isMockDay ? 'Контрольный срез' : 'Активная подготовка',
      isRestDay: false,
      isMockDay,
      totalMinutes: alloc.listening + alloc.reading + alloc.writing + alloc.speaking,
      projectedBand: roundHalfBand(plan.currentBand + bandGap * progressRatio),
      completedCount,
      skills,
    });
  }

  return days;
}
