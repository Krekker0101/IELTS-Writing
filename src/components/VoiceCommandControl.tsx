import React, { useEffect, useState } from 'react';
import { CheckCircle2, HelpCircle, Mic, MicOff, Volume2, X } from 'lucide-react';
import type { AppRoute } from './SidebarNav';
import { VOICE_COMMAND_RULES } from '../utils/voiceCommands';
import type { VoiceNavStatus } from '../hooks/useVoiceNavigation';
import type { VoiceCommandMatch } from '../utils/voiceCommands';

interface VoiceCommandButtonProps {
  isSupported: boolean;
  isListening: boolean;
  compact?: boolean;
  onToggle: () => void;
  onOpenHelp: () => void;
}

export const VoiceCommandButton: React.FC<VoiceCommandButtonProps> = ({
  isSupported,
  isListening,
  compact = false,
  onToggle,
  onOpenHelp,
}) => {
  return (
    <div className="inline-flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={isSupported ? onToggle : onOpenHelp}
        aria-pressed={isListening}
        aria-label={
          isListening
            ? 'Остановить голосовую команду'
            : 'Включить голосовую навигацию (Alt+V)'
        }
        title={
          isSupported
            ? 'Голосовые команды (Alt+V): «перейти на главную», «начать практику», «открыть прогресс»'
            : 'Список голосовых команд'
        }
        className={`inline-flex items-center gap-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'px-2.5 py-1.5' : 'px-3 py-1.5'
        } ${
          isListening
            ? 'bg-[#FF4B3A] text-white shadow-xs'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
        }`}
      >
        {isListening ? (
          <MicOff className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Mic className="w-3.5 h-3.5 shrink-0" />
        )}
        {!compact && <span>{isListening ? 'Слушаю…' : 'Голос'}</span>}
      </button>

      {!compact && (
        <button
          type="button"
          onClick={onOpenHelp}
          aria-label="Показать список голосовых команд"
          title="Список голосовых команд"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

interface VoiceCommandOverlayProps {
  isSupported: boolean;
  status: VoiceNavStatus;
  transcript: string;
  lastMatch: VoiceCommandMatch | null;
  errorMessage: string | null;
  helpOpen: boolean;
  onCloseHelp: () => void;
  onStopListening: () => void;
  onStartListening: () => void;
  onNavigate: (route: AppRoute) => void;
}

export const VoiceCommandOverlay: React.FC<VoiceCommandOverlayProps> = ({
  isSupported,
  status,
  transcript,
  lastMatch,
  errorMessage,
  helpOpen,
  onCloseHelp,
  onStopListening,
  onStartListening,
  onNavigate,
}) => {
  const [dismissedError, setDismissedError] = useState(false);

  useEffect(() => {
    if (status === 'listening' || status === 'matched') {
      setDismissedError(false);
    }
  }, [status]);

  const showLivePanel =
    helpOpen ||
    status === 'listening' ||
    status === 'matched' ||
    ((status === 'unrecognized' || status === 'error') && !dismissedError);

  if (!showLivePanel) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-40 w-[340px] max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-2xl shadow-xl p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              status === 'listening'
                ? 'bg-[#FF4B3A] text-white'
                : status === 'matched'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {status === 'matched' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">
              {status === 'listening'
                ? 'Слушаю голосовую команду…'
                : status === 'matched'
                ? `Открыто: ${lastMatch?.label ?? ''}`
                : helpOpen
                ? 'Голосовая навигация (Alt+V)'
                : 'Голосовое управление'}
            </p>
            <p className="text-[11px] text-slate-500">
              {status === 'listening'
                ? 'Произнесите команду, например «перейти на главную»'
                : isSupported
                ? 'Web Speech API · Русский и английский'
                : 'SpeechRecognition недоступен в этом браузере'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (status === 'listening') onStopListening();
            setDismissedError(true);
            onCloseHelp();
          }}
          aria-label="Закрыть панель голосовых команд"
          className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Live transcript / result */}
      {transcript && (
        <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-800">
          «{transcript}»
        </div>
      )}

      {errorMessage && (status === 'unrecognized' || status === 'error') && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {errorMessage}
        </p>
      )}

      {/* Interactive Command Reference List */}
      {helpOpen && (
        <div className="space-y-2 pt-1 border-t border-slate-100">
          <p className="text-[11px] font-semibold text-slate-600">
            Доступные команды (можно нажать для перехода):
          </p>
          <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
            {VOICE_COMMAND_RULES.slice(0, 8).map((rule) => (
              <button
                key={rule.route}
                type="button"
                onClick={() => {
                  onNavigate(rule.route);
                  onCloseHelp();
                }}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <span className="font-medium text-slate-800">
                  «{rule.examples[0]}»
                </span>
                <span className="text-[11px] text-slate-500 shrink-0">
                  {rule.label}
                </span>
              </button>
            ))}
          </div>

          {isSupported && status !== 'listening' && (
            <button
              type="button"
              onClick={() => {
                setDismissedError(false);
                onStartListening();
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#FF4B3A] rounded-xl hover:bg-[#e84232] transition-colors cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              Нажать и сказать команду
            </button>
          )}
        </div>
      )}
    </div>
  );
};
