import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachPersona, CoachVoiceName, SpeakingMode } from '../types/ielts';

interface SpeakOptions {
  voiceName: CoachVoiceName;
  speed?: number;
  mode?: SpeakingMode;
  persona?: CoachPersona;
  onEnded?: () => void;
}

const CAPTION_WINDOW_WORDS = 16;

function buildProgressiveSubtitle(words: string[], ratio: number): string {
  if (words.length === 0) return '';
  const clamped = Math.max(0.05, Math.min(1, ratio));
  const targetCount = Math.max(1, Math.min(words.length, Math.ceil(words.length * clamped)));
  const start = Math.max(0, targetCount - CAPTION_WINDOW_WORDS);
  const slice = words.slice(start, targetCount);
  return (start > 0 ? '… ' : '') + slice.join(' ');
}

export function useCoachSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [speechLevel, setSpeechLevel] = useState(0);
  const [liveSubtitle, setLiveSubtitle] = useState('');
  const [isSubtitleVisible, setIsSubtitleVisible] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const speakSessionRef = useRef(0);

  const clearTimersAndAudio = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (fallbackTimerRef.current !== null) {
      window.clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    speakSessionRef.current += 1;
    clearTimersAndAudio();
    setIsSpeaking(false);
    setIsTtsLoading(false);
    setSpeechLevel(0);
    setIsSubtitleVisible(false);
    setLiveSubtitle('');
  }, [clearTimersAndAudio]);

  useEffect(() => {
    return () => {
      clearTimersAndAudio();
    };
  }, [clearTimersAndAudio]);

  const scheduleSubtitleFade = useCallback((sessionId: number, onEnded?: () => void) => {
    setIsSpeaking(false);
    setSpeechLevel(0);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      if (speakSessionRef.current !== sessionId) return;
      setIsSubtitleVisible(false);
      setLiveSubtitle('');
      onEnded?.();
    }, 1500);
  }, []);

  const startTimedSubtitleFallback = useCallback(
    (text: string, speed: number, sessionId: number, onEnded?: () => void) => {
      const words = text.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        scheduleSubtitleFade(sessionId, onEnded);
        return;
      }
      const totalMs = Math.max(1800, Math.round((words.length / (2.5 * speed)) * 1000));
      const startedAt = performance.now();
      setIsSpeaking(true);
      setIsSubtitleVisible(true);

      fallbackTimerRef.current = window.setInterval(() => {
        if (speakSessionRef.current !== sessionId) return;
        const elapsed = performance.now() - startedAt;
        const ratio = Math.min(1, elapsed / totalMs);
        setLiveSubtitle(buildProgressiveSubtitle(words, ratio));
        // Gentle natural speaking cadence pulse
        const wave = 34 + Math.round(Math.abs(Math.sin(elapsed * 0.015)) * 46);
        setSpeechLevel(ratio < 1 ? wave : 0);

        if (ratio >= 1) {
          if (fallbackTimerRef.current !== null) {
            window.clearInterval(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }
          scheduleSubtitleFade(sessionId, onEnded);
        }
      }, 90);
    },
    [scheduleSubtitleFade]
  );

  const speak = useCallback(
    async (text: string, opts: SpeakOptions) => {
      const clean = text.trim();
      if (!clean) return;

      speakSessionRef.current += 1;
      const sessionId = speakSessionRef.current;
      clearTimersAndAudio();

      const words = clean.split(/\s+/).filter(Boolean);
      const speed = opts.speed || 1.0;

      setIsTtsLoading(true);
      setIsSpeaking(false);
      setSpeechLevel(0);
      setLiveSubtitle(buildProgressiveSubtitle(words, 0.12));
      setIsSubtitleVisible(true);

      try {
        const res = await fetch('/api/speaking/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: clean,
            voiceName: opts.voiceName,
            mode: opts.mode || 'coaching',
            persona: opts.persona || 'classic',
          }),
        });
        const data = await res.json();
        if (speakSessionRef.current !== sessionId) return;

        if (!res.ok || !data.audioBase64) {
          setIsTtsLoading(false);
          startTimedSubtitleFallback(clean, speed, sessionId, opts.onEnded);
          return;
        }

        const audio = new Audio(`data:${data.mimeType};base64,${data.audioBase64}`);
        audio.playbackRate = speed;
        audioRef.current = audio;

        let analyser: AnalyserNode | null = null;
        let freqBuf: Uint8Array<ArrayBuffer> | null = null;
        try {
          const AudioContextCtor =
            window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioContextCtor();
          if (ctx.state === 'suspended') {
            await ctx.resume().catch(() => {});
          }
          const src = ctx.createMediaElementSource(audio);
          analyser = ctx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.65;
          src.connect(analyser);
          analyser.connect(ctx.destination);
          freqBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
          audioCtxRef.current = ctx;
        } catch {
          analyser = null;
          freqBuf = null;
        }

        setIsTtsLoading(false);
        setIsSpeaking(true);

        const tick = () => {
          if (speakSessionRef.current !== sessionId) return;
          const el = audioRef.current;
          if (!el || el.paused || el.ended) return;

          let level = 0;
          if (analyser && freqBuf) {
            analyser.getByteFrequencyData(freqBuf);
            let sum = 0;
            // Focus on vocal range bins
            const count = Math.min(28, freqBuf.length);
            for (let i = 1; i < count; i++) sum += freqBuf[i];
            const avg = sum / Math.max(1, count - 1);
            level = Math.min(100, Math.round((avg / 95) * 100));
          } else {
            level = 32 + Math.round(Math.abs(Math.sin(performance.now() * 0.016)) * 45);
          }
          setSpeechLevel(level);

          if (el.duration && Number.isFinite(el.duration) && el.duration > 0) {
            const ratio = Math.min(1, el.currentTime / el.duration);
            setLiveSubtitle(buildProgressiveSubtitle(words, ratio));
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        audio.onended = () => {
          if (speakSessionRef.current !== sessionId) return;
          if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
          setLiveSubtitle(buildProgressiveSubtitle(words, 1));
          scheduleSubtitleFade(sessionId, opts.onEnded);
        };

        audio.onerror = () => {
          if (speakSessionRef.current !== sessionId) return;
          startTimedSubtitleFallback(clean, speed, sessionId, opts.onEnded);
        };

        try {
          await audio.play();
          if (speakSessionRef.current === sessionId) {
            rafRef.current = requestAnimationFrame(tick);
          }
        } catch {
          // Browser blocked autoplay without gesture -> run clean timed subtitle fallback
          if (speakSessionRef.current === sessionId) {
            clearTimersAndAudio();
            startTimedSubtitleFallback(clean, speed, sessionId, opts.onEnded);
          }
        }
      } catch {
        if (speakSessionRef.current === sessionId) {
          setIsTtsLoading(false);
          startTimedSubtitleFallback(clean, speed, sessionId, opts.onEnded);
        }
      }
    },
    [clearTimersAndAudio, scheduleSubtitleFade, startTimedSubtitleFallback]
  );

  return {
    isSpeaking,
    isTtsLoading,
    speechLevel,
    liveSubtitle,
    isSubtitleVisible,
    speak,
    stop,
  };
}
