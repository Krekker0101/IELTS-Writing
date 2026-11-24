import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Play,
  ShieldAlert,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type { SpeakingSessionRecord, UserProfile } from '../types/ielts';

interface SpeakingReportViewProps {
  session: SpeakingSessionRecord;
  userProfile: UserProfile;
  onBack: () => void;
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const SpeakingReportView: React.FC<SpeakingReportViewProps> = ({
  session,
  userProfile,
  onBack,
}) => {
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const [drillPlayingId, setDrillPlayingId] = useState<string | null>(null);

  const handleJumpToTime = (turnId: string, sec: number, speed = 1.0) => {
    const el = audioRefs.current[turnId];
    if (!el) return;
    el.playbackRate = speed;
    el.currentTime = Math.max(0, sec);
    el.play().catch(() => {});
  };

  const handlePlayModelPronunciation = async (annId: string, phrase: string) => {
    setDrillPlayingId(annId);
    try {
      const res = await fetch('/api/speaking/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: phrase,
          voiceName: userProfile.coachVoice,
          mode: 'practice',
          persona: 'classic',
        }),
      });
      const data = await res.json();
      if (res.ok && data.audioBase64) {
        const audio = new Audio(`data:${data.mimeType};base64,${data.audioBase64}`);
        audio.playbackRate = 0.75;
        await audio.play();
      }
    } catch {
      // ignore playback error
    } finally {
      setDrillPlayingId(null);
    }
  };

  const { evaluation } = session;

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад к статистике
        </button>
        <span className="text-xs text-slate-500">
          {new Date(session.createdAt).toLocaleString('ru-RU')} · {formatSec(session.durationSec)}
        </span>
      </div>

      {/* Band Score Header Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="text-[#FF4B3A]">
              {session.isFullMock ? 'Full Speaking Mock' : `Speaking Part ${session.part ?? 1} Practice`}
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">{session.mode}</span>
            {evaluation.isPartialPractice && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-amber-700">Оценка по одной части (не заменяет полный экзамен)</span>
              </>
            )}
            {session.sessionIntegrity === 'interrupted' && (
              <>
                <span className="text-slate-400">·</span>
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Focus Events: {session.focusEvents.length}
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{session.title}</h1>
          <p className="text-sm text-slate-600 leading-relaxed">{evaluation.summary}</p>
          {evaluation.coachObservation && (
            <p className="text-xs text-purple-900 bg-purple-50 border border-purple-200 rounded-xl p-3">
              <span className="font-bold">AI Coach: </span>
              {evaluation.coachObservation}
            </p>
          )}
          {evaluation.uncertaintyNote && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
              {evaluation.uncertaintyNote}
            </p>
          )}
        </div>

        <div className="shrink-0 text-center md:text-right bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4">
          <p className="text-xs text-slate-500 font-medium">Примерный балл платформы</p>
          <p className="text-4xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {evaluation.speakingBand.toFixed(1)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">AI estimate (не официальный IELTS)</p>
        </div>
      </div>

      {/* 4 Official Criteria */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {evaluation.criteria.map((c) => (
          <div key={c.name} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">{c.name}</h2>
              <span className="text-base font-bold font-mono tabular-nums text-blue-700">
                {c.band.toFixed(1)}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{c.explanation}</p>
            {c.strengths.length > 0 && (
              <div className="text-xs">
                <span className="font-semibold text-emerald-700">Сильные стороны: </span>
                <span className="text-slate-700">{c.strengths.join('; ')}</span>
              </div>
            )}
            {c.nextBandSteps.length > 0 && (
              <div className="text-xs">
                <span className="font-semibold text-slate-800">Следующий шаг: </span>
                <span className="text-slate-600">{c.nextBandSteps.join('; ')}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Priorities & Next Exercise */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
          <h3 className="text-sm font-bold text-slate-900">Главные приоритеты</h3>
          <ul className="space-y-1.5 text-xs text-slate-700">
            {evaluation.topPriorities.map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#FF4B3A] shrink-0 mt-0.5" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
          <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#FF4B3A]" />
            Рекомендуемое упражнение
          </h3>
          <p className="text-xs text-slate-700 leading-relaxed">
            {evaluation.nextRecommendedExercise}
          </p>
        </div>
      </div>

      {/* Turn-by-turn Audio, Fluency Signals & Timestamped Annotations */}
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-slate-900">Разбор по ответам и таймкодам</h2>
        {session.turns.map((turn, idx) => (
          <div
            key={turn.id}
            className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-blue-700">
                  Part {turn.part} · Ответ {idx + 1} · {turn.durationSec} сек
                </p>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  {turn.questionText}
                </h3>
              </div>
            </div>

            {/* Fluency Signals */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs">
              <div>
                <p className="font-mono font-bold text-slate-900">{turn.fluencySignals.estimatedWpm}</p>
                <p className="text-[11px] text-slate-500">WPM (темп)</p>
              </div>
              <div>
                <p className="font-mono font-bold text-slate-900">{turn.fluencySignals.longPausesCount}</p>
                <p className="text-[11px] text-slate-500">Длин. паузы</p>
              </div>
              <div>
                <p className="font-mono font-bold text-slate-900">{turn.fluencySignals.fillerWordsCount}</p>
                <p className="text-[11px] text-slate-500">Филлеры</p>
              </div>
              <div>
                <p className="font-mono font-bold text-slate-900">{turn.fluencySignals.selfCorrectionsCount}</p>
                <p className="text-[11px] text-slate-500">Самоиспр.</p>
              </div>
              <div>
                <p className="font-mono font-bold text-slate-900">{turn.fluencySignals.repetitionsCount}</p>
                <p className="text-[11px] text-slate-500">Повторы</p>
              </div>
            </div>

            {/* Audio Player with 0.75x drill toggle */}
            {turn.audioDataUrl ? (
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <audio
                  ref={(el) => {
                    audioRefs.current[turn.id] = el;
                  }}
                  controls
                  src={turn.audioDataUrl}
                  className="h-9 flex-1 min-w-[220px]"
                />
                <button
                  type="button"
                  onClick={() => handleJumpToTime(turn.id, 0, 0.75)}
                  className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:border-slate-300 cursor-pointer"
                >
                  Слушать 0.75x
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Аудиозапись не сохранена согласно настройкам приватности (транскрипт и разбор сохранены).
              </p>
            )}

            {/* Transcript */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-800 leading-relaxed">
              <p className="text-xs font-semibold text-slate-500 mb-1">Транскрипт речи:</p>
              <p>{turn.transcript}</p>
              {turn.uncertainWords.length > 0 && (
                <p className="mt-2 text-xs text-amber-800">
                  Неуверенное распознавание слов: {turn.uncertainWords.join(', ')}
                </p>
              )}
            </div>

            {/* Timestamped Annotations */}
            {turn.annotations.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-slate-700">
                  Точечные замечания ({turn.annotations.length}):
                </p>
                {turn.annotations.map((ann) => (
                  <div
                    key={ann.id}
                    className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                      ann.severity === 'uncertain_transcription'
                        ? 'bg-amber-50/70 border-amber-200'
                        : ann.severity === 'error'
                        ? 'bg-red-50/50 border-red-200'
                        : 'bg-blue-50/50 border-blue-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {turn.audioDataUrl && (
                          <button
                            type="button"
                            onClick={() => handleJumpToTime(turn.id, ann.startSec, 1.0)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 font-mono font-semibold bg-white border border-slate-200 rounded-md hover:border-slate-400 cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                            {formatSec(ann.startSec)}
                          </button>
                        )}
                        <span className="font-bold text-slate-900">
                          {ann.category} · {ann.subRule}
                        </span>
                      </div>
                      {(ann.repeatDrillPhrase || ann.minimalCorrection) && (
                        <button
                          type="button"
                          onClick={() =>
                            handlePlayModelPronunciation(
                              ann.id,
                              ann.repeatDrillPhrase || ann.minimalCorrection
                            )
                          }
                          disabled={drillPlayingId === ann.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 cursor-pointer"
                        >
                          {drillPlayingId === ann.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Volume2 className="w-3 h-3" />
                          )}
                          Эталон 0.75x
                        </button>
                      )}
                    </div>
                    <p className="text-slate-800">
                      <span className="line-through text-red-700 mr-1.5">{ann.wordOrPhrase}</span>
                      → <span className="font-semibold text-emerald-800">{ann.minimalCorrection}</span>
                    </p>
                    <p className="text-slate-700">{ann.explanation}</p>
                    <p className="text-slate-500">Совет: {ann.tip}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
