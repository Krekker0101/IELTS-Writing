import React from 'react';
import { ArrowRight, BookOpen, Clock, FileEdit, Layers, Sparkles } from 'lucide-react';
import type { ErrorJournalEntry, Submission, WritingTask } from '../types/ielts';
import type { AppRoute } from './Navbar';

interface HomeViewProps {
  submissions: Submission[];
  errorJournal: ErrorJournalEntry[];
  tasks: WritingTask[];
  onNavigate: (route: AppRoute) => void;
  onOpenSubmission: (submission: Submission) => void;
  onStartTask: (task: WritingTask) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  submissions,
  errorJournal,
  tasks,
  onNavigate,
  onOpenSubmission,
  onStartTask,
}) => {
  const latestSubmission = submissions[0];
  const latestBand = latestSubmission
    ? latestSubmission.overallWritingBand ??
      latestSubmission.task2?.revisions[latestSubmission.task2.revisions.length - 1]?.evaluation.taskBand ??
      latestSubmission.task1?.revisions[latestSubmission.task1.revisions.length - 1]?.evaluation.taskBand
    : null;

  const activeErrors = errorJournal.filter((e) => !e.mastered);
  const topWeakness = activeErrors[0];

  const recommendedTask = (() => {
    if (!latestSubmission) {
      return tasks.find((t) => t.id === 'acad-t1-line-energy') ?? tasks[0];
    }
    if (latestSubmission.task1 && !latestSubmission.task2) {
      return tasks.find((t) => t.taskNumber === 2 && t.format === latestSubmission.format) ?? tasks[0];
    }
    return tasks.find((t) => t.id === 'acad-t1-maps-mapledurham') ?? tasks[0];
  })();

  const primaryActions = [
    {
      id: 'mock' as AppRoute,
      title: 'Full Writing Mock Test',
      meta: '60 мин · Task 1 + Task 2 · Двойной вес Task 2',
      description:
        'Полноценный экзаменационный модуль Academic или General Training с общим таймером и итоговым Band Score.',
      icon: Clock,
      accent: 'bg-blue-700 text-white',
      cta: 'Выбрать Mock Test',
    },
    {
      id: 'practice1' as AppRoute,
      title: 'Practice Task 1',
      meta: '20 мин или без таймера · 150+ слов',
      description:
        'Графики, таблицы, карты, процессы (Academic) и деловые, полуофициальные или дружеские письма (General Training).',
      icon: Layers,
      accent: 'bg-slate-900 text-white',
      cta: 'Тренировать Task 1',
    },
    {
      id: 'practice2' as AppRoute,
      title: 'Practice Task 2',
      meta: '40 мин или без таймера · 250+ слов',
      description:
        'Эссе всех экзаменационных типов: Agree/Disagree, Discuss Both Views, Problem/Solution и Two-Part Questions.',
      icon: BookOpen,
      accent: 'bg-slate-900 text-white',
      cta: 'Тренировать Task 2',
    },
    {
      id: 'topics' as AppRoute,
      title: 'My Topics',
      meta: 'Личная библиотека · Изображения · ИИ-классификация',
      description:
        'Добавляйте собственные темы, загружайте схемы для Task 1 и получайте точную проверку с разбором ошибок.',
      icon: FileEdit,
      accent: 'bg-slate-900 text-white',
      cta: 'Открыть темы',
    },
  ];

  return (
    <div className="max-w-[1240px] mx-auto px-6 py-10 space-y-10">
      {/* Clean Editorial Hero */}
      <section className="max-w-3xl">
        <p className="text-xs font-medium text-slate-500 mb-2">
          IELTS Academic &amp; General Training · Диагностика и самоисправление
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight text-balance">
          Тренируйте IELTS Writing и учитесь видеть и исправлять собственные ошибки
        </h1>
        <p className="mt-3 text-base text-slate-600 leading-relaxed max-w-2xl">
          Платформа проверяет ответы по четырём официальным критериям, выделяет конкретные недочёты
          прямо в вашем тексте с минимальными исправлениями и формирует упражнения по повторяющимся ошибкам.
        </p>
      </section>

      {/* Four Primary Actions (Section 4) */}
      <section aria-label="Основные режимы подготовки">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {primaryActions.map((action) => {
            const Icon = action.icon;
            return (
              <div
                key={action.id}
                onClick={() => onNavigate(action.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate(action.id);
                  }
                }}
                className="group bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between hover:border-slate-300 transition-colors cursor-pointer"
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1.5">{action.meta}</p>
                      <h2 className="text-xl font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {action.title}
                      </h2>
                    </div>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${action.accent}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                    {action.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-blue-700 group-hover:text-blue-800">
                    {action.cta}
                  </span>
                  <ArrowRight className="w-4 h-4 text-blue-700 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Summary Strip Below Primary Actions (Section 4) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-2">
        {/* Latest Work & Result */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Последняя работа и результат</p>
            {latestSubmission ? (
              <>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-3xl font-semibold font-mono tabular-nums text-slate-900">
                    Band {latestBand?.toFixed(1) ?? '—'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {latestSubmission.overallWritingBand !== undefined
                      ? 'Полный Writing Band'
                      : 'Оценка отдельного задания'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-700 line-clamp-2">
                  {latestSubmission.mockTestTitle ??
                    latestSubmission.task2?.taskTitle ??
                    latestSubmission.task1?.taskTitle}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(latestSubmission.updatedAt).toLocaleDateString('ru-RU')} ·{' '}
                  {latestSubmission.format === 'academic' ? 'Academic' : 'General Training'}
                </p>
              </>
            ) : (
              <div className="mt-2">
                <p className="text-sm text-slate-700 font-medium">Работ пока нет</p>
                <p className="text-xs text-slate-500 mt-1">
                  Напишите первое задание Task 1, Task 2 или пройдите полный Mock Test, чтобы увидеть диагностику.
                </p>
              </div>
            )}
          </div>
          {latestSubmission && (
            <button
              type="button"
              onClick={() => onOpenSubmission(latestSubmission)}
              className="mt-4 text-left text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
            >
              Открыть подробный отчёт →
            </button>
          )}
        </div>

        {/* Current Progress */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Текущий прогресс</p>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
                  {submissions.length}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Проверено работ</p>
              </div>
              <div>
                <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
                  {activeErrors.length}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Активных зон роста</p>
              </div>
            </div>
            {topWeakness ? (
              <p className="mt-3 text-xs text-slate-600">
                Частая категория ошибок: <span className="font-semibold text-slate-900">{topWeakness.subRule}</span> ({topWeakness.normalizedPer1000Words} на 1000 слов)
              </p>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                Журнал повторяющихся ошибок автоматически пополняется после каждой проверки.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('progress')}
            className="mt-4 text-left text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
          >
            Журнал ошибок и упражнения →
          </button>
        </div>

        {/* Recommended Practice */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">Рекомендуемая тренировка</p>
              <Sparkles className="w-4 h-4 text-blue-700" />
            </div>
            {recommendedTask ? (
              <>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {recommendedTask.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {recommendedTask.format === 'academic' ? 'Academic' : 'General Training'} · Task{' '}
                  {recommendedTask.taskNumber} · {recommendedTask.taskType}
                </p>
                <p className="mt-2 text-xs text-slate-600 line-clamp-2">
                  {recommendedTask.promptText}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Выберите задание из библиотеки.</p>
            )}
          </div>
          {recommendedTask && (
            <button
              type="button"
              onClick={() => onStartTask(recommendedTask)}
              className="mt-4 text-left text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
            >
              Перейти к заданию →
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
