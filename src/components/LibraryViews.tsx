import React, { useMemo, useState } from 'react';
import { ArrowRight, Clock, BookOpen, ShieldCheck, Compass } from 'lucide-react';
import type { IeltsFormat, MockTest, PracticeMode, TaskNumber, WritingTask } from '../types/ielts';

interface MockTestListViewProps {
  mockTests: MockTest[];
  tasks: WritingTask[];
  onStartMock: (mock: MockTest) => void;
}

export const MockTestListView: React.FC<MockTestListViewProps> = ({
  mockTests,
  tasks,
  onStartMock,
}) => {
  const [formatFilter, setFormatFilter] = useState<'all' | IeltsFormat>('all');

  const filtered = useMemo(
    () =>
      mockTests.filter((m) =>
        formatFilter === 'all' ? true : m.format === formatFilter
      ),
    [mockTests, formatFilter]
  );

  return (
    <div className="max-w-[1240px] mx-auto px-6 py-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">
            60 минут · Единый таймер · Task 2 имеет двойной вес
          </p>
          <h1 className="text-3xl font-semibold text-slate-900 mt-1">
            Полноценные Writing Mock Tests
          </h1>
          <p className="text-sm text-slate-600 mt-2 max-w-2xl">
            Полный модуль IELTS Writing состоит из двух обязательных заданий (Task 1 и Task 2) с общим
            временем 60 минут и возможностью свободно переключаться между заданиями.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {(
            [
              { id: 'all', label: 'Все форматы' },
              { id: 'academic', label: 'Academic' },
              { id: 'general', label: 'General Training' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFormatFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                formatFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((mock) => {
          const t1 = tasks.find((t) => t.id === mock.task1Id);
          const t2 = tasks.find((t) => t.id === mock.task2Id);
          return (
            <div
              key={mock.id}
              className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div>
                <p className="text-xs text-slate-500">
                  {mock.format === 'academic' ? 'IELTS Academic' : 'IELTS General Training'} ·{' '}
                  {mock.difficulty} · {mock.totalMinutes} мин
                </p>
                <h2 className="text-lg font-semibold text-slate-900 mt-2">
                  {mock.title}
                </h2>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  {mock.description}
                </p>

                <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5 text-xs">
                  <div>
                    <span className="font-semibold text-slate-800">Task 1 ({t1?.taskType ?? '—'}): </span>
                    <span className="text-slate-600">{t1?.title ?? 'Задание не найдено'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800">Task 2 ({t2?.taskType ?? '—'}): </span>
                    <span className="text-slate-600">{t2?.title ?? 'Задание не найдено'}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onStartMock(mock)}
                disabled={!t1 || !t2}
                className="mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
              >
                Начать экзамен (60 мин)
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface TaskPracticeListViewProps {
  taskNumber: TaskNumber;
  tasks: WritingTask[];
  onStartTask: (task: WritingTask, mode: PracticeMode, timerMinutes: number | null) => void;
}

export const TaskPracticeListView: React.FC<TaskPracticeListViewProps> = ({
  taskNumber,
  tasks,
  onStartTask,
}) => {
  const [format, setFormat] = useState<IeltsFormat>('academic');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [mode, setMode] = useState<PracticeMode>('practice');
  const [timerEnabled, setTimerEnabled] = useState<boolean>(false);

  const defaultMinutes = taskNumber === 1 ? 20 : 40;

  const availableTasks = useMemo(
    () => tasks.filter((t) => t.taskNumber === taskNumber && t.format === format),
    [tasks, taskNumber, format]
  );

  const taskTypes = useMemo(() => {
    const set = new Set<string>();
    availableTasks.forEach((t) => set.add(t.taskType));
    return ['all', ...Array.from(set)];
  }, [availableTasks]);

  const filteredTasks = useMemo(
    () =>
      availableTasks.filter((t) =>
        typeFilter === 'all' ? true : t.taskType === typeFilter
      ),
    [availableTasks, typeFilter]
  );

  const handleModeChange = (nextMode: PracticeMode) => {
    setMode(nextMode);
    if (nextMode === 'exam') {
      setTimerEnabled(true);
    } else if (nextMode === 'practice') {
      setTimerEnabled(false);
    }
  };

  return (
    <div className="max-w-[1240px] mx-auto px-6 py-10 space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <p className="text-xs font-medium text-slate-500">
            {taskNumber === 1
              ? 'Минимум 150 слов · Рекомендуемое время 20 мин'
              : 'Минимум 250 слов · Рекомендуемое время 40 мин'}
          </p>
          <h1 className="text-3xl font-semibold text-slate-900 mt-1">
            Отдельная практика Task {taskNumber}
          </h1>
          <p className="text-sm text-slate-600 mt-2 max-w-2xl">
            {taskNumber === 1
              ? 'Отрабатывайте описание графиков, карт, процессов (Academic) или написание писем разных регистров (General Training).'
              : 'Тренируйте структуру, аргументацию, логическую связность и точность формулировок во всех типах эссе.'}
          </p>
        </div>

        {/* Format Segmented Control */}
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => {
              setFormat('academic');
              setTypeFilter('all');
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              format === 'academic'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            IELTS Academic
          </button>
          <button
            type="button"
            onClick={() => {
              setFormat('general');
              setTypeFilter('all');
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              format === 'general'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            General Training
          </button>
        </div>
      </div>

      {/* Mode & Timer Configuration Strip (Section 6) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          {(
            [
              {
                id: 'exam' as PracticeMode,
                title: 'Exam Mode',
                desc: 'Без подсказок, строгий таймер',
                icon: ShieldCheck,
              },
              {
                id: 'practice' as PracticeMode,
                title: 'Practice Mode',
                desc: 'Без ограничения по времени',
                icon: Clock,
              },
              {
                id: 'learning' as PracticeMode,
                title: 'Learning Mode',
                desc: 'Учебные подсказки и план',
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
                onClick={() => handleModeChange(m.id)}
                className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'border-blue-700 bg-blue-50/60'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${active ? 'text-blue-700' : 'text-slate-500'}`} />
                  <span className={`text-sm font-semibold ${active ? 'text-blue-900' : 'text-slate-900'}`}>
                    {m.title}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">{m.desc}</p>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 pt-3 lg:pt-0 lg:pl-5 lg:border-l border-slate-200 shrink-0">
          <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={timerEnabled}
              onChange={(e) => setTimerEnabled(e.target.checked)}
              className="w-4 h-4 accent-blue-700 rounded cursor-pointer"
            />
            <span className="whitespace-nowrap">Таймер {defaultMinutes} мин</span>
          </label>
        </div>
      </div>

      {/* Task Type Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {taskTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setTypeFilter(type)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              typeFilter === type
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            {type === 'all' ? 'Все типы заданий' : type}
          </button>
        ))}
      </div>

      {/* Tasks Grid */}
      {filteredTasks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <BookOpen className="w-7 h-7 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-800">
            Для выбранного фильтра заданий пока нет
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Попробуйте другой тип задания или добавьте собственную тему в разделе «Мои темы».
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredTasks.map((task) => (
            <div
              key={task.id}
              className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between hover:border-slate-300 transition-colors"
            >
              <div>
                <p className="text-xs text-slate-500">
                  {task.taskType} · {task.difficulty} ·{' '}
                  {task.isCustom ? 'Моя тема' : 'Библиотека'}
                </p>
                <h2 className="text-lg font-semibold text-slate-900 mt-1.5">
                  {task.title}
                </h2>
                <p className="text-sm text-slate-600 mt-2.5 line-clamp-3 leading-relaxed">
                  {task.promptText}
                </p>
                {task.tags.length > 0 && (
                  <p className="text-xs text-slate-400 mt-3">
                    {task.tags.join(' · ')}
                  </p>
                )}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {timerEnabled ? `${defaultMinutes} мин` : 'Без таймера'} · {mode}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onStartTask(task, mode, timerEnabled ? defaultMinutes : null)
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
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
