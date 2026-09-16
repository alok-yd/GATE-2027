export interface LectureSubject {
  id: string;
  name: string;
  totalLectures: number;
  completedLectures: number;
  phase: 1 | 2;
  color: string;
}

export interface WeeklyPlanItem {
  id: string;
  title: string;
  period: string;
  focus: string[];
  tasks: string[];
  goal: string;
  status: 'pending' | 'in-progress' | 'completed';
}

export interface StrategyItem {
  title: string;
  description: string;
  icon: string;
}

export interface DailyStudyLog {
  date: string;
  subject: string;
  goalDescription: string;
  hoursStudied: number;
  completionPercentage: number;
}

export interface WeeklyStudyTarget {
  weekId: string;
  focus: string;
  targetLectures: number;
  completedLectures: number;
}

export interface MockResult {
  id: string;
  date: string;
  score: number;
  totalMarks: number;
  testType?: 'FULL' | 'SECTIONAL' | 'TOPIC';
  sheet?: string;
  seriesId?: string;
  seriesName?: string;
  testLink?: string;
  rightQuestions?: number;
  wrongQuestions?: number;
  durationMinutes?: number;
  attempted?: number;
  accuracy?: number;
  notes?: string;
}

export interface TestSeriesItem {
  id: string;
  name: string;
  provider: string;
  targetExam: string;
  url: string;
  description?: string;
  status: 'active' | 'completed' | 'upcoming';
  badge?: string;
  enrolledDate?: string;
}

export interface PYQPracticeEntry {
  id: string;
  subject: string;
  count: number;
  date: string;
  createdAt: string;
  attempted?: number;
  correct?: number;
}

export interface SubjectPYQPerformance {
  subject: string;
  totalSolved: number;
  attempted: number;
  correct: number;
  accuracy: number | null;
}

export interface StudentSubjectPerformance {
  id: string;
  name: string;
  phase: 1 | 2;
  topicsCompleted: number;
  topicsTotal: number;
  completionRate: number;
  accuracy: number;
  weakTopics: string[];
  strongTopics: string[];
  examWeight: number;
}

export interface RevisionProgress {
  completedTasks: number;
  totalTasks: number;
  completionRate: number;
  cycle1Complete: boolean;
  cycle2Complete: boolean;
  cycle3Complete: boolean;
  completeRevision: boolean;
}

export interface RoadmapProgress {
  completedPoints: number;
  totalPoints: number;
  completionRate: number;
}

export interface RankReadinessPillar {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  passed: boolean;
  detail: string;
}

export interface RankReadiness {
  score: number;
  range: string;
  confidence: number;
  under50Eligible: boolean;
  pillars: RankReadinessPillar[];
  hardConditions: Array<{
    label: string;
    passed: boolean;
    detail: string;
  }>;
  weakestSubjects: string[];
  metrics: {
    allSubjectsAbove200: boolean;
    totalMocks: number;
    fullMocks: number;
    revisionsComplete: boolean;
    streakDays: number;
    allAccuracyAbove90: boolean;
    roadmapCompletion: number;
    weakestPYQSolved: number;
    weakestPYQAccuracy: number | null;
    testAccuracy: number;
  };
}

export interface StudentProfile {
  target: {
    AIR: number;
    score: number;
  };
  daysTillExam: number;
  currentPhase: string;
  subjects: StudentSubjectPerformance[];
  mocks: MockResult[];
  pyqEntries: PYQPracticeEntry[];
  pyqPerformance: SubjectPYQPerformance[];
  studyMetrics: {
    dailyHours: number;
    consistencyScore: number;
    learningStyle: 'visual' | 'textual' | 'interactive' | 'code-first';
    streakDays: number;
    weeklyTargetCompletion: number;
  };
  recentLogs: DailyStudyLog[];
  weeklyTargets: WeeklyStudyTarget[];
  revisionProgress: RevisionProgress;
  roadmapProgress: RoadmapProgress;
}

export interface WeakArea {
  topic: string;
  subject: string;
  weight: number;
  currentScore: number;
  roi: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  timeRequired: string;
  resources: string[];
  milestones: string[];
}

export interface PerformanceAnalysis {
  assessment: string;
  weakAreas: string[];
  strongAreas: string[];
  timeline: string;
  actionItems: string[];
}

export interface StudyPlanActivity {
  type: 'concept' | 'pyq' | 'revision' | 'mock' | 'analysis';
  topic?: string;
  count?: number;
  duration: number;
}

export interface StudyPlanDay {
  day: string;
  activities: StudyPlanActivity[];
  target: string;
}

export interface StudyPlanWeek {
  weekNumber: number;
  focus: string[];
  daily: StudyPlanDay[];
  milestone: string;
}

export interface StudyPlan {
  weeks: StudyPlanWeek[];
  notes?: string;
}

export interface Alert {
  id?: string;
  type: 'WEAK_AREA' | 'TIME_MANAGEMENT' | 'STREAK_AT_RISK' | 'PERFORMANCE_BOOST' | 'OPPORTUNITY';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  actionRequired: string;
  estimatedImpact: string;
}

export interface AIRPrediction {
  mostLikely: {
    range: string;
    confidence: number;
  };
  optimistic: {
    range: string;
    confidence: number;
  };
  pessimistic: {
    range: string;
    confidence: number;
  };
  keyFactors: string[];
  requiredImprovements: Array<{
    area: string;
    from: number;
    to: number;
    impact: string;
  }>;
  readinessScore?: number;
  rankReadiness?: RankReadiness;
}
