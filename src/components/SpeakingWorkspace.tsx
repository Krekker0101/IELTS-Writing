import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Keyboard,
  Loader2,
  Lock,
  Maximize2,
  Mic,
  Send,
  ShieldCheck,
  Square,
  Volume2,
} from 'lucide-react';
import type {
  CoachVisualState,
  SpeakingMockTest,
  SpeakingMode,
  SpeakingPartNumber,
  SpeakingSessionRecord,
  SpeakingTopic,
  SpeakingTurnRecord,
  UserProfile,
} from '../types/ielts';
import { CoachMascot } from './CoachMascot';
import { AIStatusIndicator } from './AIStatusIndicator';
import { FocusLockOverlay } from './FocusLockOverlay';
import { useAIStatus } from '../contexts/AIStatusContext';
import { useCoachSpeech } from '../hooks/useCoachSpeech';
import { useScreenLock } from '../hooks/useScreenLock';

export interface ActiveSpeakingConfig {
  title: string;
  mockTest?: SpeakingMockTest;
  topics: SpeakingTopic[];
  isFullMock: boolean;
  part?: SpeakingPartNumber;
  mode: SpeakingMode;
  enteredFullscreen: boolean;
}

interface SpeakingWorkspaceProps {
  config: ActiveSpeakingConfig;
  userProfile: UserProfile;
  onExit: () => void;
  onCompleted: (session: SpeakingSessionRecord, updatedProfile: UserProfile) => void;
}

interface QuestionStep {
  part: SpeakingPartNumber;
  topicTitle: string;
  questionText: string;
  cueCard?: SpeakingTopic['cueCard'];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать аудиозапись.'));
    reader.readAsDataURL(blob);
  });
}

function formatTimer(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const SpeakingWorkspace: React.FC<SpeakingWorkspaceProps> = ({
  config,
  userProfile,
  onExit,
  onCompleted,
}) => {
  const { beginProcessing, endProcessing } = useAIStatus();

  const steps: QuestionStep[] = useMemo(() => {
    const list: QuestionStep[] = [];
    for (const t of config.topics) {
      if (t.part === 2) {
        list.push({
          part: 2,
          topicTitle: t.title,
          questionText:
            t.cueCard?.prompt || t.questions[0]?.text || `Describe ${t.title}`,
          cueCard: t.cueCard,
        });
      } else {
        const qs = t.questions.slice(0, config.isFullMock ? 3 : 4);
        for (const q of qs) {
          list.push({
            part: t.part,
            topicTitle: t.title,
            questionText: q.text,
          });
        }
      }
    }
    return list;
  }, [config]);

  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = steps[stepIdx];

  const [turns, setTurns] = useState<SpeakingTurnRecord[]>([]);
  const [coachState, setCoachState] = useState<CoachVisualState>(
    config.mode === 'exam' ? 'neutral_examiner' : 'idle'
  );
  const [mistakeStreak, setMistakeStreak] = useState(0);
  const [coachTip, setCoachTip] = useState<string | null>(null);
  const [repeatNotice, setRepeatNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Part 2 1-min prep timer + scratchpad
  const [prepSecondsLeft, setPrepSecondsLeft] = useState<number>(0);
  const [part2Notes, setPart2Notes] = useState('');

  // Recording & Live Audio Meter
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [waveformLevel, setWaveformLevel] = useState(0);
  const [processingTurn, setProcessingTurn] = useState(false);
  const [evaluatingSession, setEvaluatingSession] = useState(false);

  // Accessible Text Fallback (only in Practice & Coaching modes)
  const [useTextFallback, setUseTextFallback] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [autoHandsFree, setAutoHandsFree] = useState(config.mode !== 'exam');

  // Real-time TTS speech & single-play subtitles
  const {
    isSpeaking,
    isTtsLoading,
    speechLevel,
    liveSubtitle,
    isSubtitleVisible,
    speak,
    stop: stopCoachSpeech,
  } = useCoachSpeech();

  // Screen Lock API & Academic Integrity monitoring
  const {
    isStrictEnabled: strictFocusEnabled,
    isLocked: isFocusLocked,
    lockReason: focusLockReason,
    focusEvents,
    lockStatus,
    engageScreenLock: engageStrictFocus,
    releaseScreenLock,
  } = useScreenLock({
    initialEnabled: Boolean(config.mode === 'exam' || config.enteredFullscreen),
    lockPromptCopy: true,
  });
  const [sessionElapsedSec, setSessionElapsedSec] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartMsRef = useRef<number>(0);

  // Hands-free VAD & Silence Nudge refs
  const autoHandsFreeRef = useRef(autoHandsFree);
  autoHandsFreeRef.current = autoHandsFree;
  const useTextFallbackRef = useRef(useTextFallback);
  useTextFallbackRef.current = useTextFallback;
  const processingTurnRef = useRef(processingTurn);
  processingTurnRef.current = processingTurn;
  const evaluatingSessionRef = useRef(evaluatingSession);
  evaluatingSessionRef.current = evaluatingSession;
  const prepSecondsLeftRef = useRef(prepSecondsLeft);
  prepSecondsLeftRef.current = prepSecondsLeft;
  const skipSubmitOnStopRef = useRef(false);
  const nudgeCountThisStepRef = useRef(0);
  const hasSpokenThisTurnRef = useRef(false);
  const speechAccumMsRef = useRef(0);
  const lastFrameMsRef = useRef(0);
  const lastVoiceActiveMsRef = useRef(0);
  const startRecordingRef = useRef<() => Promise<void>>(async () => {});

  // Initialize Part 2 1-minute prep timer when entering a Part 2 step
  useEffect(() => {
    if (currentStep?.part === 2) {
      setPrepSecondsLeft(60);
    } else {
      setPrepSecondsLeft(0);
    }
  }, [stepIdx, currentStep?.part]);

  // Countdown ticks
  useEffect(() => {
    const id = window.setInterval(() => {
      setSessionElapsedSec((s) => s + 1);
      setPrepSecondsLeft((p) => (p > 0 ? p - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const cleanupRecorderResources = () => {
    if (analyserRafRef.current) cancelAnimationFrame(analyserRafRef.current);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    micStreamRef.current = null;
    audioCtxRef.current = null;
    analyserRafRef.current = null;
    recordTimerRef.current = null;
  };

  useEffect(() => {
    return () => {
      cleanupRecorderResources();
      stopCoachSpeech();
    };
  }, [stopCoachSpeech]);

  const handlePlayExaminerVoice = async (
    text: string,
    overrideEmotion?: CoachVisualState
  ) => {
    if (!text) return;
    const baseState: CoachVisualState =
      config.mode === 'exam' ? 'neutral_examiner' : overrideEmotion || 'speaking';
    setCoachState(baseState);
    await speak(text, {
      voiceName: userProfile.coachVoice,
      speed: userProfile.coachSpeed || 1.0,
      mode: config.mode,
      persona: userProfile.coachPersona,
      onEnded: () => {
        setCoachState(config.mode === 'exam' ? 'neutral_examiner' : 'idle');
        if (
          config.mode !== 'exam' &&
          autoHandsFreeRef.current &&
          !useTextFallbackRef.current &&
          !processingTurnRef.current &&
          !evaluatingSessionRef.current &&
          prepSecondsLeftRef.current === 0
        ) {
          void startRecordingRef.current();
        }
      },
    });
  };

  // Auto-read prompt aloud on new step (preserving angry/calming reaction briefly on coaching mode)
  useEffect(() => {
    nudgeCountThisStepRef.current = 0;
    if (currentStep) {
      handlePlayExaminerVoice(
        currentStep.questionText,
        config.mode === 'exam' ? 'neutral_examiner' : coachState === 'angry_fire' || coachState === 'teasing' || coachState === 'calming_down' ? coachState : 'speaking'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  // If Part 2 prep timer finishes in hands-free mode while idle, start recording automatically
  useEffect(() => {
    if (
      currentStep?.part === 2 &&
      prepSecondsLeft === 0 &&
      config.mode !== 'exam' &&
      autoHandsFree &&
      !isRecording &&
      !isSpeaking &&
      !isTtsLoading &&
      !useTextFallback &&
      !processingTurn &&
      !evaluatingSession
    ) {
      void startRecordingRef.current();
    }
  }, [
    prepSecondsLeft,
    currentStep?.part,
    config.mode,
    autoHandsFree,
    isRecording,
    isSpeaking,
    isTtsLoading,
    useTextFallback,
    processingTurn,
    evaluatingSession,
  ]);

  const triggerSilenceNudge = () => {
    skipSubmitOnStopRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      cleanupRecorderResources();
      setIsRecording(false);
      setWaveformLevel(0);
    }

    const nudgeCount = nudgeCountThisStepRef.current + 1;
    nudgeCountThisStepRef.current = nudgeCount;
    const nudgeText =
      nudgeCount >= 2
        ? 'Still quiet! Come on, give me at least two quick sentences — tell me your honest opinion right now!'
        : 'Go ahead, try starting with one simple idea or example!';

    setRepeatNotice('Тренер подталкивает к ответу — микрофон включится автоматически после подсказки.');
    void handlePlayExaminerVoice(nudgeText, nudgeCount >= 2 ? 'teasing' : 'encouraging');
  };

  const startRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') return;
    stopCoachSpeech();
    setErrorMsg(null);
    setRepeatNotice(null);
    skipSubmitOnStopRef.current = false;
    hasSpokenThisTurnRef.current = false;
    speechAccumMsRef.current = 0;
    const now = Date.now();
    recordStartMsRef.current = now;
    lastFrameMsRef.current = now;
    lastVoiceActiveMsRef.current = now;
    if (prepSecondsLeft > 0) setPrepSecondsLeft(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const mimeCandidate = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      const recorder = mimeCandidate
        ? new MediaRecorder(stream, { mimeType: mimeCandidate })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) audioChunksRef.current.push(evt.data);
      };
      recorder.onstop = () => {
        const shouldSkip = skipSubmitOnStopRef.current;
        skipSubmitOnStopRef.current = false;
        const finalMime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalMime });
        const dur = Math.max(1, Math.round((Date.now() - recordStartMsRef.current) / 1000));
        cleanupRecorderResources();
        setIsRecording(false);
        setWaveformLevel(0);
        if (!shouldSkip) {
          submitTurnAudio(blob, finalMime, dur);
        }
      };

      // Live audio analyser + optional hands-free VAD / silence nudge
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      src.connect(analyser);
      const buf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      const draw = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
        const level = Math.min(100, Math.round((avg / 85) * 100));
        setWaveformLevel(level);

        const frameNow = Date.now();
        const dt = Math.min(200, Math.max(0, frameNow - lastFrameMsRef.current));
        lastFrameMsRef.current = frameNow;

        if (autoHandsFreeRef.current && config.mode !== 'exam') {
          if (level > 14) {
            lastVoiceActiveMsRef.current = frameNow;
            speechAccumMsRef.current += dt;
            if (speechAccumMsRef.current >= 600) {
              hasSpokenThisTurnRef.current = true;
            }
          } else {
            if (!hasSpokenThisTurnRef.current) {
              const silentElapsed = frameNow - recordStartMsRef.current;
              if (silentElapsed >= 6500 && nudgeCountThisStepRef.current < 2) {
                triggerSilenceNudge();
                return;
              }
            } else {
              const pauseAfterSpeech = frameNow - lastVoiceActiveMsRef.current;
              if (pauseAfterSpeech >= 2300) {
                stopRecording();
                return;
              }
            }
          }
        }

        analyserRafRef.current = requestAnimationFrame(draw);
      };
      draw();

      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setCoachState('listening');
    } catch {
      setErrorMsg(
        'Микрофон недоступен. Разрешите доступ в браузере или используйте текстовый ввод (в Practice/Coaching режиме).'
      );
      setCoachState(config.mode === 'exam' ? 'neutral_examiner' : 'idle');
    }
  };
  startRecordingRef.current = startRecording;

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const submitTurnAudio = async (blob: Blob | null, mimeType: string, dur: number, typedText?: string) => {
    if (!currentStep) return;
    setProcessingTurn(true);
    setCoachState('thinking');
    beginProcessing('Анализ устного ответа', 35);

    try {
      let audioBase64: string | undefined;
      let audioDataUrl: string | undefined;
      if (blob) {
        audioBase64 = await blobToBase64(blob);
        audioDataUrl = `data:${mimeType};base64,${audioBase64}`;
      }

      const res = await fetch('/api/speaking/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicTitle: currentStep.topicTitle,
          part: currentStep.part,
          questionText: currentStep.questionText,
          mode: config.mode,
          persona: userProfile.coachPersona,
          durationSec: dur,
          history: turns.map((t) => ({ question: t.questionText, transcript: t.transcript })),
          audioBase64,
          mimeType: blob ? mimeType : undefined,
          typedFallbackText: typedText,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось проанализировать ответ.');

      if (data.clarityOk === false) {
        setRepeatNotice(
          data.repeatPrompt ||
            'Речь была плохо слышна. Пожалуйста, повторите ответ чуть громче и ближе к микрофону.'
        );
        setCoachState(config.mode === 'exam' ? 'neutral_examiner' : 'encouraging');
        return;
      }

      const newTurn: SpeakingTurnRecord = {
        id: `turn-${Date.now()}`,
        part: currentStep.part,
        questionText: currentStep.questionText,
        audioDataUrl: userProfile.storeAudioRecordings ? audioDataUrl : undefined,
        durationSec: dur,
        transcript: data.transcript,
        uncertainWords: data.uncertainWords || [],
        fluencySignals: data.fluencySignals,
        annotations: data.annotations || [],
        examinerNote: data.coachTip,
      };

      const nextTurns = [...turns, newTurn];
      setTurns(nextTurns);
      setTypedAnswer('');
      setCoachTip(data.coachTip || null);

      if (config.mode !== 'exam') {
        const hasErrors = Array.isArray(data.annotations)
          ? data.annotations.some((a: { severity?: string }) => a.severity === 'error')
          : false;
        const prevStreak = mistakeStreak;
        const nextStreak = hasErrors ? prevStreak + 1 : 0;
        setMistakeStreak(nextStreak);
        if (hasErrors) {
          setCoachState(nextStreak >= 2 ? 'angry_fire' : 'teasing');
        } else if (prevStreak >= 1) {
          setCoachState('calming_down');
        } else {
          setCoachState('encouraging');
        }
      } else {
        setCoachState('neutral_examiner');
      }

      if (stepIdx < steps.length - 1) {
        setStepIdx((i) => i + 1);
      } else {
        await finalizeSession(nextTurns);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка анализа ответа.');
      setCoachState(config.mode === 'exam' ? 'neutral_examiner' : 'idle');
    } finally {
      setProcessingTurn(false);
      endProcessing();
    }
  };

  const finalizeSession = async (finalTurns: SpeakingTurnRecord[]) => {
    if (finalTurns.length === 0) {
      setErrorMsg('Запишите хотя бы один ответ перед завершением.');
      return;
    }
    setEvaluatingSession(true);
    setCoachState('thinking');
    beginProcessing('Итоговая диагностика Speaking', 70);
    try {
      const res = await fetch('/api/speaking/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: config.topics[0]?.id,
          mockTestId: config.mockTest?.id,
          title: config.title,
          part: config.isFullMock ? undefined : config.part,
          isFullMock: config.isFullMock,
          mode: config.mode,
          persona: userProfile.coachPersona,
          durationSec: sessionElapsedSec,
          turns: finalTurns,
          focusEvents,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось сформировать итоговый отчёт.');

      releaseScreenLock(true);
      onCompleted(data.session, data.userProfile);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка итоговой оценки.');
    } finally {
      setEvaluatingSession(false);
      endProcessing();
    }
  };

  if (!currentStep) return null;

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex flex-col">
      {/* Top Studio Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="max-w-[1160px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                cleanupRecorderResources();
                stopCoachSpeech();
                releaseScreenLock(true);
                onExit();
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Выйти
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <div>
              <p className="text-sm font-bold text-slate-900">{config.title}</p>
              <p className="text-xs text-slate-500">
                Part {currentStep.part} · Вопрос {stepIdx + 1} из {steps.length} ·{' '}
                {config.mode === 'exam' ? 'Exam Mode (Нейтральный экзаменатор)' : config.mode}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <AIStatusIndicator compact />
            {!strictFocusEnabled ? (
              <button
                type="button"
                onClick={engageStrictFocus}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Screen Lock
              </button>
            ) : (
              <span
                title={`Fullscreen: ${lockStatus.fullscreenActive ? 'ON' : 'OFF'} · Wake Lock: ${lockStatus.wakeLockActive ? 'ON' : 'OFF'} · Keyboard Lock: ${lockStatus.keyboardLocked ? 'ON' : 'Fallback'}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Screen Lock активен
              </span>
            )}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono tabular-nums text-slate-700">
              <Clock className="w-3.5 h-3.5" />
              {formatTimer(sessionElapsedSec)}
            </div>
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => finalizeSession(turns)}
                disabled={evaluatingSession || processingTurn}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
              >
                Завершить и оценить
              </button>
            )}
          </div>
        </div>
      </div>

      <FocusLockOverlay
        visible={strictFocusEnabled && isFocusLocked}
        reason={focusLockReason}
        violationCount={focusEvents.length}
        sessionTitle={config.title}
        onUnlockAndReenterFullscreen={engageStrictFocus}
        onEmergencyExit={() => {
          cleanupRecorderResources();
          stopCoachSpeech();
          releaseScreenLock(true);
          onExit();
        }}
      />

      {strictFocusEnabled && focusEvents.length > 0 && !isFocusLocked && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2">
          <div className="max-w-[1160px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
            <span className="inline-flex items-center gap-2 font-medium">
              <Lock className="w-3.5 h-3.5 text-amber-700" />
              Screen Lock активен · Зафиксировано выходов из окна: {focusEvents.length}
            </span>
          </div>
        </div>
      )}

      {/* Main Studio Body */}
      <div className="flex-1 max-w-[960px] w-full mx-auto px-6 py-8 space-y-6">
        {/* Coach / Examiner Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-xs">
          <div className="flex flex-col items-center gap-3">
            <CoachMascot
              state={coachState}
              persona={config.mode === 'exam' ? 'classic' : userProfile.coachPersona}
              size="md"
              reducedMotion={userProfile.reducedMotion}
              speaking={isSpeaking}
              speechLevel={speechLevel}
            />

            {config.mode !== 'exam' && (
              <span className="text-[11px] font-semibold text-slate-500">
                {coachState === 'angry_fire'
                  ? `Повторная ошибка (${mistakeStreak} подряд) — обратите внимание на подсказку`
                  : coachState === 'teasing'
                  ? 'Замечена ошибка — разберёмся внимательнее'
                  : coachState === 'calming_down'
                  ? 'Отлично исправились — чистый ответ!'
                  : isSpeaking
                  ? 'Озвучивает вопрос в реальном времени'
                  : isRecording
                  ? 'Слушает ваш ответ…'
                  : 'Готов к ответу'}
              </span>
            )}

            {isSubtitleVisible && liveSubtitle && (
              <div
                className="max-w-xl w-full px-4 py-2.5 rounded-xl bg-slate-950/90 text-white text-xs sm:text-sm font-medium shadow-md transition-opacity duration-300"
                aria-live="polite"
              >
                {liveSubtitle}
              </div>
            )}
          </div>

          <div className="space-y-2 max-w-2xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Speaking Part {currentStep.part} · {currentStep.topicTitle}
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
              {currentStep.questionText}
            </h2>
          </div>

          {/* Cue Card Bullets for Part 2 */}
          {currentStep.part === 2 && currentStep.cueCard && (
            <div className="max-w-lg mx-auto text-left p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Cue Card — You should say:</span>
                {prepSecondsLeft > 0 ? (
                  <span className="text-xs font-mono font-bold text-amber-700">
                    Подготовка: {formatTimer(prepSecondsLeft)}
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-emerald-700">Время ответа (до 2 мин)</span>
                )}
              </div>
              <ul className="list-disc pl-5 text-sm text-slate-800 space-y-1">
                {currentStep.cueCard.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              <textarea
                rows={2}
                value={part2Notes}
                onChange={(e) => setPart2Notes(e.target.value)}
                placeholder="Черновик тезисов для 1-минутной подготовки (не оценивается ИИ)…"
                className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none"
              />
            </div>
          )}

          {/* Audio Play Question Button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => handlePlayExaminerVoice(currentStep.questionText)}
              disabled={isTtsLoading || isRecording}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-50 cursor-pointer"
            >
              {isTtsLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-blue-700" />
              )}
              {config.mode === 'exam' ? 'Повторить вопрос экзаменатора' : 'Прослушать вопрос'}
            </button>
          </div>
        </div>

        {/* Notices & Errors */}
        {repeatNotice && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
            {repeatNotice}
          </div>
        )}
        {coachTip && config.mode === 'coaching' && (
          <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 text-xs text-purple-950">
            <span className="font-bold">Заметка AI Coach по предыдущему ответу: </span>
            {coachTip}
          </div>
        )}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        {/* Microphone / Recording Control Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          {evaluatingSession ? (
            <div className="py-8 flex flex-col items-center gap-3 text-slate-700">
              <Loader2 className="w-7 h-7 animate-spin text-[#FF4B3A]" />
              <p className="text-sm font-semibold">
                Формируем итоговый диагностический отчёт по 4 критериям IELTS Speaking…
              </p>
            </div>
          ) : processingTurn ? (
            <div className="py-6 flex flex-col items-center gap-3 text-slate-700">
              <Loader2 className="w-6 h-6 animate-spin text-blue-700" />
              <p className="text-sm font-medium">
                Расшифровываем аудиозапись, анализируем произношение, паузы и лексику…
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {!useTextFallback ? (
                <>
                  {isRecording ? (
                    <div className="w-full max-w-md space-y-3 text-center">
                      <div className="flex items-center justify-center gap-2 text-sm font-mono font-bold text-[#FF4B3A]">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FF4B3A] animate-pulse" />
                        Запись: {formatTimer(recordSeconds)}
                        {currentStep.part === 2 && ' / 02:00'}
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#FF4B3A] transition-all duration-75"
                          style={{ width: `${Math.max(10, waveformLevel)}%` }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-slate-900 rounded-2xl hover:bg-slate-800 cursor-pointer"
                      >
                        <Square className="w-4 h-4 fill-current" />
                        Остановить и отправить ответ
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="inline-flex items-center gap-2.5 px-7 py-3.5 text-sm font-bold text-white bg-[#FF4B3A] rounded-2xl hover:bg-[#e84232] shadow-sm cursor-pointer"
                    >
                      <Mic className="w-4 h-4" />
                      {prepSecondsLeft > 0
                        ? 'Начать монолог досрочно'
                        : 'Записать голосовой ответ'}
                    </button>
                  )}
                </>
              ) : (
                <div className="w-full space-y-3">
                  <textarea
                    rows={3}
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    placeholder="Текстовый режим доступности (Practice / Coaching): введите ваш ответ на английском…"
                    className="w-full p-3.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        submitTurnAudio(null, 'text/plain', 20, typedAnswer.trim())
                      }
                      disabled={!typedAnswer.trim()}
                      className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 disabled:opacity-40 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Отправить ответ
                    </button>
                  </div>
                </div>
              )}

              {config.mode !== 'exam' && (
                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  {!isRecording && (
                    <button
                      type="button"
                      onClick={() => setUseTextFallback((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      <Keyboard className="w-3.5 h-3.5" />
                      {useTextFallback
                        ? 'Вернуться к записи голосом'
                        : 'Нет микрофона? Ввести ответ текстом (Accessibility)'}
                    </button>
                  )}

                  {!useTextFallback && (
                    <button
                      type="button"
                      onClick={() => setAutoHandsFree((v) => !v)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                        autoHandsFree
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5" />
                      {autoHandsFree
                        ? 'Авто-ответ (Hands-free) включён'
                        : 'Авто-ответ выключен'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recorded Turns History */}
        {turns.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-500">
              Записано ответов в этой сессии: {turns.length}
            </p>
            <div className="space-y-2">
              {turns.map((t, i) => (
                <div
                  key={t.id}
                  className="flex items-start gap-2.5 text-xs p-3 rounded-xl bg-slate-50 border border-slate-100"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">
                      Part {t.part} · Ответ {i + 1} ({t.durationSec} сек)
                    </p>
                    <p className="text-slate-600 mt-0.5 line-clamp-2">{t.transcript}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
