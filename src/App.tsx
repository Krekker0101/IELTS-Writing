import { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import type {
  AppDatabase,
  MockTest,
  PracticeMode,
  Submission,
  WritingTask,
} from './types/ielts';
import { Navbar, type AppRoute } from './components/Navbar';
import { HomeView } from './components/HomeView';
import { MockTestListView, TaskPracticeListView } from './components/LibraryViews';
import { WritingWorkspace, type ActiveSessionConfig } from './components/WritingWorkspace';
import { ReportView } from './components/ReportView';
import { MyTopicsView } from './components/MyTopicsView';
import { ProgressView } from './components/ProgressView';
import { AdminView } from './components/AdminView';
import { AIStatusProvider } from './contexts/AIStatusContext';

function AppShell() {
  const [db, setDb] = useState<AppDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [route, setRoute] = useState<AppRoute>('home');
  const [activeSession, setActiveSession] = useState<ActiveSessionConfig | null>(null);
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);

  const loadBootstrap = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error('Не удалось загрузить данные платформы.');
      const data = (await res.json()) as AppDatabase;
      setDb(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Ошибка подключения к серверу.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, []);

  const refreshBootstrapSilently = async () => {
    try {
      const res = await fetch('/api/bootstrap');
      if (res.ok) {
        const data = (await res.json()) as AppDatabase;
        setDb(data);
      }
    } catch {
      // ignore
    }
  };

  const handleStartMock = (mock: MockTest) => {
    if (!db) return;
    const t1 = db.tasks.find((t) => t.id === mock.task1Id);
    const t2 = db.tasks.find((t) => t.id === mock.task2Id);
    if (!t1 || !t2) return;

    setActiveSession({
      sessionType: 'mock',
      mode: 'mock',
      format: mock.format,
      mockTest: mock,
      task1: t1,
      task2: t2,
      timerMinutes: mock.totalMinutes,
      draftKey: `mock_${mock.id}`,
    });
    setRoute('workspace');
  };

  const handleStartTask = (
    task: WritingTask,
    mode: PracticeMode = 'practice',
    timerMinutes: number | null = null
  ) => {
    setActiveSession({
      sessionType: 'single',
      mode,
      format: task.format,
      task1: task.taskNumber === 1 ? task : undefined,
      task2: task.taskNumber === 2 ? task : undefined,
      timerMinutes,
      draftKey: `task_${task.id}`,
    });
    setRoute('workspace');
  };

  const handlePracticeSimilar = (task: WritingTask) => {
    if (!db) return;
    const candidates = db.tasks.filter(
      (t) =>
        t.id !== task.id &&
        t.taskNumber === task.taskNumber &&
        t.format === task.format
    );
    const sameType = candidates.filter((t) => t.taskType === task.taskType);
    const next = sameType[0] ?? candidates[0] ?? task;
    handleStartTask(next, 'practice', null);
  };

  const handleOpenSubmission = (sub: Submission) => {
    setActiveSubmission(sub);
    setRoute('report');
  };

  const handleSubmissionCompleted = async (submission: Submission) => {
    setActiveSubmission(submission);
    setActiveSession(null);
    setRoute('report');
    await refreshBootstrapSilently();
  };

  const handleSubmissionUpdated = async (updated: Submission) => {
    setActiveSubmission(updated);
    await refreshBootstrapSilently();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin text-blue-700" />
          <span>Загрузка IELTS Writing Lab…</span>
        </div>
      </div>
    );
  }

  if (loadError || !db) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full space-y-4 text-center">
          <AlertCircle className="w-7 h-7 text-red-600 mx-auto" />
          <p className="text-sm text-slate-800">{loadError || 'Ошибка загрузки'}</p>
          <button
            type="button"
            onClick={loadBootstrap}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {route !== 'workspace' && (
        <Navbar
          currentRoute={route}
          onNavigate={(next) => {
            setRoute(next);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      <main className="flex-1">
        {route === 'home' && (
          <HomeView
            submissions={db.submissions}
            errorJournal={db.errorJournal}
            tasks={db.tasks}
            onNavigate={setRoute}
            onOpenSubmission={handleOpenSubmission}
            onStartTask={(task) => handleStartTask(task, 'practice', null)}
          />
        )}

        {route === 'mock' && (
          <MockTestListView
            mockTests={db.mockTests}
            tasks={db.tasks}
            onStartMock={handleStartMock}
          />
        )}

        {route === 'practice1' && (
          <TaskPracticeListView
            taskNumber={1}
            tasks={db.tasks}
            onStartTask={handleStartTask}
          />
        )}

        {route === 'practice2' && (
          <TaskPracticeListView
            taskNumber={2}
            tasks={db.tasks}
            onStartTask={handleStartTask}
          />
        )}

        {route === 'topics' && (
          <MyTopicsView
            tasks={db.tasks}
            onTopicCreated={(newTask) =>
              setDb((prev) => (prev ? { ...prev, tasks: [newTask, ...prev.tasks] } : prev))
            }
            onTopicDeleted={(id) =>
              setDb((prev) =>
                prev ? { ...prev, tasks: prev.tasks.filter((t) => t.id !== id) } : prev
              )
            }
            onStartTask={(task) => handleStartTask(task, 'practice', task.recommendedMinutes)}
          />
        )}

        {route === 'progress' && (
          <ProgressView
            submissions={db.submissions}
            errorJournal={db.errorJournal}
            exercises={db.exercises}
            onOpenSubmission={handleOpenSubmission}
            onExercisesUpdated={(exercises) =>
              setDb((prev) => (prev ? { ...prev, exercises } : prev))
            }
            onJournalUpdated={(errorJournal) =>
              setDb((prev) => (prev ? { ...prev, errorJournal } : prev))
            }
            onUserDataCleared={refreshBootstrapSilently}
          />
        )}

        {route === 'admin' && (
          <AdminView
            tasks={db.tasks}
            mockTests={db.mockTests}
            submissions={db.submissions}
            complaints={db.complaints}
            settings={db.settings}
            onTaskCreated={(t) =>
              setDb((prev) => (prev ? { ...prev, tasks: [t, ...prev.tasks] } : prev))
            }
            onTaskDeleted={(id) =>
              setDb((prev) =>
                prev
                  ? {
                      ...prev,
                      tasks: prev.tasks.filter((t) => t.id !== id),
                      mockTests: prev.mockTests.filter(
                        (m) => m.task1Id !== id && m.task2Id !== id
                      ),
                    }
                  : prev
              )
            }
            onMockCreated={(m) =>
              setDb((prev) => (prev ? { ...prev, mockTests: [m, ...prev.mockTests] } : prev))
            }
            onMockDeleted={(id) =>
              setDb((prev) =>
                prev ? { ...prev, mockTests: prev.mockTests.filter((m) => m.id !== id) } : prev
              )
            }
            onComplaintUpdated={(cmp) =>
              setDb((prev) =>
                prev
                  ? {
                      ...prev,
                      complaints: prev.complaints.map((c) => (c.id === cmp.id ? cmp : c)),
                    }
                  : prev
              )
            }
            onSettingsUpdated={(settings) =>
              setDb((prev) => (prev ? { ...prev, settings } : prev))
            }
          />
        )}

        {route === 'workspace' && activeSession && (
          <WritingWorkspace
            session={activeSession}
            initialDraft={db.drafts[activeSession.draftKey]}
            onExit={() => {
              setActiveSession(null);
              setRoute('home');
            }}
            onCompleted={handleSubmissionCompleted}
          />
        )}

        {route === 'report' && activeSubmission && (
          <ReportView
            submission={activeSubmission}
            tasks={db.tasks}
            onBack={() => setRoute('progress')}
            onSubmissionUpdated={handleSubmissionUpdated}
            onRepeatTask={(task) => handleStartTask(task, 'practice', null)}
            onPracticeSimilar={handlePracticeSimilar}
          />
        )}
      </main>

      {route !== 'workspace' && (
        <footer className="border-t border-slate-200 bg-white mt-12">
          <div className="max-w-[1240px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <span>IELTS Writing Lab · Платформа подготовки и диагностики</span>
            <span>Оценочные баллы носят учебный характер и не заменяют официальный экзамен IELTS</span>
          </div>
        </footer>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AIStatusProvider>
      <AppShell />
    </AIStatusProvider>
  );
}
