import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  Flame,
  Pencil,
  Trophy,
  X,
} from 'lucide-react';
import type { IeltsFormat, LeaderboardEntry, UserProfile } from '../types/ielts';
import { getLevelProgress } from '../utils/levelSystem';

interface RankedEntry extends LeaderboardEntry {
  rank: number;
}

interface GlobalLeaderboardProps {
  userProfile: UserProfile;
  initialEntries?: LeaderboardEntry[];
  onUpdateProfile: (patch: Partial<UserProfile>) => Promise<void>;
}

type FormatFilter = 'all' | IeltsFormat;
type ScopeFilter = 'top' | 'around';

export const GlobalLeaderboard: React.FC<GlobalLeaderboardProps> = ({
  userProfile,
  initialEntries = [],
  onUpdateProfile,
}) => {
  const [serverPeers, setServerPeers] = useState<LeaderboardEntry[]>(() =>
    initialEntries.filter((e) => !e.isCurrentUser && e.id !== 'current-user')
  );
  const [isLoading, setIsLoading] = useState(initialEntries.length === 0);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [scope, setScope] = useState<ScopeFilter>('top');

  // Optional username editor state
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(
    userProfile.leaderboardUsername ?? ''
  );
  const [showUsernameDraft, setShowUsernameDraft] = useState(
    Boolean(userProfile.showUsernameOnLeaderboard)
  );
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      streak: String(userProfile.streakDays || 0),
      xp: String(userProfile.xp || 0),
    });

    fetch(`/api/leaderboard?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Не удалось загрузить рейтинг.');
        return (await res.json()) as {
          entries: RankedEntry[];
          currentUserRank: number;
          totalParticipants: number;
        };
      })
      .then((data) => {
        if (!active) return;
        const peers = data.entries
          .filter((e) => !e.isCurrentUser && e.id !== 'current-user')
          .map(({ rank: _rank, ...rest }) => rest);
        setServerPeers(peers);
        setFetchError(null);
      })
      .catch((err) => {
        if (!active) return;
        setFetchError(
          err instanceof Error ? err.message : 'Ошибка загрузки рейтинга.'
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    userProfile.streakDays,
    userProfile.xp,
    userProfile.leaderboardUsername,
    userProfile.showUsernameOnLeaderboard,
    userProfile.format,
    userProfile.targetBand,
  ]);

  const rankedAll = useMemo<RankedEntry[]>(() => {
    const showUsername = Boolean(userProfile.showUsernameOnLeaderboard);
    const trimmedName = (userProfile.leaderboardUsername ?? '').trim();
    const currentUserEntry: LeaderboardEntry = {
      id: 'current-user',
      username: showUsername
        ? trimmedName || userProfile.name?.trim() || undefined
        : undefined,
      showUsername,
      streakDays: userProfile.streakDays || 0,
      xp: userProfile.xp || 0,
      targetBand: userProfile.targetBand || 7.5,
      format: userProfile.format || 'academic',
      lastActiveDate:
        userProfile.lastActiveDate || new Date().toISOString().slice(0, 10),
      isCurrentUser: true,
    };

    const filteredPeers =
      formatFilter === 'all'
        ? serverPeers
        : serverPeers.filter((e) => e.format === formatFilter);

    const includeCurrent =
      formatFilter === 'all' || currentUserEntry.format === formatFilter;

    const combined = includeCurrent
      ? [...filteredPeers, currentUserEntry]
      : filteredPeers;

    combined.sort((a, b) => {
      if (b.streakDays !== a.streakDays) return b.streakDays - a.streakDays;
      if (b.xp !== a.xp) return b.xp - a.xp;
      return b.targetBand - a.targetBand;
    });

    return combined.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }));
  }, [
    serverPeers,
    formatFilter,
    userProfile.showUsernameOnLeaderboard,
    userProfile.leaderboardUsername,
    userProfile.name,
    userProfile.streakDays,
    userProfile.xp,
    userProfile.targetBand,
    userProfile.format,
    userProfile.lastActiveDate,
  ]);

  const currentUserRow = rankedAll.find((e) => e.isCurrentUser) ?? null;

  const visibleEntries = useMemo(() => {
    if (rankedAll.length === 0) return [];
    if (scope === 'around' && currentUserRow) {
      const idx = rankedAll.findIndex((e) => e.isCurrentUser);
      const start = Math.max(0, idx - 3);
      const end = Math.min(rankedAll.length, idx + 4);
      return rankedAll.slice(start, end);
    }
    return rankedAll.slice(0, 10);
  }, [rankedAll, scope, currentUserRow]);

  const showPinnedUserRow =
    scope === 'top' &&
    currentUserRow !== null &&
    !visibleEntries.some((e) => e.isCurrentUser);

  const nextRankEntry = useMemo(() => {
    if (!currentUserRow || currentUserRow.rank <= 1) return null;
    return rankedAll.find((e) => e.rank === currentUserRow.rank - 1) ?? null;
  }, [rankedAll, currentUserRow]);

  const openEditor = () => {
    setUsernameDraft(userProfile.leaderboardUsername ?? '');
    setShowUsernameDraft(
      userProfile.leaderboardUsername
        ? Boolean(userProfile.showUsernameOnLeaderboard)
        : true
    );
    setIsEditingUsername(true);
    setSaveFeedback(null);
  };

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingUsername(true);
    const cleaned = usernameDraft.trim().replace(/\s+/g, ' ').slice(0, 24);
    try {
      await onUpdateProfile({
        leaderboardUsername: cleaned,
        showUsernameOnLeaderboard: cleaned.length > 0 ? showUsernameDraft : false,
      });
      setIsEditingUsername(false);
      setSaveFeedback(
        cleaned.length > 0 && showUsernameDraft
          ? `Username «${cleaned}» отображается в рейтинге`
          : 'Вы участвуете анонимно'
      );
      window.setTimeout(() => setSaveFeedback(null), 3000);
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleToggleVisibility = async () => {
    const nextShow = !userProfile.showUsernameOnLeaderboard;
    if (nextShow && !(userProfile.leaderboardUsername ?? '').trim()) {
      openEditor();
      return;
    }
    setIsSavingUsername(true);
    try {
      await onUpdateProfile({ showUsernameOnLeaderboard: nextShow });
      setSaveFeedback(
        nextShow ? 'Ваш username теперь виден в рейтинге' : 'Username скрыт'
      );
      window.setTimeout(() => setSaveFeedback(null), 2500);
    } finally {
      setIsSavingUsername(false);
    }
  };

  const activePublicUsername = userProfile.showUsernameOnLeaderboard
    ? (userProfile.leaderboardUsername ?? '').trim() || userProfile.name?.trim()
    : '';

  const streakGap =
    nextRankEntry && currentUserRow
      ? Math.max(1, nextRankEntry.streakDays - currentUserRow.streakDays)
      : 0;

  return (
    <section
      aria-label="Глобальный рейтинг по серии дней"
      className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
    >
      {/* Header Row */}
      <div className="px-6 py-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">
              Глобальный рейтинг по Streak
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Ранжирование по непрерывной серии занятий</span>
              {currentUserRow && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-800">
                    Ваше место #{currentUserRow.rank} из {rankedAll.length}
                  </span>
                </>
              )}
              {nextRankEntry && currentUserRow ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    До #{nextRankEntry.rank} осталось{' '}
                    <span className="font-mono tabular-nums font-semibold text-[#FF4B3A]">
                      {streakGap} дн.
                    </span>
                  </span>
                </>
              ) : currentUserRow?.rank === 1 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-emerald-700">
                    Лидер рейтинга
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Interactive Filters */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div
            role="group"
            aria-label="Фильтр по формату IELTS"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            {(
              [
                { id: 'all', label: 'Все' },
                { id: 'academic', label: 'Academic' },
                { id: 'general', label: 'General' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFormatFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  formatFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Диапазон участников"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
          >
            <button
              type="button"
              onClick={() => setScope('top')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                scope === 'top'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Топ-10
            </button>
            <button
              type="button"
              onClick={() => setScope('around')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                scope === 'around'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Рядом со мной
            </button>
          </div>
        </div>
      </div>

      {/* Optional Username Control Strip */}
      <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-100">
        {!isEditingUsername ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
              {activePublicUsername ? (
                <>
                  <span>Вы отображаетесь в таблице как</span>
                  <span className="font-semibold text-slate-900">
                    {activePublicUsername}
                  </span>
                </>
              ) : (
                <span>
                  Сейчас вы отображаетесь как{' '}
                  <span className="font-semibold text-slate-900">
                    Анонимный участник
                  </span>
                  . Укажите username по желанию, чтобы мотивировать себя и других.
                </span>
              )}
              {saveFeedback && (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <Check className="w-3.5 h-3.5" />
                  {saveFeedback}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={openEditor}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                {userProfile.leaderboardUsername ? 'Изменить username' : 'Указать username'}
              </button>
              <button
                type="button"
                disabled={isSavingUsername}
                onClick={handleToggleVisibility}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                {userProfile.showUsernameOnLeaderboard ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                    Скрыть имя
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    Показывать имя
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSaveUsername}
            className="flex flex-col md:flex-row md:items-center justify-between gap-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 min-w-0">
              <label htmlFor="leaderboard-username-input" className="sr-only">
                Username для рейтинга
              </label>
              <input
                id="leaderboard-username-input"
                type="text"
                maxLength={24}
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(e.target.value)}
                placeholder="Например, Alex_Band8 (необязательно)"
                className="w-full sm:max-w-[260px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF4B3A]/30 focus:border-[#FF4B3A]"
              />
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showUsernameDraft}
                  onChange={(e) => setShowUsernameDraft(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#FF4B3A] focus:ring-[#FF4B3A]"
                />
                <span>Показывать мой username в таблице</span>
              </label>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={isSavingUsername}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#FF4B3A] rounded-lg hover:bg-[#e84232] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                <Check className="w-3.5 h-3.5" />
                Сохранить
              </button>
              <button
                type="button"
                onClick={() => setIsEditingUsername(false)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Отмена
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Table Content */}
      {isLoading ? (
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className="px-6 py-3 flex items-center justify-between animate-pulse"
            >
              <div className="flex items-center gap-4">
                <div className="w-6 h-4 bg-slate-100 rounded" />
                <div className="w-36 h-4 bg-slate-100 rounded" />
              </div>
              <div className="w-20 h-4 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : fetchError && rankedAll.length === 0 ? (
        <div className="px-6 py-8 text-center text-xs text-slate-500">
          {fetchError}
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="px-6 py-8 text-center space-y-2">
          <p className="text-sm font-medium text-slate-700">
            Нет участников в выбранном фильтре
          </p>
          <button
            type="button"
            onClick={() => setFormatFilter('all')}
            className="text-xs font-semibold text-[#FF4B3A] hover:underline cursor-pointer"
          >
            Показать всех участников
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-medium text-slate-500">
                <th className="py-2.5 pl-6 pr-3 w-14">#</th>
                <th className="py-2.5 px-3">Участник</th>
                <th className="py-2.5 px-3 hidden sm:table-cell">Направление</th>
                <th className="py-2.5 px-3 text-right hidden md:table-cell">Опыт</th>
                <th className="py-2.5 pl-3 pr-6 text-right">Streak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {visibleEntries.map((entry) => (
                <LeaderboardRow key={entry.id} entry={entry} />
              ))}

              {showPinnedUserRow && currentUserRow && (
                <>
                  <tr>
                    <td
                      colSpan={5}
                      className="py-1.5 text-center text-xs font-mono text-slate-400 bg-slate-50/50"
                    >
                      · · ·
                    </td>
                  </tr>
                  <LeaderboardRow entry={currentUserRow} />
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

const LeaderboardRow: React.FC<{ entry: RankedEntry }> = ({ entry }) => {
  const levelInfo = getLevelProgress(entry.xp);
  const displayName = entry.showUsername && entry.username
    ? entry.username
    : entry.isCurrentUser
    ? 'Вы (никнейм скрыт)'
    : 'Анонимный участник';

  const rankStyle =
    entry.rank === 1
      ? 'text-amber-600 font-bold'
      : entry.rank === 2
      ? 'text-slate-700 font-bold'
      : entry.rank === 3
      ? 'text-orange-700 font-bold'
      : 'text-slate-500 font-medium';

  return (
    <tr
      className={
        entry.isCurrentUser
          ? 'bg-[#FF4B3A]/[0.05] hover:bg-[#FF4B3A]/[0.08] transition-colors'
          : 'hover:bg-slate-50/80 transition-colors'
      }
    >
      <td className={`py-3 pl-6 pr-3 font-mono tabular-nums text-xs ${rankStyle}`}>
        #{entry.rank}
      </td>

      <td className="py-3 px-3 min-w-[160px]">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`truncate ${
              entry.isCurrentUser
                ? 'font-bold text-slate-900'
                : entry.showUsername && entry.username
                ? 'font-medium text-slate-800'
                : 'text-slate-500 italic'
            }`}
          >
            {displayName}
          </span>
          {entry.isCurrentUser && entry.showUsername && entry.username && (
            <span className="text-xs font-semibold text-[#FF4B3A] shrink-0">
              · Вы
            </span>
          )}
        </div>
      </td>

      <td className="py-3 px-3 hidden sm:table-cell text-xs text-slate-500 whitespace-nowrap">
        <span>{entry.format === 'academic' ? 'Academic' : 'General'}</span>
        <span aria-hidden="true" className="mx-1.5">
          ·
        </span>
        <span className="font-mono tabular-nums">
          Цель {entry.targetBand.toFixed(1)}
        </span>
      </td>

      <td className="py-3 px-3 text-right hidden md:table-cell text-xs text-slate-600 font-mono tabular-nums whitespace-nowrap">
        Ур. {levelInfo.level} · {entry.xp} XP
      </td>

      <td className="py-3 pl-3 pr-6 text-right whitespace-nowrap">
        <span className="inline-flex items-center justify-end gap-1.5 font-mono tabular-nums font-bold text-slate-900">
          <Flame
            className={`w-3.5 h-3.5 ${
              entry.streakDays >= 7
                ? 'text-[#FF4B3A]'
                : entry.streakDays > 0
                ? 'text-amber-500'
                : 'text-slate-300'
            }`}
          />
          {entry.streakDays} дн.
        </span>
      </td>
    </tr>
  );
};
