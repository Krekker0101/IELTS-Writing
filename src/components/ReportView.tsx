import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Edit3,
  Flag,
  Loader2,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import type {
  AnalysisProgressEvent,
  Submission,
  TaskNumber,
  TaskSubmissionPart,
  TextAnnotation,
  WritingTask,
} from '../types/ielts';
import { AnalysisProgressPanel } from './AnalysisProgressPanel';
import { useAIStatus } from '../contexts/AIStatusContext';
import { postSseStream } from '../utils/sseClient';

interface ReportViewProps {
  submission: Submission;
  tasks: WritingTask[];
  onBack: () => void;
  onSubmissionUpdated: (updated: Submission) => void;
  onRepeatTask: (task: WritingTask) => void;
  onPracticeSimilar: (task: WritingTask) => void;
}

type FilterBucket = 'all' | 'grammar' | 'vocabulary' | 'structure' | 'suggestions';

function getBucket(ann: TextAnnotation): FilterBucket {
  if (ann.severity === 'suggestion') return 'suggestions';
  if (['Grammar', 'Spelling', 'Punctuation'].includes(ann.category)) return 'grammar';
  if (['Vocabulary', 'Collocations', 'Register and Style'].includes(ann.category)) {
    return 'vocabulary';
  }
  return 'structure';
}

function getHighlightStyle(ann: TextAnnotation, isSelected: boolean): string {
  const ring = isSelected ? 'ring-2 ring-slate-900 ring-offset-1' : '';
  if (ann.severity === 'suggestion') {
    return `bg-teal-50 text-teal-950 border-b-2 border-dashed border-teal-600 ${ring}`;
  }
  if (['Grammar', 'Spelling', 'Punctuation'].includes(ann.category)) {
    return `bg-red-50 text-red-950 border-b-2 border-red-600 ${ring}`;
  }
  if (['Vocabulary', 'Collocations', 'Register and Style'].includes(ann.category)) {
    return `bg-amber-50 text-amber-950 border-b-2 border-amber-600 ${ring}`;
  }
  return `bg-blue-50 text-blue-950 border-b-2 border-blue-600 ${ring}`;
}

export const ReportView: React.FC<ReportViewProps> = ({
  submission,
  tasks,
  onBack,
  onSubmissionUpdated,
  onRepeatTask,
  onPracticeSimilar,
}) => {
  const hasT1 = Boolean(submission.task1);
  const hasT2 = Boolean(submission.task2);

  const [activePartNum, setActivePartNum] = useState<TaskNumber>(hasT1 ? 1 : 2);
  const activePart: TaskSubmissionPart | undefined =
    activePartNum === 1 ? submission.task1 : submission.task2;

  const [selectedRevIdxByTask, setSelectedRevIdxByTask] = useState<{ 1: number; 2: number }>({
    1: submission.task1 ? submission.task1.revisions.length - 1 : 0,
    2: submission.task2 ? submission.task2.revisions.length - 1 : 0,
  });

  const revIdx = Math.min(
    selectedRevIdxByTask[activePartNum],
    Math.max(0, (activePart?.revisions.length ?? 1) - 1)
  );
  const activeRevision = activePart?.revisions[revIdx];

  const [filterBucket, setFilterBucket] = useState<FilterBucket>('all');
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);

  // Practice mini-quiz inside annotation card
  const [practiceChoices, setPracticeChoices] = useState<Record<string, number>>({});

  // Improve My Writing / Revision Editor state
  const [isRevising, setIsRevising] = useState(false);
  const [revisedDraft, setRevisedDraft] = useState('');
  const { beginProcessing, updateProcessing, endProcessing } = useAIStatus();
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [revisionProgress, setRevisionProgress] = useState<AnalysisProgressEvent | null>(null);
  const [revisionError, setRevisionError] = useState<string | null>(null);

  // Complaint modal state
  const [complaintTarget, setComplaintTarget] = useState<TextAnnotation | null>(null);
  const [complaintReason, setComplaintReason] = useState('');
  const [complaintSentIds, setComplaintSentIds] = useState<Record<string, boolean>>({});

  const visibleAnnotations = useMemo(() => {
    const list = activeRevision?.evaluation.annotations ?? [];
    if (filterBucket === 'all') return list;
    return list.filter((a) => getBucket(a) === filterBucket);
  }, [activeRevision, filterBucket]);

  const selectedAnnotation = useMemo(() => {
    if (!activeRevision) return null;
    return (
      visibleAnnotations.find((a) => a.id === selectedAnnId) ??
      visibleAnnotations[0] ??
      null
    );
  }, [visibleAnnotations, selectedAnnId, activeRevision]);

  const activeTaskObj = useMemo(
    () => (activePart ? tasks.find((t) => t.id === activePart.taskId) : undefined),
    [activePart, tasks]
  );

  const openRevisionEditor = () => {
    if (!activeRevision) return;
    setRevisedDraft(activeRevision.essayText);
    setRevisionError(null);
    setIsRevising(true);
  };

  const handleSubmitRevision = async () => {
    if (!activePart || !revisedDraft.trim()) return;
    setIsSubmittingRevision(true);
    beginProcessing('Проверка новой редакции', 2);
    setRevisionProgress({
      percent: 2,
      stageKey: 'connect',
      stage: 'Подготовка сравнения версий',
      detail: 'Инициализируем потоковую проверку исправлений…',
      charsReceived: 0,
      annotationsDetected: 0,
      elapsedSec: 0,
      estimatedRemainingSec: null,
    });
    setRevisionError(null);
    try {
      const data = await postSseStream<{ submission: Submission }>(
        `/api/submissions/${submission.id}/revise-stream`,
        {
          taskNumber: activePart.taskNumber,
          revisedText: revisedDraft,
        },
        (evt) => {
          setRevisionProgress(evt);
          updateProcessing(evt.percent, evt.stage);
        }
      );
      const updated = data.submission;
      onSubmissionUpdated(updated);
      const nextPart = activePart.taskNumber === 1 ? updated.task1 : updated.task2;
      setSelectedRevIdxByTask((prev) => ({
        ...prev,
        [activePart.taskNumber]: (nextPart?.revisions.length ?? 1) - 1,
      }));
      setIsRevising(false);
      setSelectedAnnId(null);
    } catch (err) {
      setRevisionError(
        err instanceof Error ? err.message : 'Ошибка при повторной проверке.'
      );
    } finally {
      setIsSubmittingRevision(false);
      setRevisionProgress(null);
      endProcessing();
    }
  };

  const handleSendComplaint = async () => {
    if (!complaintTarget || !complaintReason.trim() || !activePart) return;
    try {
      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          taskNumber: activePart.taskNumber,
          annotationId: complaintTarget.id,
          originalPhrase: complaintTarget.originalPhrase,
          correction: complaintTarget.correction,
          category: complaintTarget.category,
          reason: complaintReason,
        }),
      });
      if (res.ok) {
        setComplaintSentIds((prev) => ({ ...prev, [complaintTarget.id]: true }));
        setComplaintTarget(null);
        setComplaintReason('');
      }
    } catch {
      // ignore
    }
  };

  if (!activePart || !activeRevision) {
    return null;
  }

  const evalData = activeRevision.evaluation;

  // Render inline text segments with exact annotation anchors
  const renderAnnotatedText = () => {
    const text = activeRevision.essayText;
    const sorted = [...visibleAnnotations].sort((a, b) => a.startIndex - b.startIndex);
    const segments: React.ReactNode[] = [];
    let cursor = 0;

    for (const ann of sorted) {
      if (ann.startIndex < cursor || ann.endIndex > text.length) continue;
      if (ann.startIndex > cursor) {
        segments.push(
          <span key={`plain-${cursor}`}>{text.slice(cursor, ann.startIndex)}</span>
        );
      }
      const isSelected = selectedAnnotation?.id === ann.id;
      segments.push(
        <button
          key={ann.id}
          type="button"
          onClick={() => setSelectedAnnId(ann.id)}
          className={`inline text-left px-0.5 rounded-sm transition-colors cursor-pointer ${getHighlightStyle(
            ann,
            isSelected
          )}`}
          title={`${ann.category}: ${ann.correction}`}
        >
          {text.slice(ann.startIndex, ann.endIndex)}
        </button>
      );
      cursor = ann.endIndex;
    }

    if (cursor < text.length) {
      segments.push(<span key={`tail-${cursor}`}>{text.slice(cursor)}</span>);
    }

    return segments;
  };

  return (
    <div className="max-w-[1320px] mx-auto px-6 py-8 space-y-8">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад
        </button>

        <div className="flex flex-wrap items-center gap-3">
          {activeTaskObj && (
            <>
              <button
                type="button"
                onClick={() => onRepeatTask(activeTaskObj)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Повторить задание
              </button>
              <button
                type="button"
                onClick={() => onPracticeSimilar(activeTaskObj)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                Выбрать похожее
              </button>
            </>
          )}
          {!isRevising && (
            <button
              type="button"
              onClick={openRevisionEditor}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer whitespace-nowrap"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Improve My Writing
            </button>
          )}
        </div>
      </div>

      {/* Band Score Overview Banner */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <p className="text-xs text-slate-500">
              {submission.format === 'academic' ? 'IELTS Academic' : 'General Training'} ·{' '}
              {new Date(submission.createdAt).toLocaleString('ru-RU', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            <h1 className="text-2xl font-semibold text-slate-900 mt-1">
              {submission.mockTestTitle ?? activePart.taskTitle}
            </h1>
            <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
              {evalData.summary}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 shrink-0">
            {submission.overallWritingBand !== undefined ? (
              <div className="px-5 py-3.5 rounded-xl bg-slate-900 text-white">
                <p className="text-[11px] text-slate-300">Overall Writing Band</p>
                <p className="text-3xl font-semibold font-mono tabular-nums mt-0.5">
                  {submission.overallWritingBand.toFixed(1)}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  (Task 1 + 2 × Task 2) / 3
                </p>
              </div>
            ) : (
              <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 max-w-[230px]">
                <p className="text-xs font-medium text-slate-700">Оценка одного задания</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Общий Writing Band рассчитывается только при выполнении обоих заданий.
                </p>
              </div>
            )}

            <div className="px-5 py-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-[11px] text-slate-500">
                Task {activePart.taskNumber} Band (v{activeRevision.version})
              </p>
              <p className="text-3xl font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                {evalData.taskBand.toFixed(1)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                {activeRevision.wordCount} слов
              </p>
            </div>
          </div>
        </div>

        {/* Mock Test Task 1 / Task 2 Switcher & Revision Version Tabs */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {hasT1 && hasT2 && (
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setActivePartNum(1);
                    setIsRevising(false);
                    setSelectedAnnId(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                    activePartNum === 1 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Task 1 · Band{' '}
                  {submission.task1!.revisions[submission.task1!.revisions.length - 1].evaluation.taskBand.toFixed(1)}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePartNum(2);
                    setIsRevising(false);
                    setSelectedAnnId(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                    activePartNum === 2 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Task 2 (×2 вес) · Band{' '}
                  {submission.task2!.revisions[submission.task2!.revisions.length - 1].evaluation.taskBand.toFixed(1)}
                </button>
              </div>
            )}

            {/* Versions switcher (Section 15: original version always preserved) */}
            {activePart.revisions.length > 1 && (
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {activePart.revisions.map((rev, idx) => (
                  <button
                    key={rev.version}
                    type="button"
                    onClick={() => {
                      setSelectedRevIdxByTask((prev) => ({
                        ...prev,
                        [activePartNum]: idx,
                      }));
                      setSelectedAnnId(null);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                      revIdx === idx ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    {rev.version === 1 ? 'Версия 1 (Исходная)' : `Редакция ${rev.version}`} ·{' '}
                    {rev.evaluation.taskBand.toFixed(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-500">
            Прогноз носит учебный характер и не является официальным сертификатом IELTS.
          </p>
        </div>
      </section>

      {/* Chart Readability Warning (Section 7) */}
      {evalData.chartDataUncertain && evalData.chartUncertaintyNote && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Ограничение распознавания данных диаграммы</p>
            <p className="text-xs text-amber-800 mt-1">{evalData.chartUncertaintyNote}</p>
          </div>
        </div>
      )}

      {/* Revision Diff Summary (Section 15) */}
      {evalData.revisionDiff && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Сравнение с предыдущей версией
              </h2>
              <p className="text-sm text-slate-600 mt-1">{evalData.revisionDiff.summary}</p>
            </div>
            <div className="px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 font-mono tabular-nums text-sm font-semibold text-slate-900">
              Изменение балла:{' '}
              {evalData.revisionDiff.bandDelta >= 0
                ? `+${evalData.revisionDiff.bandDelta.toFixed(1)}`
                : evalData.revisionDiff.bandDelta.toFixed(1)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-lg bg-emerald-50/60 border border-emerald-200">
              <p className="font-semibold text-emerald-900 mb-2">
                Исправлено ({evalData.revisionDiff.fixedErrors.length})
              </p>
              {evalData.revisionDiff.fixedErrors.length > 0 ? (
                <ul className="space-y-1 text-emerald-800 list-disc pl-4">
                  {evalData.revisionDiff.fixedErrors.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-emerald-800/80">Нет отмеченных исправлений.</p>
              )}
            </div>

            <div className="p-4 rounded-lg bg-amber-50/60 border border-amber-200">
              <p className="font-semibold text-amber-900 mb-2">
                Осталось доработать ({evalData.revisionDiff.remainingErrors.length})
              </p>
              {evalData.revisionDiff.remainingErrors.length > 0 ? (
                <ul className="space-y-1 text-amber-900 list-disc pl-4">
                  {evalData.revisionDiff.remainingErrors.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-amber-800">Предыдущие ошибки устранены.</p>
              )}
            </div>

            <div className="p-4 rounded-lg bg-red-50/60 border border-red-200">
              <p className="font-semibold text-red-900 mb-2">
                Новые ошибки ({evalData.revisionDiff.newErrors.length})
              </p>
              {evalData.revisionDiff.newErrors.length > 0 ? (
                <ul className="space-y-1 text-red-800 list-disc pl-4">
                  {evalData.revisionDiff.newErrors.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-red-800/80">Новых ошибок не обнаружено.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Interactive Annotated Text + 7-Part Diagnostic Card OR Revision Editor */}
      {isRevising ? (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Самостоятельное исправление (Improve My Writing)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Отредактируйте свой текст с опорой на замечания справа и нажмите Check My Revision.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-600">
                {revisedDraft.trim() ? revisedDraft.trim().split(/\s+/).length : 0} слов
              </span>
            </div>

            {revisionError && (
              <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{revisionError}</span>
              </div>
            )}

            {isSubmittingRevision && (
              <AnalysisProgressPanel progress={revisionProgress} isRevision />
            )}

            <textarea
              value={revisedDraft}
              onChange={(e) => setRevisedDraft(e.target.value)}
              rows={16}
              spellCheck={false}
              disabled={isSubmittingRevision}
              className="w-full p-6 text-[15px] leading-[1.75] text-slate-900 focus:outline-none resize-y"
            />

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsRevising(false)}
                disabled={isSubmittingRevision}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSubmitRevision}
                disabled={isSubmittingRevision}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                {isSubmittingRevision ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="font-mono tabular-nums">
                      Проверка {revisionProgress?.percent ?? 0}%
                    </span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Check My Revision
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3 max-h-[620px] overflow-y-auto">
            <h3 className="text-sm font-semibold text-slate-900">
              Замечания к текущей версии ({evalData.annotations.length})
            </h3>
            {evalData.annotations.map((ann) => (
              <div key={ann.id} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    {ann.category} · {ann.subRule}
                  </span>
                  <span className="text-slate-500">
                    {ann.severity === 'error' ? 'Ошибка' : 'Совет'}
                  </span>
                </div>
                <p className="text-red-700 line-through">{ann.originalPhrase}</p>
                <p className="text-emerald-800 font-medium">→ {ann.correction}</p>
                <p className="text-slate-600">{ann.explanation}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Interactive Highlighted Text */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Интерактивный разбор текста
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Нажмите на любой выделенный фрагмент, чтобы увидеть минимальное исправление и правило.
                </p>
              </div>

              <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'all', label: `Все (${evalData.annotations.length})` },
                    { id: 'grammar', label: 'Грамматика' },
                    { id: 'vocabulary', label: 'Лексика' },
                    { id: 'structure', label: 'Структура' },
                    { id: 'suggestions', label: 'Улучшения' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setFilterBucket(tab.id);
                      setSelectedAnnId(null);
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                      filterBucket === tab.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[15px] leading-[1.9] text-slate-900 whitespace-pre-wrap">
              {renderAnnotatedText()}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-1 bg-red-600 inline-block" /> Грамматика и орфография
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-1 bg-amber-600 inline-block" /> Лексика и сочетаемость
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-1 bg-blue-600 inline-block" /> Структура и задача
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-b-2 border-dashed border-teal-600 inline-block" /> Возможное улучшение
              </span>
            </div>
          </div>

          {/* Right: 7-Part Diagnostic Card (Section 9) */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sticky top-20">
            {selectedAnnotation ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <p className="text-xs text-slate-500">
                      {selectedAnnotation.severity === 'error'
                        ? 'Подтверждённая ошибка'
                        : 'Возможное стилистическое улучшение'}{' '}
                      · Уверенность: {selectedAnnotation.confidence}
                    </p>
                    <h3 className="text-base font-semibold text-slate-900 mt-1">
                      3. {selectedAnnotation.category} — {selectedAnnotation.subRule}
                    </h3>
                  </div>

                  {!complaintSentIds[selectedAnnotation.id] ? (
                    <button
                      type="button"
                      onClick={() => setComplaintTarget(selectedAnnotation)}
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-700 cursor-pointer shrink-0"
                      title="Пожаловаться на неточное замечание ИИ"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      Неточность?
                    </button>
                  ) : (
                    <span className="text-xs text-emerald-700 font-medium">Отправлено</span>
                  )}
                </div>

                {/* 1. Original phrase & 2. Correction */}
                <div className="grid grid-cols-1 gap-3">
                  <div className="p-3 rounded-lg bg-red-50/70 border border-red-200">
                    <p className="text-[11px] font-semibold text-red-800">1. Original phrase</p>
                    <p className="text-sm text-red-950 mt-1 font-medium">
                      {selectedAnnotation.originalPhrase}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
                    <p className="text-[11px] font-semibold text-emerald-800">
                      2. Minimal correction
                    </p>
                    <p className="text-sm text-emerald-950 mt-1 font-semibold">
                      {selectedAnnotation.correction}
                    </p>
                  </div>
                </div>

                {/* 4. Explanation */}
                <div>
                  <p className="text-xs font-semibold text-slate-900">4. Explanation</p>
                  <p className="text-sm text-slate-700 mt-1 leading-relaxed">
                    {selectedAnnotation.explanation}
                  </p>
                </div>

                {/* 5. IELTS impact */}
                <div>
                  <p className="text-xs font-semibold text-slate-900">5. IELTS impact</p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {selectedAnnotation.ieltsImpact}
                  </p>
                </div>

                {/* 6. Improvement tip */}
                <div>
                  <p className="text-xs font-semibold text-slate-900">6. Improvement tip</p>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {selectedAnnotation.improvementTip}
                  </p>
                </div>

                {/* 7. Quick Practice */}
                {selectedAnnotation.practice && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-900 mb-1.5">
                      7. Practice: закрепление правила
                    </p>
                    <p className="text-xs text-slate-700 mb-2.5">
                      {selectedAnnotation.practice.question}
                    </p>
                    <div className="space-y-1.5">
                      {selectedAnnotation.practice.options.map((opt, idx) => {
                        const chosen = practiceChoices[selectedAnnotation.id];
                        const isAnswered = chosen !== undefined;
                        const isCorrectOpt = idx === selectedAnnotation.practice!.correctIndex;
                        const isChosen = chosen === idx;
                        let style = 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800';
                        if (isAnswered) {
                          if (isCorrectOpt) {
                            style = 'border-emerald-300 bg-emerald-50 text-emerald-900 font-medium';
                          } else if (isChosen) {
                            style = 'border-red-300 bg-red-50 text-red-900';
                          }
                        }
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() =>
                              setPracticeChoices((prev) => ({
                                ...prev,
                                [selectedAnnotation.id]: idx,
                              }))
                            }
                            className={`w-full text-left px-3 py-2 text-xs rounded-lg border transition-colors cursor-pointer ${style}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {practiceChoices[selectedAnnotation.id] !== undefined && (
                      <p className="text-xs text-slate-600 mt-2">
                        {selectedAnnotation.practice.explanation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-slate-500">
                В выбранной категории замечаний не найдено.
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4 Official Criteria Cards (Section 8) */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">
          Оценка по четырём официальным критериям IELTS
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {evalData.criteria.map((c) => (
            <div key={c.name} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100">
                <h3 className="text-base font-semibold text-slate-900">{c.name}</h3>
                <span className="text-xl font-semibold font-mono tabular-nums text-blue-700">
                  {c.band.toFixed(1)}
                </span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{c.explanation}</p>

              <div className="space-y-3 text-xs">
                <div>
                  <p className="font-semibold text-emerald-800 mb-1">Сильные стороны</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    {c.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-amber-800 mb-1">Конкретные недостатки</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    {c.weaknesses.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-blue-800 mb-1">Что исправить для следующего Band</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-600">
                    {c.nextBandSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Content Checklist & Top Priorities (Section 12 & 14) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Проверка содержания задания
          </h2>
          <div className="space-y-3">
            {evalData.contentChecklist.map((item, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                {item.met ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium text-slate-900">{item.label}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{item.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Действия с наибольшим эффектом для роста Band
          </h2>
          <ol className="space-y-2.5 list-decimal pl-5 text-sm text-slate-700">
            {evalData.topPriorities.map((p, i) => (
              <li key={i} className="leading-relaxed">
                {p}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Complaint Modal */}
      {complaintTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
          onClick={() => setComplaintTarget(null)}
        >
          <div
            className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 border border-slate-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900">
              Сообщить о неточном замечании ИИ
            </h3>
            <p className="text-xs text-slate-600">
              Фрагмент: <span className="font-semibold text-slate-900">«{complaintTarget.originalPhrase}»</span>
            </p>
            <textarea
              value={complaintReason}
              onChange={(e) => setComplaintReason(e.target.value)}
              rows={3}
              placeholder="Опишите, почему исходная формулировка допустима или исправление некорректно…"
              className="w-full p-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComplaintTarget(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSendComplaint}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
              >
                Отправить в админ-панель
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
