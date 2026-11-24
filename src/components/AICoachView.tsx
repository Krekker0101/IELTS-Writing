import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Flame,
  Loader2,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Send,
  Sparkles,
} from 'lucide-react';
import type { CoachPersona, CoachVisualState, UserProfile } from '../types/ielts';
import { CoachMascot } from './CoachMascot';
import { useLiveCoachSession } from '../hooks/useLiveCoachSession';

interface AICoachViewProps {
  userProfile: UserProfile;
  onUpdateProfile: (patch: Partial<UserProfile>) => Promise<void>;
}

const STARTER_TOPICS = [
  'Everyday Routines & Work-Life Balance',
  'Technology, AI & Future Skills',
  'Travel, Cities & Cultural Heritage',
  'Books, Films & Creative Hobbies',
];

function getLiveStatusCaption(params: {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  emotion: CoachVisualState;
  isSpeaking: boolean;
  mistakeStreak: number;
  nudgeActive: boolean;
  isMuted: boolean;
}): { label: string; toneClass: string } {
  const { status, emotion, isSpeaking, mistakeStreak, nudgeActive, isMuted } = params;
  if (status === 'connecting') {
    return {
      label: 'Подключаем потоковый голосовой канал Live AI…',
      toneClass: 'text-blue-700 bg-blue-50 border-blue-200',
    };
  }
  if (status === 'idle') {
    return {
      label: 'Нажмите «Начать живой разговор» — говорить можно сразу без записи файлов',
      toneClass: 'text-slate-600 bg-slate-100 border-slate-200',
    };
  }
  if (status === 'error') {
    return {
      label: 'Сбой голосового канала · Нажмите «Подключить заново»',
      toneClass: 'text-red-700 bg-red-50 border-red-200',
    };
  }
  if (emotion === 'angry_fire') {
    return {
      label: isSpeaking
        ? `Разозлился (${mistakeStreak} ошибки подряд) · Разбирает прямо в речи`
        : `Горит голова! Повторяющаяся ошибка (${mistakeStreak} подряд)`,
      toneClass: 'text-red-700 bg-red-50 border-red-200',
    };
  }
  if (emotion === 'teasing') {
    return {
      label: 'Подшучивает и поддевает за неточность в речи…',
      toneClass: 'text-purple-700 bg-purple-50 border-purple-200',
    };
  }
  if (emotion === 'calming_down') {
    return {
      label: 'Успокаивается — ошибка исправлена чисто!',
      toneClass: 'text-teal-700 bg-teal-50 border-teal-200',
    };
  }
  if (nudgeActive || isSpeaking) {
    return {
      label: nudgeActive
        ? 'Видит паузу и сам подталкивает вас к разговору…'
        : 'Говорит с вами в реальном времени',
      toneClass: 'text-[#FF4B3A] bg-red-50 border-red-200',
    };
  }
  if (isMuted) {
    return {
      label: 'Микрофон на паузе (можно писать текстом или включить звук)',
      toneClass: 'text-amber-700 bg-amber-50 border-amber-200',
    };
  }
  return {
    label: 'Слушает ваши слова · Если замолчите — сам задаст вопрос',
    toneClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  };
}

export const AICoachView: React.FC<AICoachViewProps> = ({
  userProfile,
  onUpdateProfile,
}) => {
  const [topic, setTopic] = useState(STARTER_TOPICS[0]);
  const [inputText, setInputText] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const {
    status,
    isMicActive,
    isMuted,
    isSpeaking,
    isAiBusy,
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
  } = useLiveCoachSession();

  const isLiveConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  const handleStartLive = () => {
    void startSession({
      topic,
      persona: userProfile.coachPersona,
      voiceName: userProfile.coachVoice,
      onProfileXp: (xp, streakDays) => {
        void onUpdateProfile({ xp, streakDays });
      },
    });
  };

  const handleSelectTopic = (nextTopic: string) => {
    setTopic(nextTopic);
    if (isLiveConnected) {
      changeTopic(nextTopic);
    }
  };

  const handleSwitchPersona = async (persona: CoachPersona) => {
    await onUpdateProfile({ coachPersona: persona });
    if (isLiveConnected) {
      void startSession({
        topic,
        persona,
        voiceName: userProfile.coachVoice,
        onProfileXp: (xp, streakDays) => {
          void onUpdateProfile({ xp, streakDays });
        },
      });
    }
  };

  const caption = getLiveStatusCaption({
    status,
    emotion: coachEmotion,
    isSpeaking: isAiBusy,
    mistakeStreak,
    nudgeActive: nudgeActiveNotice,
    isMuted,
  });

  return (
    <div className="max-w-[980px] mx-auto px-6 py-8 space-y-6">
      {/* Header & Persona Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#FF4B3A] inline-flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            Потоковый Live-разговор в реальном времени · Не влияет на Mock Band
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">AI Coach Live Conversation</h1>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0 self-start sm:self-auto">
          {(
            [
              { id: 'strict', label: 'Требовательный' },
              { id: 'classic', label: 'Классический' },
              { id: 'supportive', label: 'Поддерживающий' },
            ] as Array<{ id: CoachPersona; label: string }>
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => void handleSwitchPersona(p.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                userProfile.coachPersona === p.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Topic Starters */}
      <div className="flex flex-wrap items-center gap-2">
        {STARTER_TOPICS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleSelectTopic(t)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl border cursor-pointer transition-colors ${
              topic === t
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Live Real-Time Mascot Stage + Single-Play Bottom Subtitles */}
      <section className="hero-pastel-mesh border border-slate-200 rounded-3xl p-6 sm:p-10 flex flex-col items-center justify-between min-h-[380px] relative overflow-hidden">
        {/* Top Emotion + Mic Indicator Strip */}
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-semibold ${caption.toneClass}`}
          >
            {coachEmotion === 'angry_fire' && <Flame className="w-3.5 h-3.5 text-red-600" />}
            {isConnecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {caption.label}
          </span>

          {isLiveConnected && isMicActive && (
            <div className="flex items-center gap-2 bg-white/90 border border-slate-200 px-3 py-1 rounded-lg">
              <span
                className={`w-2 h-2 rounded-full ${
                  isMuted ? 'bg-slate-400' : 'bg-emerald-600 animate-pulse'
                }`}
              />
              <span className="text-[11px] font-semibold text-slate-700">
                {isMuted ? 'Микрофон выкл.' : 'Микрофон открыт'}
              </span>
              {!isMuted && (
                <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-75"
                    style={{ width: `${Math.max(8, micLevel)}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center Animated Mascot */}
        <div className="my-6 flex flex-col items-center justify-center gap-5">
          <CoachMascot
            state={coachEmotion}
            persona={userProfile.coachPersona}
            size="lg"
            reducedMotion={userProfile.reducedMotion}
            speaking={isSpeaking}
            speechLevel={speechLevel}
          />

          {/* Primary Real-Time Call Controls */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {status === 'idle' || status === 'error' ? (
              <button
                type="button"
                onClick={handleStartLive}
                className="inline-flex items-center gap-2.5 px-6 py-3 text-sm font-bold text-white bg-[#FF4B3A] hover:bg-[#e84232] rounded-2xl shadow-md transition-all cursor-pointer"
              >
                <PhoneCall className="w-4 h-4" />
                {status === 'error' ? 'Подключить заново' : 'Начать живой разговор'}
              </button>
            ) : isConnecting ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-slate-800 rounded-2xl opacity-85"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Запуск Live-канала…
              </button>
            ) : (
              <>
                {isMicActive && (
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                      isMuted
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    {isMuted ? (
                      <>
                        <MicOff className="w-4 h-4 text-amber-700" />
                        Включить микрофон
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4 text-emerald-600" />
                        Пауза микрофона
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={stopSession}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  <PhoneOff className="w-4 h-4" />
                  Завершить разговор
                </button>
              </>
            )}
          </div>
        </div>

        {/* Single-Play Live Subtitles Underneath (Shown Once While Speaking, Auto-Clears) */}
        <div className="w-full max-w-2xl min-h-[64px] flex items-end justify-center">
          {isSubtitleVisible && liveSubtitle ? (
            <div
              className="w-full px-5 py-3 rounded-2xl bg-slate-950/90 text-white text-center shadow-lg border border-slate-800 transition-opacity duration-300"
              aria-live="polite"
            >
              <p className="text-sm sm:text-base font-medium leading-relaxed">
                {liveSubtitle}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center">
              {isLiveConnected
                ? 'Говорите свободно — тренер всегда договаривает мысль до конца, не сбивается на шум и сразу слушает вас.'
                : 'Без записи файлов и кнопок «Отправить»: живой голос в обе стороны, как звонок с тренером.'}
            </p>
          )}
        </div>
      </section>

      {/* Latest Live Mistake Feedback Banner */}
      {latestGentleFix && (
        <div className="px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-bold">Моментальная правка речи: </span>
            <span className="line-through text-red-700 mr-1.5">{latestGentleFix.original}</span>
            →{' '}
            <span className="font-semibold text-emerald-800 ml-1">{latestGentleFix.better}</span>
            <span className="block text-[11px] text-amber-800 mt-0.5">{latestGentleFix.reasonRu}</span>
          </div>
          <span className="text-[11px] font-mono text-amber-800">
            Ошибок подряд: {mistakeStreak}
          </span>
        </div>
      )}

      {errorMsg && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
          {errorMsg}
        </p>
      )}

      {/* Optional Text Input for No-Mic Accessibility During Live Call */}
      {isLiveConnected && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inputText.trim()) {
                sendTextTurn(inputText.trim());
                setInputText('');
              }
            }}
            placeholder="Если неудобно говорить вслух — отправьте фразу в Live-диалог текстом…"
            className="flex-1 min-w-[200px] px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400"
          />
          <button
            type="button"
            onClick={() => {
              if (!inputText.trim()) return;
              sendTextTurn(inputText.trim());
              setInputText('');
            }}
            disabled={!inputText.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 disabled:opacity-40 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Сказать текстом
          </button>
        </div>
      )}

      {/* Collapsible Transcript & Correction History */}
      {history.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="w-full px-5 py-3 flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <span>История живого диалога и разобранные правки ({history.length})</span>
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showHistory && (
            <div className="p-5 pt-2 border-t border-slate-100 space-y-3 max-h-[340px] overflow-y-auto">
              {history.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-blue-700 text-white'
                        : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    <p>{m.text}</p>
                  </div>
                  {m.gentleFix && (
                    <p className="mt-1 text-[11px] text-amber-800">
                      Правка: <span className="line-through">{m.gentleFix.original}</span> →{' '}
                      <span className="font-semibold text-emerald-700">{m.gentleFix.better}</span> (
                      {m.gentleFix.reasonRu})
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
