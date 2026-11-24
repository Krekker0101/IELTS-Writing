import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import type {
  AppDatabase,
  MockTest,
  PracticeMode,
  SpeakingMockTest,
  SpeakingMode,
  SpeakingSessionRecord,
  SpeakingTopic,
  Submission,
  UserProfile,
  WritingTask,
} from './types/ielts';
import { SidebarNav, TopContextBar, type AppRoute } from './components/SidebarNav';
import { HomeView } from './components/HomeView';
import { MockTestListView, TaskPracticeListView } from './components/LibraryViews';
import { WritingWorkspace, type ActiveSessionConfig } from './components/WritingWorkspace';
import { ReportView } from './components/ReportView';
import { MyTopicsView } from './components/MyTopicsView';
import { ProgressView } from './components/ProgressView';
import { AdminView } from './components/AdminView';
import { SpeakingHubView } from './components/SpeakingHubView';
import {
  SpeakingWorkspace,
  type ActiveSpeakingConfig,
} from './components/SpeakingWorkspace';
import { SpeakingReportView } from './components/SpeakingReportView';
import { AICoachView } from './components/AICoachView';
import { StudyPlanView } from './components/StudyPlanView';
import { SettingsView } from './components/SettingsView';
import { PreExamCheckModal } from './components/PreExamCheckModal';
import { AIStatusProvider } from './contexts/AIStatusContext';
import {
  LevelUpNotification,
  type LevelUpEvent,
} from './components/LevelUpNotification';
import { getLevelProgress, writeLastSeenLevel } from './utils/levelSystem';
import {
  computeLocalStreakAndXp,
  loadOrCreateLocalDevicePlan,
} from './utils/localStudyPlan';
import { useVoiceNavigation } from './hooks/useVoiceNavigation';
import { VoiceCommandOverlay } from './components/VoiceCommandControl';
import {
  OnboardingGuide,
  hasCompletedOnboarding,
} from './components/OnboardingGuide';

type PendingExamLaunch =
  | {
      kind: 'writing';
      title: string;
      session: ActiveSessionConfig;
    }
  | {
      kind: 'speaking';
      title: string;
      speakingConfig: Omit<ActiveSpeakingConfig, 'enteredFullscreen'>;
    };

function AppShell() {
  const [db, setDb] = useState<AppDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [route, setRoute] = useState<AppRoute>('home');
  const [activeSession, setActiveSession] = useState<ActiveSessionConfig | null>(null);
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);

  const [activeSpeaking, setActiveSpeaking] = useState<ActiveSpeakingConfig | null>(null);
  const [activeSpeakingSession, setActiveSpeakingSession] =
    useState<SpeakingSessionRecord | null>(null);
  const [pendingExam, setPendingExam] = useState<PendingExamLaunch | null>(null);
  const [levelUpEvent, setLevelUpEvent] = useState<LevelUpEvent | null>(null);
  const [voiceHelpOpen, setVoiceHelpOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const onboardingCheckedRef = useRef(false);
  const prevLevelRef = useRef<number | null>(null);
  const prevXpRef = useRef<number | null>(null);

  const navigateWithScroll = (next: AppRoute) => {
    setRoute(next);
    window.scrollTo({
      top: 0,
      behavior: db?.userProfile.reducedMotion ? 'auto' : 'smooth',
    });
  };

  const voiceNav = useVoiceNavigation({
    disabled:
      !db ||
      route === 'workspace' ||
      route === 'speaking-workspace' ||
      route === 'coach',
    onNavigate: navigateWithScroll,
  });

  const mergeLocalDeviceIntoDb = (data: AppDatabase): AppDatabase => {
    const local = loadOrCreateLocalDevicePlan({
      format: data.userProfile.format,
      currentBand: data.userProfile.currentBand,
      targetBand: data.userProfile.targetBand,
      examDate: data.userProfile.examDate,
      dailyGoalMinutes: data.userProfile.dailyGoalMinutes,
      taperDaysBeforeExam: data.userProfile.taperDaysBeforeExam,
      restDays: data.userProfile.restDays,
      learnerName: data.userProfile.name,
    });
    const localStats = computeLocalStreakAndXp(local);
    return {
      ...data,
      userProfile: {
        ...data.userProfile,
        name: local.learnerName || data.userProfile.name,
        format: local.format,
        currentBand: local.currentBand,
        targetBand: local.targetBand,
        examDate: local.examDate,
        dailyGoalMinutes: local.dailyGoalMinutes,
        taperDaysBeforeExam: local.taperDaysBeforeExam,
        restDays: local.restDays,
        streakDays: Math.max(data.userProfile.streakDays, localStats.streakDays),
        xp: Math.max(data.userProfile.xp, localStats.xp),
      },
    };
  };

  const loadBootstrap = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error('Не удалось загрузить данные платформы.');
      const data = (await res.json()) as AppDatabase;
      setDb(mergeLocalDeviceIntoDb(data));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Ошибка подключения к серверу.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, []);

  // Auto-open interactive onboarding tour on first visit once data is ready
  useEffect(() => {
    if (!db || onboardingCheckedRef.current) return;
    onboardingCheckedRef.current = true;
    if (
      !hasCompletedOnboarding() &&
      route !== 'workspace' &&
      route !== 'speaking-workspace'
    ) {
      setOnboardingOpen(true);
    }
  }, [db, route]);

  // Detect XP level-up transitions during the session and fire LevelUpNotification
  useEffect(() => {
    if (!db?.userProfile) return;
    const info = getLevelProgress(db.userProfile.xp);

    if (prevLevelRef.current === null) {
      prevLevelRef.current = info.level;
      prevXpRef.current = info.totalXp;
      writeLastSeenLevel(info.level);
      return;
    }

    if (info.level > prevLevelRef.current) {
      setLevelUpEvent({
        level: info.level,
        title: info.title,
        subtitle: info.subtitle,
        totalXp: info.totalXp,
        xpRemaining: info.xpRemaining,
        gainedXp: Math.max(0, info.totalXp - (prevXpRef.current ?? info.totalXp)),
      });
      writeLastSeenLevel(info.level);
    }

    prevLevelRef.current = info.level;
    prevXpRef.current = info.totalXp;
  }, [db?.userProfile.xp]);

  useEffect(() => {
    if (!levelUpEvent) return;
    const timer = window.setTimeout(() => {
      setLevelUpEvent(null);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [levelUpEvent]);

  const refreshBootstrapSilently = async () => {
    try {
      const res = await fetch('/api/bootstrap');
      if (res.ok) {
        const data = (await res.json()) as AppDatabase;
        setDb(mergeLocalDeviceIntoDb(data));
      }
    } catch {
      // ignore
    }
  };

  const handleUpdateProfile = async (patch: Partial<UserProfile>) => {
    if (!db) return;
    setDb((prev) =>
      prev ? { ...prev, userProfile: { ...prev.userProfile, ...patch } } : prev
    );
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = (await res.json()) as UserProfile;
        setDb((prev) => (prev ? { ...prev, userProfile: updated } : prev));
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

    const session: ActiveSessionConfig = {
      sessionType: 'mock',
      mode: 'mock',
      format: mock.format,
      mockTest: mock,
      task1: t1,
      task2: t2,
      timerMinutes: mock.totalMinutes,
      draftKey: `mock_${mock.id}`,
    };

    setPendingExam({
      kind: 'writing',
      title: mock.title,
      session,
    });
  };

  const handleStartTask = (
    task: WritingTask,
    mode: PracticeMode = 'practice',
    timerMinutes: number | null = null
  ) => {
    const session: ActiveSessionConfig = {
      sessionType: 'single',
      mode,
      format: task.format,
      task1: task.taskNumber === 1 ? task : undefined,
      task2: task.taskNumber === 2 ? task : undefined,
      timerMinutes,
      draftKey: `task_${task.id}`,
    };

    if (mode === 'exam') {
      setPendingExam({
        kind: 'writing',
        title: task.title,
        session,
      });
      return;
    }

    setActiveSession(session);
    setRoute('workspace');
  };

  const handleStartSpeakingMock = (mock: SpeakingMockTest, mode: SpeakingMode) => {
    if (!db) return;
    const p1 = db.speakingTopics.find((t) => t.id === mock.part1TopicId);
    const p2 = db.speakingTopics.find((t) => t.id === mock.part2TopicId);
    const p3 = db.speakingTopics.find((t) => t.id === mock.part3TopicId);
    if (!p1 || !p2 || !p3) return;

    const baseCfg: Omit<ActiveSpeakingConfig, 'enteredFullscreen'> = {
      title: mock.title,
      mockTest: mock,
      topics: [p1, p2, p3],
      isFullMock: true,
      mode,
    };

    if (mode === 'exam') {
      setPendingExam({
        kind: 'speaking',
        title: mock.title,
        speakingConfig: baseCfg,
      });
      return;
    }

    setActiveSpeaking({ ...baseCfg, enteredFullscreen: false });
    setRoute('speaking-workspace');
  };

  const handleStartSpeakingTopic = (topic: SpeakingTopic, mode: SpeakingMode) => {
    if (!db) return;
    const linkedPart3 =
      topic.part === 2 && topic.linkedPart3TopicId
        ? db.speakingTopics.find((t) => t.id === topic.linkedPart3TopicId)
        : undefined;

    const topics = linkedPart3 ? [topic, linkedPart3] : [topic];
    const baseCfg: Omit<ActiveSpeakingConfig, 'enteredFullscreen'> = {
      title: topic.title,
      topics,
      isFullMock: false,
      part: topic.part,
      mode,
    };

    if (mode === 'exam') {
      setPendingExam({
        kind: 'speaking',
        title: topic.title,
        speakingConfig: baseCfg,
      });
      return;
    }

    setActiveSpeaking({ ...baseCfg, enteredFullscreen: false });
    setRoute('speaking-workspace');
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

  const handleOpenSpeakingSession = (ses: SpeakingSessionRecord) => {
    setActiveSpeakingSession(ses);
    setRoute('speaking-report');
  };

  const handleSubmissionCompleted = async (submission: Submission) => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setActiveSubmission(submission);
    setActiveSession(null);
    setRoute('report');
    await refreshBootstrapSilently();
  };

  const handleSubmissionUpdated = async (updated: Submission) => {
    setActiveSubmission(updated);
    await refreshBootstrapSilently();
  };

  const handleSpeakingCompleted = async (
    session: SpeakingSessionRecord,
    updatedProfile: UserProfile
  ) => {
    setActiveSpeakingSession(session);
    setActiveSpeaking(null);
    setDb((prev) => (prev ? { ...prev, userProfile: updatedProfile } : prev));
    setRoute('speaking-report');
    await refreshBootstrapSilently();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FB] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin text-[#FF4B3A]" />
          <span>Загрузка IELTS Writing &amp; Speaking Lab…</span>
        </div>
      </div>
    );
  }

  if (loadError || !db) {
    return (
      <div className="min-h-screen bg-[#F8F9FB] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full space-y-4 text-center">
          <AlertCircle className="w-7 h-7 text-red-600 mx-auto" />
          <p className="text-sm text-slate-800">{loadError || 'Ошибка загрузки'}</p>
          <button
            type="button"
            onClick={loadBootstrap}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 cursor-pointer"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  const isStudioFullscreenRoute =
    route === 'workspace' || route === 'speaking-workspace';

  const a11yClasses = [
    db.userProfile.fontSize === 'large' ? 'a11y-large-text' : '',
    db.userProfile.highContrast ? 'a11y-high-contrast' : '',
    db.userProfile.reducedMotion ? 'a11y-reduced-motion' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`min-h-screen bg-[#F8F9FB] text-slate-900 flex flex-col lg:flex-row ${a11yClasses}`}>
      {!isStudioFullscreenRoute && (
        <SidebarNav
          currentRoute={route}
          userProfile={db.userProfile}
          onNavigate={navigateWithScroll}
          onReplayOnboarding={() => setOnboardingOpen(true)}
          voiceControl={
            route === 'coach'
              ? undefined
              : {
                  isSupported: voiceNav.isSupported,
                  isListening: voiceNav.isListening,
                  onToggle: voiceNav.toggleListening,
                  onOpenHelp: () => setVoiceHelpOpen((v) => !v),
                }
          }
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {!isStudioFullscreenRoute && (
          <TopContextBar
            currentRoute={route}
            xp={db.userProfile.xp}
            onNavigate={navigateWithScroll}
            voiceControl={
              route === 'coach'
                ? undefined
                : {
                    isSupported: voiceNav.isSupported,
                    isListening: voiceNav.isListening,
                    onToggle: voiceNav.toggleListening,
                    onOpenHelp: () => setVoiceHelpOpen((v) => !v),
                  }
            }
          />
        )}

        <main className="flex-1">
          {route === 'home' && (
            <HomeView
              submissions={db.submissions}
              speakingSessions={db.speakingSessions}
              errorJournal={db.errorJournal}
              tasks={db.tasks}
              userProfile={db.userProfile}
              leaderboard={db.leaderboard}
              onNavigate={setRoute}
              onOpenSubmission={handleOpenSubmission}
              onOpenSpeakingSession={handleOpenSpeakingSession}
              onStartTask={(task) => handleStartTask(task, 'practice', null)}
              onUpdateProfile={handleUpdateProfile}
            />
          )}

          {route === 'study-plan' && (
            <StudyPlanView
              userProfile={db.userProfile}
              submissions={db.submissions}
              speakingSessions={db.speakingSessions}
              errorJournal={db.errorJournal}
              onNavigate={setRoute}
              onUpdateProfile={handleUpdateProfile}
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

          {route === 'speaking' && (
            <SpeakingHubView
              speakingTopics={db.speakingTopics}
              speakingMockTests={db.speakingMockTests}
              onStartMock={handleStartSpeakingMock}
              onStartTopic={handleStartSpeakingTopic}
              onTopicCreated={(newTopic) =>
                setDb((prev) =>
                  prev
                    ? { ...prev, speakingTopics: [newTopic, ...prev.speakingTopics] }
                    : prev
                )
              }
              onTopicDeleted={(id) =>
                setDb((prev) =>
                  prev
                    ? {
                        ...prev,
                        speakingTopics: prev.speakingTopics.filter((t) => t.id !== id),
                        speakingMockTests: prev.speakingMockTests.filter(
                          (m) =>
                            m.part1TopicId !== id &&
                            m.part2TopicId !== id &&
                            m.part3TopicId !== id
                        ),
                      }
                    : prev
                )
              }
            />
          )}

          {route === 'coach' && (
            <AICoachView
              userProfile={db.userProfile}
              onUpdateProfile={handleUpdateProfile}
            />
          )}

          {route === 'progress' && (
            <ProgressView
              submissions={db.submissions}
              speakingSessions={db.speakingSessions}
              errorJournal={db.errorJournal}
              exercises={db.exercises}
              flashcards={db.flashcards}
              onOpenSubmission={handleOpenSubmission}
              onOpenSpeakingSession={handleOpenSpeakingSession}
              onExercisesUpdated={(exercises) =>
                setDb((prev) => (prev ? { ...prev, exercises } : prev))
              }
              onJournalUpdated={(errorJournal) =>
                setDb((prev) => (prev ? { ...prev, errorJournal } : prev))
              }
              onFlashcardsUpdated={(flashcards) =>
                setDb((prev) => (prev ? { ...prev, flashcards } : prev))
              }
              onUserDataCleared={refreshBootstrapSilently}
            />
          )}

          {route === 'settings' && (
            <SettingsView
              userProfile={db.userProfile}
              onUpdateProfile={handleUpdateProfile}
              onAudioDeleted={async () => {
                const res = await fetch('/api/speaking/audio', { method: 'DELETE' });
                if (res.ok) await refreshBootstrapSilently();
              }}
              onAllUserDataCleared={async () => {
                const res = await fetch('/api/user-data', { method: 'DELETE' });
                if (res.ok) await refreshBootstrapSilently();
              }}
            />
          )}

          {route === 'admin' && (
            <AdminView
              tasks={db.tasks}
              mockTests={db.mockTests}
              speakingTopics={db.speakingTopics}
              speakingMockTests={db.speakingMockTests}
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
              onSpeakingTopicDeleted={(id) =>
                setDb((prev) =>
                  prev
                    ? {
                        ...prev,
                        speakingTopics: prev.speakingTopics.filter((t) => t.id !== id),
                      }
                    : prev
                )
              }
              onSpeakingMockCreated={(m) =>
                setDb((prev) =>
                  prev
                    ? { ...prev, speakingMockTests: [m, ...prev.speakingMockTests] }
                    : prev
                )
              }
              onSpeakingMockDeleted={(id) =>
                setDb((prev) =>
                  prev
                    ? {
                        ...prev,
                        speakingMockTests: prev.speakingMockTests.filter((m) => m.id !== id),
                      }
                    : prev
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

          {route === 'speaking-workspace' && activeSpeaking && (
            <SpeakingWorkspace
              config={activeSpeaking}
              userProfile={db.userProfile}
              onExit={() => {
                setActiveSpeaking(null);
                setRoute('speaking');
              }}
              onCompleted={handleSpeakingCompleted}
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

          {route === 'speaking-report' && activeSpeakingSession && (
            <SpeakingReportView
              session={activeSpeakingSession}
              userProfile={db.userProfile}
              onBack={() => setRoute('progress')}
            />
          )}
        </main>

        {!isStudioFullscreenRoute && (
          <footer className="border-t border-slate-200 bg-white mt-12">
            <div className="max-w-[1160px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <span>IELTS Writing &amp; Speaking Lab · Диагностика и тренировка</span>
              <span>Примерный балл платформы (AI estimate) · Не заменяет официальный сертификат IELTS</span>
            </div>
          </footer>
        )}
      </div>

      {pendingExam && (
        <PreExamCheckModal
          title={pendingExam.title}
          requireMicrophone={pendingExam.kind === 'speaking'}
          onCancel={() => setPendingExam(null)}
          onStart={(enteredFullscreen) => {
            if (pendingExam.kind === 'writing') {
              setActiveSession({
                ...pendingExam.session,
                enteredFullscreen,
              });
              setRoute('workspace');
            } else {
              setActiveSpeaking({
                ...pendingExam.speakingConfig,
                enteredFullscreen,
              });
              setRoute('speaking-workspace');
            }
            setPendingExam(null);
          }}
        />
      )}

      <LevelUpNotification
        event={levelUpEvent}
        onDismiss={() => setLevelUpEvent(null)}
        onViewProgress={() => {
          setLevelUpEvent(null);
          setRoute('progress');
        }}
      />

      {!isStudioFullscreenRoute && !pendingExam && (
        <OnboardingGuide
          open={onboardingOpen}
          currentRoute={route}
          onNavigate={navigateWithScroll}
          onClose={() => setOnboardingOpen(false)}
          reducedMotion={db.userProfile.reducedMotion}
        />
      )}

      {!isStudioFullscreenRoute && route !== 'coach' && (
        <VoiceCommandOverlay
          isSupported={voiceNav.isSupported}
          status={voiceNav.status}
          transcript={voiceNav.transcript}
          lastMatch={voiceNav.lastMatch}
          errorMessage={voiceNav.errorMessage}
          helpOpen={voiceHelpOpen}
          onCloseHelp={() => setVoiceHelpOpen(false)}
          onStopListening={voiceNav.stopListening}
          onStartListening={voiceNav.startListening}
          onNavigate={navigateWithScroll}
        />
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
