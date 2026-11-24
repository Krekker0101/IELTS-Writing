export type IeltsFormat = 'academic' | 'general';
export type TaskNumber = 1 | 2;
export type PracticeMode = 'exam' | 'practice' | 'learning';

export type AcademicTask1Type =
  | 'Bar Chart'
  | 'Line Graph'
  | 'Pie Chart'
  | 'Table'
  | 'Mixed Charts'
  | 'Maps'
  | 'Process Diagrams'
  | 'Object and Technical Diagrams';

export type AcademicTask2Type =
  | 'Agree or Disagree'
  | 'Discuss Both Views'
  | 'Advantages and Disadvantages'
  | 'Problem and Solution'
  | 'Cause and Effect'
  | 'Two-Part Questions'
  | 'Mixed Questions';

export type GeneralTask1Type =
  | 'Formal Letters'
  | 'Semi-formal Letters'
  | 'Informal Letters'
  | 'Requests'
  | 'Complaints'
  | 'Explanations'
  | 'Advice and Suggestions';

export type GeneralTask2Type =
  | 'Opinion Essays'
  | 'Discussion Essays'
  | 'Advantages and Disadvantages'
  | 'Problem and Solution'
  | 'Cause and Effect'
  | 'Two-Part Questions';

export type TaskTypeLabel =
  | AcademicTask1Type
  | AcademicTask2Type
  | GeneralTask1Type
  | GeneralTask2Type;

export type AnnotationCategory =
  | 'Grammar'
  | 'Vocabulary'
  | 'Collocations'
  | 'Spelling'
  | 'Punctuation'
  | 'Sentence Structure'
  | 'Coherence'
  | 'Task Achievement / Task Response'
  | 'Register and Style';

export interface ChartSeries {
  name: string;
  color: string;
  values: number[];
  type?: 'bar' | 'line';
}

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

export interface ChartSpec {
  kind: 'bar' | 'line' | 'pie' | 'table' | 'mixed';
  title: string;
  subtitle?: string;
  unit?: string;
  categories: string[];
  series: ChartSeries[];
  tableHeaders?: string[];
  tableRows?: (string | number)[][];
  pieSlices?: PieSlice[];
  secondaryPie?: {
    title: string;
    slices: PieSlice[];
  };
}

export interface LearningHints {
  outline: string[];
  keyVocabulary: string[];
  pitfalls: string[];
}

export interface WritingTask {
  id: string;
  title: string;
  format: IeltsFormat;
  taskNumber: TaskNumber;
  taskType: TaskTypeLabel;
  promptText: string;
  bulletPoints?: string[];
  chartSpec?: ChartSpec;
  imageUrl?: string;
  tags: string[];
  difficulty: 'Band 6.0' | 'Band 7.0' | 'Band 8.0+';
  recommendedMinutes: number;
  isCustom: boolean;
  aiDetectedType?: string;
  createdAt: string;
  learningHints?: LearningHints;
}

export interface MockTest {
  id: string;
  title: string;
  format: IeltsFormat;
  description: string;
  difficulty: 'Band 6.0' | 'Band 7.0' | 'Band 8.0+';
  task1Id: string;
  task2Id: string;
  totalMinutes: number;
  createdAt: string;
}

export interface AnnotationPractice {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface TextAnnotation {
  id: string;
  startIndex: number;
  endIndex: number;
  originalPhrase: string;
  correction: string;
  category: AnnotationCategory;
  subRule: string;
  severity: 'error' | 'suggestion';
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
  ieltsImpact: string;
  improvementTip: string;
  practice?: AnnotationPractice;
}

export interface CriterionAssessment {
  name: string;
  band: number;
  explanation: string;
  strengths: string[];
  weaknesses: string[];
  nextBandSteps: string[];
}

export interface ContentCheckItem {
  label: string;
  met: boolean;
  note: string;
}

export interface RevisionDiffSummary {
  fixedErrors: string[];
  remainingErrors: string[];
  newErrors: string[];
  bandDelta: number;
  summary: string;
}

export interface TaskEvaluation {
  taskBand: number;
  criteria: CriterionAssessment[];
  summary: string;
  topPriorities: string[];
  chartDataUncertain?: boolean;
  chartUncertaintyNote?: string;
  contentChecklist: ContentCheckItem[];
  annotations: TextAnnotation[];
  revisionDiff?: RevisionDiffSummary;
}

export interface RevisionRecord {
  version: number;
  essayText: string;
  wordCount: number;
  createdAt: string;
  evaluation: TaskEvaluation;
}

export interface TaskSubmissionPart {
  taskId: string;
  taskTitle: string;
  taskType: string;
  taskNumber: TaskNumber;
  promptSnapshot: string;
  revisions: RevisionRecord[];
  timeSpentSec: number;
}

export interface Submission {
  id: string;
  mode: 'mock' | PracticeMode;
  format: IeltsFormat;
  mockTestId?: string;
  mockTestTitle?: string;
  createdAt: string;
  updatedAt: string;
  task1?: TaskSubmissionPart;
  task2?: TaskSubmissionPart;
  overallWritingBand?: number;
  focusEvents?: FocusEventRecord[];
  sessionIntegrity?: 'standard' | 'interrupted';
}

export interface ErrorExampleRecord {
  submissionId: string;
  taskTitle: string;
  originalPhrase: string;
  correction: string;
  explanation: string;
  createdAt: string;
}

export interface ErrorJournalEntry {
  key: string;
  subRule: string;
  category: AnnotationCategory;
  occurrences: number;
  totalWordsEvaluated: number;
  normalizedPer1000Words: number;
  masteryStreak: number;
  mastered: boolean;
  lastSeenAt: string;
  examples: ErrorExampleRecord[];
}

export interface PersonalizedExercise {
  id: string;
  targetSubRule: string;
  category: AnnotationCategory;
  exerciseType: 'sentence_correction' | 'article_choice' | 'preposition_fit' | 'collocation' | 'topic_sentence' | 'argument_development';
  prompt: string;
  sentenceWithBlankOrError: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  completed?: boolean;
  answeredCorrectly?: boolean;
}

export interface VocabularyFlashcard {
  id: string;
  term: string;
  translationOrMeaning: string;
  exampleSentence: string;
  originalMistake: string;
  correctionTip: string;
  sourceModule: 'writing' | 'speaking';
  sourceCategory: string;
  mastered: boolean;
  reviewCount: number;
  createdAt: string;
}

export interface ComplaintRecord {
  id: string;
  submissionId: string;
  taskNumber: TaskNumber;
  annotationId: string;
  originalPhrase: string;
  correction: string;
  category: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface EvaluationSettings {
  feedbackLanguage: 'ru' | 'en';
  strictness: 'standard' | 'strict';
  customExaminerNote: string;
}

export interface DraftEntry {
  key: string;
  task1Text: string;
  task2Text: string;
  remainingSeconds: number;
  startedAtIso?: string;
  updatedAt: string;
}

export type SpeakingPartNumber = 1 | 2 | 3;
export type SpeakingMode = 'exam' | 'practice' | 'coaching';
export type CoachPersona = 'classic' | 'strict' | 'supportive';
export type CoachVoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
export type CoachVisualState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'encouraging'
  | 'celebrating'
  | 'teasing'
  | 'angry_fire'
  | 'calming_down'
  | 'neutral_examiner'
  | 'reconnecting';

export interface SpeakingQuestionItem {
  id: string;
  text: string;
  source: 'user' | 'ai' | 'platform';
}

export interface SpeakingCueCard {
  prompt: string;
  bullets: string[];
}

export interface SpeakingTopic {
  id: string;
  title: string;
  description: string;
  part: SpeakingPartNumber;
  difficulty: 'Band 6.0' | 'Band 7.0' | 'Band 8.0+';
  tags: string[];
  isCustom: boolean;
  sourceLabel: 'Авторское задание платформы' | 'Официальный пример' | 'Моя тема';
  questions: SpeakingQuestionItem[];
  cueCard?: SpeakingCueCard;
  linkedPart3TopicId?: string;
  notes?: string;
  createdAt: string;
}

export interface SpeakingMockTest {
  id: string;
  title: string;
  description: string;
  difficulty: 'Band 6.0' | 'Band 7.0' | 'Band 8.0+';
  part1TopicId: string;
  part2TopicId: string;
  part3TopicId: string;
  totalMinutes: number;
  createdAt: string;
}

export interface SpeakingTurnAnnotation {
  id: string;
  startSec: number;
  endSec: number;
  wordOrPhrase: string;
  minimalCorrection: string;
  category: 'Fluency' | 'Lexical Resource' | 'Grammar' | 'Pronunciation';
  subRule: string;
  severity: 'error' | 'suggestion' | 'uncertain_transcription';
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
  ieltsImpact: string;
  tip: string;
  pronunciationTarget?: string;
  repeatDrillPhrase?: string;
}

export interface FluencySignals {
  estimatedWpm: number;
  longPausesCount: number;
  fillerWordsCount: number;
  selfCorrectionsCount: number;
  repetitionsCount: number;
}

export interface SpeakingTurnRecord {
  id: string;
  part: SpeakingPartNumber;
  questionText: string;
  audioDataUrl?: string;
  durationSec: number;
  transcript: string;
  uncertainWords: string[];
  fluencySignals: FluencySignals;
  annotations: SpeakingTurnAnnotation[];
  examinerNote?: string;
}

export interface SpeakingEvaluation {
  speakingBand: number;
  isPartialPractice: boolean;
  criteria: CriterionAssessment[];
  summary: string;
  strengths: string[];
  topPriorities: string[];
  nextRecommendedExercise: string;
  coachObservation?: string;
  uncertaintyNote?: string;
}

export interface FocusEventRecord {
  type: 'fullscreen_exit' | 'tab_hidden' | 'window_blur';
  at: string;
  durationSec?: number;
}

export interface SpeakingSessionRecord {
  id: string;
  topicId?: string;
  mockTestId?: string;
  title: string;
  part?: SpeakingPartNumber;
  isFullMock: boolean;
  mode: SpeakingMode;
  createdAt: string;
  durationSec: number;
  turns: SpeakingTurnRecord[];
  evaluation: SpeakingEvaluation;
  focusEvents: FocusEventRecord[];
  sessionIntegrity: 'standard' | 'interrupted';
}

export interface StudyPlanDailyTask {
  id: string;
  title: string;
  module: 'writing' | 'speaking' | 'coach' | 'drill';
  minutes: number;
  completed: boolean;
  targetRoute: string;
}

export interface UserProfile {
  name: string;
  format: IeltsFormat;
  currentBand?: number;
  targetBand: number;
  examDate: string;
  taperDaysBeforeExam?: 2 | 3;
  priorityCriteria?: string[];
  coachPersona: CoachPersona;
  coachVoice: CoachVoiceName;
  coachSpeed: number;
  storeAudioRecordings: boolean;
  audioRetentionDays: number;
  dailyGoalMinutes: number;
  restDays: string[];
  streakDays: number;
  xp: number;
  lastActiveDate: string;
  completedDailyTaskIds: string[];
  fontSize: 'normal' | 'large';
  highContrast: boolean;
  reducedMotion: boolean;
  showHeroBanner: boolean;
  leaderboardUsername?: string;
  showUsernameOnLeaderboard?: boolean;
}

export interface LeaderboardEntry {
  id: string;
  username?: string;
  showUsername: boolean;
  streakDays: number;
  xp: number;
  targetBand: number;
  format: IeltsFormat;
  lastActiveDate: string;
  isCurrentUser?: boolean;
}

export interface AppDatabase {
  tasks: WritingTask[];
  mockTests: MockTest[];
  submissions: Submission[];
  errorJournal: ErrorJournalEntry[];
  exercises: PersonalizedExercise[];
  flashcards: VocabularyFlashcard[];
  complaints: ComplaintRecord[];
  drafts: Record<string, DraftEntry>;
  settings: EvaluationSettings;
  speakingTopics: SpeakingTopic[];
  speakingMockTests: SpeakingMockTest[];
  speakingSessions: SpeakingSessionRecord[];
  userProfile: UserProfile;
  leaderboard: LeaderboardEntry[];
}

export interface AnalysisProgressEvent {
  percent: number;
  stageKey:
    | 'connect'
    | 'criteria'
    | 'checklist'
    | 'annotations'
    | 'revision_diff'
    | 'anchoring'
    | 'saving'
    | 'done';
  stage: string;
  detail: string;
  taskNumber?: TaskNumber;
  taskStepLabel?: string;
  charsReceived: number;
  annotationsDetected: number;
  elapsedSec: number;
  estimatedRemainingSec: number | null;
}

export type AIApiConnectionState =
  | 'checking'
  | 'online'
  | 'processing'
  | 'degraded'
  | 'offline'
  | 'unconfigured';

export interface AIHealthStatus {
  status: Exclude<AIApiConnectionState, 'checking'>;
  configured: boolean;
  model: string;
  activeRequests: number;
  latencyMs: number | null;
  checkedAt: string;
  lastSuccessAt: string | null;
  message: string;
}



