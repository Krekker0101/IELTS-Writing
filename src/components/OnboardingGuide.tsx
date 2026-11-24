import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Compass,
  FileSpreadsheet,
  PanelLeft,
  X,
} from 'lucide-react';
import type { AppRoute } from './SidebarNav';

export const ONBOARDING_STORAGE_KEY = 'ielts_lab_onboarding_completed_v1';

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingCompleted(): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
  } catch {
    // ignore storage errors
  }
}

interface OnboardingStep {
  id: 'sidebar' | 'mock' | 'progress';
  route: AppRoute;
  selector: string;
  fallbackSelector?: string;
  sectionTag: string;
  title: string;
  description: string;
  highlights: string[];
  icon: React.ComponentType<{ className?: string }>;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'sidebar',
    route: 'home',
    selector: '[data-onboarding="sidebar"]',
    fallbackSelector: '[data-onboarding="mobile-nav"]',
    sectionTag: 'Sidebar',
    title: 'Навигация и панель уровня',
    description:
      'В боковой панели собраны все разделы подготовки: План обучения, Mock Tests, Practice Tasks, Speaking Studio, AI Coach и Аналитика.',
    highlights: [
      'Отслеживайте текущий уровень XP и прогресс до цели Band',
      'Запускайте голосовые команды или повторяйте этот гид в любой момент',
    ],
    icon: PanelLeft,
  },
  {
    id: 'mock',
    route: 'mock',
    selector: '[data-onboarding="mock-test-list-view"]',
    sectionTag: 'MockTestListView',
    title: 'Полноценные Writing Mock Tests',
    description:
      'Симуляции реального экзамена IELTS (Task 1 + Task 2) с общим 60-минутным таймером для Academic и General Training.',
    highlights: [
      'Режим экзамена активирует Screen Lock API (Fullscreen, Wake Lock и Keyboard Lock)',
      'Автосохранение черновиков и развёрнутый AI-разбор по 4 критериям',
    ],
    icon: FileSpreadsheet,
  },
  {
    id: 'progress',
    route: 'progress',
    selector: '[data-onboarding="progress-view"]',
    sectionTag: 'ProgressView',
    title: 'Динамика Band Score и аналитика',
    description:
      'График изменения баллов за последние 30 дней по четырём официальным критериям IELTS для Writing и Speaking.',
    highlights: [
      'Сравнивайте прогресс по TA/TR, Coherence, Lexical Resource и Grammar',
      'Тренируйте флеш-карточки лексики и закрывайте слабые места из журнала ошибок',
    ],
    icon: BarChart3,
  },
];

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface OnboardingGuideProps {
  open: boolean;
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onClose: () => void;
  reducedMotion?: boolean;
}

export const OnboardingGuide: React.FC<OnboardingGuideProps> = ({
  open,
  currentRoute,
  onNavigate,
  onClose,
  reducedMotion = false,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<RectBox | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  });
  const [popoverHeight, setPopoverHeight] = useState<number>(290);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledStepRef = useRef<string | null>(null);

  const step = ONBOARDING_STEPS[stepIndex] ?? ONBOARDING_STEPS[0];

  const resolveTargetElement = useCallback((currentStep: OnboardingStep): HTMLElement | null => {
    const primary = document.querySelector(currentStep.selector) as HTMLElement | null;
    if (primary) {
      const rect = primary.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return primary;
      }
    }
    if (currentStep.fallbackSelector) {
      const fallback = document.querySelector(currentStep.fallbackSelector) as HTMLElement | null;
      if (fallback) {
        const rect = fallback.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return fallback;
        }
      }
    }
    return null;
  }, []);

  const measureTarget = useCallback(
    (allowScroll: boolean) => {
      if (!open) return;
      setViewport({ w: window.innerWidth, h: window.innerHeight });

      const el = resolveTargetElement(step);
      if (!el) {
        setTargetRect(null);
        return;
      }

      if (allowScroll && step.id !== 'sidebar' && lastScrolledStepRef.current !== step.id) {
        lastScrolledStepRef.current = step.id;
        el.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      }

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        setTargetRect(null);
        return;
      }

      const padding = step.id === 'sidebar' ? 4 : 10;
      const clampedTop = Math.max(4, rect.top - padding);
      const clampedLeft = Math.max(4, rect.left - padding);
      const maxWidth = Math.max(40, window.innerWidth - clampedLeft - 4);
      const maxHeight = Math.max(40, window.innerHeight - clampedTop - 4);

      setTargetRect({
        top: clampedTop,
        left: clampedLeft,
        width: Math.min(rect.width + padding * 2, maxWidth),
        height: Math.min(rect.height + padding * 2, maxHeight),
      });
    },
    [open, reducedMotion, resolveTargetElement, step]
  );

  // Reset to step 0 when opened
  useEffect(() => {
    if (open) {
      setStepIndex(0);
      lastScrolledStepRef.current = null;
    }
  }, [open]);

  // Navigate to the route associated with the active step
  useEffect(() => {
    if (!open) return;
    if (currentRoute !== step.route) {
      onNavigate(step.route);
    }
  }, [open, currentRoute, step.route, onNavigate]);

  // Measure target element after route/step render settles
  useEffect(() => {
    if (!open) return;
    let rafId = 0;
    rafId = window.requestAnimationFrame(() => measureTarget(true));
    const t1 = window.setTimeout(() => measureTarget(true), 90);
    const t2 = window.setTimeout(() => measureTarget(false), 260);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [open, stepIndex, currentRoute, measureTarget]);

  // Re-measure on resize and scroll
  useEffect(() => {
    if (!open) return;
    let rafPending = false;
    const scheduleMeasure = () => {
      if (rafPending) return;
      rafPending = true;
      window.requestAnimationFrame(() => {
        rafPending = false;
        measureTarget(false);
      });
    };
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    return () => {
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
    };
  }, [open, measureTarget]);

  useLayoutEffect(() => {
    if (!open || !popoverRef.current) return;
    const h = popoverRef.current.getBoundingClientRect().height;
    if (h > 0 && Math.abs(h - popoverHeight) > 4) {
      setPopoverHeight(h);
    }
  }, [open, stepIndex, targetRect, popoverHeight]);

  const handleComplete = useCallback(
    (returnHome: boolean) => {
      markOnboardingCompleted();
      if (returnHome && currentRoute !== 'home') {
        onNavigate('home');
      }
      onClose();
    },
    [currentRoute, onClose, onNavigate]
  );

  const handleNext = useCallback(() => {
    if (stepIndex >= ONBOARDING_STEPS.length - 1) {
      handleComplete(true);
      return;
    }
    lastScrolledStepRef.current = null;
    setStepIndex((prev) => prev + 1);
  }, [handleComplete, stepIndex]);

  const handlePrev = useCallback(() => {
    if (stepIndex <= 0) return;
    lastScrolledStepRef.current = null;
    setStepIndex((prev) => prev - 1);
  }, [stepIndex]);

  // Keyboard shortcuts while onboarding is open
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleComplete(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleComplete, handleNext, handlePrev]);

  if (!open) return null;

  const cardWidth = Math.min(396, viewport.w - 24);
  const estHeight = Math.max(240, popoverHeight);
  const margin = 16;

  let cardTop = Math.max(margin, (viewport.h - estHeight) / 2);
  let cardLeft = Math.max(margin, (viewport.w - cardWidth) / 2);

  if (targetRect) {
    const isDesktopSidebar =
      step.id === 'sidebar' && targetRect.left < 60 && targetRect.height > 260 && viewport.w >= 1024;

    if (isDesktopSidebar) {
      cardLeft = Math.min(
        targetRect.left + targetRect.width + 20,
        viewport.w - cardWidth - margin
      );
      cardTop = Math.max(24, Math.min(targetRect.top + 56, viewport.h - estHeight - margin));
    } else {
      const spaceBelow = viewport.h - (targetRect.top + targetRect.height) - margin;
      const spaceAbove = targetRect.top - margin;

      if (spaceBelow >= estHeight + 12) {
        cardTop = targetRect.top + targetRect.height + 14;
      } else if (spaceAbove >= estHeight + 12) {
        cardTop = targetRect.top - estHeight - 14;
      } else {
        cardTop = Math.max(margin, viewport.h - estHeight - margin);
      }

      cardLeft = Math.max(
        margin,
        Math.min(targetRect.left, viewport.w - cardWidth - margin)
      );
    }
  }

  const StepIcon = step.icon;
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-step-title"
    >
      {/* Click-blocking transparent layer */}
      <div
        className="fixed inset-0 bg-transparent"
        onClick={() => handleComplete(false)}
        aria-hidden="true"
      />

      {/* Spotlight cutout frame */}
      {targetRect ? (
        <div
          aria-hidden="true"
          className={`fixed pointer-events-none rounded-2xl border-2 border-[#FF4B3A] ${
            reducedMotion ? '' : 'transition-all duration-300 ease-out'
          }`}
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.58)',
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none bg-slate-900/58"
        />
      )}

      {/* Floating Tour Card */}
      <div
        ref={popoverRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          top: cardTop,
          left: cardLeft,
          width: cardWidth,
        }}
        className={`fixed z-10 bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 space-y-4 ${
          reducedMotion ? '' : 'transition-all duration-300 ease-out'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <StepIcon className="w-4 h-4 text-[#FF4B3A]" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#FF4B3A]">
                Шаг {stepIndex + 1} из {ONBOARDING_STEPS.length} · {step.sectionTag}
              </p>
              <h2
                id="onboarding-step-title"
                className="text-base font-bold text-slate-900 leading-snug mt-0.5"
              >
                {step.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleComplete(false)}
            aria-label="Закрыть гид"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>

        <ul className="space-y-1.5 pt-0.5">
          {step.highlights.map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
              <Compass className="w-3.5 h-3.5 text-[#FF4B3A] shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          {/* Step dots */}
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {ONBOARDING_STEPS.map((item, idx) => (
              <span
                key={item.id}
                className={`h-1.5 rounded-full transition-all ${
                  idx === stepIndex
                    ? 'w-5 bg-[#FF4B3A]'
                    : idx < stepIndex
                      ? 'w-2 bg-slate-400'
                      : 'w-1.5 bg-slate-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleComplete(false)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Пропустить
            </button>

            {stepIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Назад
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#FF4B3A] hover:bg-[#e54030] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              {isLastStep ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Начать работу
                </>
              ) : (
                <>
                  Далее
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
