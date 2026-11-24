import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  Shield,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { CoachPersona, CoachVoiceName, UserProfile } from '../types/ielts';

interface SettingsViewProps {
  userProfile: UserProfile;
  onUpdateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  onAudioDeleted: () => Promise<void>;
  onAllUserDataCleared: () => Promise<void>;
}

const VOICES: Array<{ id: CoachVoiceName; label: string }> = [
  { id: 'Kore', label: 'Kore (спокойный нейтральный)' },
  { id: 'Zephyr', label: 'Zephyr (мягкий естественный)' },
  { id: 'Puck', label: 'Puck (живой разговорный)' },
  { id: 'Charon', label: 'Charon (глубокий академический)' },
  { id: 'Fenrir', label: 'Fenrir (выразительный чёткий)' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  userProfile,
  onUpdateProfile,
  onAudioDeleted,
  onAllUserDataCleared,
}) => {
  const [name, setName] = useState(userProfile.name);
  const [targetBand, setTargetBand] = useState(userProfile.targetBand);
  const [examDate, setExamDate] = useState(userProfile.examDate);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(userProfile.dailyGoalMinutes);
  const [leaderboardUsername, setLeaderboardUsername] = useState(
    userProfile.leaderboardUsername ?? ''
  );
  const [showUsernameOnLeaderboard, setShowUsernameOnLeaderboard] = useState(
    Boolean(userProfile.showUsernameOnLeaderboard)
  );
  const [savedNotice, setSavedNotice] = useState(false);
  const [confirmAudioWipe, setConfirmAudioWipe] = useState(false);
  const [confirmFullWipe, setConfirmFullWipe] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedUsername = leaderboardUsername.trim().replace(/\s+/g, ' ').slice(0, 24);
    await onUpdateProfile({
      name: name.trim() || 'Кандидат IELTS',
      targetBand,
      examDate,
      dailyGoalMinutes,
      leaderboardUsername: cleanedUsername,
      showUsernameOnLeaderboard: cleanedUsername.length > 0 ? showUsernameOnLeaderboard : false,
    });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="max-w-[920px] mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Настройки профиля и приватности</h1>
        <p className="text-sm text-slate-600 mt-1">
          Управляйте целевым баллом, голосом AI Coach, хранением аудиозаписей и параметрами доступности.
        </p>
      </div>

      {/* Study Profile */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
      >
        <h2 className="text-base font-bold text-slate-900">Профиль подготовки</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Имя</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Формат по умолчанию
            </label>
            <select
              value={userProfile.format}
              onChange={(e) =>
                onUpdateProfile({ format: e.target.value === 'general' ? 'general' : 'academic' })
              }
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white"
            >
              <option value="academic">IELTS Academic</option>
              <option value="general">IELTS General Training</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Целевой Band Score
            </label>
            <input
              type="number"
              step="0.5"
              min="5.0"
              max="9.0"
              value={targetBand}
              onChange={(e) => setTargetBand(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Дата экзамена (необязательно)
            </label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Дневная цель (минут)
            </label>
            <input
              type="number"
              min="5"
              max="120"
              step="5"
              value={dailyGoalMinutes}
              onChange={(e) => setDailyGoalMinutes(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Username в рейтинге Streak (необязательно)
            </label>
            <input
              type="text"
              maxLength={24}
              value={leaderboardUsername}
              onChange={(e) => setLeaderboardUsername(e.target.value)}
              placeholder="Например, Alex_Band8"
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl"
            />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showUsernameOnLeaderboard}
                onChange={(e) => setShowUsernameOnLeaderboard(e.target.checked)}
                className="rounded border-slate-300 text-[#FF4B3A]"
              />
              <span>Показывать username в глобальном рейтинге</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {savedNotice ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              Сохранено
            </span>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 cursor-pointer"
          >
            Сохранить профиль
          </button>
        </div>
      </form>

      {/* AI Coach & Voice */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-[#FF4B3A]" />
          Голос и характер AI Coach
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Характер</label>
            <select
              value={userProfile.coachPersona}
              onChange={(e) =>
                onUpdateProfile({ coachPersona: e.target.value as CoachPersona })
              }
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white"
            >
              <option value="classic">Классический</option>
              <option value="strict">Требовательный</option>
              <option value="supportive">Поддерживающий</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Голос Gemini TTS</label>
            <select
              value={userProfile.coachVoice}
              onChange={(e) =>
                onUpdateProfile({ coachVoice: e.target.value as CoachVoiceName })
              }
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white"
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Скорость речи ({userProfile.coachSpeed.toFixed(2)}x)
            </label>
            <select
              value={userProfile.coachSpeed}
              onChange={(e) => onUpdateProfile({ coachSpeed: Number(e.target.value) })}
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white"
            >
              <option value={0.85}>0.85x (Медленнее)</option>
              <option value={1.0}>1.00x (Стандарт)</option>
              <option value={1.1}>1.10x (Живой темп)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Accessibility */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
        <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
          <Eye className="w-4 h-4 text-blue-700" />
          Доступность и отображение
        </h2>
        <label className="flex items-center justify-between py-2 text-sm text-slate-700 cursor-pointer">
          <span>Увеличенный размер шрифта интерфейса</span>
          <input
            type="checkbox"
            checked={userProfile.fontSize === 'large'}
            onChange={(e) =>
              onUpdateProfile({ fontSize: e.target.checked ? 'large' : 'normal' })
            }
            className="w-4 h-4 accent-blue-700"
          />
        </label>
        <label className="flex items-center justify-between py-2 text-sm text-slate-700 cursor-pointer border-t border-slate-100">
          <span>Повышенная контрастность границ и текста</span>
          <input
            type="checkbox"
            checked={userProfile.highContrast}
            onChange={(e) => onUpdateProfile({ highContrast: e.target.checked })}
            className="w-4 h-4 accent-blue-700"
          />
        </label>
        <label className="flex items-center justify-between py-2 text-sm text-slate-700 cursor-pointer border-t border-slate-100">
          <span>Уменьшить анимации (Reduced Motion)</span>
          <input
            type="checkbox"
            checked={userProfile.reducedMotion}
            onChange={(e) => onUpdateProfile({ reducedMotion: e.target.checked })}
            className="w-4 h-4 accent-blue-700"
          />
        </label>
        <label className="flex items-center justify-between py-2 text-sm text-slate-700 cursor-pointer border-t border-slate-100">
          <span>Показывать приветственный баннер AI Coach на главной</span>
          <input
            type="checkbox"
            checked={userProfile.showHeroBanner}
            onChange={(e) => onUpdateProfile({ showHeroBanner: e.target.checked })}
            className="w-4 h-4 accent-blue-700"
          />
        </label>
      </div>

      {/* Audio Privacy & Data Export/Delete */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-700" />
          Приватность аудио и управление данными
        </h2>

        <label className="flex items-center justify-between py-2 text-sm text-slate-700 cursor-pointer">
          <div>
            <span className="font-medium block">Сохранять аудиозаписи Speaking для повторного прослушивания</span>
            <span className="text-xs text-slate-500">
              Если выключено, аудио используется только для оценки ИИ и сразу удаляется (остаются транскрипты).
            </span>
          </div>
          <input
            type="checkbox"
            checked={userProfile.storeAudioRecordings}
            onChange={(e) => onUpdateProfile({ storeAudioRecordings: e.target.checked })}
            className="w-4 h-4 accent-blue-700 shrink-0 ml-4"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <a
            href="/api/user-data/export"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 rounded-xl hover:bg-slate-200"
          >
            <Download className="w-4 h-4" />
            Экспортировать все данные (JSON)
          </a>

          {!confirmAudioWipe ? (
            <button
              type="button"
              onClick={() => setConfirmAudioWipe(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Удалить только аудиозаписи
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                await onAudioDeleted();
                setConfirmAudioWipe(false);
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-amber-600 rounded-xl cursor-pointer"
            >
              Подтвердить удаление аудио
            </button>
          )}

          {!confirmFullWipe ? (
            <button
              type="button"
              onClick={() => setConfirmFullWipe(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              Очистить весь прогресс
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                await onAllUserDataCleared();
                setConfirmFullWipe(false);
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-xl cursor-pointer"
            >
              Подтвердить полную очистку
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
