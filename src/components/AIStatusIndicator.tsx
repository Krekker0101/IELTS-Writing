import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { useAIStatus } from '../contexts/AIStatusContext';

interface AIStatusIndicatorProps {
  compact?: boolean;
}

export const AIStatusIndicator: React.FC<AIStatusIndicatorProps> = ({ compact = false }) => {
  const { health, isChecking, activeTask, effectiveStatus, refreshHealth } = useAIStatus();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const statusMeta = (() => {
    switch (effectiveStatus) {
      case 'processing':
        return {
          shortLabel:
            activeTask?.percent !== undefined
              ? `ИИ ${activeTask.percent}%`
              : 'ИИ работает',
          title: activeTask?.label ?? 'Выполняется ИИ-анализ',
          icon: <Loader2 className="w-3.5 h-3.5 text-blue-700 animate-spin shrink-0" />,
          dotClass: 'bg-blue-600',
          triggerClass: 'border-blue-200 bg-blue-50/80 text-blue-800 hover:bg-blue-50',
        };
      case 'online':
        return {
          shortLabel: 'ИИ готов',
          title: 'Gemini API подключён',
          icon: <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" aria-hidden="true" />,
          dotClass: 'bg-emerald-600',
          triggerClass: 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-white hover:border-slate-300',
        };
      case 'degraded':
        return {
          shortLabel: 'ИИ перегружен',
          title: 'Высокая нагрузка на Gemini API',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
          dotClass: 'bg-amber-600',
          triggerClass: 'border-amber-200 bg-amber-50/80 text-amber-800 hover:bg-amber-50',
        };
      case 'unconfigured':
        return {
          shortLabel: 'Ключ ИИ не задан',
          title: 'Не настроен GEMINI_API_KEY',
          icon: <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />,
          dotClass: 'bg-red-600',
          triggerClass: 'border-red-200 bg-red-50/80 text-red-800 hover:bg-red-50',
        };
      case 'offline':
        return {
          shortLabel: 'ИИ недоступен',
          title: 'Ошибка соединения с Gemini API',
          icon: <WifiOff className="w-3.5 h-3.5 text-red-600 shrink-0" />,
          dotClass: 'bg-red-600',
          triggerClass: 'border-red-200 bg-red-50/80 text-red-800 hover:bg-red-50',
        };
      default:
        return {
          shortLabel: 'Проверка ИИ…',
          title: 'Проверяем подключение к Gemini API',
          icon: <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin shrink-0" />,
          dotClass: 'bg-slate-400',
          triggerClass: 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white',
        };
    }
  })();

  const checkedTime = health?.checkedAt
    ? new Date(health.checkedAt).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={statusMeta.title}
        className={`inline-flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${statusMeta.triggerClass}`}
      >
        {statusMeta.icon}
        <span className={compact ? 'hidden sm:inline font-mono tabular-nums' : 'font-mono tabular-nums'}>
          {statusMeta.shortLabel}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Статус подключения к ИИ"
          className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-4 z-50 text-left space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              {effectiveStatus === 'online' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              ) : (
                <div className="mt-0.5 shrink-0">{statusMeta.icon}</div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">{statusMeta.title}</p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  {activeTask?.stage
                    ? activeTask.stage
                    : health?.message ?? 'Выполняется проверка доступности API…'}
                </p>
              </div>
            </div>
          </div>

          {activeTask && (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-700">
                <span className="truncate font-medium">{activeTask.label}</span>
                {activeTask.percent !== undefined && (
                  <span className="font-mono tabular-nums font-semibold text-blue-700 shrink-0 ml-2">
                    {activeTask.percent}%
                  </span>
                )}
              </div>
              {activeTask.percent !== undefined && (
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-700 rounded-full transition-all duration-300"
                    style={{ width: `${activeTask.percent}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-y-2 gap-x-3 text-[11px]">
            <div>
              <span className="text-slate-500 block">Модель</span>
              <span className="font-mono text-slate-800 font-medium">
                {health?.model ?? 'gemini-4-hydrogen'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Отклик API</span>
              <span className="font-mono tabular-nums text-slate-800 font-medium">
                {health?.latencyMs !== null && health?.latencyMs !== undefined
                  ? `${health.latencyMs} мс`
                  : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Активных задач</span>
              <span className="font-mono tabular-nums text-slate-800 font-medium">
                {activeTask ? Math.max(1, health?.activeRequests ?? 1) : health?.activeRequests ?? 0}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Проверено</span>
              <span className="font-mono tabular-nums text-slate-800 font-medium">
                {checkedTime}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">
              {health?.configured ? 'Ключ настроен на сервере' : 'Требуется GEMINI_API_KEY'}
            </span>
            <button
              type="button"
              onClick={() => void refreshHealth(true)}
              disabled={isChecking}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-60 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
              Проверить
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
