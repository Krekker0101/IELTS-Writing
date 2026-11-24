import React from 'react';
import { AlertTriangle, Lock, Maximize2, ShieldAlert } from 'lucide-react';
import type { FocusEventRecord } from '../types/ielts';

interface FocusLockOverlayProps {
  visible: boolean;
  reason: FocusEventRecord['type'] | null;
  violationCount: number;
  sessionTitle: string;
  onUnlockAndReenterFullscreen: () => void;
  onEmergencyExit?: () => void;
}

const REASON_LABEL: Record<FocusEventRecord['type'], string> = {
  fullscreen_exit: 'Вы вышли из полноэкранного режима.',
  tab_hidden: 'Зафиксировано переключение на другую вкладку или сворачивание окна.',
  window_blur: 'Фокус окна перешёл в другое приложение или системное окно.',
};

export const FocusLockOverlay: React.FC<FocusLockOverlayProps> = ({
  visible,
  reason,
  violationCount,
  sessionTitle,
  onUnlockAndReenterFullscreen,
  onEmergencyExit,
}) => {
  if (!visible) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="focus-lock-title"
      className="fixed inset-0 z-[70] bg-slate-950/95 backdrop-blur-md text-white flex items-center justify-center p-6"
    >
      <div className="max-w-lg w-full bg-slate-900 border border-slate-700/80 rounded-2xl p-7 space-y-5 shadow-2xl">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#FF4B3A]/15 border border-[#FF4B3A]/40 text-[#FF4B3A] flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold text-[#FF4B3A]">
              Экран заблокирован · Строгий режим фокуса
            </p>
            <h2 id="focus-lock-title" className="text-xl font-bold text-white">
              Доступ к заданию приостановлен
            </h2>
            <p className="text-xs text-slate-400 truncate">{sessionTitle}</p>
          </div>
        </div>

        <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-2 text-xs text-slate-200">
          <p className="font-semibold inline-flex items-center gap-1.5 text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {reason ? REASON_LABEL[reason] : 'Требуется полноэкранный режим фокусировки.'}
          </p>
          <p className="text-slate-300 leading-relaxed">
            Во время экзамена переключение на другие вкладки, окна и приложения блокируется.
            Содержимое задания скрыто до возврата в Fullscreen и повторной активации блокировки клавиатуры.
          </p>
          <p className="font-mono tabular-nums text-[11px] text-slate-400">
            Зафиксировано нарушений фокуса в этой сессии: {violationCount}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          {onEmergencyExit ? (
            <button
              type="button"
              onClick={onEmergencyExit}
              className="px-4 py-2.5 text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              Выйти из сессии
            </button>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={onUnlockAndReenterFullscreen}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#FF4B3A] rounded-xl hover:bg-[#e84232] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
            Вернуться в Fullscreen и разблокировать
          </button>
        </div>

        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 shrink-0 text-[#FF4B3A]" />
          Screen Lock API: при входе активируются Fullscreen, Screen Wake Lock и Keyboard Lock для защиты целостности экзамена.
        </p>
      </div>
    </div>
  );
};
