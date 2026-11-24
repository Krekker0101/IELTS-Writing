import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarCheck,
  Clock,
  FileEdit,
  Flame,
  Layers,
  Mic,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  CoachPersona,
  ErrorJournalEntry,
  LeaderboardEntry,
  SpeakingSessionRecord,
  Submission,
  UserProfile,
  WritingTask,
} from '../types/ielts';
import type { AppRoute } from './SidebarNav';
import { CoachMascot, CoachPersonaFan } from './CoachMascot';
import { DailyGoalTracker } from './DailyGoalTracker';
import { GlobalLeaderboard } from './GlobalLeaderboard';
import { getLevelProgress } from '../utils/levelSystem';
import {
  buildFourSkillSchedule,
  computeLocalStreakAndXp,
  loadOrCreateLocalDevicePlan,
  saveLocalDevicePlan,
  type LocalDeviceStudyProfile,
  type SkillKey,
} from '../utils/localStudyPlan';

interface HomeViewProps {
  submissions: Submission[];
  speakingSessions: SpeakingSessionRecord[];
  errorJournal: ErrorJournalEntry[];
  tasks: WritingTask[];
  userProfile: UserProfile;
  leaderboard?: LeaderboardEntry[];
  onNavigate: (route: AppRoute) => void;
  onOpenSubmission: (submission: Submission) => void;
  onOpenSpeakingSession: (session: SpeakingSessionRecord) => void;
  onStartTask: (task: WritingTask) => void;
  onUpdateProfile: (patch: Partial<UserProfile>) => Promise<void>;
}

export const HomeView: React.FC<HomeViewProps> = ({
  submissions,
  speakingSessions,
  errorJournal,
  tasks,
  userProfile,
  leaderboard,
  onNavigate,
  onOpenSubmission,
  onOpenSpeakingSession,
  onStartTask,
  onUpdateProfile,
}) => {
  const latestSubmission = submissions[0];
  const latestWritingBand = latestSubmission
    ? latestSubmission.overallWritingBand ??
      latestSubmission.task2?.revisions[latestSubmission.task2.revisions.length - 1]?.evaluation.taskBand ??
      latestSubmission.task1?.revisions[latestSubmission.task1.revisions.length - 1]?.evaluation.taskBand
    : null;

  const latestSpeaking = speakingSessions[0];
  const activeErrors = errorJournal.filter((e) => !e.mastered);
  const topWeakness = activeErrors[0];

  const recommendedTask = (() => {
    if (!latestSubmission) {
      return tasks.find((t) => t.id === 'acad-t1-line-energy') ?? tasks[0];
    }
    if (latestSubmission.task1 && !latestSubmission.task2) {
      return tasks.find((t) => t.taskNumber === 2 && t.format === latestSubmission.format) ?? tasks[0];
    }
    return tasks.find((t) => t.id === 'acad-t1-maps-mapledurham') ?? tasks[0];
  })();

  const writingActions = [
    {
      id: 'mock' as AppRoute,
      title: 'Full Writing Mock Test',
      meta: '60 мин · Task 1 + Task 2 · ×2 вес Task 2',
      description: 'Единый таймер экзамена Academic или General Training с итоговым Band Score.',
      icon: Clock,
      accent: 'bg-blue-700 text-white',
      cta: 'Выбрать Mock',
    },
    {
      id: 'practice1' as AppRoute,
      title: 'Writing Task 1',
      meta: '20 мин или свободно · 150+ слов',
      description: 'Графики, таблицы, карты, процессы и официальные/деловые/дружеские письма.',
      icon: Layers,
      accent: 'bg-slate-900 text-white',
      cta: 'Тренировать Task 1',
    },
    {
      id: 'practice2' as AppRoute,
      title: 'Writing Task 2',
      meta: '40 мин или свободно · 250+ слов',
      description: 'Эссе всех экзаменационных типов с разбором ошибок прямо в тексте.',
      icon: BookOpen,
      accent: 'bg-slate-900 text-white',
      cta: 'Тренировать Task 2',
    },
    {
      id: 'topics' as AppRoute,
      title: 'Мои темы Writing',
      meta: 'Свои условия · Графики · ИИ-разметка',
      description: 'Добавляйте собственные задания и загружайте схемы для Task 1.',
      icon: FileEdit,
      accent: 'bg-slate-900 text-white',
      cta: 'Открыть темы',
    },
  ];

  const speakingActions = [
    {
      id: 'speaking' as AppRoute,
      title: 'Speaking Mock & Parts 1–3',
      meta: 'Part 1 · Cue Card 1+2 мин · Part 3',
      description: 'Голосовой экзаменатор Gemini TTS, запись ответа и диагностика Pronunciation & Fluency.',
      icon: Mic,
      accent: 'bg-[#FF4B3A] text-white',
      cta: 'Открыть Speaking Lab',
    },
    {
      id: 'coach' as AppRoute,
      title: 'AI Coach · Живой диалог',
      meta: 'Свободная разговорная практика · Без стресса',
      description: 'Говорите на любую тему в выбранном стиле коуча с мягкими точечными подсказками.',
      icon: Sparkles,
      accent: 'bg-purple-600 text-white',
      cta: 'Начать разговор',
    },
    {
      id: 'study-plan' as AppRoute,
      title: 'Учебный план (4 навыка)',
      meta: `${userProfile.dailyGoalMinutes} мин в день · L · R · W · S`,
      description: 'Таблица и календарь с дейли-рутиной по Listening, Reading, Writing и Speaking — сохраняется на устройстве.',
      icon: CalendarCheck,
      accent: 'bg-amber-500 text-white',
      cta: 'Открыть расписание',
    },
  ];

  const handleSelectPersona = (persona: CoachPersona) => {
    onUpdateProfile({ coachPersona: persona });
  };

  const [localPlan, setLocalPlan] = useState<LocalDeviceStudyProfile>(() =>
    loadOrCreateLocalDevicePlan({
      format: userProfile.format,
      currentBand: userProfile.currentBand,
      targetBand: userProfile.targetBand,
      examDate: userProfile.examDate,
      dailyGoalMinutes: userProfile.dailyGoalMinutes,
      taperDaysBeforeExam: userProfile.taperDaysBeforeExam,
      restDays: userProfile.restDays,
      learnerName: userProfile.name,
    })
  );
  const localPlanRef = useRef<LocalDeviceStudyProfile>(localPlan);
  localPlanRef.current = localPlan;

  const todayPlan = useMemo(() => {
    const days = buildFourSkillSchedule(localPlan, 1);
    return days[0] ?? null;
  }, [localPlan]);

  const applyPlanUpdate = (
    updater: (prev: LocalDeviceStudyProfile) => LocalDeviceStudyProfile
  ) => {
    const prevSnapshot = localPlanRef.current;
    const prevStats = computeLocalStreakAndXp(prevSnapshot);
    const next = updater(prevSnapshot);
    localPlanRef.current = next;
    saveLocalDevicePlan(next);
    setLocalPlan(next);

    const nextStats = computeLocalStreakAndXp(next);
    const deltaXp = nextStats.xp - prevStats.xp;
    const mergedXp = Math.max(nextStats.xp, (userProfile.xp || 0) + deltaXp);
    void onUpdateProfile({
      streakDays: Math.max(userProfile.streakDays || 0, nextStats.streakDays),
      xp: mergedXp,
    });
  };

  const handleToggleTodaySkill = (taskKey: string) => {
    applyPlanUpdate((prev) => ({
      ...prev,
      completedTasks: {
        ...prev.completedTasks,
        [taskKey]: !prev.completedTasks[taskKey],
      },
    }));
  };

  const handleCompleteAllToday = () => {
    if (!todayPlan) return;
    const keys: SkillKey[] = ['listening', 'reading', 'writing', 'speaking'];
    applyPlanUpdate((prev) => {
      const nextTasks = { ...prev.completedTasks };
      for (const k of keys) {
        nextTasks[todayPlan.skills[k].taskKey] = true;
      }
      return { ...prev, completedTasks: nextTasks };
    });
  };

  const levelInfo = getLevelProgress(userProfile.xp);

  return (
    <div className="max-w-[1160px] mx-auto px-6 py-8 space-y-8">
      {/* Top Dashboard XP & Level Progress Bar */}
      <section
        aria-label="Уровень и шкала опыта"
        className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#FF4B3A] text-white flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-bold text-slate-900 text-sm">
                Уровень {levelInfo.level} · {levelInfo.title}
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{levelInfo.subtitle}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
              Всего {levelInfo.totalXp} XP · До уровня {levelInfo.level + 1} осталось {levelInfo.xpRemaining} XP
            </p>
          </div>
        </div>

        <div className="flex-1 md:max-w-sm space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono tabular-nums">
            <span className="font-semibold text-slate-700">
              {levelInfo.xpIntoLevel} / {levelInfo.xpRequiredForLevel} XP
            </span>
            <span className="font-bold text-[#FF4B3A]">{levelInfo.progressPercent}%</span>
          </div>
          <div
            className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/70"
            role="progressbar"
            aria-valuenow={levelInfo.progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Шкала опыта пользователя"
          >
            <div
              className="h-full bg-[#FF4B3A] rounded-full transition-all duration-300"
              style={{ width: `${levelInfo.progressPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* Daily Goal Tracker: Remaining Minutes & Celebration */}
      {todayPlan && (
        <DailyGoalTracker
          todayPlan={todayPlan}
          onToggleSkill={handleToggleTodaySkill}
          onCompleteAllToday={handleCompleteAllToday}
          onOpenStudyPlan={() => onNavigate('study-plan')}
          reducedMotion={userProfile.reducedMotion}
        />
      )}

      {/* Dismissible Hero Banner with Pastel Mesh + Centered AI Coach Mascot (matches screenshot) */}
      {userProfile.showHeroBanner ? (
        <section className="space-y-6">
          <div className="relative hero-pastel-mesh border border-slate-200/80 rounded-3xl px-6 py-10 sm:py-12 text-center shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => onUpdateProfile({ showHeroBanner: false })}
              className="absolute top-4 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white/85 hover:bg-white border border-slate-200/80 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Больше не показывать
            </button>

            <h1 className="text-3xl sm:text-5xl font-bold text-slate-900 tracking-tight text-balance">
              Знакомься с AI Coach
            </h1>

            <div className="my-7 flex justify-center">
              <CoachMascot
                state="idle"
                persona={userProfile.coachPersona}
                size="lg"
                reducedMotion={userProfile.reducedMotion}
              />
            </div>

            <p className="text-xl sm:text-2xl font-bold text-slate-900">
              Готов, когда ты готов
            </p>
            <p className="mt-1.5 text-sm text-slate-600">
              Выбери характер наставника и начинай готовиться к IELTS Writing и Speaking
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('coach')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#FF4B3A] rounded-xl hover:bg-[#e84232] shadow-sm transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Поговорить с AI Coach
              </button>
              <button
                type="button"
                onClick={() => onNavigate('speaking')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors cursor-pointer"
              >
                <Mic className="w-4 h-4 text-[#FF4B3A]" />
                Speaking Mock Test
              </button>
              <button
                type="button"
                onClick={() => onNavigate('mock')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors cursor-pointer"
              >
                <Clock className="w-4 h-4 text-blue-700" />
                Writing Mock Test
              </button>
            </div>
          </div>

          {/* Interactive Persona Selector */}
          <div className="space-y-3">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-slate-900">
                Характер AI Coach
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Твой живой ИИ-собеседник для разговорной практики и фидбэка. На реальном экзамене (Exam Mode) он всегда остаётся нейтральным экзаменатором.
              </p>
            </div>
            <CoachPersonaFan
              selected={userProfile.coachPersona}
              onSelect={handleSelectPersona}
              reducedMotion={userProfile.reducedMotion}
            />
          </div>
        </section>
      ) : (
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <CoachMascot
              state="idle"
              persona={userProfile.coachPersona}
              size="sm"
              reducedMotion={userProfile.reducedMotion}
            />
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                IELTS Writing &amp; Speaking Lab
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Цель: Band {userProfile.targetBand.toFixed(1)} · Streak {userProfile.streakDays} дн. · {userProfile.xp} XP
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onUpdateProfile({ showHeroBanner: true })}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
            >
              Показать экран AI Coach
            </button>
            <button
              type="button"
              onClick={() => onNavigate('coach')}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#FF4B3A] rounded-lg hover:bg-[#e84232] cursor-pointer"
            >
              Открыть AI Coach
            </button>
          </div>
        </section>
      )}

      {/* Speaking & AI Coach Section */}
      <section aria-label="IELTS Speaking и AI Coach" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Speaking Lab и Учебный план</h2>
            <p className="text-xs text-slate-500">
              Реальная оценка аудиопроизношения и темпа речи, а не только текста
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {speakingActions.map((action) => {
            const Icon = action.icon;
            return (
              <div
                key={action.id}
                onClick={() => onNavigate(action.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate(action.id);
                  }
                }}
                className="group bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-300 transition-colors cursor-pointer"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">{action.meta}</p>
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-[#FF4B3A] transition-colors">
                        {action.title}
                      </h3>
                    </div>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${action.accent}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="mt-2.5 text-xs text-slate-600 leading-relaxed">
                    {action.description}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 group-hover:text-[#FF4B3A]">
                    {action.cta}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#FF4B3A] transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Writing Actions Grid */}
      <section aria-label="IELTS Writing" className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">IELTS Writing</h2>
          <p className="text-xs text-slate-500">
            Минимальные точечные исправления без переписывания вашей работы за вас
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {writingActions.map((action) => {
            const Icon = action.icon;
            return (
              <div
                key={action.id}
                onClick={() => onNavigate(action.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate(action.id);
                  }
                }}
                className="group bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-300 transition-colors cursor-pointer"
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">{action.meta}</p>
                      <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {action.title}
                      </h3>
                    </div>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${action.accent}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
                    {action.description}
                  </p>
                </div>

                <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-700 group-hover:text-blue-800">
                    {action.cta}
                  </span>
                  <ArrowRight className="w-4 h-4 text-blue-700 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Summary Strip Below Primary Actions */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1">
        {/* Latest Result (Writing or Speaking) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Последний результат</p>
            {latestSpeaking && (!latestSubmission || latestSpeaking.createdAt >= latestSubmission.updatedAt) ? (
              <>
                <div className="mt-2 flex items-baseline gap-2.5">
                  <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                    Band {latestSpeaking.evaluation.speakingBand.toFixed(1)}
                  </span>
                  <span className="text-xs text-[#FF4B3A] font-medium">
                    Speaking · {latestSpeaking.isFullMock ? 'Full Mock' : `Part ${latestSpeaking.part ?? 1}`}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate-700 line-clamp-2">{latestSpeaking.title}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Примерный балл платформы · {new Date(latestSpeaking.createdAt).toLocaleDateString('ru-RU')}
                </p>
              </>
            ) : latestSubmission ? (
              <>
                <div className="mt-2 flex items-baseline gap-2.5">
                  <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                    Band {latestWritingBand?.toFixed(1) ?? '—'}
                  </span>
                  <span className="text-xs text-blue-700 font-medium">
                    Writing · {latestSubmission.overallWritingBand !== undefined ? 'Full Mock' : 'Practice'}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate-700 line-clamp-2">
                  {latestSubmission.mockTestTitle ??
                    latestSubmission.task2?.taskTitle ??
                    latestSubmission.task1?.taskTitle}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Примерный балл платформы · {new Date(latestSubmission.updatedAt).toLocaleDateString('ru-RU')}
                </p>
              </>
            ) : (
              <div className="mt-2">
                <p className="text-sm text-slate-700 font-medium">Сессий пока нет</p>
                <p className="text-xs text-slate-500 mt-1">
                  Напишите первое эссе или пройдите короткое Speaking-интервью для диагностики.
                </p>
              </div>
            )}
          </div>
          {latestSpeaking && (!latestSubmission || latestSpeaking.createdAt >= latestSubmission.updatedAt) ? (
            <button
              type="button"
              onClick={() => onOpenSpeakingSession(latestSpeaking)}
              className="mt-4 text-left text-xs font-semibold text-[#FF4B3A] hover:underline cursor-pointer"
            >
              Открыть отчёт Speaking →
            </button>
          ) : latestSubmission ? (
            <button
              type="button"
              onClick={() => onOpenSubmission(latestSubmission)}
              className="mt-4 text-left text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              Открыть отчёт Writing →
            </button>
          ) : null}
        </div>

        {/* Progress & Streak */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Прогресс и регулярность</p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div>
                <p className="text-xl font-bold font-mono tabular-nums text-slate-900">
                  {submissions.length + speakingSessions.length}
                </p>
                <p className="text-[11px] text-slate-500">Сессий</p>
              </div>
              <div>
                <p className="text-xl font-bold font-mono tabular-nums text-slate-900 inline-flex items-center gap-1">
                  <Flame className="w-4 h-4 text-[#FF4B3A]" />
                  {userProfile.streakDays}
                </p>
                <p className="text-[11px] text-slate-500">Streak дн.</p>
              </div>
              <div>
                <p className="text-xl font-bold font-mono tabular-nums text-slate-900">
                  {activeErrors.length}
                </p>
                <p className="text-[11px] text-slate-500">Зон роста</p>
              </div>
            </div>
            {topWeakness ? (
              <p className="mt-3 text-xs text-slate-600">
                Фокус сейчас: <span className="font-semibold text-slate-900">{topWeakness.subRule}</span> ({topWeakness.normalizedPer1000Words} / 1000 сл.)
              </p>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                Учебный журнал автоматически выделяет повторяющиеся шаблоны ошибок.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('progress')}
            className="mt-4 text-left text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
          >
            Журнал ошибок и аналитика →
          </button>
        </div>

        {/* Recommended Practice */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Рекомендованная задача</p>
            {recommendedTask ? (
              <>
                <p className="mt-2 text-sm font-bold text-slate-900">{recommendedTask.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {recommendedTask.format === 'academic' ? 'Academic' : 'General Training'} · Task{' '}
                  {recommendedTask.taskNumber} · {recommendedTask.taskType}
                </p>
                <p className="mt-2 text-xs text-slate-600 line-clamp-2">{recommendedTask.promptText}</p>
              </>
            ) : null}
          </div>
          {recommendedTask && (
            <button
              type="button"
              onClick={() => onStartTask(recommendedTask)}
              className="mt-4 text-left text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              Перейти к заданию →
            </button>
          )}
        </div>
      </section>

      {/* Global Streak Leaderboard */}
      <GlobalLeaderboard
        userProfile={userProfile}
        initialEntries={leaderboard}
        onUpdateProfile={onUpdateProfile}
      />
    </div>
  );
};
