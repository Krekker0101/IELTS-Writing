import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { IeltsFormat, TaskNumber, TaskTypeLabel, WritingTask } from '../types/ielts';

interface MyTopicsViewProps {
  tasks: WritingTask[];
  onTopicCreated: (task: WritingTask) => void;
  onTopicDeleted: (taskId: string) => void;
  onStartTask: (task: WritingTask) => void;
}

const TASK_TYPES: Record<IeltsFormat, Record<TaskNumber, TaskTypeLabel[]>> = {
  academic: {
    1: [
      'Bar Chart',
      'Line Graph',
      'Pie Chart',
      'Table',
      'Mixed Charts',
      'Maps',
      'Process Diagrams',
      'Object and Technical Diagrams',
    ],
    2: [
      'Agree or Disagree',
      'Discuss Both Views',
      'Advantages and Disadvantages',
      'Problem and Solution',
      'Cause and Effect',
      'Two-Part Questions',
      'Mixed Questions',
    ],
  },
  general: {
    1: [
      'Formal Letters',
      'Semi-formal Letters',
      'Informal Letters',
      'Requests',
      'Complaints',
      'Explanations',
      'Advice and Suggestions',
    ],
    2: [
      'Opinion Essays',
      'Discussion Essays',
      'Advantages and Disadvantages',
      'Problem and Solution',
      'Cause and Effect',
      'Two-Part Questions',
    ],
  },
};

export const MyTopicsView: React.FC<MyTopicsViewProps> = ({
  tasks,
  onTopicCreated,
  onTopicDeleted,
  onStartTask,
}) => {
  const customTopics = tasks.filter((t) => t.isCustom);

  const [format, setFormat] = useState<IeltsFormat>('academic');
  const [taskNumber, setTaskNumber] = useState<TaskNumber>(2);
  const [taskType, setTaskType] = useState<TaskTypeLabel>('Agree or Disagree');
  const [title, setTitle] = useState('');
  const [promptText, setPromptText] = useState('');
  const [bulletPoints, setBulletPoints] = useState<string[]>(['', '', '']);
  const [tagsText, setTagsText] = useState('');
  const [recommendedMinutes, setRecommendedMinutes] = useState<number>(40);
  const [imageUrl, setImageUrl] = useState<string>('');

  const [aiDetectedType, setAiDetectedType] = useState<string | null>(null);
  const [imageNote, setImageNote] = useState<string | null>(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFormatOrTaskChange = (nextFmt: IeltsFormat, nextNum: TaskNumber) => {
    setFormat(nextFmt);
    setTaskNumber(nextNum);
    setTaskType(TASK_TYPES[nextFmt][nextNum][0]);
    setRecommendedMinutes(nextNum === 1 ? 20 : 40);
  };

  const handleImageUpload = (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrorMsg('Поддерживаются только изображения PNG, JPEG или WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Максимальный размер изображения — 5 МБ.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClassifyWithAI = async () => {
    if (!promptText.trim()) {
      setErrorMsg('Введите текст условия задания перед автоопределением.');
      return;
    }
    setErrorMsg(null);
    setIsClassifying(true);
    try {
      const res = await fetch('/api/ai/classify-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptText,
          formatHint: format,
          taskNumberHint: taskNumber,
          imageUrl: imageUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка классификации.');

      const nextFmt: IeltsFormat = data.suggestedFormat === 'general' ? 'general' : 'academic';
      const nextNum: TaskNumber = data.suggestedTaskNumber === 1 ? 1 : 2;
      setFormat(nextFmt);
      setTaskNumber(nextNum);
      setRecommendedMinutes(nextNum === 1 ? 20 : 40);

      const allowed = TASK_TYPES[nextFmt][nextNum];
      const matched = allowed.find(
        (t) => t.toLowerCase() === String(data.suggestedTaskType).toLowerCase()
      );
      setTaskType(matched ?? allowed[0]);
      setAiDetectedType(`${nextFmt === 'academic' ? 'Academic' : 'General'} · Task ${nextNum} · ${data.suggestedTaskType}`);
      if (!title.trim() && data.suggestedTitle) {
        setTitle(data.suggestedTitle);
      }
      if (!tagsText.trim() && Array.isArray(data.suggestedTags)) {
        setTagsText(data.suggestedTags.join(', '));
      }
      if (imageUrl && data.imageNote) {
        setImageNote(
          data.imageReadable
            ? `ИИ подтвердил читаемость схемы: ${data.imageNote}`
            : `Внимание: ${data.imageNote}`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось классифицировать тему.');
    } finally {
      setIsClassifying(false);
    }
  };

  const handleSaveTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim()) {
      setErrorMsg('Введите условие задания.');
      return;
    }
    setErrorMsg(null);
    setIsSaving(true);
    try {
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || `Моя тема: ${taskType}`,
          format,
          taskNumber,
          taskType,
          promptText: promptText.trim(),
          bulletPoints:
            format === 'general' && taskNumber === 1
              ? bulletPoints.map((b) => b.trim()).filter(Boolean)
              : undefined,
          imageUrl: format === 'academic' && taskNumber === 1 ? imageUrl || undefined : undefined,
          tags: tags.length > 0 ? tags : ['Custom'],
          recommendedMinutes,
          isCustom: true,
          aiDetectedType: aiDetectedType ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить тему.');

      onTopicCreated(data as WritingTask);
      setTitle('');
      setPromptText('');
      setBulletPoints(['', '', '']);
      setTagsText('');
      setImageUrl('');
      setAiDetectedType(null);
      setImageNote(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка сохранения.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (res.ok) onTopicDeleted(id);
  };

  return (
    <div className="max-w-[1240px] mx-auto px-6 py-10 space-y-10">
      <div>
        <p className="text-xs font-medium text-slate-500">
          Личная библиотека · Загрузка графиков и диаграмм · Автоопределение типа
        </p>
        <h1 className="text-3xl font-semibold text-slate-900 mt-1">
          Мои темы и собственные задания
        </h1>
        <p className="text-sm text-slate-600 mt-2 max-w-2xl">
          Добавьте любое экзаменационное задание из учебника или собственной подборки, прикрепите
          изображение графика для Academic Task 1 или пункты письма для General Training и напишите ответ.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Creation Form */}
        <form
          onSubmit={handleSaveTopic}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <h2 className="text-lg font-semibold text-slate-900">Создать новое задание</h2>

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Format & Task Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Формат IELTS
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleFormatOrTaskChange('academic', taskNumber)}
                  className={`py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    format === 'academic' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Academic
                </button>
                <button
                  type="button"
                  onClick={() => handleFormatOrTaskChange('general', taskNumber)}
                  className={`py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    format === 'general' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  General Training
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Номер задания
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => handleFormatOrTaskChange(format, 1)}
                  className={`py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    taskNumber === 1 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Task 1
                </button>
                <button
                  type="button"
                  onClick={() => handleFormatOrTaskChange(format, 2)}
                  className={`py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    taskNumber === 2 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Task 2
                </button>
              </div>
            </div>
          </div>

          {/* Prompt Text + AI Classification */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <label className="text-xs font-medium text-slate-700">
                Условие задания (на английском)
              </label>
              <button
                type="button"
                onClick={handleClassifyWithAI}
                disabled={isClassifying}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer disabled:opacity-50"
              >
                {isClassifying ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Определить тип с помощью ИИ
              </button>
            </div>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={5}
              placeholder="Вставьте условие эссе, описание графика или ситуацию для письма..."
              className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
            />
            {aiDetectedType && (
              <p className="mt-1.5 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-3 py-1.5">
                ИИ классифицировал тему как: <span className="font-semibold">{aiDetectedType}</span>. Вы можете изменить тип ниже.
              </p>
            )}
          </div>

          {/* Task Type & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Тип задания
              </label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as TaskTypeLabel)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-700"
              >
                {TASK_TYPES[format][taskNumber].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Время выполнения (мин)
              </label>
              <input
                type="number"
                min={5}
                max={90}
                value={recommendedMinutes}
                onChange={(e) => setRecommendedMinutes(Number(e.target.value) || 20)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
          </div>

          {/* General Training Task 1 Bullet Points */}
          {format === 'general' && taskNumber === 1 && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                Обязательные пункты письма (Bullet points)
              </label>
              {bulletPoints.map((bp, idx) => (
                <input
                  key={idx}
                  type="text"
                  value={bp}
                  onChange={(e) => {
                    const next = [...bulletPoints];
                    next[idx] = e.target.value;
                    setBulletPoints(next);
                  }}
                  placeholder={`Пункт ${idx + 1}, например: Explain why you are writing`}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
                />
              ))}
            </div>
          )}

          {/* Academic Task 1 Image Upload */}
          {format === 'academic' && taskNumber === 1 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Изображение графика, таблицы, карты или диаграммы (PNG/JPG/WebP, до 5 МБ)
              </label>
              {!imageUrl ? (
                <label className="flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-xl p-6 bg-slate-50 hover:bg-slate-100/70 transition-colors cursor-pointer">
                  <ImagePlus className="w-6 h-6 text-slate-400 mb-2" />
                  <span className="text-xs font-medium text-slate-700">
                    Загрузить изображение задания
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => handleImageUpload(e.target.files?.[0])}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="relative border border-slate-200 rounded-xl p-2 bg-white">
                  <img
                    src={imageUrl}
                    alt="Загруженная схема Task 1"
                    className="w-full max-h-64 object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl('');
                      setImageNote(null);
                    }}
                    className="absolute top-3 right-3 p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-red-700 cursor-pointer"
                    aria-label="Удалить изображение"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {imageNote && (
                <p className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5">
                  {imageNote}
                </p>
              )}
            </div>
          )}

          {/* Title & Tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Название темы
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Urban Transport Funding"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Тематические теги (через запятую)
              </label>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="Transport, Cities, Policy"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Сохранить тему в библиотеку
          </button>
        </form>

        {/* Saved Custom Topics List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Сохранённые темы ({customTopics.length})
            </h2>
          </div>

          {customTopics.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
              <p className="text-sm font-medium text-slate-800">Пока нет личных тем</p>
              <p className="text-xs text-slate-500 mt-1">
                Создайте тему слева — она сохранится на сервере, и вы сможете вернуться к ней в любой момент.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {customTopics.map((topic) => (
                <div
                  key={topic.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500">
                        {topic.format === 'academic' ? 'Academic' : 'General Training'} · Task{' '}
                        {topic.taskNumber} · {topic.taskType} · {topic.recommendedMinutes} мин
                      </p>
                      <h3 className="text-base font-semibold text-slate-900 mt-1">
                        {topic.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(topic.id)}
                      className="p-1.5 text-slate-400 hover:text-red-700 rounded-lg cursor-pointer"
                      aria-label="Удалить тему"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2">{topic.promptText}</p>
                  {topic.tags.length > 0 && (
                    <p className="text-[11px] text-slate-400">{topic.tags.join(' · ')}</p>
                  )}

                  <button
                    type="button"
                    onClick={() => onStartTask(topic)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
                  >
                    Написать ответ и проверить
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
