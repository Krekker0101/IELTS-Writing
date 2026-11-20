import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ErrorJournalEntry,
  PersonalizedExercise,
  Submission,
} from '../types/ielts';
import { useAIStatus } from '../contexts/AIStatusContext';

interface ProgressViewProps {
  submissions: Submission[];
  errorJournal: ErrorJournalEntry[];
  exercises: PersonalizedExercise[];
  onOpenSubmission: (sub: Submission) => void;
  onExercisesUpdated: (exercises: PersonalizedExercise[]) => void;
  onJournalUpdated: (journal: ErrorJournalEntry[]) => void;
  onUserDataCleared: () => void;
}

export const ProgressView: React.FC<ProgressViewProps> = ({
  submissions,
  errorJournal,
  exercises,
  onOpenSubmission,
  onExercisesUpdated,
  onJournalUpdated,
  onUserDataCleared,
}) => {
  const { beginProcessing, endProcessing } = useAIStatus();
  const [selectedRuleKey, setSelectedRuleKey] = useState<string | null>(
    errorJournal[0]?.key ?? null
  );
  const [isGeneratingEx, setIsGeneratingEx] = useState(false);
  const [exError, setExError] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [confirmWipe, setConfirmWipe] = useState(false);

  // Recharts trend controls
  const [chartScope, setChartScope] = useState<'all' | 'criteria'>('all');
  const [revisionBasis, setRevisionBasis] = useState<'latest' | 'initial'>('latest');
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>({
    overallBand: true,
    taskAchievement: true,
    coherence: true,
    lexical: true,
    grammar: true,
  });

  // Chronological Band + 4 IELTS criteria points
  const bandPoints = useMemo(() => {
    const ordered = [...submissions].reverse();
    return ordered.map((s, idx) => {
      const pickRev = (part: Submission['task1']) => {
        if (!part || part.revisions.length === 0) return undefined;
        return revisionBasis === 'initial'
          ? part.revisions[0]
          : part.revisions[part.revisions.length - 1];
      };

      const r1 = pickRev(s.task1);
      const r2 = pickRev(s.task2);
      const activeRevs = [r1, r2].filter((r): r is NonNullable<typeof r> => Boolean(r));

      // Compute weighted Band (2x Task 2 when both present) or single task Band
      let overallBand = 0;
      if (r1 && r2) {
        overallBand =
          Math.round(((r1.evaluation.taskBand + r2.evaluation.taskBand * 2) / 3) * 2) / 2;
      } else if (r2) {
        overallBand = r2.evaluation.taskBand;
      } else if (r1) {
        overallBand = r1.evaluation.taskBand;
      }

      const avgCriterion = (matcher: (name: string) => boolean): number | undefined => {
        const vals: number[] = [];
        for (const rev of activeRevs) {
          const weight = activeRevs.length === 2 && rev === r2 ? 2 : 1;
          const found = rev.evaluation.criteria.find((c) => matcher(c.name));
          if (found) {
            for (let w = 0; w < weight; w++) vals.push(found.band);
          }
        }
        if (vals.length === 0) return undefined;
        return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
      };

      return {
        indexLabel: `#${idx + 1}`,
        dateLabel: new Date(s.createdAt).toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
        }),
        title: s.mockTestTitle ?? s.task2?.taskTitle ?? s.task1?.taskTitle ?? `Работа #${idx + 1}`,
        overallBand,
        taskAchievement: avgCriterion((n) => {
          const l = n.toLowerCase();
          return l.includes('achievement') || l.includes('response');
        }),
        coherence: avgCriterion((n) => n.toLowerCase().includes('coherence')),
        lexical: avgCriterion((n) => n.toLowerCase().includes('lexical')),
        grammar: avgCriterion((n) => n.toLowerCase().includes('grammatical')),
      };
    });
  }, [submissions, revisionBasis]);

  const seriesMeta = [
    { key: 'overallBand', label: 'Overall Band', color: '#0f172a', strokeWidth: 3 },
    { key: 'taskAchievement', label: 'Task Achievement / Response', color: '#1d4ed8', strokeWidth: 2 },
    { key: 'coherence', label: 'Coherence & Cohesion', color: '#0f766e', strokeWidth: 2 },
    { key: 'lexical', label: 'Lexical Resource', color: '#d97706', strokeWidth: 2 },
    { key: 'grammar', label: 'Grammatical Range & Accuracy', color: '#dc2626', strokeWidth: 2 },
  ] as const;

  const toggleSeries = (key: string) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Average by 4 official criteria
  const criteriaAverages = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of submissions) {
      for (const part of [s.task1, s.task2]) {
        if (!part) continue;
        const latest = part.revisions[part.revisions.length - 1];
        for (const c of latest.evaluation.criteria) {
          const normalizedName =
            c.name === 'Task Achievement' || c.name === 'Task Response'
              ? 'Task Achievement / Response'
              : c.name;
          const arr = map.get(normalizedName) ?? [];
          arr.push(c.band);
          map.set(normalizedName, arr);
        }
      }
    }
    return Array.from(map.entries()).map(([name, vals]) => ({
      name,
      avg: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1),
    }));
  }, [submissions]);

  // Breakdown by task type
  const taskTypeAverages = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of submissions) {
      for (const part of [s.task1, s.task2]) {
        if (!part) continue;
        const latest = part.revisions[part.revisions.length - 1];
        const arr = map.get(part.taskType) ?? [];
        arr.push(latest.evaluation.taskBand);
        map.set(part.taskType, arr);
      }
    }
    return Array.from(map.entries()).map(([type, vals]) => ({
      type,
      count: vals.length,
      avg: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1),
    }));
  }, [submissions]);

  const selectedEntry =
    errorJournal.find((e) => e.key === selectedRuleKey) ?? errorJournal[0] ?? null;

  const handleGenerateExercises = async () => {
    setExError(null);
    setIsGeneratingEx(true);
    beginProcessing('Генерация персональных упражнений');
    try {
      const res = await fetch('/api/exercises/generate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось создать упражнения.');
      onExercisesUpdated(data.exercises as PersonalizedExercise[]);
    } catch (err) {
      setExError(err instanceof Error ? err.message : 'Ошибка генерации упражнений.');
    } finally {
      setIsGeneratingEx(false);
      endProcessing();
    }
  };

  const handleAnswerExercise = async (exerciseId: string, optionIdx: number) => {
    setSelectedAnswers((prev) => ({ ...prev, [exerciseId]: optionIdx }));
    try {
      const res = await fetch(`/api/exercises/${exerciseId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedIndex: optionIdx }),
      });
      const data = await res.json();
      if (res.ok) {
        const updatedEx = data.exercise as PersonalizedExercise;
        onExercisesUpdated(
          exercises.map((e) => (e.id === updatedEx.id ? updatedEx : e))
        );
        onJournalUpdated(data.errorJournal as ErrorJournalEntry[]);
      }
    } catch {
      // ignore network blip
    }
  };

  const handleWipeUserData = async () => {
    const res = await fetch('/api/user-data', { method: 'DELETE' });
    if (res.ok) {
      setConfirmWipe(false);
      onUserDataCleared();
    }
  };

  return (
    <div className="max-w-[1240px] mx-auto px-6 py-10 space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Динамика Band Score · Нормализованный журнал ошибок · Закрепление навыков
          </p>
          <h1 className="text-3xl font-semibold text-slate-900 mt-1">
            Прогресс, журнал ошибок и упражнения
          </h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <a
            href="/api/user-data/export"
            download="ielts-writing-lab-export.json"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Экспорт данных (JSON)
          </a>
          {!confirmWipe ? (
            <button
              type="button"
              onClick={() => setConfirmWipe(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-slate-200 rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Очистить историю
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <span className="text-xs text-red-800">Удалить все работы?</span>
              <button
                type="button"
                onClick={handleWipeUserData}
                className="text-xs font-semibold text-red-700 hover:underline cursor-pointer"
              >
                Да
              </button>
              <button
                type="button"
                onClick={() => setConfirmWipe(false)}
                className="text-xs text-slate-600 hover:underline cursor-pointer"
              >
                Нет
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Analytics Row: Recharts Band & Criteria Trends + Breakdown */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Динамика Band Score и критериев IELTS
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Отслеживайте прогресс общего балла и четырёх официальных критериев от работы к работе.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setChartScope('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                    chartScope === 'all'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Общий + критерии
                </button>
                <button
                  type="button"
                  onClick={() => setChartScope('criteria')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                    chartScope === 'criteria'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Только 4 критерия
                </button>
              </div>

              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setRevisionBasis('latest')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                    revisionBasis === 'latest'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Финальная
                </button>
                <button
                  type="button"
                  onClick={() => setRevisionBasis('initial')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                    revisionBasis === 'initial'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Версия 1
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Criterion Filter Controls */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {seriesMeta
              .filter((s) => (chartScope === 'criteria' ? s.key !== 'overallBand' : true))
              .map((s) => {
                const active = visibleSeries[s.key];
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleSeries(s.key)}
                    className={`inline-flex items-center gap-2 px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-white border-slate-300 text-slate-900 font-medium'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    }`}
                  >
                    <span
                      className="w-2.5 h-1 rounded-sm shrink-0"
                      style={{ backgroundColor: active ? s.color : '#cbd5e1' }}
                    />
                    {s.label}
                  </button>
                );
              })}
          </div>

          {bandPoints.length === 0 ? (
            <div className="py-14 text-center border border-dashed border-slate-200 rounded-lg">
              <p className="text-sm font-medium text-slate-700">
                График тренда появится после первой проверенной работы
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Здесь отобразятся изменения Overall Band, Task Achievement/Response, Coherence, Lexical Resource и Grammar.
              </p>
            </div>
          ) : (
            <div className="h-[290px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={bandPoints}
                  margin={{ top: 12, right: 16, left: -12, bottom: 4 }}
                >
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="indexLabel"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[3.5, 9]}
                    ticks={[4, 5, 6, 7, 8, 9]}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ReferenceLine
                    y={7}
                    stroke="#cbd5e1"
                    strokeDasharray="4 4"
                    label={{
                      value: 'Band 7.0',
                      position: 'insideTopRight',
                      fill: '#64748b',
                      fontSize: 10,
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const pt = payload[0]?.payload as (typeof bandPoints)[number] | undefined;
                      if (!pt) return null;
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-md text-xs space-y-1.5 max-w-[260px]">
                          <p className="font-semibold text-slate-900 truncate">{pt.title}</p>
                          <p className="text-[11px] text-slate-500">
                            {pt.indexLabel} · {pt.dateLabel}
                          </p>
                          <div className="pt-1 border-t border-slate-100 space-y-1">
                            {payload.map((entry) => (
                              <div
                                key={String(entry.dataKey)}
                                className="flex items-center justify-between gap-4"
                              >
                                <span className="flex items-center gap-1.5 text-slate-700">
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: entry.color }}
                                  />
                                  {entry.name}
                                </span>
                                <span className="font-mono tabular-nums font-semibold text-slate-900">
                                  {typeof entry.value === 'number'
                                    ? entry.value.toFixed(1)
                                    : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }}
                  />
                  {seriesMeta
                    .filter((s) =>
                      chartScope === 'criteria'
                        ? s.key !== 'overallBand' && visibleSeries[s.key]
                        : visibleSeries[s.key]
                    )
                    .map((s) => (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={s.color}
                        strokeWidth={s.strokeWidth}
                        dot={{ r: 4, fill: '#ffffff', strokeWidth: 2 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">
              Средний балл по критериям
            </h2>
            {criteriaAverages.length === 0 ? (
              <p className="text-xs text-slate-500">Нет данных</p>
            ) : (
              <div className="space-y-3">
                {criteriaAverages.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between text-xs pb-2 border-b border-slate-100 last:border-0"
                  >
                    <span className="text-slate-700 pr-2">{c.name}</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {c.avg}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">
              По типам заданий
            </h2>
            {taskTypeAverages.length === 0 ? (
              <p className="text-xs text-slate-500">Нет данных</p>
            ) : (
              <div className="space-y-3">
                {taskTypeAverages.map((t) => (
                  <div
                    key={t.type}
                    className="flex items-center justify-between text-xs pb-2 border-b border-slate-100 last:border-0"
                  >
                    <span className="text-slate-700 truncate pr-2">
                      {t.type} ({t.count})
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {t.avg}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Error Journal (Section 16) */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Персональный журнал повторяющихся ошибок
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Частота ошибок нормализована на 1000 написанных слов, чтобы корректно сравнивать Task 1 и Task 2.
            Правило считается закреплённым после 3 верных ответов подряд в независимых упражнениях.
          </p>
        </div>

        {errorJournal.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            После первой проверки эссе здесь появятся ваши повторяющиеся ошибки и примеры из текста.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
              {errorJournal.map((entry) => {
                const isSelected = selectedEntry?.key === entry.key;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setSelectedRuleKey(entry.key)}
                    className={`w-full text-left px-5 py-3.5 border-b border-slate-100 last:border-0 transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">
                        {entry.subRule}
                      </span>
                      <span className="text-xs font-mono tabular-nums font-semibold text-slate-900">
                        {entry.occurrences} повторений
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {entry.category} · {entry.normalizedPer1000Words} / 1000 сл.
                      </span>
                      <span
                        className={
                          entry.mastered ? 'text-emerald-700 font-semibold' : 'text-slate-600'
                        }
                      >
                        {entry.mastered
                          ? 'Закреплено (3/3)'
                          : `Закрепление: ${entry.masteryStreak}/3`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              {selectedEntry && (
                <>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <p className="text-xs text-slate-500">{selectedEntry.category}</p>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {selectedEntry.subRule}
                      </h3>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-600">
                      {selectedEntry.normalizedPer1000Words} ошибок / 1000 слов
                    </span>
                  </div>

                  <div className="space-y-3">
                    {selectedEntry.examples.map((ex, i) => (
                      <div
                        key={i}
                        className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 text-xs space-y-1.5"
                      >
                        <p className="text-slate-500">
                          {ex.taskTitle} · {new Date(ex.createdAt).toLocaleDateString('ru-RU')}
                        </p>
                        <p className="text-red-700 line-through">{ex.originalPhrase}</p>
                        <p className="text-emerald-800 font-semibold">→ {ex.correction}</p>
                        <p className="text-slate-600">{ex.explanation}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Personalized Exercises (Section 17) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Персональные упражнения
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              ИИ создаёт короткие задания строго по вашим проблемным категориям из журнала ошибок.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateExercises}
            disabled={isGeneratingEx || errorJournal.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            {isGeneratingEx ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Сгенерировать упражнения
          </button>
        </div>

        {exError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {exError}
          </p>
        )}

        {exercises.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            Нажмите «Сгенерировать упражнения» после проверки вашей первой работы.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {exercises.map((ex) => {
              const chosen = selectedAnswers[ex.id];
              const isAnswered = ex.completed || chosen !== undefined;
              return (
                <div
                  key={ex.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      {ex.category} · {ex.targetSubRule}
                    </span>
                    {ex.completed && (
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          ex.answeredCorrectly ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {ex.answeredCorrectly ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Верно
                          </>
                        ) : (
                          'Нужна практика'
                        )}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-slate-900">{ex.prompt}</p>
                  <p className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3 font-medium">
                    {ex.sentenceWithBlankOrError}
                  </p>
                  <div className="space-y-1.5">
                    {ex.options.map((opt, idx) => {
                      const isCorrectOpt = idx === ex.correctIndex;
                      const isUserPick = chosen === idx;
                      let cls = 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800';
                      if (isAnswered) {
                        if (isCorrectOpt) {
                          cls = 'border-emerald-300 bg-emerald-50 text-emerald-900 font-medium';
                        } else if (isUserPick) {
                          cls = 'border-red-300 bg-red-50 text-red-900';
                        }
                      }
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={isAnswered}
                          onClick={() => handleAnswerExercise(ex.id, idx)}
                          className={`w-full text-left px-3 py-2 text-xs rounded-lg border transition-colors cursor-pointer ${cls}`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {isAnswered && (
                    <p className="text-xs text-slate-600 pt-1">{ex.explanation}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* History Table (Section 18) */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">
          История написанных работ ({submissions.length})
        </h2>
        {submissions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            История пуста.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <th className="text-left py-3 px-4 font-semibold">Дата</th>
                  <th className="text-left py-3 px-4 font-semibold">Работа</th>
                  <th className="text-left py-3 px-4 font-semibold">Формат</th>
                  <th className="text-right py-3 px-4 font-semibold">Слова</th>
                  <th className="text-right py-3 px-4 font-semibold">Редакции</th>
                  <th className="text-right py-3 px-4 font-semibold">Band</th>
                  <th className="text-right py-3 px-4 font-semibold">Отчёт</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => {
                  const t1Latest = sub.task1?.revisions[sub.task1.revisions.length - 1];
                  const t2Latest = sub.task2?.revisions[sub.task2.revisions.length - 1];
                  const totalWords =
                    (t1Latest?.wordCount ?? 0) + (t2Latest?.wordCount ?? 0);
                  const maxRevs = Math.max(
                    sub.task1?.revisions.length ?? 0,
                    sub.task2?.revisions.length ?? 0
                  );
                  const band =
                    sub.overallWritingBand ??
                    t2Latest?.evaluation.taskBand ??
                    t1Latest?.evaluation.taskBand;

                  return (
                    <tr
                      key={sub.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                    >
                      <td className="py-3 px-4 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                        {new Date(sub.createdAt).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {sub.mockTestTitle ??
                          sub.task2?.taskTitle ??
                          sub.task1?.taskTitle}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {sub.format === 'academic' ? 'Academic' : 'General'} ·{' '}
                        {sub.overallWritingBand !== undefined ? 'Mock Test' : 'Single'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        {totalWords}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        v{maxRevs}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {band?.toFixed(1) ?? '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenSubmission(sub)}
                          className="text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer whitespace-nowrap"
                        >
                          Открыть →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
