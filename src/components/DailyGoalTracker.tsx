import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Headphones,
  Mic,
  PartyPopper,
  PenTool,
} from 'lucide-react';
import type { FourSkillScheduledDay, SkillKey } from '../utils/localStudyPlan';

interface DailyGoalTrackerProps {
  todayPlan: FourSkillScheduledDay;
  onToggleSkill: (taskKey: string) => void;
  onCompleteAllToday?: () => void;
  onOpenStudyPlan?: () => void;
  reducedMotion?: boolean;
}

const SKILL_ITEMS: Array<{
  key: SkillKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'listening', label: 'Listening', icon: Headphones },
  { key: 'reading', label: 'Reading', icon: BookOpen },
  { key: 'writing', label: 'Writing', icon: PenTool },
  { key: 'speaking', label: 'Speaking', icon: Mic },
];

const CONFETTI_PARTICLES: Array<{
  tx: string;
  ty: string;
  rot: string;
  color: string;
  size: string;
  delay: string;
}> = [
  { tx: '-54px', ty: '-52px', rot: '-120deg', color: 'bg-[#FF4B3A]', size: 'w-2.5 h-2.5', delay: '0ms' },
  { tx: '-16px', ty: '-66px', rot: '95deg', color: 'bg-emerald-500', size: 'w-2 h-3', delay: '40ms' },
  { tx: '28px', ty: '-64px', rot: '160deg', color: 'bg-amber-400', size: 'w-2.5 h-2.5', delay: '60ms' },
  { tx: '58px', ty: '-44px', rot: '200deg', color: 'bg-blue-600', size: 'w-2 h-2.5', delay: '30ms' },
  { tx: '-64px', ty: '-10px', rot: '-90deg', color: 'bg-amber-400', size: 'w-2 h-2.5', delay: '80ms' },
  { tx: '64px', ty: '4px', rot: '130deg', color: 'bg-[#FF4B3A]', size: 'w-2.5 h-2', delay: '50ms' },
  { tx: '-48px', ty: '42px', rot: '-150deg', color: 'bg-blue-500', size: 'w-2 h-2.5', delay: '90ms' },
  { tx: '48px', ty: '44px', rot: '175deg', color: 'bg-emerald-500', size: 'w-2.5 h-2.5', delay: '70ms' },
  { tx: '0px', ty: '60px', rot: '110deg', color: 'bg-purple-500', size: 'w-2 h-2', delay: '100ms' },
  { tx: '-28px', ty: '56px', rot: '-70deg', color: 'bg-[#FF4B3A]', size: 'w-2 h-2', delay: '110ms' },
];

export const DailyGoalTracker: React.FC<DailyGoalTrackerProps> = ({
  todayPlan,
  onToggleSkill,
  onCompleteAllToday,
  onOpenStudyPlan,
  reducedMotion = false,
}) => {
  const { targetMinutes, completedMinutes, remainingMinutes, progressPercent } = useMemo(() => {
    const target = Math.max(1, todayPlan.totalMinutes);
    let done = 0;
    for (const item of SKILL_ITEMS) {
      const skillObj = todayPlan.skills[item.key];
      if (skillObj.completed) {
        done += skillObj.minutes;
      }
    }
    const remaining = Math.max(0, target - done);
    const pct = Math.min(100, Math.round((done / target) * 100));
    return {
      targetMinutes: target,
      completedMinutes: done,
      remainingMinutes: remaining,
      progressPercent: pct,
    };
  }, [todayPlan]);

  const isGoalReached = remainingMinutes === 0;
  const prevRemainingRef = useRef<number>(remainingMinutes);
  const [celebrating, setCelebrating] = useState(false);
  const [burstSeed, setBurstSeed] = useState(0);

  useEffect(() => {
    const prevRemaining = prevRemainingRef.current;
    if (prevRemaining > 0 && remainingMinutes === 0) {
      setBurstSeed((s) => s + 1);
      setCelebrating(true);
    } else if (remainingMinutes > 0 && celebrating) {
      setCelebrating(false);
    }
    prevRemainingRef.current = remainingMinutes;
  }, [remainingMinutes, celebrating]);

  useEffect(() => {
    if (!celebrating) return;
    const timer = window.setTimeout(() => {
      setCelebrating(false);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [celebrating, burstSeed]);

  // SVG Ring Math (radius = 36 -> circumference = 226.19)
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <section
      aria-label="Трекер дневной цели"
      className={`rounded-3xl border p-5 sm:p-6 transition-colors duration-300 ${
        isGoalReached
          ? 'hero-pastel-mesh border-emerald-200'
          : 'bg-white border-slate-200'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left: Circular Progress Ring + Celebration Burst + Remaining Minutes Headline */}
        <div className="flex items-center gap-5 min-w-0">
          <div
            className={`relative w-24 h-24 shrink-0 flex items-center justify-center ${
              celebrating && !reducedMotion ? 'goal-ring-pop' : ''
            }`}
          >
            {/* Celebration Confetti Particles */}
            {celebrating &&
              !reducedMotion &&
              CONFETTI_PARTICLES.map((p, idx) => (
                <span
                  key={`${burstSeed}-${idx}`}
                  aria-hidden="true"
                  className={`goal-confetti-piece pointer-events-none absolute left-1/2 top-1/2 rounded-sm ${p.size} ${p.color}`}
                  style={
                    {
                      '--tx': p.tx,
                      '--ty': p.ty,
                      '--rot': p.rot,
                      animationDelay: p.delay,
                    } as React.CSSProperties
                  }
                />
              ))}

            <svg
              className="w-24 h-24 -rotate-90"
              viewBox="0 0 88 88"
              role="img"
              aria-label={`Выполнено ${progressPercent}% дневной цели`}
            >
              <circle
                cx="44"
                cy="44"
                r={radius}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="7"
              />
              <circle
                cx="44"
                cy="44"
                r={radius}
                fill="none"
                stroke={isGoalReached ? '#16a34a' : '#FF4B3A'}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-[stroke-dashoffset,stroke] duration-300 ease-out"
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              {isGoalReached ? (
                <PartyPopper className="w-6 h-6 text-emerald-600" />
              ) : (
                <>
                  <span className="text-lg font-bold font-mono tabular-nums text-slate-900 leading-none">
                    {remainingMinutes}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 mt-0.5">
                    мин ост.
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                <Clock className="w-3.5 h-3.5 text-[#FF4B3A]" />
                Дневная цель на сегодня
              </span>
              <span aria-hidden="true">·</span>
              <span>{todayPlan.phaseLabel}</span>
            </div>

            {isGoalReached ? (
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
                Цель на сегодня выполнена!
              </h2>
            ) : (
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight font-mono tabular-nums">
                Осталось {remainingMinutes} мин до цели дня
              </h2>
            )}

            <p className="text-xs text-slate-600 font-mono tabular-nums">
              {isGoalReached ? (
                <span className="text-emerald-700 font-semibold font-sans">
                  Все {targetMinutes} мин закрыты (4/4 модуля) · Отличный темп!
                </span>
              ) : (
                <>
                  Выполнено {completedMinutes} из {targetMinutes} мин ({progressPercent}%) ·{' '}
                  {todayPlan.completedCount}/4 навыков
                </>
              )}
            </p>

            {/* Linear Progress Bar */}
            <div className="pt-1 max-w-md">
              <div
                className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/70"
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Выполнение дневной цели по минутам"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isGoalReached ? 'bg-emerald-600' : 'bg-[#FF4B3A]'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Interactive 4-Skill Minute Pills/Buttons + Quick Action */}
        <div className="flex flex-col gap-3 lg:items-end shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto">
            {SKILL_ITEMS.map((meta) => {
              const skillObj = todayPlan.skills[meta.key];
              const Icon = meta.icon;
              return (
                <button
                  key={meta.key}
                  type="button"
                  onClick={() => onToggleSkill(skillObj.taskKey)}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 min-w-[118px] ${
                    skillObj.completed
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                      skillObj.completed
                        ? 'bg-white/20 border-white/40 text-white'
                        : 'bg-white border-slate-300 text-slate-500'
                    }`}
                  >
                    {skillObj.completed ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Icon className="w-2.5 h-2.5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-bold block leading-none truncate">
                      {meta.label}
                    </span>
                    <span
                      className={`text-[10px] font-mono tabular-nums block mt-0.5 ${
                        skillObj.completed ? 'text-emerald-100' : 'text-slate-500'
                      }`}
                    >
                      {skillObj.minutes} мин
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onCompleteAllToday && !isGoalReached && (
              <button
                type="button"
                onClick={onCompleteAllToday}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Закрыть цель дня ({remainingMinutes} мин)
              </button>
            )}

            {onOpenStudyPlan && (
              <button
                type="button"
                onClick={onOpenStudyPlan}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap cursor-pointer"
              >
                Открыть всё расписание
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
