export interface LevelDefinition {
  level: number;
  minXp: number;
  title: string;
  subtitle: string;
}

export interface LevelProgressInfo {
  level: number;
  title: string;
  subtitle: string;
  totalXp: number;
  currentLevelMinXp: number;
  nextLevelMinXp: number;
  xpIntoLevel: number;
  xpRequiredForLevel: number;
  xpRemaining: number;
  progressPercent: number;
}

export const LEVEL_DEFINITIONS: LevelDefinition[] = [
  { level: 1, minXp: 0, title: 'Старт', subtitle: 'Знакомство с форматом IELTS' },
  { level: 2, minXp: 50, title: 'Практик', subtitle: 'Первые регулярные занятия' },
  { level: 3, minXp: 125, title: 'Исследователь', subtitle: 'Стабильный учебный ритм' },
  { level: 4, minXp: 250, title: 'Аналитик', subtitle: 'Точность и разбор ошибок' },
  { level: 5, minXp: 450, title: 'Стратег', subtitle: 'Системный рост по критериям' },
  { level: 6, minXp: 700, title: 'Эксперт', subtitle: 'Уверенная скорость и структура' },
  { level: 7, minXp: 1000, title: 'Мастер IELTS', subtitle: 'Выход на высокий Band' },
  { level: 8, minXp: 1400, title: 'Полиглот', subtitle: 'Свободная аргументация C1+' },
  { level: 9, minXp: 1900, title: 'Виртуоз', subtitle: 'Точность уровня C2' },
  { level: 10, minXp: 2500, title: 'Легенда IELTS', subtitle: 'Максимальная выдержка и мастерство' },
];

const POST_CAP_STEP_XP = 600;
const LAST_LEVEL_STORAGE_KEY = 'ielts_lab_last_seen_level_v1';

export function getLevelProgress(rawXp: number): LevelProgressInfo {
  const totalXp = Math.max(0, Math.floor(Number.isFinite(rawXp) ? rawXp : 0));

  const maxDefined = LEVEL_DEFINITIONS[LEVEL_DEFINITIONS.length - 1];
  if (totalXp >= maxDefined.minXp) {
    const extraLevels = Math.floor((totalXp - maxDefined.minXp) / POST_CAP_STEP_XP);
    const level = maxDefined.level + extraLevels;
    const currentLevelMinXp = maxDefined.minXp + extraLevels * POST_CAP_STEP_XP;
    const nextLevelMinXp = currentLevelMinXp + POST_CAP_STEP_XP;
    const xpIntoLevel = totalXp - currentLevelMinXp;
    const xpRequiredForLevel = POST_CAP_STEP_XP;
    const xpRemaining = Math.max(0, nextLevelMinXp - totalXp);
    const progressPercent = Math.min(
      100,
      Math.max(0, Math.round((xpIntoLevel / xpRequiredForLevel) * 100))
    );

    return {
      level,
      title: maxDefined.title,
      subtitle: maxDefined.subtitle,
      totalXp,
      currentLevelMinXp,
      nextLevelMinXp,
      xpIntoLevel,
      xpRequiredForLevel,
      xpRemaining,
      progressPercent,
    };
  }

  let current = LEVEL_DEFINITIONS[0];
  let next = LEVEL_DEFINITIONS[1];

  for (let i = 0; i < LEVEL_DEFINITIONS.length - 1; i++) {
    const def = LEVEL_DEFINITIONS[i];
    const upcoming = LEVEL_DEFINITIONS[i + 1];
    if (totalXp >= def.minXp && totalXp < upcoming.minXp) {
      current = def;
      next = upcoming;
      break;
    }
  }

  const xpIntoLevel = totalXp - current.minXp;
  const xpRequiredForLevel = Math.max(1, next.minXp - current.minXp);
  const xpRemaining = Math.max(0, next.minXp - totalXp);
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((xpIntoLevel / xpRequiredForLevel) * 100))
  );

  return {
    level: current.level,
    title: current.title,
    subtitle: current.subtitle,
    totalXp,
    currentLevelMinXp: current.minXp,
    nextLevelMinXp: next.minXp,
    xpIntoLevel,
    xpRequiredForLevel,
    xpRemaining,
    progressPercent,
  };
}

export function readLastSeenLevel(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_LEVEL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLastSeenLevel(level: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_LEVEL_STORAGE_KEY, String(level));
  } catch {
    // ignore
  }
}
