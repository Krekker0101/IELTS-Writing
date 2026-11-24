import React from 'react';
import { Award, ArrowRight, X } from 'lucide-react';

export interface LevelUpEvent {
  level: number;
  title: string;
  subtitle: string;
  totalXp: number;
  xpRemaining: number;
  gainedXp: number;
}

interface LevelUpNotificationProps {
  event: LevelUpEvent | null;
  onDismiss: () => void;
  onViewProgress: () => void;
}

export const LevelUpNotification: React.FC<LevelUpNotificationProps> = ({
  event,
  onDismiss,
  onViewProgress,
}) => {
  if (!event) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] max-w-sm hero-pastel-mesh border border-slate-200 rounded-2xl shadow-lg p-4 transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#FF4B3A] text-white flex items-center justify-center shrink-0 shadow-xs">
          <Award className="w-5 h-5" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#FF4B3A]">
              Новый уровень достигнут
            </span>
            <button
              type="button"
              onClick={onDismiss}
              className="p-1.5 -mr-1.5 -mt-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              aria-label="Закрыть уведомление"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <h3 className="text-base font-bold text-slate-900 leading-snug">
            Уровень {event.level} · {event.title}
          </h3>
          <p className="text-xs text-slate-600">{event.subtitle}</p>

          <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-slate-200/70 text-[11px] font-mono tabular-nums text-slate-700">
            <span>
              {event.gainedXp > 0 ? `+${event.gainedXp} XP · ` : ''}Всего {event.totalXp} XP
            </span>
            <button
              type="button"
              onClick={onViewProgress}
              className="inline-flex items-center gap-1 font-sans font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              Прогресс
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
