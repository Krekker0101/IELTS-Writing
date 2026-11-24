import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachPersona, CoachVisualState, CoachVoiceName } from '../types/ielts';

export interface LiveTranscriptTurn {
  id: string;
  role: 'coach' | 'user';
  text: string;
  gentleFix?: { original: string; better: string; reasonRu: string };
}

interface StartLiveOptions {
  topic: string;
  persona: CoachPersona;
  voiceName: CoachVoiceName;
  onProfileXp?: (xp: number, streakDays: number) => void;
}

const CAPTION_MAX_WORDS = 18;

function formatCaptionWindow(fullText: string): string {
  const words = fullText.trim().split(/\s+/).filter(Boolean);
  if (words.length <= CAPTION_MAX_WORDS) return words.join(' ');
  return '… ' + words.slice(-CAPTION_MAX_WORDS).join(' ');
}

function float32ToPcm16Base64(floatData: Float32Array): string {
  const buffer = new ArrayBuffer(floatData.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < floatData.length; i++) {
    const s = Math.max(-1, Math.min(1, floatData[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function pcm24kBase64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(len / 2);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

export function useLiveCoachSession() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [isMicActive, setIsMicActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAiTurnPending, setIsAiTurnPending] = useState(false);
  const [speechLevel, setSpeechLevel] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [coachEmotion, setCoachEmotion] = useState<CoachVisualState>('idle');
  const [mistakeStreak, setMistakeStreak] = useState(0);
  const [liveSubtitle, setLiveSubtitle] = useState('');
  const [isSubtitleVisible, setIsSubtitleVisible] = useState(false);
  const [latestGentleFix, setLatestGentleFix] = useState<LiveTranscriptTurn['gentleFix'] | null>(null);
  const [history, setHistory] = useState<LiveTranscriptTurn[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nudgeActiveNotice, setNudgeActiveNotice] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

  const isMutedRef = useRef(false);
  const isAiSpeakingRef = useRef(false);
  const isAiTurnInFlightRef = useRef(false);
  const statusRef = useRef(status);
  statusRef.current = status;

  const noiseFloorRmsRef = useRef<number>(0.01);
  const preRollFramesRef = useRef<string[]>([]);
  const consecutiveSpeechFramesRef = useRef<number>(0);
  const speechGateOpenRef = useRef<boolean>(false);
  const hangoverFramesLeftRef = useRef<number>(0);
  const queuedUserSpeechWhileAiRef = useRef<string[]>([]);

  // Browser SpeechRecognition word gate (optional enhancer; falls back safely if unavailable)
  const speechRecRef = useRef<{ stop?: () => void } | null>(null);
  const speechRecHealthyRef = useRef<boolean>(false);
  const lastRecognizedWordAtRef = useRef<number>(0);

  const lastUserActivityAtRef = useRef<number>(Date.now());
  const aiFinishedAtRef = useRef<number>(Date.now());
  const silenceNudgesRef = useRef<number>(0);
  const aiTranscriptAccRef = useRef<string>('');
  const subtitleClearTimerRef = useRef<number | null>(null);
  const silenceWatchdogRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const onProfileXpRef = useRef<((xp: number, streakDays: number) => void) | undefined>(undefined);

  // Merged jitter-buffer playback state (eliminates mid-sentence pauses on weak internet)
  const pendingTurnPcmRef = useRef<Float32Array[]>([]);
  const pendingTurnSamplesRef = useRef<number>(0);
  const turnFirstAudioAtRef = useRef<number>(0);
  const turnPlaybackStartedRef = useRef<boolean>(false);
  const pendingFlushTimerRef = useRef<number | null>(null);
  const lastSpeechUiAtRef = useRef<number>(0);
  const lastSpeechUiValRef = useRef<number>(0);
  const lastMicUiAtRef = useRef<number>(0);
  const lastMicUiValRef = useRef<number>(0);

  const flushQueuedSpeechToWs = useCallback(() => {
    const ws = wsRef.current;
    const queued = queuedUserSpeechWhileAiRef.current;
    queuedUserSpeechWhileAiRef.current = [];
    if (!ws || ws.readyState !== WebSocket.OPEN || queued.length === 0) {
      return;
    }
    const wordWasHeard =
      !speechRecHealthyRef.current || Date.now() - lastRecognizedWordAtRef.current < 4500;
    if (!wordWasHeard) {
      // Only background noise or speaker echo occurred during AI playback — discard completely!
      return;
    }
    for (const chunk of queued) {
      ws.send(JSON.stringify({ type: 'audio', data: chunk }));
    }
    speechGateOpenRef.current = true;
    hangoverFramesLeftRef.current = 12;
    lastUserActivityAtRef.current = Date.now();
  }, []);

  const stopQueuedAudio = useCallback(() => {
    if (pendingFlushTimerRef.current !== null) {
      window.clearTimeout(pendingFlushTimerRef.current);
      pendingFlushTimerRef.current = null;
    }
    pendingTurnPcmRef.current = [];
    pendingTurnSamplesRef.current = 0;
    turnPlaybackStartedRef.current = false;

    for (const src of activeSourcesRef.current) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        // ignore
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    isAiSpeakingRef.current = false;
    setIsSpeaking(false);
    setSpeechLevel(0);
    aiFinishedAtRef.current = Date.now();
  }, []);

  const stopSession = useCallback(() => {
    if (silenceWatchdogRef.current !== null) {
      window.clearInterval(silenceWatchdogRef.current);
      silenceWatchdogRef.current = null;
    }
    if (subtitleClearTimerRef.current !== null) {
      window.clearTimeout(subtitleClearTimerRef.current);
      subtitleClearTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    stopQueuedAudio();

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    analyserRef.current = null;
    freqBufRef.current = null;

    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop?.();
      } catch {
        // ignore
      }
      speechRecRef.current = null;
    }
    speechRecHealthyRef.current = false;
    lastRecognizedWordAtRef.current = 0;

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    isAiTurnInFlightRef.current = false;
    setIsAiTurnPending(false);
    preRollFramesRef.current = [];
    consecutiveSpeechFramesRef.current = 0;
    speechGateOpenRef.current = false;
    hangoverFramesLeftRef.current = 0;
    queuedUserSpeechWhileAiRef.current = [];

    setStatus('idle');
    setIsMicActive(false);
    setIsSpeaking(false);
    setSpeechLevel(0);
    setMicLevel(0);
    setCoachEmotion('idle');
    setIsSubtitleVisible(false);
    setLiveSubtitle('');
    setNudgeActiveNotice(false);
  }, [stopQueuedAudio]);

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, [stopSession]);

  const scheduleSubtitleAutoClear = useCallback(() => {
    if (subtitleClearTimerRef.current !== null) {
      window.clearTimeout(subtitleClearTimerRef.current);
    }
    subtitleClearTimerRef.current = window.setTimeout(() => {
      if (!isAiSpeakingRef.current) {
        setIsSubtitleVisible(false);
        setLiveSubtitle('');
      }
    }, 1800);
  }, []);

  const flushPendingPcmToAudioContext = useCallback(() => {
    if (pendingFlushTimerRef.current !== null) {
      window.clearTimeout(pendingFlushTimerRef.current);
      pendingFlushTimerRef.current = null;
    }
    const outCtx = outputCtxRef.current;
    const analyser = analyserRef.current;
    const chunks = pendingTurnPcmRef.current;
    const totalSamples = pendingTurnSamplesRef.current;
    if (!outCtx || !analyser || chunks.length === 0 || totalSamples < 24) {
      pendingTurnPcmRef.current = [];
      pendingTurnSamplesRef.current = 0;
      return;
    }

    if (outCtx.state === 'suspended') {
      outCtx.resume().catch(() => {});
    }

    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    pendingTurnPcmRef.current = [];
    pendingTurnSamplesRef.current = 0;

    const buffer = outCtx.createBuffer(1, merged.length, 24000);
    buffer.getChannelData(0).set(merged);

    const source = outCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);

    const now = outCtx.currentTime;
    const startAt =
      nextStartTimeRef.current <= now + 0.02
        ? now + 0.14
        : nextStartTimeRef.current;
    nextStartTimeRef.current = startAt + buffer.duration;

    turnPlaybackStartedRef.current = true;
    activeSourcesRef.current.add(source);
    isAiSpeakingRef.current = true;
    setIsSpeaking(true);
    setNudgeActiveNotice(false);

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        if (pendingTurnSamplesRef.current > 0) {
          flushPendingPcmToAudioContext();
          return;
        }
        isAiSpeakingRef.current = false;
        setIsSpeaking(false);
        lastSpeechUiValRef.current = 0;
        setSpeechLevel(0);
        aiFinishedAtRef.current = Date.now();
        lastUserActivityAtRef.current = Date.now();
        consecutiveSpeechFramesRef.current = 0;
        if (!isAiTurnInFlightRef.current) {
          turnPlaybackStartedRef.current = false;
          flushQueuedSpeechToWs();
          scheduleSubtitleAutoClear();
        }
      }
    };

    source.start(startAt);
  }, [flushQueuedSpeechToWs, scheduleSubtitleAutoClear]);

  const play24kPcmChunk = useCallback(
    (base64Pcm: string) => {
      const outCtx = outputCtxRef.current;
      if (!outCtx) return;

      const floatSamples = pcm24kBase64ToFloat32(base64Pcm);
      if (floatSamples.length < 24) return;

      if (!turnPlaybackStartedRef.current && pendingTurnSamplesRef.current === 0) {
        turnFirstAudioAtRef.current = Date.now();
      }
      pendingTurnPcmRef.current.push(floatSamples);
      pendingTurnSamplesRef.current += floatSamples.length;

      const bufferedSamples = pendingTurnSamplesRef.current;

      if (!turnPlaybackStartedRef.current) {
        // Pre-buffer at least 1.5s (36,000 samples at 24kHz) before starting turn playback
        // so weak/jittery connections NEVER pause mid-sentence!
        const elapsedSinceFirst = Date.now() - turnFirstAudioAtRef.current;
        if (
          bufferedSamples >= 36000 ||
          !isAiTurnInFlightRef.current ||
          (elapsedSinceFirst >= 950 && bufferedSamples >= 12000)
        ) {
          flushPendingPcmToAudioContext();
        } else if (pendingFlushTimerRef.current === null) {
          pendingFlushTimerRef.current = window.setTimeout(() => {
            pendingFlushTimerRef.current = null;
            flushPendingPcmToAudioContext();
          }, 950);
        }
        return;
      }

      // Playback already active: coalesce into ~1.0s blocks unless runway < 0.85s or turn completed
      const runwaySec = nextStartTimeRef.current - outCtx.currentTime;
      if (
        bufferedSamples >= 24000 ||
        runwaySec < 0.85 ||
        !isAiTurnInFlightRef.current
      ) {
        flushPendingPcmToAudioContext();
      } else if (pendingFlushTimerRef.current === null) {
        pendingFlushTimerRef.current = window.setTimeout(() => {
          pendingFlushTimerRef.current = null;
          flushPendingPcmToAudioContext();
        }, 420);
      }
    },
    [flushPendingPcmToAudioContext]
  );

  const startSession = useCallback(
    async (opts: StartLiveOptions) => {
      stopSession();
      setErrorMsg(null);
      setStatus('connecting');
      setCoachEmotion('thinking');
      setMistakeStreak(0);
      setLatestGentleFix(null);
      setHistory([]);
      silenceNudgesRef.current = 0;
      aiTranscriptAccRef.current = '';
      isAiTurnInFlightRef.current = true;
      setIsAiTurnPending(true);
      noiseFloorRmsRef.current = 0.01;
      preRollFramesRef.current = [];
      consecutiveSpeechFramesRef.current = 0;
      speechGateOpenRef.current = false;
      hangoverFramesLeftRef.current = 0;
      queuedUserSpeechWhileAiRef.current = [];
      lastRecognizedWordAtRef.current = 0;
      speechRecHealthyRef.current = false;
      onProfileXpRef.current = opts.onProfileXp;

      try {
        const AudioContextCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

        // Dedicated 24kHz AudioContext for Gemini Live audio output
        const outCtx = new AudioContextCtor({ sampleRate: 24000 });
        if (outCtx.state === 'suspended') {
          await outCtx.resume().catch(() => {});
        }
        const analyser = outCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.65;
        analyser.connect(outCtx.destination);
        outputCtxRef.current = outCtx;
        analyserRef.current = analyser;
        freqBufRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        nextStartTimeRef.current = outCtx.currentTime;

        // Throttled visual vocal meter (~18fps) to keep main thread light for audio
        const drawOutputMeter = () => {
          const nowTs = performance.now();
          if (nowTs - lastSpeechUiAtRef.current >= 55) {
            lastSpeechUiAtRef.current = nowTs;
            const an = analyserRef.current;
            const buf = freqBufRef.current;
            let nextLevel = 0;
            if (an && buf && isAiSpeakingRef.current) {
              an.getByteFrequencyData(buf);
              let sum = 0;
              const bins = Math.min(28, buf.length);
              for (let i = 1; i < bins; i++) sum += buf[i];
              const avg = sum / Math.max(1, bins - 1);
              nextLevel = Math.min(100, Math.round((avg / 85) * 100));
            }
            if (Math.abs(nextLevel - lastSpeechUiValRef.current) >= 2 || nextLevel === 0) {
              if (lastSpeechUiValRef.current !== nextLevel) {
                lastSpeechUiValRef.current = nextLevel;
                setSpeechLevel(nextLevel);
              }
            }
          }
          rafRef.current = requestAnimationFrame(drawOutputMeter);
        };
        rafRef.current = requestAnimationFrame(drawOutputMeter);

        // Try capturing continuous 16kHz mic input (echo cancellation enabled)
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          micStreamRef.current = stream;
          const inCtx = new AudioContextCtor({ sampleRate: 16000 });
          if (inCtx.state === 'suspended') {
            await inCtx.resume().catch(() => {});
          }
          inputCtxRef.current = inCtx;
          const source = inCtx.createMediaStreamSource(stream);
          const processor = inCtx.createScriptProcessor(2048, 1, 1);
          processorRef.current = processor;

          // Keep processor graph alive silently
          const zeroGain = inCtx.createGain();
          zeroGain.gain.value = 0;
          source.connect(processor);
          processor.connect(zeroGain);
          zeroGain.connect(inCtx.destination);

          processor.onaudioprocess = (e) => {
            if (isMutedRef.current) {
              setMicLevel(0);
              preRollFramesRef.current = [];
              consecutiveSpeechFramesRef.current = 0;
              speechGateOpenRef.current = false;
              hangoverFramesLeftRef.current = 0;
              queuedUserSpeechWhileAiRef.current = [];
              return;
            }
            const channel = e.inputBuffer.getChannelData(0);
            let sqSum = 0;
            for (let i = 0; i < channel.length; i++) {
              sqSum += channel[i] * channel[i];
            }
            const rms = Math.sqrt(sqSum / channel.length);
            const nowMs = Date.now();
            if (nowMs - lastMicUiAtRef.current >= 100) {
              lastMicUiAtRef.current = nowMs;
              const nextMic = Math.min(100, Math.round(rms * 420));
              if (Math.abs(nextMic - lastMicUiValRef.current) >= 3 || (nextMic === 0 && lastMicUiValRef.current !== 0)) {
                lastMicUiValRef.current = nextMic;
                setMicLevel(nextMic);
              }
            }

            const pcmBase64 = float32ToPcm16Base64(channel);
            const ws = wsRef.current;

            // Keep 20-frame (~2.56s) rolling pre-roll so word beginnings are preserved cleanly
            const preRoll = preRollFramesRef.current;
            preRoll.push(pcmBase64);
            if (preRoll.length > 20) preRoll.shift();

            const inEchoCooldown = nowMs - aiFinishedAtRef.current < 350;
            const aiCurrentlyTalking =
              isAiSpeakingRef.current || isAiTurnInFlightRef.current || inEchoCooldown;

            const wordHeardRecently = nowMs - lastRecognizedWordAtRef.current < 1800;

            if (aiCurrentlyTalking) {
              // While AI speaks (+ 350ms echo cooldown): NEVER stream audio to Gemini Live so AI finishes cleanly!
              // Only locally buffer if user is clearly speaking real sustained words above strict echo+noise floor.
              const strictThreshold = Math.max(0.06, noiseFloorRmsRef.current * 3.8);
              if (rms > strictThreshold || (wordHeardRecently && rms > 0.024)) {
                consecutiveSpeechFramesRef.current += 1;
                if (consecutiveSpeechFramesRef.current >= 4 || wordHeardRecently) {
                  if (queuedUserSpeechWhileAiRef.current.length === 0) {
                    queuedUserSpeechWhileAiRef.current.push(...preRoll);
                  } else if (queuedUserSpeechWhileAiRef.current.length < 48) {
                    queuedUserSpeechWhileAiRef.current.push(pcmBase64);
                  }
                }
              } else if (
                queuedUserSpeechWhileAiRef.current.length > 0 &&
                queuedUserSpeechWhileAiRef.current.length < 48
              ) {
                queuedUserSpeechWhileAiRef.current.push(pcmBase64);
              } else {
                consecutiveSpeechFramesRef.current = 0;
              }
              return;
            }

            // AI is silent and listening: calibrate ambient noise floor when quiet
            const idleSpeechThreshold = Math.max(0.032, noiseFloorRmsRef.current * 3.0);
            if (!speechGateOpenRef.current && rms < 0.08) {
              noiseFloorRmsRef.current = noiseFloorRmsRef.current * 0.96 + rms * 0.04;
            }

            // When browser SpeechRecognition is active & confirmed healthy, require real spoken WORDS
            // so random sounds (clicks, claps, breathing, room noise) NEVER trigger Gemini!
            // If SpeechRecognition is unavailable/errored, fall back to strict >= 512ms sustained voice.
            let shouldOpenGate = false;
            if (speechRecHealthyRef.current) {
              shouldOpenGate = wordHeardRecently && rms > Math.max(0.018, noiseFloorRmsRef.current * 1.8);
            } else if (rms > idleSpeechThreshold) {
              consecutiveSpeechFramesRef.current += 1;
              shouldOpenGate = consecutiveSpeechFramesRef.current >= 4;
            } else {
              consecutiveSpeechFramesRef.current = 0;
            }

            if (shouldOpenGate) {
              if (!speechGateOpenRef.current) {
                speechGateOpenRef.current = true;
                if (ws && ws.readyState === WebSocket.OPEN) {
                  // Flush pre-roll frames prior to current frame so word start is intact
                  for (let i = 0; i < preRoll.length - 1; i++) {
                    ws.send(JSON.stringify({ type: 'audio', data: preRoll[i] }));
                  }
                }
              }
              hangoverFramesLeftRef.current = 14; // ~1.8s tail after speech stops
              lastUserActivityAtRef.current = nowMs;
              setCoachEmotion((curr) =>
                curr === 'angry_fire' || curr === 'teasing' || curr === 'calming_down'
                  ? curr
                  : 'listening'
              );
            }

            if (speechGateOpenRef.current && ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'audio', data: pcmBase64 }));
              if (!shouldOpenGate) {
                hangoverFramesLeftRef.current -= 1;
                if (hangoverFramesLeftRef.current <= 0) {
                  speechGateOpenRef.current = false;
                }
              }
            }
          };

          setIsMicActive(true);

          // Start optional browser SpeechRecognition as a real-word verifier (non-blocking)
          try {
            const win = window as unknown as {
              SpeechRecognition?: new () => {
                continuous: boolean;
                interimResults: boolean;
                lang: string;
                onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
                onerror: ((e: { error?: string }) => void) | null;
                onend: (() => void) | null;
                start: () => void;
                stop: () => void;
              };
              webkitSpeechRecognition?: new () => {
                continuous: boolean;
                interimResults: boolean;
                lang: string;
                onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
                onerror: ((e: { error?: string }) => void) | null;
                onend: (() => void) | null;
                start: () => void;
                stop: () => void;
              };
            };
            const RecCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
            if (RecCtor) {
              const rec = new RecCtor();
              rec.continuous = true;
              rec.interimResults = true;
              rec.lang = 'en-US';
              rec.onresult = (event) => {
                const len = event.results.length;
                if (len === 0) return;
                const latest = event.results[len - 1]?.[0]?.transcript || '';
                if (/[a-zA-Zа-яА-Я]{2,}/.test(latest)) {
                  speechRecHealthyRef.current = true;
                  lastRecognizedWordAtRef.current = Date.now();
                  if (!isAiSpeakingRef.current && !isAiTurnInFlightRef.current) {
                    lastUserActivityAtRef.current = Date.now();
                    silenceNudgesRef.current = 0;
                  }
                }
              };
              rec.onerror = (evt) => {
                const code = evt?.error || '';
                if (
                  code === 'network' ||
                  code === 'not-allowed' ||
                  code === 'service-not-allowed' ||
                  code === 'audio-capture'
                ) {
                  speechRecHealthyRef.current = false;
                  speechRecRef.current = null;
                }
              };
              rec.onend = () => {
                if (speechRecRef.current === rec && statusRef.current === 'connected') {
                  try {
                    rec.start();
                  } catch {
                    speechRecHealthyRef.current = false;
                  }
                }
              };
              rec.start();
              speechRecRef.current = rec;
            }
          } catch {
            speechRecHealthyRef.current = false;
          }
        } catch {
          setIsMicActive(false);
        }

        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const qs = new URLSearchParams({
          topic: opts.topic,
          persona: opts.persona,
          voice: opts.voiceName,
        });
        const ws = new WebSocket(`${wsProto}//${window.location.host}/ws/live-coach?${qs.toString()}`);
        wsRef.current = ws;

        ws.onopen = () => {
          lastUserActivityAtRef.current = Date.now();
          aiFinishedAtRef.current = Date.now();
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data as string) as {
              type: string;
              data?: string;
              text?: string;
              userText?: string;
              aiText?: string;
              emotion?: CoachVisualState;
              mistakeStreak?: number;
              gentleFix?: LiveTranscriptTurn['gentleFix'];
              xp?: number;
              streakDays?: number;
              message?: string;
            };

            if (msg.type === 'ready') {
              setStatus('connected');
              setCoachEmotion('encouraging');
              lastUserActivityAtRef.current = Date.now();
            } else if (msg.type === 'audio' && msg.data) {
              isAiTurnInFlightRef.current = true;
              setIsAiTurnPending(true);
              play24kPcmChunk(msg.data);
            } else if (msg.type === 'interrupted') {
              // Keep playing current sentence cleanly unless queue is already empty
              if (activeSourcesRef.current.size === 0) {
                aiTranscriptAccRef.current = '';
                setIsSubtitleVisible(false);
                setLiveSubtitle('');
              }
            } else if (msg.type === 'ai_transcript_delta' && msg.text) {
              isAiTurnInFlightRef.current = true;
              setIsAiTurnPending(true);
              if (subtitleClearTimerRef.current !== null) {
                window.clearTimeout(subtitleClearTimerRef.current);
                subtitleClearTimerRef.current = null;
              }
              aiTranscriptAccRef.current += msg.text;
              setLiveSubtitle(formatCaptionWindow(aiTranscriptAccRef.current));
              setIsSubtitleVisible(true);
            } else if (msg.type === 'user_transcript_delta' && msg.text) {
              if (/[a-zA-Zа-яА-Я0-9]{2,}/.test(msg.text)) {
                lastUserActivityAtRef.current = Date.now();
                silenceNudgesRef.current = 0;
              }
            } else if (msg.type === 'turn_complete') {
              isAiTurnInFlightRef.current = false;
              setIsAiTurnPending(false);
              flushPendingPcmToAudioContext();
              const uText = (msg.userText || '').trim();
              const aText = (msg.aiText || aiTranscriptAccRef.current || '').trim();
              aiTranscriptAccRef.current = '';
              aiFinishedAtRef.current = Date.now();
              lastUserActivityAtRef.current = Date.now();

              if (uText || aText) {
                setHistory((prev) => [
                  ...prev,
                  ...(uText ? [{ id: `u-${Date.now()}`, role: 'user' as const, text: uText }] : []),
                  ...(aText ? [{ id: `c-${Date.now() + 1}`, role: 'coach' as const, text: aText }] : []),
                ]);
              }
              if (!isAiSpeakingRef.current && pendingTurnSamplesRef.current === 0) {
                turnPlaybackStartedRef.current = false;
                flushQueuedSpeechToWs();
                scheduleSubtitleAutoClear();
              }
            } else if (msg.type === 'coach_reaction' && msg.emotion) {
              setCoachEmotion(msg.emotion);
              if (typeof msg.mistakeStreak === 'number') {
                setMistakeStreak(msg.mistakeStreak);
              }
              if (msg.gentleFix) {
                setLatestGentleFix(msg.gentleFix);
                setHistory((prev) => {
                  const copy = [...prev];
                  for (let i = copy.length - 1; i >= 0; i--) {
                    if (copy[i].role === 'coach') {
                      copy[i] = { ...copy[i], gentleFix: msg.gentleFix };
                      break;
                    }
                  }
                  return copy;
                });
              } else if (msg.emotion === 'calming_down') {
                setLatestGentleFix(null);
              }
            } else if (msg.type === 'profile_xp' && typeof msg.xp === 'number') {
              onProfileXpRef.current?.(msg.xp, msg.streakDays ?? 1);
            } else if (msg.type === 'error') {
              isAiTurnInFlightRef.current = false;
              setIsAiTurnPending(false);
              setErrorMsg(msg.message || 'Ошибка потоковой связи с AI Coach.');
              setStatus('error');
              setCoachEmotion('reconnecting');
            } else if (msg.type === 'closed') {
              isAiTurnInFlightRef.current = false;
              setIsAiTurnPending(false);
              if (statusRef.current === 'connected') {
                setStatus('idle');
                setCoachEmotion('idle');
              }
            }
          } catch {
            // ignore bad frames
          }
        };

        ws.onerror = () => {
          setErrorMsg('Не удалось установить реальновременный аудиоканал с AI Coach.');
          setStatus('error');
          setCoachEmotion('reconnecting');
        };

        ws.onclose = () => {
          if (statusRef.current === 'connecting') {
            setErrorMsg('Соединение Live-диалога закрылось. Попробуйте подключиться снова.');
            setStatus('error');
          }
        };

        // Proactive silence watchdog: if user says zero words for 7.5s after AI stops speaking, AI speaks up!
        silenceWatchdogRef.current = window.setInterval(() => {
          const currentWs = wsRef.current;
          if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
          if (statusRef.current !== 'connected') return;
          if (isAiSpeakingRef.current || isAiTurnInFlightRef.current) return;

          const now = Date.now();
          const sinceAiStopped = now - aiFinishedAtRef.current;
          const sinceUserSpoke = now - lastUserActivityAtRef.current;
          const waitThresholdMs = silenceNudgesRef.current >= 1 ? 10500 : 7500;

          if (sinceAiStopped >= 2000 && sinceUserSpoke >= waitThresholdMs) {
            silenceNudgesRef.current += 1;
            lastUserActivityAtRef.current = now;
            isAiTurnInFlightRef.current = true;
            setIsAiTurnPending(true);
            setNudgeActiveNotice(true);
            currentWs.send(
              JSON.stringify({
                type: 'silence_nudge',
                silentCount: silenceNudgesRef.current,
              })
            );
          }
        }, 450);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Не удалось запустить живой голосовой диалог.'
        );
        setStatus('error');
      }
    },
    [flushPendingPcmToAudioContext, flushQueuedSpeechToWs, play24kPcmChunk, scheduleSubtitleAutoClear, stopSession]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      isMutedRef.current = next;
      return next;
    });
  }, []);

  const sendTextTurn = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      lastUserActivityAtRef.current = Date.now();
      silenceNudgesRef.current = 0;
      ws.send(JSON.stringify({ type: 'text', text: clean }));
    }
  }, []);

  const changeTopic = useCallback((newTopic: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'update_topic', topic: newTopic }));
    }
  }, []);

  const triggerManualNudge = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && !isAiSpeakingRef.current) {
      silenceNudgesRef.current += 1;
      lastUserActivityAtRef.current = Date.now();
      setNudgeActiveNotice(true);
      ws.send(
        JSON.stringify({
          type: 'silence_nudge',
          silentCount: silenceNudgesRef.current,
        })
      );
    }
  }, []);

  return {
    status,
    isMicActive,
    isMuted,
    isSpeaking,
    isAiTurnPending,
    isAiBusy: isSpeaking || isAiTurnPending,
    speechLevel,
    micLevel,
    coachEmotion,
    mistakeStreak,
    liveSubtitle,
    isSubtitleVisible,
    latestGentleFix,
    history,
    errorMsg,
    nudgeActiveNotice,
    startSession,
    stopSession,
    toggleMute,
    sendTextTurn,
    changeTopic,
    triggerManualNudge,
  };
}
