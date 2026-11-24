import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Keyboard,
  Lock,
  Maximize2,
  Mic,
  Monitor,
  ShieldCheck,
  Volume2,
  Wifi,
  X,
} from 'lucide-react';
import { useAIStatus } from '../contexts/AIStatusContext';
import {
  getDeviceLockCapabilities,
  readCurrentNotificationPermission,
  requestStrictDeviceFocusLock,
} from '../utils/focusLock';

interface PreExamCheckModalProps {
  title: string;
  requireMicrophone: boolean;
  onCancel: () => void;
  onStart: (enteredFullscreen: boolean) => void;
}

export const PreExamCheckModal: React.FC<PreExamCheckModalProps> = ({
  title,
  requireMicrophone,
  onCancel,
  onStart,
}) => {
  const { health } = useAIStatus();
  const caps = getDeviceLockCapabilities();

  const [micStatus, setMicStatus] = useState<'idle' | 'ok' | 'denied'>(
    requireMicrophone ? 'idle' : 'ok'
  );
  const [micLevel, setMicLevel] = useState(0);
  const [speakerChecked, setSpeakerChecked] = useState(!requireMicrophone);
  const [micError, setMicError] = useState<string | null>(null);

  const [notifStatus, setNotifStatus] = useState<NotificationPermission | 'unsupported'>(() =>
    readCurrentNotificationPermission()
  );
  const [wakeLockReady, setWakeLockReady] = useState(false);
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockPreviewRef = useRef<WakeLockSentinel | null>(null);

  const stopMicMonitor = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    audioCtxRef.current = null;
  };

  useEffect(() => {
    return () => {
      stopMicMonitor();
      if (wakeLockPreviewRef.current && !wakeLockPreviewRef.current.released) {
        wakeLockPreviewRef.current.release().catch(() => {});
      }
    };
  }, []);

  const handleTestMic = async () => {
    setMicError(null);
    stopMicMonitor();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      setMicStatus('ok');

      const loop = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setMicLevel(Math.min(100, Math.round((avg / 90) * 100)));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      setMicStatus('denied');
      setMicError(
        'Доступ к микрофону отклонён. Разрешите доступ в настройках браузера или выберите Practice/Coaching режим с текстовым вводом.'
      );
    }
  };

  const handleTestSpeaker = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
      setSpeakerChecked(true);
    } catch {
      setSpeakerChecked(true);
    }
  };

  const handleRequestDevicePermissions = async () => {
    setIsRequestingPermissions(true);
    try {
      if (requireMicrophone && micStatus !== 'ok') {
        await handleTestMic();
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        try {
          const perm = await Notification.requestPermission();
          setNotifStatus(perm);
        } catch {
          setNotifStatus(readCurrentNotificationPermission());
        }
      } else {
        setNotifStatus(readCurrentNotificationPermission());
      }
      if ('wakeLock' in navigator && navigator.wakeLock?.request) {
        try {
          const wl = await navigator.wakeLock.request('screen');
          wakeLockPreviewRef.current = wl;
          setWakeLockReady(true);
        } catch {
          setWakeLockReady(false);
        }
      }
    } finally {
      setIsRequestingPermissions(false);
    }
  };

  const handleEnterExam = async (useFullscreen: boolean) => {
    stopMicMonitor();
    if (wakeLockPreviewRef.current && !wakeLockPreviewRef.current.released) {
      wakeLockPreviewRef.current.release().catch(() => {});
      wakeLockPreviewRef.current = null;
    }

    if (!useFullscreen) {
      onStart(false);
      return;
    }

    const { status } = await requestStrictDeviceFocusLock({
      requestNotifications: true,
    });
    setNotifStatus(status.notificationPermission);
    onStart(status.fullscreenActive);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl my-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-blue-700">
              Предэкзаменационная проверка · Exam Mode
            </p>
            <h2 className="text-xl font-bold text-slate-900 mt-1">{title}</h2>
          </div>
          <button
            type="button"
            onClick={() => {
              stopMicMonitor();
              onCancel();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Checklist */}
        <div className="space-y-3">
          {requireMicrophone && (
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Mic className="w-4 h-4 text-[#FF4B3A]" />
                  Микрофон и уровень сигнала
                </span>
                <button
                  type="button"
                  onClick={handleTestMic}
                  className="px-3 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:border-slate-300 cursor-pointer"
                >
                  {micStatus === 'ok' ? 'Повторить тест' : 'Проверить микрофон'}
                </button>
              </div>
              {micStatus === 'ok' && (
                <div className="space-y-1">
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-75"
                      style={{ width: `${Math.max(8, micLevel)}%` }}
                    />
                  </div>
                  <p className="text-xs text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Микрофон активен — скажите пару слов для проверки шкалы
                  </p>
                </div>
              )}
              {micError && <p className="text-xs text-red-600">{micError}</p>}
            </div>
          )}

          {requireMicrophone && (
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Volume2 className="w-4 h-4 text-blue-700" />
                <span>Воспроизведение звука</span>
                {speakerChecked && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </div>
              <button
                type="button"
                onClick={handleTestSpeaker}
                className="px-3 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:border-slate-300 cursor-pointer"
              >
                Проверить звук
              </button>
            </div>
          )}

          {/* Device Access & Strict Lock Readiness */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Lock className="w-4 h-4 text-blue-700" />
                Доступы устройства для строгой фокусировки
              </span>
              <button
                type="button"
                disabled={isRequestingPermissions}
                onClick={handleRequestDevicePermissions}
                className="px-3 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:border-slate-300 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {isRequestingPermissions ? 'Запрос…' : 'Запросить все доступы'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-lg px-2.5 py-2">
                <span className="inline-flex items-center gap-1.5 text-slate-700">
                  <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                  Fullscreen
                </span>
                <span className={caps.fullscreenSupported ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>
                  {caps.fullscreenSupported ? 'Готово' : 'Ограничено'}
                </span>
              </div>

              <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-lg px-2.5 py-2">
                <span className="inline-flex items-center gap-1.5 text-slate-700">
                  <Keyboard className="w-3.5 h-3.5 text-slate-500" />
                  Keyboard Lock
                </span>
                <span className={caps.keyboardLockSupported ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                  {caps.keyboardLockSupported ? 'При Fullscreen' : 'Перехват клавиш'}
                </span>
              </div>

              <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-lg px-2.5 py-2">
                <span className="inline-flex items-center gap-1.5 text-slate-700">
                  <Monitor className="w-3.5 h-3.5 text-slate-500" />
                  Wake Lock
                </span>
                <span className={wakeLockReady || caps.wakeLockSupported ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                  {wakeLockReady ? 'Активен' : caps.wakeLockSupported ? 'Доступен' : 'Недоступно'}
                </span>
              </div>

              <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-lg px-2.5 py-2">
                <span className="inline-flex items-center gap-1.5 text-slate-700">
                  <Bell className="w-3.5 h-3.5 text-slate-500" />
                  Уведомления
                </span>
                <span
                  className={
                    notifStatus === 'granted'
                      ? 'text-emerald-700 font-semibold'
                      : notifStatus === 'denied'
                      ? 'text-amber-700'
                      : 'text-slate-600'
                  }
                >
                  {notifStatus === 'granted'
                    ? 'Разрешено'
                    : notifStatus === 'denied'
                    ? 'Отклонено'
                    : notifStatus === 'unsupported'
                    ? 'Недоступно'
                    : 'Запросится'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3 text-xs">
            <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
              <Wifi className="w-4 h-4 text-slate-500" />
              Подключение к AI API
            </span>
            <span
              className={`font-semibold ${
                health?.status === 'online' || health?.status === 'processing'
                  ? 'text-emerald-700'
                  : 'text-amber-700'
              }`}
            >
              {health?.status === 'online'
                ? `Готово (${health.latencyMs ?? '—'} мс)`
                : health?.message ?? 'Проверка соединения с Gemini API…'}
            </span>
          </div>
        </div>

        {/* Honest Browser Focus Mode Disclosure */}
        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 text-xs text-amber-900 space-y-1.5">
          <p className="font-semibold inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
            Жёсткий режим концентрации (Strict Focus Lock)
          </p>
          <p className="leading-relaxed">
            При запуске в Fullscreen активируются блокировка клавиатуры (Keyboard Lock), удержание
            экрана (Wake Lock), перехват горячих клавиш переключения вкладок и защита от закрытия окна.
            Если вы всё же переключите окно через системные клавиши ОС, задание немедленно скроется
            под экраном блокировки до возврата в Fullscreen.
          </p>
          {!caps.fullscreenSupported && (
            <p className="inline-flex items-center gap-1 text-amber-800 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              Fullscreen API не поддерживается в текущем окне — сессия запустится с защитой от потери фокуса.
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => handleEnterExam(false)}
            disabled={requireMicrophone && micStatus === 'denied'}
            className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            Начать без Fullscreen
          </button>
          <button
            type="button"
            onClick={() => handleEnterExam(true)}
            disabled={requireMicrophone && micStatus !== 'ok'}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Включить Fullscreen + Lock и начать
          </button>
        </div>
      </div>
    </div>
  );
};
