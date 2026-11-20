import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Clock,
  Loader2,
  Send,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  DraftEntry,
  IeltsFormat,
  MockTest,
  PracticeMode,
  Submission,
  WritingTask,
} from '../types/ielts';
import { TaskVisual } from './TaskVisual';

export interface ActiveSessionConfig {
  sessionType: 'mock' | 'single';
  mode: 'mock' | PracticeMode;
  format: IeltsFormat;
  mockTest?: MockTest;
  task1?: WritingTask;
  task2?: WritingTask;
  timerMinutes: number | null;
  draftKey: string;
}

interface WritingWorkspaceProps {
  session: ActiveSessionConfig;
  initialDraft?: DraftEntry;
  onExit: () => void;
  onCompleted: (submission: Submission) => void;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(Math.max(0, totalSeconds) / 60);
  const secs = Math.max(0, totalSeconds) % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const WritingWorkspace: React.FC<WritingWorkspaceProps> = ({
  session,
  initialDraft,
  onExit,
  onCompleted,
}) => {
  const hasTask1 = Boolean(session.task1);
  const hasTask2 = Boolean(session.task2);

  const [activeTaskTab, setActiveTaskTab] = useState<1 | 2>(hasTask1 ? 1 : 2);
  const [task1Text, setTask1Text] = useState<string>(() => {
    const local = localStorage.getItem(`draft_${session.draftKey}_t1`);
    return local ?? initialDraft?.task1Text ?? '';
  });
  const [task2Text, setTask2Text] = useState<string>(() => {
    const local = localStorage.getItem(`draft_${session.draftKey}_t2`);
    return local ?? initialDraft?.task2Text ?? '';
  });

  const initialSec =
    session.timerMinutes !== null
      ? initialDraft?.remainingSeconds && initialDraft.remainingSeconds > 0
        ? initialDraft.remainingSeconds
        : session.timerMinutes * 60
      : 0;

  const [secondsLeft, setSecondsLeft] = useState<number>(initialSec);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [showHints, setShowHints] = useState<boolean>(session.mode === 'learning');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const task1Words = useMemo(() => countWords(task1Text), [task1Text]);
  const task2Words = useMemo(() => countWords(task2Text), [task2Text]);

  const currentTask = activeTaskTab === 1 ? session.task1 : session.task2;
  const currentText = activeTaskTab === 1 ? task1Text : task2Text;
  const currentWords = activeTaskTab === 1 ? task1Words : task2Words;
  const minWordGoal = activeTaskTab === 1 ? 150 : 250;

  const latestRef = useRef({ task1Text, task2Text, secondsLeft });
  latestRef.current = { task1Text, task2Text, secondsLeft };

  // Timer tick
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
      if (session.timerMinutes !== null) {
        setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [session.timerMinutes]);

  // Instant localStorage save + debounced server auto-save (Section 5 & Criterion 15)
  useEffect(() => {
    localStorage.setItem(`draft_${session.draftKey}_t1`, task1Text);
    localStorage.setItem(`draft_${session.draftKey}_t2`, task2Text);
    setSaveState('saving');

    const timer = window.setTimeout(async () => {
      try {
        await fetch(`/api/drafts/${encodeURIComponent(session.draftKey)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task1Text,
            task2Text,
            remainingSeconds: latestRef.current.secondsLeft,
          }),
        });
      } catch {
        // localStorage already preserves the draft even offline
      } finally {
        setSaveState('saved');
      }
    }, 800);

    return () => window.clearTimeout(timer);
  }, [task1Text, task2Text, session.draftKey]);

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (session.sessionType === 'mock') {
      if (!task1Text.trim() && !task2Text.trim()) {
        setErrorMsg('Напишите ответ хотя бы на одно задание перед отправкой на проверку.');
        return;
      }
    } else if (!currentText.trim()) {
      setErrorMsg('Введите ваш ответ перед отправкой на проверку.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        mode: session.mode,
        format: session.format,
        mockTestId: session.mockTest?.id,
        draftKey: session.draftKey,
      };

      if (session.task1 && task1Text.trim()) {
        payload.task1 = {
          taskId: session.task1.id,
          essayText: task1Text,
          timeSpentSec:
            session.sessionType === 'mock'
              ? Math.round(elapsedSec * 0.35)
              : elapsedSec,
        };
      }
      if (session.task2 && task2Text.trim()) {
        payload.task2 = {
          taskId: session.task2.id,
          essayText: task2Text,
          timeSpentSec:
            session.sessionType === 'mock'
              ? Math.round(elapsedSec * 0.65)
              : elapsedSec,
        };
      }

      const res = await fetch('/api/submissions/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось выполнить ИИ-проверку.');
      }

      localStorage.removeItem(`draft_${session.draftKey}_t1`);
      localStorage.removeItem(`draft_${session.draftKey}_t2`);
      onCompleted(data.submission as Submission);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Ошибка при отправке работы. Ваш текст сохранён.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentTask) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 flex flex-col">
      {/* Workspace Toolbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Выйти
            </button>
            <div className="h-4 w-px bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {session.mockTest ? session.mockTest.title : currentTask.title}
              </p>
              <p className="text-xs text-slate-500">
                {session.format === 'academic' ? 'IELTS Academic' : 'General Training'} ·{' '}
                {session.mode === 'mock'
                  ? 'Full Writing Mock Test'
                  : session.mode === 'exam'
                  ? 'Exam Mode'
                  : session.mode === 'learning'
                  ? 'Learning Mode'
                  : 'Practice Mode'}
              </p>
            </div>
          </div>

          {/* Task Switcher in Mock Test */}
          {hasTask1 && hasTask2 && (
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setActiveTaskTab(1)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  activeTaskTab === 1
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Task 1 · {task1Words} сл.
              </button>
              <button
                type="button"
                onClick={() => setActiveTaskTab(2)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  activeTaskTab === 2
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Task 2 · {task2Words} сл.
              </button>
            </div>
          )}

          {/* Timer, Save state & Submit */}
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-xs text-slate-500 hidden sm:inline">
              {saveState === 'saving' ? 'Сохранение черновика…' : 'Черновик сохранён'}
            </span>

            {session.timerMinutes !== null ? (
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono tabular-nums font-semibold ${
                  secondsLeft <= 300
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-slate-200 bg-slate-50 text-slate-800'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {formatTime(secondsLeft)}
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono tabular-nums text-slate-700">
                <Clock className="w-3.5 h-3.5" />
                {formatTime(elapsedSec)}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ИИ проверяет…
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Отправить на проверку
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="max-w-[1360px] w-full mx-auto px-6 pt-4">
          <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* Split Workspace: Prompt + Visual on Left, Writing Sheet on Right */}
      <div className="flex-1 max-w-[1360px] w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Task Prompt & Visual */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between overflow-y-auto max-h-[calc(100vh-11rem)]">
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-blue-700">
                Task {currentTask.taskNumber} · {currentTask.taskType}
              </span>
              <span className="text-xs text-slate-500">
                {currentTask.taskNumber === 1 ? 'Рекомендация: 20 мин' : 'Рекомендация: 40 мин'}
              </span>
            </div>

            <h2 className="text-xl font-semibold text-slate-900 mt-2">
              {currentTask.title}
            </h2>

            <div className="mt-4 text-sm text-slate-800 leading-relaxed whitespace-pre-line">
              {currentTask.promptText}
            </div>

            {currentTask.bulletPoints && currentTask.bulletPoints.length > 0 && (
              <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  В письме обязательно раскройте:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-800">
                  {currentTask.bulletPoints.map((bp, i) => (
                    <li key={i}>{bp}</li>
                  ))}
                </ul>
              </div>
            )}

            <TaskVisual task={currentTask} />

            {/* Learning Mode Study Guide (never shown in Exam or Mock Mode) */}
            {session.mode === 'learning' && currentTask.learningHints && (
              <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowHints((v) => !v)}
                  className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-700" />
                    Учебные подсказки (Learning Mode)
                  </span>
                  {showHints ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showHints && (
                  <div className="p-4 space-y-4 text-xs text-slate-700 bg-white">
                    <div>
                      <p className="font-semibold text-slate-900 mb-1.5">Рекомендуемый план:</p>
                      <ul className="space-y-1 list-disc pl-4">
                        {currentTask.learningHints.outline.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 mb-1.5">Полезные выражения:</p>
                      <p className="text-slate-700 font-mono">
                        {currentTask.learningHints.keyVocabulary.join(' · ')}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 mb-1.5">Частые ловушки:</p>
                      <ul className="space-y-1 list-disc pl-4">
                        {currentTask.learningHints.pitfalls.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500">
            Write at least {minWordGoal} words.
            {session.sessionType === 'mock' && ' Task 2 carries twice the weight of Task 1.'}
          </p>
        </div>

        {/* Right: Distraction-Free Essay Sheet */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden min-h-[520px]">
          <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <span className="text-xs font-medium text-slate-600">
              Бланк ответа · Task {activeTaskTab}
            </span>
            <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
              <span
                className={
                  currentWords >= minWordGoal
                    ? 'text-emerald-700 font-semibold'
                    : 'text-slate-700 font-medium'
                }
              >
                {currentWords} / {minWordGoal}+ слов
              </span>
            </div>
          </div>

          <textarea
            value={currentText}
            onChange={(e) => {
              if (activeTaskTab === 1) setTask1Text(e.target.value);
              else setTask2Text(e.target.value);
            }}
            placeholder={
              activeTaskTab === 1
                ? 'Start writing your Task 1 response here in English...'
                : 'Start writing your Task 2 essay here in English...'
            }
            spellCheck={false}
            disabled={isSubmitting}
            className="flex-1 w-full p-6 text-[15px] leading-[1.75] text-slate-900 placeholder:text-slate-400 resize-none focus:outline-none bg-white"
          />

          {isSubmitting && (
            <div className="px-6 py-3 bg-blue-50 border-t border-blue-100 flex items-center gap-2.5 text-xs text-blue-800">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>
                Проводим многоэтапный разбор: проверяем содержание задания, структуру, лексику,
                грамматику и формируем точные минимальные исправления…
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
