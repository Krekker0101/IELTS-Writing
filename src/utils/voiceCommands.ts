import type { AppRoute } from '../components/SidebarNav';

export interface VoiceCommandRule {
  route: AppRoute;
  label: string;
  examples: string[];
  patterns: RegExp[];
}

export interface VoiceCommandMatch {
  route: AppRoute;
  label: string;
  matchedTranscript: string;
}

export const VOICE_COMMAND_RULES: VoiceCommandRule[] = [
  {
    route: 'home',
    label: 'Главная панель',
    examples: ['перейти на главную', 'домой'],
    patterns: [
      /(?:перейти|вернись|открой|открыть|зайди)?\s*(?:на\s+)?главн/i,
      /(?:^|\s)домой(?=\s|$)/i,
      /\b(?:go\s+)?home\b/i,
      /\bdashboard\b/i,
    ],
  },
  {
    route: 'practice1',
    label: 'Writing Task 1 (Практика)',
    examples: ['начать практику', 'задание 1'],
    patterns: [
      /практик[аиуе]?\s*(?:1|один|перв|task\s*1)?$/i,
      /(?:начать|открой|открыть|запусти)\s+практик/i,
      /\b(?:start|open)\s+practice\b/i,
      /(?:writing\s*)?(?:task|таск|задание)\s*(?:1|one|один|первое)/i,
    ],
  },
  {
    route: 'practice2',
    label: 'Writing Task 2 (Эссе)',
    examples: ['практика 2', 'эссе'],
    patterns: [
      /практик[аиуе]?\s*(?:2|два|втор)/i,
      /(?:writing\s*)?(?:task|таск|задание)\s*(?:2|two|два|второе)/i,
      /(?:^|\s)эссе(?=\s|$)/i,
      /\bessay\b/i,
    ],
  },
  {
    route: 'mock',
    label: 'Writing Mock Test',
    examples: ['открыть мок тест', 'письменный экзамен'],
    patterns: [
      /(?:writing\s*)?mock/i,
      /(?:^|\s)мок(?:\s*тест)?(?=\s|$)/i,
      /письменн\w*\s*экзамен/i,
      /пробн\w*\s*(?:тест|экзамен)/i,
    ],
  },
  {
    route: 'speaking',
    label: 'Speaking Lab',
    examples: ['открыть спикинг', 'устный экзамен'],
    patterns: [
      /\bspeaking\b/i,
      /спикинг/i,
      /говорени/i,
      /разговорн\w*\s*(?:практик|экзамен)/i,
      /устн\w*\s*экзамен/i,
    ],
  },
  {
    route: 'coach',
    label: 'AI Coach',
    examples: ['открыть коуча', 'ai coach'],
    patterns: [
      /\b(?:ai\s*)?coach\b/i,
      /коуч/i,
      /наставник/i,
      /жив\w*\s*диалог/i,
    ],
  },
  {
    route: 'study-plan',
    label: 'Учебный план',
    examples: ['учебный план', 'открыть расписание'],
    patterns: [
      /(?:учебный\s*)?план/i,
      /расписани/i,
      /календар/i,
      /\bstudy\s*plan\b/i,
      /\bschedule\b/i,
    ],
  },
  {
    route: 'topics',
    label: 'Мои темы Writing',
    examples: ['мои темы'],
    patterns: [
      /мои\s*тем/i,
      /\bmy\s*topics\b/i,
      /свои\s*задани/i,
    ],
  },
  {
    route: 'progress',
    label: 'Прогресс и ошибки',
    examples: ['открыть прогресс', 'журнал ошибок'],
    patterns: [
      /прогресс/i,
      /статистик/i,
      /аналитик/i,
      /журнал\s*ошибок/i,
      /карточки/i,
      /\bprogress\b/i,
    ],
  },
  {
    route: 'settings',
    label: 'Настройки профиля',
    examples: ['открыть настройки', 'профиль'],
    patterns: [
      /настройк/i,
      /профил/i,
      /\bsettings\b/i,
      /\bprofile\b/i,
    ],
  },
  {
    route: 'admin',
    label: 'Админ-панель',
    examples: ['админ панель'],
    patterns: [
      /админ/i,
      /библиотек\w*\s*задан/i,
      /\badmin\b/i,
    ],
  },
];

export function matchVoiceCommand(rawTranscript: string): VoiceCommandMatch | null {
  const normalized = rawTranscript
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:«»"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  // Check more specific patterns first (Task 2 before general practice, Study Plan before general)
  const priorityOrder: AppRoute[] = [
    'practice2',
    'mock',
    'speaking',
    'coach',
    'study-plan',
    'topics',
    'progress',
    'settings',
    'admin',
    'home',
    'practice1',
  ];

  for (const routeId of priorityOrder) {
    const rule = VOICE_COMMAND_RULES.find((r) => r.route === routeId);
    if (!rule) continue;
    if (rule.patterns.some((re) => re.test(normalized))) {
      return {
        route: rule.route,
        label: rule.label,
        matchedTranscript: rawTranscript.trim(),
      };
    }
  }

  return null;
}
