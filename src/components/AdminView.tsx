import React, { useState } from 'react';
import { Check, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import type {
  ComplaintRecord,
  EvaluationSettings,
  IeltsFormat,
  MockTest,
  SpeakingMockTest,
  SpeakingTopic,
  Submission,
  TaskNumber,
  TaskTypeLabel,
  WritingTask,
} from '../types/ielts';

interface AdminViewProps {
  tasks: WritingTask[];
  mockTests: MockTest[];
  speakingTopics?: SpeakingTopic[];
  speakingMockTests?: SpeakingMockTest[];
  submissions: Submission[];
  complaints: ComplaintRecord[];
  settings: EvaluationSettings;
  onTaskCreated: (task: WritingTask) => void;
  onTaskDeleted: (taskId: string) => void;
  onMockCreated: (mock: MockTest) => void;
  onMockDeleted: (mockId: string) => void;
  onSpeakingTopicDeleted?: (id: string) => void;
  onSpeakingMockCreated?: (mock: SpeakingMockTest) => void;
  onSpeakingMockDeleted?: (id: string) => void;
  onComplaintUpdated: (complaint: ComplaintRecord) => void;
  onSettingsUpdated: (settings: EvaluationSettings) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  tasks,
  mockTests,
  speakingTopics = [],
  speakingMockTests = [],
  submissions,
  complaints,
  settings,
  onTaskCreated,
  onTaskDeleted,
  onMockCreated,
  onMockDeleted,
  onSpeakingTopicDeleted,
  onSpeakingMockCreated,
  onSpeakingMockDeleted,
  onComplaintUpdated,
  onSettingsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'mocks' | 'speaking' | 'complaints' | 'settings'>('tasks');
  const [spkMockTitle, setSpkMockTitle] = useState('');
  const [spkP1Id, setSpkP1Id] = useState(
    speakingTopics.find((t) => t.part === 1)?.id ?? ''
  );
  const [spkP2Id, setSpkP2Id] = useState(
    speakingTopics.find((t) => t.part === 2)?.id ?? ''
  );
  const [spkP3Id, setSpkP3Id] = useState(
    speakingTopics.find((t) => t.part === 3)?.id ?? ''
  );

  // New Library Task form
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<IeltsFormat>('academic');
  const [taskNumber, setTaskNumber] = useState<TaskNumber>(1);
  const [taskType, setTaskType] = useState<TaskTypeLabel>('Bar Chart');
  const [difficulty, setDifficulty] = useState<WritingTask['difficulty']>('Band 7.0');
  const [promptText, setPromptText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [taskError, setTaskError] = useState<string | null>(null);

  // New Mock Test form
  const [mockTitle, setMockTitle] = useState('');
  const [mockFormat, setMockFormat] = useState<IeltsFormat>('academic');
  const [mockDesc, setMockDesc] = useState('');
  const [task1Id, setTask1Id] = useState(
    tasks.find((t) => t.taskNumber === 1 && t.format === 'academic')?.id ?? ''
  );
  const [task2Id, setTask2Id] = useState(
    tasks.find((t) => t.taskNumber === 2 && t.format === 'academic')?.id ?? ''
  );

  // Settings state
  const [feedbackLanguage, setFeedbackLanguage] = useState<'ru' | 'en'>(settings.feedbackLanguage);
  const [strictness, setStrictness] = useState<'standard' | 'strict'>(settings.strictness);
  const [customExaminerNote, setCustomExaminerNote] = useState(settings.customExaminerNote);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const handleImageFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setTaskError('Размер изображения не должен превышать 5 МБ.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setImageUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateLibraryTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setTaskError(null);
    if (!title.trim() || !promptText.trim()) {
      setTaskError('Заполните название и текст задания.');
      return;
    }
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        format,
        taskNumber,
        taskType,
        difficulty,
        promptText,
        imageUrl: imageUrl || undefined,
        isCustom: false,
        tags: ['Official Library'],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setTaskError(data.error || 'Ошибка создания задания.');
      return;
    }
    onTaskCreated(data as WritingTask);
    setTitle('');
    setPromptText('');
    setImageUrl('');
  };

  const handleCreateMock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mockTitle.trim() || !task1Id || !task2Id) return;
    const res = await fetch('/api/mock-tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: mockTitle,
        format: mockFormat,
        description: mockDesc,
        task1Id,
        task2Id,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      onMockCreated(data as MockTest);
      setMockTitle('');
      setMockDesc('');
    }
  };

  const handleComplaintStatus = async (
    id: string,
    status: ComplaintRecord['status']
  ) => {
    const res = await fetch(`/api/complaints/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      onComplaintUpdated((await res.json()) as ComplaintRecord);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feedbackLanguage,
        strictness,
        customExaminerNote,
      }),
    });
    if (res.ok) {
      onSettingsUpdated((await res.json()) as EvaluationSettings);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    }
  };

  const avgBand = (() => {
    const bands: number[] = [];
    for (const s of submissions) {
      if (s.overallWritingBand !== undefined) bands.push(s.overallWritingBand);
      else if (s.task2) bands.push(s.task2.revisions[0].evaluation.taskBand);
      else if (s.task1) bands.push(s.task1.revisions[0].evaluation.taskBand);
    }
    if (bands.length === 0) return '—';
    return (bands.reduce((a, b) => a + b, 0) / bands.length).toFixed(1);
  })();

  const openComplaintsCount = complaints.filter((c) => c.status === 'open').length;

  return (
    <div className="max-w-[1240px] mx-auto px-6 py-10 space-y-8">
      <div>
        <p className="text-xs font-medium text-slate-500">
          Управление библиотекой · Mock Tests · Настройки ИИ · Жалобы
        </p>
        <h1 className="text-3xl font-semibold text-slate-900 mt-1">
          Административная панель
        </h1>
      </div>

      {/* Aggregated Platform Stats (Section 19) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Заданий в базе</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {tasks.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Mock Tests</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {mockTests.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Средний Band (по работам)</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {avgBand}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs text-slate-500">Открытых жалоб на ИИ</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">
            {openComplaintsCount}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
        {(
          [
            { id: 'tasks', label: 'Writing задания' },
            { id: 'mocks', label: 'Writing Mock Tests' },
            { id: 'speaking', label: `Speaking (${speakingTopics.length})` },
            { id: 'complaints', label: `Жалобы на ИИ (${openComplaintsCount})` },
            { id: 'settings', label: 'Настройки проверки' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              activeTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'tasks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleCreateLibraryTask}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <h2 className="text-base font-semibold text-slate-900">Добавить задание в библиотеку</h2>
            {taskError && <p className="text-xs text-red-700">{taskError}</p>}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название задания"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as IeltsFormat)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="academic">Academic</option>
                <option value="general">General Training</option>
              </select>
              <select
                value={taskNumber}
                onChange={(e) => setTaskNumber(Number(e.target.value) as TaskNumber)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value={1}>Task 1</option>
                <option value={2}>Task 2</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as TaskTypeLabel)}
                placeholder="Тип (напр. Bar Chart)"
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as WritingTask['difficulty'])}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="Band 6.0">Band 6.0</option>
                <option value="Band 7.0">Band 7.0</option>
                <option value="Band 8.0+">Band 8.0+</option>
              </select>
            </div>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={4}
              placeholder="Текст условия на английском..."
              className="w-full p-3 text-sm border border-slate-200 rounded-lg"
            />
            {taskNumber === 1 && (
              <div>
                {!imageUrl ? (
                  <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 cursor-pointer hover:bg-slate-50">
                    <ImagePlus className="w-4 h-4" /> Прикрепить схему/график
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => handleImageFile(e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
                    <span>Изображение прикреплено</span>
                    <button type="button" onClick={() => setImageUrl('')} className="text-red-700 cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Добавить в библиотеку
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="px-5 py-3.5 border-b border-slate-100 last:border-0 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">
                    {t.format === 'academic' ? 'Academic' : 'GT'} · Task {t.taskNumber} ·{' '}
                    {t.taskType} · {t.difficulty} · {t.isCustom ? 'Личная' : 'Библиотека'}
                  </p>
                  <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
                    if (res.ok) onTaskDeleted(t.id);
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-700 cursor-pointer shrink-0"
                  aria-label="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'mocks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleCreateMock}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <h2 className="text-base font-semibold text-slate-900">Создать Mock Test</h2>
            <input
              type="text"
              value={mockTitle}
              onChange={(e) => setMockTitle(e.target.value)}
              placeholder="Название Mock Test"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <select
              value={mockFormat}
              onChange={(e) => {
                const next = e.target.value as IeltsFormat;
                setMockFormat(next);
                setTask1Id(tasks.find((t) => t.taskNumber === 1 && t.format === next)?.id ?? '');
                setTask2Id(tasks.find((t) => t.taskNumber === 2 && t.format === next)?.id ?? '');
              }}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value="academic">Academic</option>
              <option value="general">General Training</option>
            </select>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Задание Task 1</label>
              <select
                value={task1Id}
                onChange={(e) => setTask1Id(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {tasks
                  .filter((t) => t.taskNumber === 1 && t.format === mockFormat)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Задание Task 2</label>
              <select
                value={task2Id}
                onChange={(e) => setTask2Id(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {tasks
                  .filter((t) => t.taskNumber === 2 && t.format === mockFormat)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </div>
            <textarea
              value={mockDesc}
              onChange={(e) => setMockDesc(e.target.value)}
              rows={2}
              placeholder="Краткое описание теста"
              className="w-full p-3 text-sm border border-slate-200 rounded-lg"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Создать Mock Test
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            {mockTests.map((m) => (
              <div
                key={m.id}
                className="px-5 py-4 border-b border-slate-100 last:border-0 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="text-xs text-slate-500">
                    {m.format === 'academic' ? 'Academic' : 'General Training'} · {m.totalMinutes} мин
                  </p>
                  <p className="text-sm font-semibold text-slate-900">{m.title}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{m.description}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch(`/api/mock-tests/${m.id}`, { method: 'DELETE' });
                    if (res.ok) onMockDeleted(m.id);
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-700 cursor-pointer shrink-0"
                  aria-label="Удалить Mock Test"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'speaking' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!spkMockTitle.trim() || !spkP1Id || !spkP2Id || !spkP3Id) return;
              const res = await fetch('/api/speaking/mock-tests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: spkMockTitle,
                  part1TopicId: spkP1Id,
                  part2TopicId: spkP2Id,
                  part3TopicId: spkP3Id,
                }),
              });
              const data = await res.json();
              if (res.ok) {
                onSpeakingMockCreated?.(data as SpeakingMockTest);
                setSpkMockTitle('');
              }
            }}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <h2 className="text-base font-semibold text-slate-900">Создать Speaking Mock Test</h2>
            <input
              type="text"
              value={spkMockTitle}
              onChange={(e) => setSpkMockTitle(e.target.value)}
              placeholder="Название Speaking Mock Test"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <select
              value={spkP1Id}
              onChange={(e) => setSpkP1Id(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              {speakingTopics.filter((t) => t.part === 1).map((t) => (
                <option key={t.id} value={t.id}>Part 1: {t.title}</option>
              ))}
            </select>
            <select
              value={spkP2Id}
              onChange={(e) => setSpkP2Id(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              {speakingTopics.filter((t) => t.part === 2).map((t) => (
                <option key={t.id} value={t.id}>Part 2: {t.title}</option>
              ))}
            </select>
            <select
              value={spkP3Id}
              onChange={(e) => setSpkP3Id(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              {speakingTopics.filter((t) => t.part === 3).map((t) => (
                <option key={t.id} value={t.id}>Part 3: {t.title}</option>
              ))}
            </select>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#FF4B3A] rounded-lg hover:bg-[#e84232] cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Создать Speaking Mock
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <p className="px-5 py-3 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-100">
                Speaking Mock Tests ({speakingMockTests.length})
              </p>
              {speakingMockTests.map((m) => (
                <div
                  key={m.id}
                  className="px-5 py-3.5 border-b border-slate-100 last:border-0 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{m.title}</p>
                    <p className="text-xs text-slate-500">{m.difficulty} · ~{m.totalMinutes} мин</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await fetch(`/api/speaking/mock-tests/${m.id}`, { method: 'DELETE' });
                      if (res.ok) onSpeakingMockDeleted?.(m.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-700 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <p className="px-5 py-3 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-100">
                Speaking-темы ({speakingTopics.length})
              </p>
              {speakingTopics.map((t) => (
                <div
                  key={t.id}
                  className="px-5 py-3 border-b border-slate-100 last:border-0 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Part {t.part} · {t.sourceLabel}</p>
                    <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await fetch(`/api/speaking/topics/${t.id}`, { method: 'DELETE' });
                      if (res.ok) onSpeakingTopicDeleted?.(t.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-700 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'complaints' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {complaints.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">
              Жалоб на замечания ИИ пока не поступало.
            </p>
          ) : (
            complaints.map((c) => (
              <div
                key={c.id}
                className="p-5 border-b border-slate-100 last:border-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1 text-xs">
                  <p className="text-slate-500">
                    {c.category} · Статус: <span className="font-semibold text-slate-800">{c.status}</span>
                  </p>
                  <p className="text-sm font-medium text-slate-900">
                    «{c.originalPhrase}» → «{c.correction}»
                  </p>
                  <p className="text-slate-700">Причина: {c.reason}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleComplaintStatus(c.id, 'resolved')}
                    className="px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg cursor-pointer"
                  >
                    Подтвердить ошибку ИИ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleComplaintStatus(c.id, 'dismissed')}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 rounded-lg cursor-pointer"
                  >
                    Отклонить
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <form
          onSubmit={handleSaveSettings}
          className="max-w-xl bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <h2 className="text-base font-semibold text-slate-900">
            Настройки калибровки ИИ-проверки
          </h2>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Язык объяснений и комментариев
            </label>
            <select
              value={feedbackLanguage}
              onChange={(e) => setFeedbackLanguage(e.target.value as 'ru' | 'en')}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value="ru">Русский (термины IELTS на английском)</option>
              <option value="en">English only</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Строгость оценивания
            </label>
            <select
              value={strictness}
              onChange={(e) => setStrictness(e.target.value as 'standard' | 'strict')}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value="standard">Стандартная калибровка IELTS</option>
              <option value="strict">Повышенная строгость (Band 7.5+ фокус)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Дополнительная инструкция экзаменатору
            </label>
            <textarea
              value={customExaminerNote}
              onChange={(e) => setCustomExaminerNote(e.target.value)}
              rows={3}
              placeholder="Например: Особое внимание уделять артиклям и связкам между абзацами."
              className="w-full p-3 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
            >
              Сохранить настройки
            </button>
            {settingsSaved && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                <Check className="w-3.5 h-3.5" /> Сохранено
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
};
