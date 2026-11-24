import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Coffee,
  ExternalLink,
  Flame,
  Headphones,
  Laptop,
  Mic,
  PenTool,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Table as TableIcon,
  X,
} from 'lucide-react';
import { DailyGoalTracker } from './DailyGoalTracker';
import type {
  ErrorJournalEntry,
  IeltsFormat,
  SpeakingSessionRecord,
  Submission,
  UserProfile,
} from '../types/ielts';
import type { AppRoute } from './SidebarNav';
import {
  addDays,
  buildFourSkillSchedule,
  computeLocalStreakAndXp,
  createDefaultLocalPlan,
  daysBetweenToday,
  loadOrCreateLocalDevicePlan,
  parseIsoDateLocal,
  roundHalfBand,
  saveLocalDevicePlan,
  toIsoDateLocal,
  type FourSkillScheduledDay,
  type LocalDeviceStudyProfile,
  type SkillBands,
  type SkillKey,
} from '../utils/localStudyPlan';

interface StudyPlanViewProps {
  userProfile: UserProfile;
  submissions: Submission[];
  speakingSessions: SpeakingSessionRecord[];
  errorJournal: ErrorJournalEntry[];
  onNavigate: (route: AppRoute) => void;
  onUpdateProfile: (patch: Partial<UserProfile>) => Promise<void>;
}

const WEEK_DAYS = [
  { id: 'Monday', label: 'Пн' },
  { id: 'Tuesday', label: 'Вт' },
  { id: 'Wednesday', label: 'Ср' },
  { id: 'Thursday', label: 'Чт' },
  { id: 'Friday', label: 'Пт' },
  { id: 'Saturday', label: 'Сб' },
  { id: 'Sunday', label: 'Вс' },
];

const BAND_CURRENT_OPTIONS = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5];
const BAND_TARGET_OPTIONS = [5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0];
const DAILY_MINUTE_OPTIONS = [30, 45, 60, 90, 120];

const SKILL_META: Array<{
  key: SkillKey;
  label: string;
  short: 'L' | 'R' | 'W' | 'S';
  icon: React.ComponentType<{ className?: string }>;
  accentText: string;
}> = [
  { key: 'listening', label: 'Listening', short: 'L', icon: Headphones, accentText: 'text-sky-700' },
  { key: 'reading', label: 'Reading', short: 'R', icon: BookOpen, accentText: 'text-emerald-700' },
  { key: 'writing', label: 'Writing', short: 'W', icon: PenTool, accentText: 'text-blue-700' },
  { key: 'speaking', label: 'Speaking', short: 'S', icon: Mic, accentText: 'text-[#FF4B3A]' },
];

const MONTH_NAMES_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export const StudyPlanView: React.FC<StudyPlanViewProps> = ({
  userProfile,
  submissions,
  speakingSessions,
  onNavigate,
  onUpdateProfile,
}) => {
  // Silent on-device auto-registration stored strictly in localStorage
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

  const [viewMode, setViewMode] = useState<'calendar' | 'table'>('calendar');
  const [phaseFilter, setPhaseFilter] = useState<'all' | 'active' | 'taper'>('all');
  const [confirmReset, setConfirmReset] = useState(false);

  const todayIso = useMemo(() => toIsoDateLocal(new Date()), []);
  const [selectedIsoDate, setSelectedIsoDate] = useState<string>(todayIso);
  const [modalIsoDate, setModalIsoDate] = useState<string | null>(null);

  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // Persist every update strictly to device localStorage immediately
  useEffect(() => {
    saveLocalDevicePlan(localPlan);
  }, [localPlan]);

  // Close Daily Routine modal on Escape key
  useEffect(() => {
    if (!modalIsoDate) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModalIsoDate(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalIsoDate]);

  // Measured averages from site Writing & Speaking sessions (optional 1-click import)
  const measuredStats = useMemo(() => {
    const writingBands: number[] = [];
    for (const sub of submissions) {
      if (typeof sub.overallWritingBand === 'number') {
        writingBands.push(sub.overallWritingBand);
      } else {
        const lastRev =
          sub.task2?.revisions[sub.task2.revisions.length - 1] ??
          sub.task1?.revisions[sub.task1.revisions.length - 1];
        if (lastRev) writingBands.push(lastRev.evaluation.taskBand);
      }
    }
    const speakingBands = speakingSessions.map((s) => s.evaluation.speakingBand);
    const avg = (arr: number[]) =>
      arr.length > 0 ? roundHalfBand(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    return {
      writingAvg: avg(writingBands),
      speakingAvg: avg(speakingBands),
    };
  }, [submissions, speakingSessions]);

  const localPlanRef = useRef<LocalDeviceStudyProfile>(localPlan);
  localPlanRef.current = localPlan;

  const updateLocalPlan = (
    updater: (prev: LocalDeviceStudyProfile) => LocalDeviceStudyProfile,
    syncToAppProfile = true
  ) => {
    const prevSnapshot = localPlanRef.current;
    const prevStats = computeLocalStreakAndXp(prevSnapshot);
    const next = updater(prevSnapshot);
    localPlanRef.current = next;
    saveLocalDevicePlan(next);
    setLocalPlan(next);

    if (syncToAppProfile) {
      const nextStats = computeLocalStreakAndXp(next);
      const deltaXp = nextStats.xp - prevStats.xp;
      const mergedXp = Math.max(nextStats.xp, (userProfile.xp || 0) + deltaXp);
      void onUpdateProfile({
        name: next.learnerName,
        format: next.format,
        currentBand: next.currentBand,
        targetBand: next.targetBand,
        examDate: next.examDate,
        dailyGoalMinutes: next.dailyGoalMinutes,
        taperDaysBeforeExam: next.taperDaysBeforeExam,
        restDays: next.restDays,
        streakDays: Math.max(userProfile.streakDays || 0, nextStats.streakDays),
        xp: mergedXp,
      });
    }
  };

  const scheduleDays = useMemo(() => buildFourSkillSchedule(localPlan, 90), [localPlan]);

  const scheduleByIso = useMemo(() => {
    const map: Record<string, FourSkillScheduledDay> = {};
    for (const d of scheduleDays) {
      map[d.isoDate] = d;
    }
    return map;
  }, [scheduleDays]);

  const activeSelectedDay =
    scheduleByIso[selectedIsoDate] ?? scheduleDays[0] ?? null;

  const todayPlan = scheduleByIso[todayIso] ?? scheduleDays[0] ?? null;

  const visibleTableDays = useMemo(() => {
    if (phaseFilter === 'all') return scheduleDays;
    if (phaseFilter === 'taper') return scheduleDays.filter((d) => d.phase !== 'active');
    return scheduleDays.filter((d) => d.phase === 'active');
  }, [scheduleDays, phaseFilter]);

  const totalDaysToExam = daysBetweenToday(localPlan.examDate);
  const taperDays = localPlan.taperDaysBeforeExam === 3 ? 3 : 2;
  const activeTrainingDaysCount = Math.max(0, totalDaysToExam - taperDays);
  const bandGap = Math.max(0, localPlan.targetBand - localPlan.currentBand);

  const localStats = useMemo(() => computeLocalStreakAndXp(localPlan), [localPlan]);
  const totalSkillTasksInPlan = scheduleDays.length * 4;
  const completedInCurrentPlan = scheduleDays.reduce((acc, d) => acc + d.completedCount, 0);

  const recommendedDailyMin =
    bandGap >= 1.5 && totalDaysToExam <= 21
      ? 90
      : bandGap >= 1.0
      ? 60
      : 45;

  const toggleSkillTask = (taskKey: string) => {
    updateLocalPlan(
      (prev) => ({
        ...prev,
        completedTasks: {
          ...prev.completedTasks,
          [taskKey]: !prev.completedTasks[taskKey],
        },
      }),
      true
    );
  };

  const toggleWholeDay = (day: FourSkillScheduledDay) => {
    const allDone = day.completedCount === 4;
    updateLocalPlan((prev) => {
      const nextTasks = { ...prev.completedTasks };
      for (const meta of SKILL_META) {
        nextTasks[day.skills[meta.key].taskKey] = !allDone;
      }
      return { ...prev, completedTasks: nextTasks };
    }, true);
  };

  const updateDayNote = (isoDate: string, note: string) => {
    updateLocalPlan(
      (prev) => ({
        ...prev,
        dayNotes: {
          ...prev.dayNotes,
          [isoDate]: note,
        },
      }),
      false
    );
  };

  const handleSkillBandChange = (skill: keyof SkillBands, value: number) => {
    updateLocalPlan((prev) => {
      const nextSkills = { ...prev.skillBands, [skill]: value };
      const avg = roundHalfBand(
        (nextSkills.listening + nextSkills.reading + nextSkills.writing + nextSkills.speaking) / 4
      );
      return {
        ...prev,
        skillBands: nextSkills,
        currentBand: avg,
        targetBand: Math.max(avg, prev.targetBand),
      };
    });
  };

  const handleOverallCurrentBandChange = (val: number) => {
    updateLocalPlan((prev) => ({
      ...prev,
      currentBand: val,
      targetBand: Math.max(val, prev.targetBand),
      skillBands: {
        listening: val,
        reading: val,
        writing: val,
        speaking: val,
      },
    }));
  };

  const toggleRestDay = (dayId: string) => {
    updateLocalPlan((prev) => {
      const exists = prev.restDays.includes(dayId);
      const next = exists
        ? prev.restDays.filter((d) => d !== dayId)
        : [...prev.restDays, dayId];
      return { ...prev, restDays: next };
    });
  };

  const handleResetDevicePlan = () => {
    const fresh = createDefaultLocalPlan({ format: 'academic', currentBand: 6.0, targetBand: 7.0 });
    saveLocalDevicePlan(fresh);
    setLocalPlan(fresh);
    setSelectedIsoDate(todayIso);
    setConfirmReset(false);
  };

  // Build Monday-first calendar cells for `calendarMonth`
  const calendarGridCells = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // JS getDay(): 0=Sun..6=Sat -> convert to Mon=0..Sun=6
    const startOffset = (firstDayOfMonth.getDay() + 6) % 7;

    const cells: Array<{
      isoDate: string;
      dayNum: number;
      inCurrentMonth: boolean;
      scheduledDay?: FourSkillScheduledDay;
    }> = [];

    // Leading padding from previous month
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      const iso = toIsoDateLocal(d);
      cells.push({
        isoDate: iso,
        dayNum: d.getDate(),
        inCurrentMonth: false,
        scheduledDay: scheduleByIso[iso],
      });
    }

    // Current month days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const d = new Date(year, month, dayNum);
      const iso = toIsoDateLocal(d);
      cells.push({
        isoDate: iso,
        dayNum,
        inCurrentMonth: true,
        scheduledDay: scheduleByIso[iso],
      });
    }

    // Trailing days to complete 7-col rows
    const remainder = cells.length % 7;
    if (remainder !== 0) {
      const needed = 7 - remainder;
      for (let i = 1; i <= needed; i++) {
        const d = new Date(year, month + 1, i);
        const iso = toIsoDateLocal(d);
        cells.push({
          isoDate: iso,
          dayNum: d.getDate(),
          inCurrentMonth: false,
          scheduledDay: scheduleByIso[iso],
        });
      }
    }

    return cells;
  }, [calendarMonth, scheduleByIso]);

  const shiftMonth = (delta: number) => {
    setCalendarMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const jumpToIsoOnCalendar = (isoDate: string, openModal = false) => {
    const parsed = parseIsoDateLocal(isoDate);
    if (parsed) {
      setCalendarMonth({ year: parsed.getFullYear(), month: parsed.getMonth() });
    }
    setSelectedIsoDate(isoDate);
    setViewMode('calendar');
    if (openModal && scheduleByIso[isoDate]) {
      setModalIsoDate(isoDate);
    }
  };

  const openDayModal = (isoDate: string) => {
    if (!scheduleByIso[isoDate]) return;
    setSelectedIsoDate(isoDate);
    setModalIsoDate(isoDate);
  };

  const modalDay = modalIsoDate ? scheduleByIso[modalIsoDate] ?? null : null;
  const modalDayArrayIndex = modalDay
    ? scheduleDays.findIndex((d) => d.isoDate === modalDay.isoDate)
    : -1;

  return (
    <div className="max-w-[1220px] mx-auto px-6 py-8 space-y-7">
      {/* Hero Banner with Silent Auto-Registration Status (On-Device Only) */}
      <section className="hero-pastel-mesh border border-slate-200/80 rounded-3xl px-6 py-7 sm:px-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#FF4B3A]">
              <Laptop className="w-3.5 h-3.5" />
              Локальный профиль устройства
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-500">
              ID {localPlan.deviceId}
            </span>
            <span aria-hidden="true">·</span>
            <span>Сохранение только в памяти вашего браузера без входа</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 tracking-tight text-balance">
            Расписание IELTS по всем 4 навыкам
          </h1>

          <p className="text-sm text-slate-600 leading-relaxed">
            Полноценный ежедневный маршрут на{' '}
            <span className="font-semibold text-slate-900">
              Listening, Reading, Writing и Speaking
            </span>{' '}
            — работает автономно как готовый план подготовки на каждый день в таблице и на календаре, с мягкой разгрузкой за {taperDays} дня до экзамена.
          </p>
        </div>

        {/* Local Device Name + Streak/XP Summary */}
        <div className="bg-white/90 border border-slate-200 rounded-2xl p-4 sm:min-w-[290px] space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="local-learner-name" className="text-xs font-semibold text-slate-500">
              Имя на этом устройстве
            </label>
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                title="Сбросить локальное расписание"
              >
                <RotateCcw className="w-3 h-3" />
                Сбросить
              </button>
            ) : (
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={handleResetDevicePlan}
                  className="font-semibold text-red-600 hover:underline cursor-pointer"
                >
                  Точно сбросить
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            )}
          </div>

          <input
            id="local-learner-name"
            type="text"
            value={localPlan.learnerName}
            onChange={(e) =>
              updateLocalPlan((prev) => ({ ...prev, learnerName: e.target.value }))
            }
            placeholder="Ваше имя"
            className="w-full px-3 py-1.5 text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400"
          />

          <div className="flex items-center justify-between pt-1 text-xs font-mono tabular-nums text-slate-700 border-t border-slate-100">
            <span className="inline-flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-[#FF4B3A]" />
              {localStats.streakDays} дн.
            </span>
            <span aria-hidden="true" className="text-slate-300">
              |
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              {localStats.xp} XP
            </span>
            <span aria-hidden="true" className="text-slate-300">
              |
            </span>
            <span>{localStats.completedFullDays} полн. дн.</span>
          </div>
        </div>
      </section>

      {/* Visual Daily Goal Tracker for Today */}
      {todayPlan && (
        <DailyGoalTracker
          todayPlan={todayPlan}
          onToggleSkill={toggleSkillTask}
          onCompleteAllToday={() => toggleWholeDay(todayPlan)}
          reducedMotion={userProfile.reducedMotion}
        />
      )}

      {/* Calibration Panel: Exam Settings + 4-Module Baselines */}
      <section className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Overall Current Band */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Общий балл сейчас (сбросит 4 навыка)
            </label>
            <select
              value={localPlan.currentBand}
              onChange={(e) => handleOverallCurrentBandChange(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 text-sm font-semibold font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400"
            >
              {BAND_CURRENT_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  Band {b.toFixed(1)} сейчас
                </option>
              ))}
            </select>
          </div>

          {/* Target Band */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Желаемый балл (Цель)
            </label>
            <select
              value={localPlan.targetBand}
              onChange={(e) =>
                updateLocalPlan((prev) => ({ ...prev, targetBand: Number(e.target.value) }))
              }
              className="w-full px-3.5 py-2.5 text-sm font-semibold font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400"
            >
              {BAND_TARGET_OPTIONS.filter((b) => b >= localPlan.currentBand).map((b) => (
                <option key={b} value={b}>
                  Цель: Band {b.toFixed(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Format Academic vs General */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">Тип экзамена</label>
            <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
              {(
                [
                  { id: 'academic', label: 'Academic' },
                  { id: 'general', label: 'General Training' },
                ] as Array<{ id: IeltsFormat; label: string }>
              ).map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => updateLocalPlan((prev) => ({ ...prev, format: fmt.id }))}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    localPlan.format === fmt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Exam Date */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700">Дата экзамена</label>
              <div className="flex gap-1">
                {[14, 21, 30, 45].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      updateLocalPlan((prev) => ({
                        ...prev,
                        examDate: toIsoDateLocal(addDays(new Date(), d)),
                      }))
                    }
                    className="text-[11px] font-mono font-semibold text-slate-600 hover:text-slate-900 px-1.5 py-0.5 bg-slate-100 rounded cursor-pointer"
                  >
                    +{d}д
                  </button>
                ))}
              </div>
            </div>
            <input
              type="date"
              min={toIsoDateLocal(addDays(new Date(), 1))}
              value={localPlan.examDate}
              onChange={(e) => {
                if (e.target.value) {
                  updateLocalPlan((prev) => ({ ...prev, examDate: e.target.value }));
                }
              }}
              className="w-full px-3.5 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400"
            />
          </div>

          {/* Pre-Exam Taper Buffer */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Разгрузка перед экзаменом
            </label>
            <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
              {([2, 3] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() =>
                    updateLocalPlan((prev) => ({ ...prev, taperDaysBeforeExam: days }))
                  }
                  className={`py-2 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    taperDays === days
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  За {days} дня
                </button>
              ))}
            </div>
          </div>

          {/* Daily Minutes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700">Минут в день (на 4 блока)</label>
              {localPlan.dailyGoalMinutes < recommendedDailyMin && (
                <button
                  type="button"
                  onClick={() =>
                    updateLocalPlan((prev) => ({ ...prev, dailyGoalMinutes: recommendedDailyMin }))
                  }
                  className="text-[11px] font-semibold text-[#FF4B3A] hover:underline cursor-pointer"
                >
                  Рек.: {recommendedDailyMin} мин
                </button>
              )}
            </div>
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {DAILY_MINUTE_OPTIONS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() =>
                    updateLocalPlan((prev) => ({ ...prev, dailyGoalMinutes: mins }))
                  }
                  className={`flex-1 py-2 text-xs font-mono font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    localPlan.dailyGoalMinutes === mins
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mins}м
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4 IELTS Modules Baseline Calibration */}
        <div className="pt-5 border-t border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Точный уровень по каждому из 4 модулей
              </h2>
              <p className="text-xs text-slate-500">
                Расписание автоматически выделяет больше ежедневного времени тем навыкам, где разрыв до цели Band {localPlan.targetBand.toFixed(1)} больше.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              Средний Band сейчас: {localPlan.currentBand.toFixed(1)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SKILL_META.map((meta) => {
              const Icon = meta.icon;
              const currentVal = localPlan.skillBands[meta.key];
              const gap = Math.max(0, localPlan.targetBand - currentVal);
              const siteAvg =
                meta.key === 'writing'
                  ? measuredStats.writingAvg
                  : meta.key === 'speaking'
                  ? measuredStats.speakingAvg
                  : null;

              return (
                <div
                  key={meta.key}
                  className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <Icon className={`w-4 h-4 ${meta.accentText}`} />
                      {meta.label}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500">
                      {gap > 0 ? `+${gap.toFixed(1)} до цели` : 'Цель достигнута'}
                    </span>
                  </div>

                  <select
                    value={currentVal}
                    onChange={(e) => handleSkillBandChange(meta.key, Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs font-semibold font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400"
                  >
                    {BAND_CURRENT_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        Сейчас Band {b.toFixed(1)}
                      </option>
                    ))}
                  </select>

                  {siteAvg !== null && (
                    <button
                      type="button"
                      onClick={() => handleSkillBandChange(meta.key, siteAvg)}
                      className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer block"
                    >
                      Подставить замер сайта: {siteAvg.toFixed(1)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Calibrated Trajectory Banner */}
      <section className="bg-slate-900 text-white rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-semibold text-emerald-400 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            Комплексный маршрут L · R · W · S сохранён на устройстве
          </p>
          <h2 className="text-xl font-bold">
            Band {localPlan.currentBand.toFixed(1)} → Band {localPlan.targetBand.toFixed(1)} за {totalDaysToExam} дн.
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            {activeTrainingDaysCount} дней активной подготовки по всем 4 секциям IELTS + {taperDays} дн. спокойного буфера перед экзаменом ({localPlan.examDate}). Раз в 7 дней — контрольный срез.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 shrink-0 font-mono tabular-nums">
          <div className="px-4 py-3 rounded-2xl bg-white/10">
            <p className="text-[11px] text-slate-300">Разрыв</p>
            <p className="text-xl font-bold mt-0.5">+{bandGap.toFixed(1)}</p>
          </div>
          <div className="px-4 py-3 rounded-2xl bg-white/10">
            <p className="text-[11px] text-slate-300">Дней плана</p>
            <p className="text-xl font-bold mt-0.5">{scheduleDays.length}</p>
          </div>
          <div className="px-4 py-3 rounded-2xl bg-white/10">
            <p className="text-[11px] text-slate-300">Модулей готово</p>
            <p className="text-xl font-bold mt-0.5">
              {completedInCurrentPlan}/{totalSkillTasksInPlan}
            </p>
          </div>
        </div>
      </section>

      {/* Main Schedule Toolbar + View Mode Switcher (Календарь / Таблица) */}
      <section className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Ежедневное расписание подготовки (L / R / W / S)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Переключайтесь между интерактивным календарём с рутиной дня и сводной таблицей на весь период.
            </p>
          </div>

          {/* View Mode Segmented Switch */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start md:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5 text-[#FF4B3A]" />
              Календарь и дейли-рутина
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5 text-slate-700" />
              Таблица ({scheduleDays.length} дн.)
            </button>
          </div>
        </div>

        {/* CALENDAR VIEW */}
        {viewMode === 'calendar' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                  aria-label="Предыдущий месяц"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h3 className="text-base font-bold text-slate-900 min-w-[155px] text-center">
                  {MONTH_NAMES_RU[calendarMonth.month]} {calendarMonth.year}
                </h3>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                  aria-label="Следующий месяц"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => jumpToIsoOnCalendar(todayIso, true)}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#FF4B3A] hover:bg-[#e84232] rounded-xl whitespace-nowrap cursor-pointer"
                >
                  Рутина на сегодня
                </button>
                <button
                  type="button"
                  onClick={() => jumpToIsoOnCalendar(localPlan.examDate, true)}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl whitespace-nowrap cursor-pointer"
                >
                  День экзамена
                </button>
              </div>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-500 pb-1">
              {WEEK_DAYS.map((w) => (
                <div key={w.id}>{w.label}</div>
              ))}
            </div>

            {/* Full-Width Interactive Calendar Grid */}
            <div className="grid grid-cols-7 gap-2">
              {calendarGridCells.map((cell) => {
                const day = cell.scheduledDay;
                const isSelected = selectedIsoDate === cell.isoDate;
                const isToday = cell.isoDate === todayIso;

                if (!day) {
                  return (
                    <div
                      key={cell.isoDate}
                      className={`min-h-[86px] sm:min-h-[108px] rounded-2xl border border-slate-100 p-2.5 flex flex-col justify-between ${
                        cell.inCurrentMonth ? 'bg-slate-50/40 text-slate-300' : 'bg-transparent text-slate-200'
                      }`}
                    >
                      <span className="text-xs font-mono tabular-nums">{cell.dayNum}</span>
                    </div>
                  );
                }

                const isExam = day.phase === 'exam';
                const isTaper = day.phase === 'taper';
                const allDone = day.completedCount === 4;

                return (
                  <button
                    key={cell.isoDate}
                    type="button"
                    onClick={() => openDayModal(cell.isoDate)}
                    className={`min-h-[86px] sm:min-h-[108px] rounded-2xl p-2.5 text-left flex flex-col justify-between transition-all cursor-pointer border group ${
                      isSelected
                        ? 'ring-2 ring-[#FF4B3A] border-[#FF4B3A] bg-white shadow-xs'
                        : isExam
                        ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                        : isTaper
                        ? 'bg-emerald-50/70 border-emerald-200 hover:border-emerald-300'
                        : day.isRestDay
                        ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        : 'bg-white border-slate-200 hover:border-slate-400'
                    } ${!cell.inCurrentMonth ? 'opacity-65' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full">
                      <span
                        className={`text-sm font-mono tabular-nums font-bold ${
                          isExam
                            ? 'text-white'
                            : isToday
                            ? 'text-[#FF4B3A]'
                            : 'text-slate-900'
                        }`}
                      >
                        {cell.dayNum}
                      </span>
                      <span
                        className={`text-[10px] font-mono tabular-nums font-semibold ${
                          isExam
                            ? 'text-emerald-300'
                            : allDone
                            ? 'text-emerald-700'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        {isExam ? 'EXAM' : `${day.completedCount}/4`}
                      </span>
                    </div>

                    <div className="space-y-1.5 w-full">
                      <div className="hidden sm:block text-[11px] leading-tight">
                        {isToday && !isExam ? (
                          <span className="font-bold text-[#FF4B3A]">Сегодня · {day.totalMinutes}м</span>
                        ) : isExam ? (
                          <span className="font-bold text-emerald-300">Экзамен IELTS</span>
                        ) : isTaper ? (
                          <span className="font-semibold text-emerald-800">Буфер · {day.totalMinutes}м</span>
                        ) : day.isRestDay ? (
                          <span className="font-medium text-slate-500">Отдых · {day.totalMinutes}м</span>
                        ) : day.isMockDay ? (
                          <span className="font-semibold text-blue-700">Mock · {day.totalMinutes}м</span>
                        ) : (
                          <span className="text-slate-600 truncate block">
                            L·R·W·S · {day.totalMinutes}м
                          </span>
                        )}
                      </div>

                      {/* 4-skill mini progress bars (L R W S) */}
                      <div className="grid grid-cols-4 gap-1">
                        {SKILL_META.map((m) => {
                          const done = day.skills[m.key].completed;
                          return (
                            <span
                              key={m.key}
                              title={`${m.label}: ${done ? 'выполнено' : 'в плане'}`}
                              className={`h-1.5 rounded-sm transition-colors ${
                                done
                                  ? 'bg-emerald-500'
                                  : isExam
                                  ? 'bg-white/25'
                                  : 'bg-slate-200'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Clean Text Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>Нажмите на любой день в календаре, чтобы открыть окно с Daily Routine и упражнениями:</span>
                <span className="font-semibold text-[#FF4B3A]">Сегодня</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-emerald-700">Буфер ({taperDays} дн.)</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-slate-900">EXAM</span>
              </div>
              {activeSelectedDay && (
                <button
                  type="button"
                  onClick={() => openDayModal(activeSelectedDay.isoDate)}
                  className="font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  Открыть выбранный день ({activeSelectedDay.dateLabel}) →
                </button>
              )}
            </div>
          </div>
        )}

        {/* TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="space-y-4">
            {/* Phase Filter Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {(
                  [
                    { id: 'all', label: `Все дни (${scheduleDays.length})` },
                    { id: 'active', label: 'Тренировки и отдых' },
                    { id: 'taper', label: `Буфер (${taperDays} дн.) и экзамен` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPhaseFilter(tab.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer ${
                      phaseFilter === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <span className="text-xs text-slate-500">
                Нажмите на любую задачу L/R/W/S, чтобы отметить выполнение, или откройте день в календаре
              </span>
            </div>

            {/* Clean 4-Skill Schedule Table */}
            <div className="border border-slate-200 rounded-2xl overflow-x-auto">
              <table className="w-full min-w-[960px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                    <th className="py-3 px-4 w-[165px]">Дата и фаза</th>
                    <th className="py-3 px-3.5 text-sky-800">Listening (L)</th>
                    <th className="py-3 px-3.5 text-emerald-800">Reading (R)</th>
                    <th className="py-3 px-3.5 text-blue-800">Writing (W)</th>
                    <th className="py-3 px-3.5 text-[#c93426]">Speaking (S)</th>
                    <th className="py-3 px-4 text-right w-[135px]">План и статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {visibleTableDays.map((day) => {
                    const isExam = day.phase === 'exam';
                    const isTaper = day.phase === 'taper';
                    const isToday = day.offset === 0;

                    return (
                      <tr
                        key={day.isoDate}
                        className={`transition-colors ${
                          isExam
                            ? 'bg-slate-900 text-white'
                            : isTaper
                            ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                            : day.isRestDay
                            ? 'bg-slate-50/70 hover:bg-slate-100/70'
                            : 'bg-white hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Date & Phase */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="space-y-1">
                            <div className="font-mono tabular-nums font-bold text-xs">
                              {isToday ? (
                                <span className="text-[#FF4B3A]">Сегодня · {day.dateLabel}</span>
                              ) : (
                                <span>
                                  Д{day.dayIndex} · {day.dateLabel}
                                </span>
                              )}
                            </div>
                            <div
                              className={`text-[11px] ${
                                isExam
                                  ? 'text-emerald-300 font-semibold'
                                  : isTaper
                                  ? 'text-emerald-800 font-semibold'
                                  : day.isRestDay
                                  ? 'text-slate-500'
                                  : 'text-slate-500'
                              }`}
                            >
                              {day.weekdayShortRu} · {day.phaseLabel}
                            </div>
                          </div>
                        </td>

                        {/* L, R, W, S Cells */}
                        {SKILL_META.map((meta) => {
                          const item = day.skills[meta.key];
                          return (
                            <td key={meta.key} className="py-3.5 px-3.5 align-top">
                              <div className="flex items-start gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleSkillTask(item.taskKey)}
                                  className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors cursor-pointer ${
                                    item.completed
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : isExam
                                      ? 'border-white/40 hover:border-white'
                                      : 'border-slate-300 hover:border-slate-500 bg-white'
                                  }`}
                                  aria-label={`Отметить ${meta.label} на ${day.dateLabel}`}
                                >
                                  {item.completed && <Check className="w-3 h-3" />}
                                </button>

                                <div className="min-w-0 space-y-1">
                                  <p
                                    className={`font-semibold leading-snug ${
                                      item.completed && !isExam
                                        ? 'line-through text-slate-400'
                                        : isExam
                                        ? 'text-white'
                                        : 'text-slate-800'
                                    }`}
                                  >
                                    {item.title}
                                  </p>
                                  <div className="flex items-center gap-2 text-[11px]">
                                    <span
                                      className={`font-mono tabular-nums ${
                                        isExam ? 'text-slate-300' : 'text-slate-500'
                                      }`}
                                    >
                                      {item.minutes} мин
                                    </span>
                                    {item.siteRoute && (
                                      <button
                                        type="button"
                                        onClick={() => onNavigate(item.siteRoute!)}
                                        className={`inline-flex items-center gap-0.5 font-semibold hover:underline cursor-pointer ${
                                          isExam ? 'text-emerald-300' : 'text-blue-700'
                                        }`}
                                      >
                                        Тренажёр
                                        <ExternalLink className="w-2.5 h-2.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          );
                        })}

                        {/* Summary & Action */}
                        <td className="py-3.5 px-4 align-top text-right">
                          <div className="space-y-1.5">
                            <div className="font-mono tabular-nums font-bold">
                              {day.completedCount}/4 · {day.totalMinutes}м
                            </div>
                            <div
                              className={`text-[11px] font-mono tabular-nums ${
                                isExam ? 'text-slate-300' : 'text-slate-500'
                              }`}
                            >
                              Band ~{day.projectedBand.toFixed(1)}
                            </div>
                            <button
                              type="button"
                              onClick={() => openDayModal(day.isoDate)}
                              className={`text-[11px] font-semibold hover:underline cursor-pointer ${
                                isExam ? 'text-emerald-300' : 'text-[#FF4B3A]'
                              }`}
                            >
                              Рутина дня →
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Rest Days Configuration */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Coffee className="w-4 h-4 text-emerald-600" />
          <h2 className="text-base font-bold text-slate-900">
            Дни восстановления в неделе (без потери ритма)
          </h2>
        </div>
        <p className="text-xs text-slate-600">
          В выбранные дни недели расписание автоматически переключается на лёгкую 25-минутную рутину по всем 4 навыкам (подкаст, короткая заметка, 3–4 фразы и 5-минутная беседа с AI Coach).
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {WEEK_DAYS.map((d) => {
            const active = localPlan.restDays.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleRestDay(d.id)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Daily Routine & Scheduled Exercises Modal Popup */}
      {modalDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-xs"
          onClick={() => setModalIsoDate(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="daily-routine-modal-title"
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="hero-pastel-mesh px-6 py-5 border-b border-slate-200 space-y-3 shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-600 font-mono tabular-nums">
                  <span>
                    {modalDay.offset === 0
                      ? 'Сегодня'
                      : `День ${modalDay.dayIndex} из ${scheduleDays.length}`}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{modalDay.phaseLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#FF4B3A]" />
                    {modalDay.totalMinutes} мин
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setModalIsoDate(null)}
                  className="p-2 -mr-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white/70 transition-colors cursor-pointer"
                  aria-label="Закрыть окно Daily Routine"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3
                    id="daily-routine-modal-title"
                    className="text-xl font-bold text-slate-900 capitalize"
                  >
                    {modalDay.fullDateLabel}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 font-mono tabular-nums">
                    Daily Routine и список упражнений · Ориентир Band {modalDay.projectedBand.toFixed(1)} · Выполнено {modalDay.completedCount}/4
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleWholeDay(modalDay)}
                  className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    modalDay.completedCount === 4
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {modalDay.completedCount === 4 ? 'Снять отметки дня' : 'Выполнить весь день'}
                </button>
              </div>
            </div>

            {/* Modal Body: Scheduled Exercises & Notes */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
              {SKILL_META.map((meta) => {
                const item = modalDay.skills[meta.key];
                const Icon = meta.icon;
                return (
                  <div
                    key={meta.key}
                    className={`px-6 py-4 transition-colors ${
                      item.completed ? 'bg-slate-50/70' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <button
                        type="button"
                        onClick={() => toggleSkillTask(item.taskKey)}
                        className="mt-0.5 shrink-0 cursor-pointer"
                        aria-label={`Отметить упражнение ${item.skillLabel}`}
                      >
                        {item.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-300 hover:text-slate-500" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-bold ${meta.accentText}`}
                          >
                            <Icon className="w-4 h-4" />
                            {item.skillLabel}
                          </span>
                          <span className="text-xs font-mono tabular-nums font-semibold text-slate-500">
                            {item.minutes} мин
                          </span>
                        </div>

                        <p
                          className={`text-sm font-bold leading-snug ${
                            item.completed ? 'line-through text-slate-400' : 'text-slate-900'
                          }`}
                        >
                          {item.title}
                        </p>

                        <p className="text-xs text-slate-600 leading-relaxed">
                          {item.details}
                        </p>

                        <p className="text-[11px] text-slate-500">
                          Совет: {item.tip}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] font-medium text-slate-500">
                            {item.resourceHint}
                          </span>

                          {item.siteRoute && (
                            <button
                              type="button"
                              onClick={() => {
                                setModalIsoDate(null);
                                onNavigate(item.siteRoute!);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg whitespace-nowrap cursor-pointer"
                            >
                              {item.siteRouteLabel ?? 'Открыть тренажёр'}
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Personal On-Device Day Note */}
              <div className="px-6 py-4 bg-slate-50 space-y-2">
                <label
                  htmlFor="modal-day-routine-note"
                  className="text-xs font-bold text-slate-700 block"
                >
                  Заметка и результаты упражнений за этот день (сохраняется на устройстве)
                </label>
                <textarea
                  id="modal-day-routine-note"
                  rows={2}
                  value={localPlan.dayNotes[modalDay.isoDate] ?? ''}
                  onChange={(e) => updateDayNote(modalDay.isoDate, e.target.value)}
                  placeholder="Например: Cambridge 18 Listening — 33/40, повторить T/F/NG..."
                  className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 resize-y"
                />
              </div>
            </div>

            {/* Modal Footer: Prev / Next Day Navigation */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                disabled={modalDayArrayIndex <= 0}
                onClick={() => {
                  if (modalDayArrayIndex > 0) {
                    openDayModal(scheduleDays[modalDayArrayIndex - 1].isoDate);
                  }
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Предыдущий день
              </button>

              <button
                type="button"
                disabled={modalDayArrayIndex < 0 || modalDayArrayIndex >= scheduleDays.length - 1}
                onClick={() => {
                  if (modalDayArrayIndex >= 0 && modalDayArrayIndex < scheduleDays.length - 1) {
                    openDayModal(scheduleDays[modalDayArrayIndex + 1].isoDate);
                  }
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg cursor-pointer"
              >
                Следующий день
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
