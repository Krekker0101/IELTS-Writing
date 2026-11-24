import React, { useState } from 'react';
import {
  BookOpen,
  CalendarCheck,
  Compass,
  FileEdit,
  Flame,
  Home,
  Layers,
  Menu,
  Mic,
  PenTool,
  Settings,
  Shield,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { AIStatusIndicator } from './AIStatusIndicator';
import { CoachMascot } from './CoachMascot';
import { VoiceCommandButton } from './VoiceCommandControl';
import type { UserProfile } from '../types/ielts';
import { getLevelProgress } from '../utils/levelSystem';

export type AppRoute =
  | 'home'
  | 'study-plan'
  | 'mock'
  | 'practice1'
  | 'practice2'
  | 'topics'
  | 'speaking'
  | 'coach'
  | 'progress'
  | 'settings'
  | 'admin'
  | 'workspace'
  | 'speaking-workspace'
  | 'speaking-report'
  | 'report';

export interface VoiceControlSlotProps {
  isSupported: boolean;
  isListening: boolean;
  onToggle: () => void;
  onOpenHelp: () => void;
}

interface SidebarNavProps {
  currentRoute: AppRoute;
  userProfile: UserProfile;
  onNavigate: (route: AppRoute) => void;
  onReplayOnboarding?: () => void;
  voiceControl?: VoiceControlSlotProps;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  currentRoute,
  userProfile,
  onNavigate,
  onReplayOnboarding,
  voiceControl,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const levelInfo = getLevelProgress(userProfile.xp);

  const mainNav: Array<{
    id: AppRoute;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    featured?: boolean;
  }> = [
    { id: 'home', label: 'Главная', icon: Home },
    { id: 'study-plan', label: 'Учебный план', icon: CalendarCheck },
    { id: 'mock', label: 'Writing Mock', icon: PenTool },
    { id: 'practice1', label: 'Writing Task 1', icon: Layers },
    { id: 'practice2', label: 'Writing Task 2', icon: BookOpen },
    { id: 'topics', label: 'Мои темы', icon: FileEdit },
    { id: 'speaking', label: 'Speaking Lab', icon: Mic, badge: 'NEW' },
    { id: 'coach', label: 'AI Coach', icon: Sparkles, badge: 'LIVE', featured: true },
    { id: 'progress', label: 'Прогресс и ошибки', icon: TrendingUp },
  ];

  const handleSelect = (id: AppRoute) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  const renderLinks = () => (
    <div className="flex flex-col h-full">
      {/* Brand Header matching screenshot clean sidebar */}
      <div className="px-5 h-16 flex items-center justify-between border-b border-slate-100 shrink-0">
        <button
          type="button"
          onClick={() => handleSelect('home')}
          className="flex items-center gap-2.5 text-left cursor-pointer group"
        >
          <CoachMascot
            size="sm"
            persona={userProfile.coachPersona}
            reducedMotion={userProfile.reducedMotion}
          />
          <div>
            <span className="text-base font-bold tracking-tight text-slate-900 block leading-none group-hover:text-[#FF4B3A] transition-colors">
              IELTS Lab
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              Writing &amp; Speaking
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
          aria-label="Закрыть меню"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Nav Links */}
      <nav className="flex-1 px-3.5 py-4 space-y-1 overflow-y-auto">
        {mainNav.map((item) => {
          const Icon = item.icon;
          const active = currentRoute === item.id;

          if (item.featured) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer my-2 ${
                  active
                    ? 'bg-[#e03828] text-white shadow-sm'
                    : 'bg-[#FF4B3A] text-white hover:bg-[#e84232] shadow-sm'
                }`}
              >
                <span className="flex items-center gap-2.5 whitespace-nowrap">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.badge && (
                  <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded uppercase tracking-wide">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                active
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 whitespace-nowrap">
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#FF4B3A]' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </span>
              {item.badge && (
                <span className="text-[10px] font-bold text-white bg-[#FF4B3A] px-1.5 py-0.5 rounded uppercase">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Profile, Settings & Admin */}
      <div className="px-3.5 py-3 border-t border-slate-100 space-y-1 shrink-0">
        <div className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100 mb-2 space-y-1.5">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="font-semibold text-slate-800 truncate">{userProfile.name}</span>
            <span className="font-mono tabular-nums font-semibold text-amber-700 inline-flex items-center gap-1 shrink-0">
              <Flame className="w-3.5 h-3.5 text-[#FF4B3A]" />
              {userProfile.streakDays}д
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600">
            <span className="font-sans font-semibold text-slate-800">
              Ур. {levelInfo.level} · {levelInfo.title}
            </span>
            <span>{levelInfo.totalXp} XP</span>
          </div>
          <div
            className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden"
            title={`До уровня ${levelInfo.level + 1}: ${levelInfo.xpRemaining} XP`}
          >
            <div
              className="h-full bg-[#FF4B3A] rounded-full transition-all duration-300"
              style={{ width: `${levelInfo.progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500 font-mono tabular-nums">
            Цель Band {userProfile.targetBand.toFixed(1)} · ещё {levelInfo.xpRemaining} XP
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleSelect('settings')}
          className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
            currentRoute === 'settings'
              ? 'bg-slate-100 text-slate-900 font-semibold'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Настройки</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelect('admin')}
          className={`w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
            currentRoute === 'admin'
              ? 'bg-slate-100 text-slate-900 font-semibold'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Shield className="w-4 h-4 text-slate-400" />
          <span>Админ-панель</span>
        </button>

        {onReplayOnboarding && (
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onReplayOnboarding();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <Compass className="w-4 h-4 text-slate-400" />
            <span>Гид по платформе</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Left Sidebar */}
      <aside
        data-onboarding="sidebar"
        className="hidden lg:flex lg:flex-col lg:w-[252px] lg:shrink-0 lg:sticky lg:top-0 lg:h-screen bg-white border-r border-slate-200 z-30"
      >
        {renderLinks()}
      </aside>

      {/* Mobile Top Header */}
      <header
        data-onboarding="mobile-nav"
        className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 h-14 flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-1 rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer"
            aria-label="Открыть навигацию"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => handleSelect('home')}
            className="flex items-center gap-2 cursor-pointer"
          >
            <CoachMascot
              size="sm"
              persona={userProfile.coachPersona}
              reducedMotion={userProfile.reducedMotion}
            />
            <span className="font-bold text-sm text-slate-900">IELTS Lab</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono tabular-nums font-bold text-slate-700 whitespace-nowrap">
            Ур.{levelInfo.level} · {levelInfo.totalXp} XP
          </span>
          {voiceControl && (
            <VoiceCommandButton
              compact
              isSupported={voiceControl.isSupported}
              isListening={voiceControl.isListening}
              onToggle={voiceControl.onToggle}
              onOpenHelp={voiceControl.onOpenHelp}
            />
          )}
          <AIStatusIndicator compact />
          <button
            type="button"
            onClick={() => handleSelect('speaking')}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#FF4B3A] rounded-lg whitespace-nowrap cursor-pointer"
          >
            Speaking
          </button>
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px] bg-slate-100"
          aria-hidden="true"
        >
          <div
            className="h-full bg-[#FF4B3A] transition-all duration-300"
            style={{ width: `${levelInfo.progressPercent}%` }}
          />
        </div>
      </header>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white h-full shadow-xl z-10">
            {renderLinks()}
          </div>
        </div>
      )}
    </>
  );
};

interface TopContextBarProps {
  currentRoute: AppRoute;
  xp: number;
  onNavigate: (route: AppRoute) => void;
  voiceControl?: VoiceControlSlotProps;
}

const ROUTE_TITLES: Record<AppRoute, string> = {
  home: 'Главная панель подготовки',
  'study-plan': 'Персональный учебный план',
  mock: 'Writing Mock Tests (60 минут)',
  practice1: 'Writing Task 1 · Тренировка',
  practice2: 'Writing Task 2 · Тренировка',
  topics: 'Мои темы Writing',
  speaking: 'Speaking Lab · Экзамен и практика',
  coach: 'AI Coach · Живая разговорная практика',
  progress: 'Прогресс, журнал ошибок и упражнения',
  settings: 'Настройки профиля и приватности',
  admin: 'Администрирование библиотеки',
  workspace: 'Экзаменационная студия Writing',
  'speaking-workspace': 'Голосовая студия Speaking',
  'speaking-report': 'Диагностический отчёт Speaking',
  report: 'Диагностический отчёт Writing',
};

export const TopContextBar: React.FC<TopContextBarProps> = ({
  currentRoute,
  xp,
  onNavigate,
  voiceControl,
}) => {
  const levelInfo = getLevelProgress(xp);

  return (
    <div className="hidden lg:flex sticky top-0 z-20 h-14 bg-white/90 backdrop-blur-sm border-b border-slate-200 px-8 items-center justify-between gap-4">
      <span className="text-sm font-medium text-slate-600 truncate">
        {ROUTE_TITLES[currentRoute] ?? 'IELTS Writing & Speaking Lab'}
      </span>

      <div className="flex items-center gap-3 shrink-0">
        {/* Level & XP Progress Bar in Top Bar */}
        <button
          type="button"
          onClick={() => onNavigate('progress')}
          title={`Уровень ${levelInfo.level} (${levelInfo.title}): ${levelInfo.totalXp} XP · До следующего уровня осталось ${levelInfo.xpRemaining} XP`}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span className="text-xs font-bold text-slate-900">
            Ур. {levelInfo.level} · {levelInfo.title}
          </span>
          <div
            className="w-24 xl:w-32 h-2 bg-slate-200 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={levelInfo.progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Прогресс уровня ${levelInfo.level}`}
          >
            <div
              className="h-full bg-[#FF4B3A] rounded-full transition-all duration-300"
              style={{ width: `${levelInfo.progressPercent}%` }}
            />
          </div>
          <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-600">
            {levelInfo.xpIntoLevel}/{levelInfo.xpRequiredForLevel} XP
          </span>
        </button>

        {voiceControl && (
          <VoiceCommandButton
            isSupported={voiceControl.isSupported}
            isListening={voiceControl.isListening}
            onToggle={voiceControl.onToggle}
            onOpenHelp={voiceControl.onOpenHelp}
          />
        )}

        <AIStatusIndicator />
        <button
          type="button"
          onClick={() => onNavigate('speaking')}
          className="px-3.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Speaking Mock
        </button>
        <button
          type="button"
          onClick={() => onNavigate('mock')}
          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Writing Mock
        </button>
      </div>
    </div>
  );
};
