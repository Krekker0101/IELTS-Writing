import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { AnalysisProgressEvent } from '../types/ielts';

interface AnalysisProgressPanelProps {
  progress: AnalysisProgressEvent | null;
  isRevision?: boolean;
}

const STAGE_ORDER: Record<AnalysisProgressEvent['stageKey'], number> = {
  connect: 0,
  criteria: 1,
  checklist: 1,
  annotations: 2,
  revision_diff: 2,
  anchoring: 3,
  saving: 3,
  done: 4,
};

export const AnalysisProgressPanel: React.FC<AnalysisProgressPanelProps> = ({
  progress,
  isRevision = false,
}) => {
  const [displayElapsed, setDisplayElapsed] = useState<number>(
    progress?.elapsedSec ?? 0
  );

  useEffect(() => {
    if (typeof progress?.elapsedSec === 'number') {
      setDisplayElapsed(progress.elapsedSec);
    }
  }, [progress?.elapsedSec]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDisplayElapsed((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const percent = progress?.percent ?? 4;
  const stageKey = progress?.stageKey ?? 'connect';
  const activeStepIdx = STAGE_ORDER[stageKey] ?? 0;

  const steps = isRevision
    ? [
        'Подключение к Gemini',
        'Оценка новой редакции',
        'Сравнение и разметка правок',
        'Пересчёт Band Score',
      ]
    : [
        'Подключение к Gemini',
        'Оценка 4 критериев IELTS',
        'Поиск точечных исправлений',
        'Привязка и Band Score',
      ];

  const etaText =
    progress?.estimatedRemainingSec !== null &&
    progress?.estimatedRemainingSec !== undefined &&
    percent < 100
      ? `Осталось ~${progress.estimatedRemainingSec} с`
      : percent >= 97
      ? 'Почти готово…'
      : 'Оцениваем время…';

  return (
    <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900">
            {progress?.stage ?? 'Запуск ИИ-анализа…'}
            {progress?.taskStepLabel ? ` · ${progress.taskStepLabel}` : ''}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            {progress?.detail ?? 'Подключаемся к серверному анализу Gemini…'}
          </p>
        </div>

        <div className="flex items-baseline gap-3 shrink-0 font-mono tabular-nums">
          <span className="text-xs text-slate-500">
            Прошло: {displayElapsed} с · {etaText}
          </span>
          <span className="text-base font-semibold text-blue-700">{percent}%</span>
        </div>
      </div>

      {/* Smooth Progress Bar */}
      <div
        className="w-full h-2 bg-slate-200 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-blue-700 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* 4-Step Pipeline Checklist + Live Stream Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {steps.map((label, idx) => {
            const isCompleted = activeStepIdx > idx || percent >= 100;
            const isActive = activeStepIdx === idx && percent < 100;
            return (
              <span
                key={label}
                className={`inline-flex items-center gap-1.5 text-[11px] ${
                  isCompleted
                    ? 'text-emerald-700 font-medium'
                    : isActive
                    ? 'text-blue-700 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : isActive ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 shrink-0" />
                )}
                {label}
              </span>
            );
          })}
        </div>

        {progress && progress.charsReceived > 0 && (
          <span className="text-[11px] text-slate-500 font-mono tabular-nums shrink-0">
            {progress.annotationsDetected > 0
              ? `Замечаний в потоке: ${progress.annotationsDetected} · `
              : ''}
            {(progress.charsReceived / 1024).toFixed(1)} КБ от ИИ
          </span>
        )}
      </div>
    </div>
  );
};
