import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppRoute } from '../components/SidebarNav';
import { matchVoiceCommand, type VoiceCommandMatch } from '../utils/voiceCommands';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export type VoiceNavStatus = 'idle' | 'listening' | 'matched' | 'unrecognized' | 'error';

interface UseVoiceNavigationOptions {
  disabled?: boolean;
  onNavigate: (route: AppRoute) => void;
}

export function useVoiceNavigation({
  disabled = false,
  onNavigate,
}: UseVoiceNavigationOptions) {
  const isSupported = Boolean(getSpeechRecognitionCtor());
  const [status, setStatus] = useState<VoiceNavStatus>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [lastMatch, setLastMatch] = useState<VoiceCommandMatch | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const statusTimerRef = useRef<number | null>(null);
  const matchedDuringSessionRef = useRef(false);

  const clearFeedbackSoon = useCallback((ms = 4200) => {
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => {
      setStatus((prev) => (prev === 'listening' ? prev : 'idle'));
      setErrorMessage(null);
    }, ms);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // ignore stop errors
      }
      recognitionRef.current = null;
    }
    setStatus((prev) => (prev === 'listening' ? 'idle' : prev));
  }, []);

  const startListening = useCallback(() => {
    if (disabled) return;
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setStatus('error');
      setErrorMessage('Web Speech API не поддерживается этим браузером.');
      clearFeedbackSoon();
      return;
    }

    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    stopListening();

    try {
      const recognition = new Ctor();
      recognition.lang = 'ru-RU';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      matchedDuringSessionRef.current = false;

      recognition.onstart = () => {
        setStatus('listening');
        setTranscript('');
        setErrorMessage(null);
      };

      recognition.onresult = (event) => {
        let latestText = '';
        let hasFinal = false;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const primary = result[0]?.transcript ?? '';
          latestText = primary;

          if (result.isFinal) {
            hasFinal = true;
            // Try all alternatives before giving up
            let matched: VoiceCommandMatch | null = null;
            for (let alt = 0; alt < result.length; alt++) {
              const candidate = result[alt]?.transcript ?? '';
              matched = matchVoiceCommand(candidate);
              if (matched) break;
            }

            setTranscript(primary);
            if (matched) {
              matchedDuringSessionRef.current = true;
              setLastMatch(matched);
              setStatus('matched');
              onNavigateRef.current(matched.route);
              try {
                recognition.stop();
              } catch {
                // ignore
              }
              clearFeedbackSoon(3800);
              return;
            }
          }
        }

        if (latestText) {
          setTranscript(latestText);
        }

        if (hasFinal && !matchedDuringSessionRef.current) {
          setStatus('unrecognized');
          setErrorMessage(
            'Команда не распознана. Попробуйте: «перейти на главную», «начать практику», «открыть прогресс».'
          );
          clearFeedbackSoon(4800);
        }
      };

      recognition.onerror = (event) => {
        if (event.error === 'aborted') {
          setStatus('idle');
          return;
        }
        const msg =
          event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? 'Доступ к микрофону запрещён. Разрешите микрофон в настройках браузера.'
            : event.error === 'no-speech'
            ? 'Речь не услышана. Нажмите снова и произнесите команду чётче.'
            : event.error === 'network'
            ? 'Ошибка сети при распознавании речи.'
            : `Ошибка распознавания речи (${event.error}).`;
        setStatus('error');
        setErrorMessage(msg);
        clearFeedbackSoon(4500);
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        setStatus((prev) => (prev === 'listening' ? 'idle' : prev));
      };

      recognitionRef.current = recognition;
      setStatus('listening');
      recognition.start();
    } catch {
      setStatus('error');
      setErrorMessage('Не удалось запустить распознавание речи.');
      clearFeedbackSoon();
    }
  }, [clearFeedbackSoon, disabled, stopListening]);

  const toggleListening = useCallback(() => {
    if (status === 'listening') {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, status, stopListening]);

  useEffect(() => {
    if (disabled && status === 'listening') {
      stopListening();
    }
  }, [disabled, status, stopListening]);

  // Accessible keyboard shortcut: Alt + V toggles voice navigation
  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        toggleListening();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, toggleListening]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
      stopListening();
    };
  }, [stopListening]);

  return {
    isSupported,
    isListening: status === 'listening',
    status,
    transcript,
    lastMatch,
    errorMessage,
    startListening,
    stopListening,
    toggleListening,
  };
}
