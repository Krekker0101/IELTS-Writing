import React, { useEffect, useRef } from 'react';
import type { CoachPersona, CoachVisualState } from '../types/ielts';

interface CoachMascotProps {
  state?: CoachVisualState;
  persona?: CoachPersona;
  size?: 'sm' | 'md' | 'lg';
  reducedMotion?: boolean;
  speaking?: boolean;
  speechLevel?: number;
  trackCursor?: boolean;
}

export const CoachMascot: React.FC<CoachMascotProps> = ({
  state = 'idle',
  persona = 'classic',
  size = 'lg',
  reducedMotion = false,
  speaking = false,
  speechLevel = 0,
  trackCursor = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const eyesRef = useRef<HTMLDivElement>(null);
  const browsRef = useRef<HTMLDivElement>(null);
  const mouthRef = useRef<HTMLDivElement>(null);

  const dimensions =
    size === 'sm'
      ? { w: 40, h: 26, border: 3, eyeW: 4, eyeH: 7, maxEyeX: 5.5, maxEyeY: 3.5 }
      : size === 'md'
      ? { w: 108, h: 68, border: 7, eyeW: 11, eyeH: 17, maxEyeX: 12, maxEyeY: 7 }
      : { w: 164, h: 102, border: 11, eyeW: 16, eyeH: 25, maxEyeX: 17, maxEyeY: 10 };

  const isListening = state === 'listening';
  const isSpeaking = speaking || state === 'speaking';
  const isThinking = state === 'thinking';
  const isHappy = state === 'encouraging' || state === 'celebrating';
  const isNeutral = state === 'neutral_examiner';
  const isAngry = state === 'angry_fire';
  const isTeasing = state === 'teasing';
  const isCalming = state === 'calming_down';

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const resetTransform = () => {
      if (eyesRef.current) eyesRef.current.style.transform = 'translate3d(0px, 0px, 0)';
      if (browsRef.current) browsRef.current.style.transform = 'translate3d(0px, 0px, 0)';
      if (mouthRef.current) mouthRef.current.style.transform = 'translate3d(0px, 0px, 0)';
    };

    if (!trackCursor || reducedMotion || prefersReduced || isThinking) {
      resetTransform();
      return;
    }

    let rafId = 0;
    let latestX = 0;
    let latestY = 0;

    const updateGaze = () => {
      rafId = 0;
      const root = containerRef.current;
      const eyes = eyesRef.current;
      if (!root || !eyes) return;

      const rect = root.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = latestX - centerX;
      const dy = latestY - centerY;
      const dist = Math.hypot(dx, dy);

      if (dist < 1) {
        resetTransform();
        return;
      }

      const softRadius = Math.max(85, rect.width * 1.4);
      const strength = Math.min(1, dist / softRadius);
      const angle = Math.atan2(dy, dx);

      const moveX = Math.cos(angle) * dimensions.maxEyeX * strength;
      const moveY = Math.sin(angle) * dimensions.maxEyeY * strength;

      eyes.style.transform = `translate3d(${moveX.toFixed(2)}px, ${moveY.toFixed(2)}px, 0)`;
      if (browsRef.current) {
        browsRef.current.style.transform = `translate3d(${(moveX * 0.45).toFixed(2)}px, ${(moveY * 0.45).toFixed(2)}px, 0)`;
      }
      if (mouthRef.current) {
        mouthRef.current.style.transform = `translate3d(${(moveX * 0.28).toFixed(2)}px, ${(moveY * 0.25).toFixed(2)}px, 0)`;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      latestX = e.clientX;
      latestY = e.clientY;
      if (!rafId) {
        rafId = window.requestAnimationFrame(updateGaze);
      }
    };

    const handlePointerLeave = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      resetTransform();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('mouseleave', handlePointerLeave);
    window.addEventListener('blur', handlePointerLeave);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('mouseleave', handlePointerLeave);
      window.removeEventListener('blur', handlePointerLeave);
    };
  }, [trackCursor, reducedMotion, isThinking, dimensions.maxEyeX, dimensions.maxEyeY]);

  const ringColor = isAngry
    ? '#DC2626'
    : isTeasing
    ? '#9333EA'
    : isCalming
    ? '#0D9488'
    : isNeutral
    ? '#1E293B'
    : state === 'reconnecting'
    ? '#D97706'
    : persona === 'strict'
    ? '#9333EA'
    : persona === 'supportive'
    ? '#F59E0B'
    : '#FF4B3A';

  const normalizedLevel = Math.max(0, Math.min(100, speechLevel));
  const mouthOpenPx = isSpeaking
    ? Math.max(
        size === 'md' ? 5 : 7,
        Math.round(((normalizedLevel || 35) / 100) * (size === 'md' ? 14 : 20))
      )
    : 0;

  const glowStyle = isAngry
    ? { boxShadow: '0 0 28px rgba(220, 38, 38, 0.38)' }
    : isCalming
    ? { boxShadow: '0 0 22px rgba(13, 148, 136, 0.25)' }
    : isTeasing
    ? { boxShadow: '0 0 22px rgba(147, 51, 234, 0.25)' }
    : isSpeaking
    ? { boxShadow: `0 0 ${12 + Math.round(normalizedLevel * 0.22)}px ${ringColor}40` }
    : undefined;

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center justify-center select-none ${
        !reducedMotion && isAngry ? 'coach-angry-shake' : ''
      } ${!reducedMotion && isCalming ? 'coach-calm-breathe' : ''}`}
      style={{
        width: dimensions.w,
        height: dimensions.h,
        marginTop: isAngry && size !== 'sm' ? 24 : 0,
      }}
      aria-hidden="true"
    >
      {/* Head Flames when Angry (repeated mistakes) */}
      {isAngry && size !== 'sm' && (
        <div
          className={`pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 flex items-end justify-center gap-0.5 ${
            !reducedMotion ? 'coach-fire-flicker' : ''
          }`}
          style={{ width: dimensions.w * 0.78, height: size === 'lg' ? 44 : 32 }}
        >
          <svg viewBox="0 0 120 56" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="coachFlameGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#DC2626" />
                <stop offset="55%" stopColor="#F97316" />
                <stop offset="100%" stopColor="#FACC15" />
              </linearGradient>
            </defs>
            <path
              d="M14,54 C10,36 22,26 24,14 C30,24 34,30 38,20 C44,6 54,4 60,0 C65,12 72,18 76,8 C85,20 88,28 95,18 C104,28 108,40 104,54 Z"
              fill="url(#coachFlameGrad)"
            />
            <path
              d="M34,54 C32,42 42,35 45,26 C50,33 56,34 60,22 C65,33 70,35 75,27 C80,36 86,44 84,54 Z"
              fill="#FEF08A"
              opacity="0.85"
            />
          </svg>
        </div>
      )}

      {/* Listening pulse aura */}
      {isListening && !reducedMotion && (
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-25"
          style={{ backgroundColor: ringColor }}
        />
      )}

      {/* Speaking live audio aura */}
      {isSpeaking && !reducedMotion && (
        <span
          className="absolute -inset-1.5 rounded-full transition-transform duration-75 opacity-20"
          style={{
            backgroundColor: ringColor,
            transform: `scale(${1 + (normalizedLevel / 100) * 0.08})`,
          }}
        />
      )}

      <div
        className={`relative w-full h-full bg-white rounded-full flex items-center justify-center shadow-sm transition-[transform,border-color,box-shadow] duration-200 overflow-hidden ${
          !reducedMotion && state === 'idle' ? 'hover:scale-[1.03]' : ''
        }`}
        style={{
          border: `${dimensions.border}px solid ${ringColor}`,
          ...glowStyle,
        }}
      >
        <div className="flex flex-col items-center justify-center gap-1">
          {/* Eyebrows for Angry / Teasing */}
          {size !== 'sm' && (isAngry || isTeasing) && (
            <div
              ref={browsRef}
              className="flex items-center justify-between -mb-0.5 transition-transform duration-100 ease-out will-change-transform"
              style={{ width: size === 'md' ? 42 : 62 }}
            >
              <span
                className="block bg-slate-900 rounded-full transition-transform duration-200"
                style={{
                  width: size === 'md' ? 14 : 20,
                  height: size === 'md' ? 3 : 4,
                  transform: isAngry ? 'rotate(20deg)' : 'rotate(-14deg) translateY(-2px)',
                }}
              />
              <span
                className="block bg-slate-900 rounded-full transition-transform duration-200"
                style={{
                  width: size === 'md' ? 14 : 20,
                  height: size === 'md' ? 3 : 4,
                  transform: isAngry ? 'rotate(-20deg)' : 'rotate(6deg)',
                }}
              />
            </div>
          )}

          {/* Eyes (tracked toward cursor) */}
          <div
            ref={eyesRef}
            data-testid="mascot-eyes"
            className="flex items-center justify-center transition-transform duration-100 ease-out will-change-transform"
            style={{ gap: size === 'sm' ? 6 : size === 'md' ? 15 : 24 }}
          >
            <span
              className={`block rounded-full bg-slate-900 transition-all duration-150 ${
                !reducedMotion && isThinking ? '-translate-y-0.5 translate-x-0.5' : ''
              }`}
              style={{
                width: dimensions.eyeW,
                height: isHappy
                  ? Math.max(4, dimensions.eyeH * 0.55)
                  : isCalming
                  ? Math.max(4, dimensions.eyeH * 0.42)
                  : isAngry
                  ? Math.max(6, dimensions.eyeH * 0.72)
                  : dimensions.eyeH,
                borderRadius: isHappy || isCalming ? '999px 999px 3px 3px' : '999px',
                transform: isTeasing ? 'scaleY(0.82) translateX(2px)' : undefined,
              }}
            />
            <span
              className={`block rounded-full bg-slate-900 transition-all duration-150 ${
                !reducedMotion && isThinking ? '-translate-y-0.5 translate-x-0.5' : ''
              }`}
              style={{
                width: dimensions.eyeW,
                height: isHappy
                  ? Math.max(4, dimensions.eyeH * 0.55)
                  : isCalming
                  ? Math.max(4, dimensions.eyeH * 0.42)
                  : isAngry
                  ? Math.max(6, dimensions.eyeH * 0.72)
                  : dimensions.eyeH,
                borderRadius: isHappy || isCalming ? '999px 999px 3px 3px' : '999px',
                transform: isTeasing ? 'scaleY(0.55) translateX(2px)' : undefined,
              }}
            />
          </div>

          {/* Mouth / Real-Time Audio-Synced Speaking */}
          {size !== 'sm' && (
            <div
              ref={mouthRef}
              className="mt-0.5 flex items-center justify-center h-5 transition-transform duration-100 ease-out will-change-transform"
            >
              {isSpeaking ? (
                <div className="flex items-center gap-1.5">
                  <span
                    className="block rounded-full bg-slate-900 transition-all duration-75"
                    style={{
                      width: size === 'md' ? 14 : 20,
                      height: mouthOpenPx,
                      borderRadius: isAngry ? '4px 4px 10px 10px' : '999px',
                    }}
                  />
                </div>
              ) : isNeutral ? (
                <span className="block w-5 h-0.5 rounded-full bg-slate-800" />
              ) : isAngry ? (
                <span
                  className="block bg-red-700 rounded-full"
                  style={{
                    width: size === 'md' ? 15 : 22,
                    height: size === 'md' ? 6 : 8,
                    borderTopLeftRadius: 999,
                    borderTopRightRadius: 999,
                    borderBottomLeftRadius: 3,
                    borderBottomRightRadius: 3,
                  }}
                />
              ) : isTeasing ? (
                <span
                  className="block border-b-[3px] border-slate-900"
                  style={{
                    width: size === 'md' ? 14 : 20,
                    height: size === 'md' ? 6 : 8,
                    borderRadius: '0 0 999px 999px',
                    transform: 'rotate(-10deg)',
                  }}
                />
              ) : isCalming ? (
                <span
                  className="block bg-teal-700 rounded-full"
                  style={{
                    width: size === 'md' ? 9 : 12,
                    height: size === 'md' ? 4 : 5,
                  }}
                />
              ) : isThinking ? (
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                </div>
              ) : (
                <span
                  className="block bg-slate-900"
                  style={{
                    width: size === 'md' ? 12 : 18,
                    height: size === 'md' ? 6 : 9,
                    borderBottomLeftRadius: 999,
                    borderBottomRightRadius: 999,
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface CoachPersonaFanProps {
  selected: CoachPersona;
  onSelect: (persona: CoachPersona) => void;
  reducedMotion?: boolean;
}

export const CoachPersonaFan: React.FC<CoachPersonaFanProps> = ({
  selected,
  onSelect,
  reducedMotion = false,
}) => {
  const cards: Array<{
    id: CoachPersona;
    title: string;
    subtitle: string;
    bgClass: string;
    ringClass: string;
    positionClass: string;
  }> = [
    {
      id: 'strict',
      title: 'Требовательный',
      subtitle: 'Чёткий, прямой и взыскательный. Подсвечивает общие фразы и просит точные примеры.',
      bgClass: 'bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white',
      ringClass: 'ring-purple-300',
      positionClass: reducedMotion ? '' : 'md:-rotate-3 md:translate-y-4',
    },
    {
      id: 'classic',
      title: 'Классический',
      subtitle: 'Сбалансированный, дружелюбный преподаватель для системной повседневной практики.',
      bgClass: 'bg-[#FF4B3A] text-white',
      ringClass: 'ring-red-300',
      positionClass: reducedMotion ? '' : 'md:-translate-y-1 z-10',
    },
    {
      id: 'supportive',
      title: 'Поддерживающий',
      subtitle: 'Спокойная и бережная подача без лишнего давления. Помогает разговориться уверенно.',
      bgClass: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white',
      ringClass: 'ring-amber-300',
      positionClass: reducedMotion ? '' : 'md:rotate-3 md:translate-y-4',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-2 max-w-3xl mx-auto pt-3 pb-2 items-stretch">
      {cards.map((card) => {
        const isSelected = selected === card.id;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(card.id)}
            className={`text-left rounded-2xl p-6 shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[172px] ${
              card.bgClass
            } ${card.positionClass} ${
              isSelected
                ? `ring-4 ${card.ringClass} shadow-xl scale-[1.02]`
                : 'opacity-90 hover:opacity-100 hover:scale-[1.01]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xl font-bold tracking-tight">{card.title}</span>
                {isSelected && (
                  <span className="text-[11px] font-semibold bg-white/25 px-2 py-0.5 rounded-md whitespace-nowrap">
                    Выбран
                  </span>
                )}
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-white/95">
                {card.subtitle}
              </p>
            </div>
            <p className="mt-4 text-xs font-semibold text-white/90">
              {isSelected ? 'Активный характер AI Coach' : 'Нажмите, чтобы выбрать →'}
            </p>
          </button>
        );
      })}
    </div>
  );
};
