import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Compass,
  Mic,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  SpeakingMockTest,
  SpeakingMode,
  SpeakingPartNumber,
  SpeakingQuestionItem,
  SpeakingTopic,
} from '../types/ielts';

interface SpeakingHubViewProps {
  speakingTopics: SpeakingTopic[];
  speakingMockTests: SpeakingMockTest[];
  onStartMock: (mock: SpeakingMockTest, mode: SpeakingMode) => void;
  onStartTopic: (topic: SpeakingTopic, mode: SpeakingMode) => void;
  onTopicCreated: (topic: SpeakingTopic) => void;
  onTopicDeleted: (id: string) => void;
}

export const SpeakingHubView: React.FC<SpeakingHubViewProps> = ({
  speakingTopics,
  speakingMockTests,
  onStartMock,
  onStartTopic,
  onTopicCreated,
  onTopicDeleted,
}) => {
  const [tab, setTab] = useState<'mock' | 'part1' | 'part2' | 'part3' | 'custom'>('mock');
  const [mode, setMode] = useState<SpeakingMode>('practice');

  // Custom Speaking topic form state
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customPart, setCustomPart] = useState<SpeakingPartNumber>(1);
  const [cuePrompt, setCuePrompt] = useState('');
  const [cueBulletsText, setCueBulletsText] = useState('');
  const [linkedPart3Id, setLinkedPart3Id] = useState('');
  const [draftQuestions, setDraftQuestions] = useState<SpeakingQuestionItem[]>([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const part3Topics = useMemo(
    () => speakingTopics.filter((t) => t.part === 3),
    [speakingTopics]
  );

  const filteredTopics = useMemo(() => {
    if (tab === 'part1') return speakingTopics.filter((t) => t.part === 1);
    if (tab === 'part2') return speakingTopics.filter((t) => t.part === 2);
    if (tab === 'part3') return speakingTopics.filter((t) => t.part === 3);
    if (tab === 'custom') return speakingTopics.filter((t) => t.isCustom);
    return [];
  }, [speakingTopics, tab]);

  const handleAddUserQuestion = () => {
    const trimmed = newQuestionText.trim();
    if (!trimmed) return;
    setDraftQuestions((prev) => [
      ...prev,
      { id: `usr-q-${Date.now()}-${prev.length}`, text: trimmed, source: 'user' },
    ]);
    setNewQuestionText('');
  };

  const handleSuggestAiQuestions = async () => {
    if (!customTitle.trim()) {
      setFormError('Сначала введите название темы.');
      return;
    }
    setFormError(null);
    setAiLoading(true);
    try {
      const res = await fetch('/api/speaking/suggest-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: customTitle.trim(),
          part: customPart,
          description: customDesc.trim(),
          existingQuestions: draftQuestions.map((q) => q.text),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось сгенерировать вопросы.');
      setDraftQuestions((prev) => [...prev, ...(data.questions || [])]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Ошибка генерации вопросов.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreateCustomTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!customTitle.trim()) {
      setFormError('Введите название темы.');
      return;
    }

    const questionsToSave =
      customPart === 2
        ? [
            {
              id: `cue-q-${Date.now()}`,
              text: cuePrompt.trim() || `Describe ${customTitle.trim()}. Speak for 1 to 2 minutes.`,
              source: 'user' as const,
            },
          ]
        : draftQuestions.length > 0
        ? draftQuestions
        : newQuestionText.trim()
        ? [{ id: `usr-q-${Date.now()}`, text: newQuestionText.trim(), source: 'user' as const }]
        : [];

    if (customPart !== 2 && questionsToSave.length === 0) {
      setFormError('Добавьте хотя бы один вопрос или сгенерируйте доп. вопросы с ИИ.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/speaking/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: customTitle.trim(),
          description: customDesc.trim(),
          part: customPart,
          questions: questionsToSave,
          cueCard:
            customPart === 2
              ? {
                  prompt: cuePrompt.trim() || `Describe ${customTitle.trim()}.`,
                  bullets: cueBulletsText
                    .split('\n')
                    .map((b) => b.trim())
                    .filter(Boolean),
                }
              : undefined,
          linkedPart3TopicId: customPart === 2 && linkedPart3Id ? linkedPart3Id : undefined,
          isCustom: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось создать тему.');
      onTopicCreated(data);
      setCustomTitle('');
      setCustomDesc('');
      setCuePrompt('');
      setCueBulletsText('');
      setDraftQuestions([]);
      setNewQuestionText('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Ошибка сохранения.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTopic = async (id: string) => {
    const res = await fetch(`/api/speaking/topics/${id}`, { method: 'DELETE' });
    if (res.ok) {
      onTopicDeleted(id);
    }
  };

  return (
    <div className="max-w-[1160px] mx-auto px-6 py-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">
            IELTS Speaking · Parts 1, 2 &amp; 3 · Анализ живого аудиопотока
          </p>
          <h1 className="text-3xl font-bold text-slate-900 mt-1">Speaking Lab</h1>
          <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
            Полный устный экзамен или тренировка отдельных частей с голосовым экзаменатором Gemini TTS,
            диагностикой темпа речи, пауз и произношения.
          </p>
        </div>
      </div>

      {/* Speaking Mode Selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {(
          [
            {
              id: 'exam' as SpeakingMode,
              title: 'Exam Mode',
              desc: 'Нейтральный экзаменатор, предэкзаменационная проверка и Focus Mode',
              icon: ShieldCheck,
            },
            {
              id: 'practice' as SpeakingMode,
              title: 'Practice Mode',
              desc: 'Повтор вопросов, без стресса, доступен текстовый фолбэк',
              icon: Clock,
            },
            {
              id: 'coaching' as SpeakingMode,
              title: 'Coaching Mode',
              desc: 'Подсказки AI Coach после каждого ответа в выбранном характере',
              icon: Compass,
            },
          ] as const
        ).map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                active
                  ? 'border-[#FF4B3A] bg-red-50/40'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${active ? 'text-[#FF4B3A]' : 'text-slate-500'}`} />
                <span className="text-sm font-bold text-slate-900">{m.title}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">{m.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'mock', label: 'Full Speaking Mock (11–14 мин)' },
            { id: 'part1', label: 'Part 1 · Знакомство' },
            { id: 'part2', label: 'Part 2 · Cue Card' },
            { id: 'part3', label: 'Part 3 · Дискуссия' },
            { id: 'custom', label: 'Мои Speaking-темы' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
              tab === t.id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Full Mock List */}
      {tab === 'mock' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {speakingMockTests.map((mock) => {
            const p1 = speakingTopics.find((t) => t.id === mock.part1TopicId);
            const p2 = speakingTopics.find((t) => t.id === mock.part2TopicId);
            const p3 = speakingTopics.find((t) => t.id === mock.part3TopicId);
            return (
              <div
                key={mock.id}
                className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between"
              >
                <div>
                  <p className="text-xs text-slate-500">
                    Full Speaking Mock · {mock.difficulty} · ~{mock.totalMinutes} мин
                  </p>
                  <h2 className="text-lg font-bold text-slate-900 mt-1.5">{mock.title}</h2>
                  <p className="text-sm text-slate-600 mt-2">{mock.description}</p>
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5 text-xs text-slate-700">
                    <p><span className="font-semibold">Part 1:</span> {p1?.title ?? '—'}</p>
                    <p><span className="font-semibold">Part 2 Cue Card:</span> {p2?.title ?? '—'}</p>
                    <p><span className="font-semibold">Part 3:</span> {p3?.title ?? '—'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onStartMock(mock, mode)}
                  disabled={!p1 || !p2 || !p3}
                  className="mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#FF4B3A] rounded-xl hover:bg-[#e84232] disabled:opacity-40 cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  Начать Full Speaking Mock ({mode})
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Topic Creator in "custom" tab */}
      {tab === 'custom' && (
        <form
          onSubmit={handleCreateCustomTopic}
          className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Создать свою Speaking-тему</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Добавьте свои вопросы или Cue Card — и при желании дополните их вопросами ИИ (отмечены отдельно).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Название темы</label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Например: Architecture & Public Spaces"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Часть (Part)</label>
              <select
                value={customPart}
                onChange={(e) => setCustomPart(Number(e.target.value) as SpeakingPartNumber)}
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white"
              >
                <option value={1}>Part 1 (Короткие вопросы)</option>
                <option value={2}>Part 2 (Cue Card 1+2 мин)</option>
                <option value={3}>Part 3 (Абстрактная дискуссия)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Краткое описание (необязательно)</label>
            <input
              type="text"
              value={customDesc}
              onChange={(e) => setCustomDesc(e.target.value)}
              placeholder="Цель тренировки или контекст"
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400"
            />
          </div>

          {customPart === 2 ? (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cue Card задание</label>
                <input
                  type="text"
                  value={cuePrompt}
                  onChange={(e) => setCuePrompt(e.target.value)}
                  placeholder="Describe a building you visited that impressed you."
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Пункты карточки (по одному в строке)
                </label>
                <textarea
                  rows={3}
                  value={cueBulletsText}
                  onChange={(e) => setCueBulletsText(e.target.value)}
                  placeholder={'where it is\nwhen you visited it\nand explain why it impressed you'}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Привязать Part 3 тему (необязательно)
                </label>
                <select
                  value={linkedPart3Id}
                  onChange={(e) => setLinkedPart3Id(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                >
                  <option value="">Без привязки к Part 3</option>
                  {part3Topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">Вопросы темы</span>
                <button
                  type="button"
                  onClick={handleSuggestAiQuestions}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {aiLoading ? 'Генерация…' : 'Сгенерировать доп. вопросы ИИ'}
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  placeholder="Введите свой вопрос на английском…"
                  className="flex-1 px-3.5 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                />
                <button
                  type="button"
                  onClick={handleAddUserQuestion}
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl hover:border-slate-300 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Добавить
                </button>
              </div>

              {draftQuestions.length > 0 && (
                <ul className="space-y-2">
                  {draftQuestions.map((q) => (
                    <li
                      key={q.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                            q.source === 'ai'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {q.source === 'ai' ? 'ИИ' : 'Мой'}
                        </span>
                        <span className="text-slate-800 truncate">{q.text}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftQuestions((prev) => prev.filter((item) => item.id !== q.id))
                        }
                        className="text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {formError && <p className="text-xs text-red-600">{formError}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Сохранение…' : 'Сохранить Speaking-тему'}
            </button>
          </div>
        </form>
      )}

      {/* Topics Grid for Part 1 / 2 / 3 / Custom */}
      {tab !== 'mock' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredTopics.map((topic) => (
            <div
              key={topic.id}
              className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    Part {topic.part} · {topic.difficulty} · {topic.sourceLabel}
                  </span>
                  {topic.isCustom && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTopic(topic.id)}
                      className="text-slate-400 hover:text-red-600 cursor-pointer"
                      title="Удалить тему"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-1.5">{topic.title}</h2>
                {topic.description && (
                  <p className="text-sm text-slate-600 mt-1.5">{topic.description}</p>
                )}

                {topic.cueCard ? (
                  <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
                    <p className="font-semibold text-slate-900">{topic.cueCard.prompt}</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {topic.cueCard.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <ul className="mt-4 space-y-1.5 text-xs text-slate-700">
                    {topic.questions.slice(0, 3).map((q) => (
                      <li key={q.id} className="flex items-start gap-2">
                        <span className="text-slate-400">•</span>
                        <span>{q.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {topic.part === 2 ? '1 мин + 2 мин' : `${topic.questions.length} вопр.`} · {mode}
                </span>
                <button
                  type="button"
                  onClick={() => onStartTopic(topic, mode)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 cursor-pointer"
                >
                  Начать практику
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
