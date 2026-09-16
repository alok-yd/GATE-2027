import { INITIAL_SUBJECTS, ROADMAP_PHASE_1, ROADMAP_PHASE_2_WEEKLY, ROADMAP_PHASE_3_MASTERY } from '../data';
import {
  DailyStudyLog,
  LectureSubject,
  MockResult,
  PYQPracticeEntry,
  RevisionProgress,
  RoadmapProgress,
  StudentProfile,
  StudentSubjectPerformance,
  SubjectPYQPerformance,
  TestSeriesItem,
  WeeklyStudyTarget,
} from '../types';

const GATE_2027_DATE = '2027-02-07T00:00:00';

const EXAM_WEIGHTS: Record<string, number> = {
  aptitude: 15,
  math: 13,
  digital: 4,
  coa: 6,
  compiler: 4,
  cn: 8,
  algo: 7,
  ds: 5,
  os: 8,
  dbms: 6,
  toc: 7,
  cprog: 5,
  discrete: 7,
};

const TOPIC_BANK: Record<string, string[]> = {
  aptitude: ['Quantitative Aptitude', 'Verbal Ability', 'Engineering Aptitude', 'Reasoning'],
  math: ['Linear Algebra', 'Probability', 'Discrete Math', 'Calculus'],
  digital: ['Number Systems', 'Combinational Circuits', 'Sequential Circuits', 'Boolean Algebra'],
  coa: ['Pipelining', 'Cache Memory', 'Instruction Formats', 'I/O Organization'],
  compiler: ['Parsing', 'Lexical Analysis', 'Syntax Directed Translation', 'Code Optimization'],
  cn: ['Transport Layer', 'Routing', 'Subnetting', 'Application Layer'],
  algo: ['Graphs', 'Dynamic Programming', 'Greedy Algorithms', 'Asymptotic Analysis'],
  ds: ['Trees', 'Hashing', 'Stacks and Queues', 'Heaps'],
  os: ['Process Synchronization', 'Memory Management', 'Scheduling', 'File Systems'],
  dbms: ['Normalization', 'Transactions', 'SQL', 'Indexing'],
  toc: ['Regular Languages', 'Context Free Grammar', 'Turing Machines', 'Decidability'],
  cprog: ['Pointers', 'Arrays', 'Functions', 'Storage Classes'],
  discrete: ['Set Theory', 'Combinatorics', 'Graph Theory', 'Mathematical Logic'],
};

const PYQ_STORAGE_KEY = 'gate_pyq_entries';

const REVISION_TASK_IDS = ['cycle-1', 'pyq-2015-2020', 'error-log', 'cycle-2', 'pyq-2010-2024', 'cycle-3'];

const normalizeSubjectName = (value: string) =>
  value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

const subjectAliases: Record<string, string> = {
  aptitude: 'General Aptitude',
  generalaptitude: 'General Aptitude',
  math: 'Engineering Mathematics',
  maths: 'Engineering Mathematics',
  engineeringmath: 'Engineering Mathematics',
  engineeringmathematics: 'Engineering Mathematics',
  discretemath: 'Discrete Mathematics',
  discretemathematics: 'Discrete Mathematics',
  algo: 'Algorithms',
  algorithm: 'Algorithms',
  algorithms: 'Algorithms',
  ds: 'Data Structures',
  datastructure: 'Data Structures',
  datastructures: 'Data Structures',
  os: 'Operating Systems',
  operatingsystem: 'Operating Systems',
  operatingsystems: 'Operating Systems',
  dbms: 'DBMS',
  databasemanagementsystem: 'DBMS',
  databasemanagementsystems: 'DBMS',
  cn: 'Computer Networks',
  computernetwork: 'Computer Networks',
  computernetworks: 'Computer Networks',
  toc: 'Theory of Computation',
  theoryofcomputation: 'Theory of Computation',
  compiler: 'Compiler Design',
  compilerdesign: 'Compiler Design',
  digital: 'Digital Logic',
  digitallogic: 'Digital Logic',
  coa: 'COA',
  computerorgandarch: 'COA',
  computerorganizationandarchitecture: 'COA',
  computerarchitecture: 'COA',
  cprog: 'C Programming',
  clanguage: 'C Programming',
  cprogramming: 'C Programming',
};

const canonicalSubjectName = (value: string) => {
  const normalized = normalizeSubjectName(value);
  return subjectAliases[normalized] || value.trim();
};

const pyqSubjectNames = Array.from(
  new Set([
    ...INITIAL_SUBJECTS.map((subject) => canonicalSubjectName(subject.name)),
    'Discrete Mathematics',
  ])
).sort((a, b) => a.localeCompare(b));

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const todayKey = () => new Date().toISOString().split('T')[0];

export const calculateDaysTillGate2027 = () => {
  const examDate = new Date(GATE_2027_DATE);
  const today = new Date();
  return Math.max(0, Math.ceil((examDate.getTime() - today.getTime()) / 86400000));
};

export const getCurrentPhaseSummary = () => {
  const now = new Date();
  const aug2026 = new Date('2026-08-01T00:00:00');
  const nov2026 = new Date('2026-11-01T00:00:00');
  const feb2027 = new Date(GATE_2027_DATE);

  if (now < aug2026) {
    return {
      title: 'Deep Revision Sprint',
      period: 'May 2026 - July 2026',
      checkpoints: [
        ['Syllabus', 'Complete'],
        ['PYQs', '2015-2020'],
        ['Sectional mocks', '1/week'],
      ],
    };
  }

  if (now < nov2026) {
    return {
      title: 'PYQ Mastery + Sectional Mocks',
      period: 'August 2026 - October 2026',
      checkpoints: [
        ['PYQs', '2010-2024'],
        ['Full mocks', '2/week'],
        ['Target score', '55-62+'],
      ],
    };
  }

  if (now < feb2027) {
    return {
      title: 'Full Mock Blitz + Final Sharpening',
      period: 'November 2026 - February 2027',
      checkpoints: [
        ['Full mocks', '3/week'],
        ['Mock target', '70+/100'],
        ['Final 10 days', 'No new mocks'],
      ],
    };
  }

  return {
    title: 'Post Exam Review',
    period: 'After GATE 2027',
    checkpoints: [
      ['Analyze paper', 'Now'],
      ['Interview prep', 'Next'],
      ['Counselling plan', 'Next'],
    ],
  };
};

export const getStoredSubjects = (): LectureSubject[] => {
  const storedSubjects = safeParse<LectureSubject[]>(
    localStorage.getItem('gate_subjects'),
    []
  );

  if (storedSubjects.length > 0) {
    const merged = [...storedSubjects];
    INITIAL_SUBJECTS.forEach((subject) => {
      if (!merged.some((stored) => stored.id === subject.id)) {
        merged.push(subject);
      }
    });

    return merged.map((subject) => ({
      ...subject,
      completedLectures: subject.totalLectures,
    }));
  }

  return INITIAL_SUBJECTS.map((subject) => {
    const savedCount = localStorage.getItem(`lectures_${subject.id}`);
    return {
      ...subject,
      completedLectures: Math.max(subject.totalLectures, Number(savedCount) || subject.completedLectures),
    };
  });
};

export const getDailyLogs = (): DailyStudyLog[] => {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith('gate_daily_target_'))
    .map((key) =>
      safeParse<DailyStudyLog | null>(localStorage.getItem(key), null)
    )
    .filter((log): log is DailyStudyLog => Boolean(log?.date))
    .sort((a, b) => a.date.localeCompare(b.date));
};

export const getWeeklyTargets = (): WeeklyStudyTarget[] => {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith('gate_weekly_target_'))
    .map((key) =>
      safeParse<WeeklyStudyTarget | null>(localStorage.getItem(key), null)
    )
    .filter((target): target is WeeklyStudyTarget => Boolean(target?.weekId))
    .sort((a, b) => a.weekId.localeCompare(b.weekId));
};

export const getMockResults = (): MockResult[] =>
  safeParse<MockResult[]>(localStorage.getItem('gate_mocks'), [])
    .map((mock) => ({
      ...mock,
      testType: mock.testType || (mock.totalMarks >= 100 ? 'FULL' : 'TOPIC'),
      sheet: mock.sheet || (mock.totalMarks >= 100 ? 'Full Mock' : 'Topic Test'),
      durationMinutes: mock.durationMinutes || (mock.totalMarks >= 100 ? 180 : 40),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.id && b.id ? a.id.localeCompare(b.id, undefined, { numeric: true }) : 0));

export const saveMockResult = (mock: Omit<MockResult, 'id'>) => {
  const mocks = getMockResults();
  const next: MockResult = {
    ...mock,
    id: `mock_${Date.now()}`,
  };
  localStorage.setItem('gate_mocks', JSON.stringify([...mocks, next]));
  window.dispatchEvent(new Event('storage'));
  return next;
};

export const deleteMockResult = (id: string) => {
  const mocks = getMockResults().filter((mock) => mock.id !== id);
  localStorage.setItem('gate_mocks', JSON.stringify(mocks));
  window.dispatchEvent(new Event('storage'));
};

export const DEFAULT_TEST_SERIES: TestSeriesItem[] = [
  {
    id: 'ace-ots-gate-2027',
    name: 'ACE Online Test Series (OTS)',
    provider: 'ACE Engineering Academy',
    targetExam: 'GATE 2027 (CS & IT)',
    url: 'https://ots.aceenggacademy.com/#/user-app/userSubscriptions/userSubView/8021f68f-c9c1-4a19-b235-84b144bf78da/userSubscriptions',
    description: 'Official Enrolled Online Test Series: Topic-wise, Subject-wise, Multi-Subject, and Full-Length All India Mock Tests.',
    status: 'active',
    badge: 'Primary Test Series',
    enrolledDate: '2026',
  },
];

export const getTestSeriesList = (): TestSeriesItem[] => {
  const stored = safeParse<TestSeriesItem[]>(localStorage.getItem('gate_test_series'), []);
  if (!stored || stored.length === 0) {
    localStorage.setItem('gate_test_series', JSON.stringify(DEFAULT_TEST_SERIES));
    return DEFAULT_TEST_SERIES;
  }
  const ace = stored.find((s) => s.id === 'ace-ots-gate-2027');
  if (ace && ace.url !== DEFAULT_TEST_SERIES[0].url) {
    ace.url = DEFAULT_TEST_SERIES[0].url;
    localStorage.setItem('gate_test_series', JSON.stringify(stored));
  }
  return stored;
};

export const saveTestSeries = (item: TestSeriesItem): TestSeriesItem[] => {
  const current = getTestSeriesList();
  const exists = current.findIndex((s) => s.id === item.id);
  let updated: TestSeriesItem[];
  if (exists >= 0) {
    updated = current.map((s) => (s.id === item.id ? item : s));
  } else {
    updated = [...current, item];
  }
  localStorage.setItem('gate_test_series', JSON.stringify(updated));
  window.dispatchEvent(new Event('storage'));
  return updated;
};

export const deleteTestSeries = (id: string): TestSeriesItem[] => {
  const current = getTestSeriesList().filter((s) => s.id !== id);
  localStorage.setItem('gate_test_series', JSON.stringify(current));
  window.dispatchEvent(new Event('storage'));
  return current;
};

export const getPYQEntries = (): PYQPracticeEntry[] =>
  safeParse<PYQPracticeEntry[]>(localStorage.getItem(PYQ_STORAGE_KEY), [])
    .filter((entry) => entry.subject && Number(entry.count) > 0 && entry.date)
    .map((entry) => {
      const attempted = Number(entry.attempted || 0);
      const correct = Number(entry.correct || 0);
      return {
        ...entry,
        subject: canonicalSubjectName(entry.subject),
        count: Number(entry.count),
        attempted: attempted > 0 ? attempted : undefined,
        correct: correct > 0 ? correct : undefined,
        createdAt: entry.createdAt || `${entry.date}T00:00:00.000Z`,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

const buildPYQPerformance = (entries: PYQPracticeEntry[]): SubjectPYQPerformance[] => {
  return pyqSubjectNames.map((subject) => {
    const relatedEntries = entries.filter((entry) => canonicalSubjectName(entry.subject) === subject);
    const totalSolved = relatedEntries.reduce((sum, entry) => sum + Number(entry.count || 0), 0);
    const attempted = relatedEntries.reduce((sum, entry) => sum + Number(entry.attempted || 0), 0);
    const correct = relatedEntries.reduce((sum, entry) => sum + Number(entry.correct || 0), 0);
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 1000) / 10 : null;

    return {
      subject,
      totalSolved,
      attempted,
      correct,
      accuracy,
    };
  });
};

const getRevisionProgress = (): RevisionProgress => {
  const done = safeParse<Record<string, boolean>>(localStorage.getItem('gate_revision_done'), {});
  const completedTasks = REVISION_TASK_IDS.filter((id) => Boolean(done[id])).length;
  const totalTasks = REVISION_TASK_IDS.length;
  const cycle1Complete = Boolean(done['cycle-1']);
  const cycle2Complete = Boolean(done['cycle-2']);
  const cycle3Complete = Boolean(done['cycle-3']);

  return {
    completedTasks,
    totalTasks,
    completionRate: Math.round((completedTasks / Math.max(totalTasks, 1)) * 100),
    cycle1Complete,
    cycle2Complete,
    cycle3Complete,
    completeRevision: cycle1Complete && cycle2Complete && cycle3Complete,
  };
};

const getRoadmapProgress = (): RoadmapProgress => {
  const roadmap = [...ROADMAP_PHASE_1, ...ROADMAP_PHASE_2_WEEKLY, ...ROADMAP_PHASE_3_MASTERY];
  const completedPoints = roadmap.reduce((sum, item) => {
    if (item.status === 'completed') return sum + 1;
    if (item.status === 'in-progress') return sum + 0.5;
    return sum;
  }, 0);
  const totalPoints = roadmap.length;

  return {
    completedPoints,
    totalPoints,
    completionRate: Math.round((completedPoints / Math.max(totalPoints, 1)) * 100),
  };
};

const getRecentLogs = (logs: DailyStudyLog[], days: number) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffKey = cutoff.toISOString().split('T')[0];
  return logs.filter((log) => log.date >= cutoffKey);
};

const calculateAverageHours = (logs: DailyStudyLog[]) => {
  const recentLogs = getRecentLogs(logs, 14).filter(
    (log) => Number(log.hoursStudied) > 0
  );
  if (recentLogs.length === 0) return 0;
  const total = recentLogs.reduce((sum, log) => sum + Number(log.hoursStudied || 0), 0);
  return Number((total / recentLogs.length).toFixed(1));
};

const calculateConsistencyScore = (logs: DailyStudyLog[], streakDays: number) => {
  const recentLogs = getRecentLogs(logs, 14);
  const activeDays = recentLogs.filter(
    (log) => Number(log.hoursStudied) > 0 || Number(log.completionPercentage) > 0
  ).length;
  const activeDayScore = (activeDays / 14) * 70;
  const streakScore = clamp(streakDays, 0, 14) * 2.15;
  return Math.round(clamp(activeDayScore + streakScore, 0, 100));
};

const calculateWeeklyTargetCompletion = (targets: WeeklyStudyTarget[]) => {
  if (targets.length === 0) return 0;
  const latest = targets[targets.length - 1];
  return Math.round(
    clamp((latest.completedLectures / Math.max(latest.targetLectures, 1)) * 100, 0, 100)
  );
};

const calculateSubjectAccuracy = (
  subject: LectureSubject,
  logs: DailyStudyLog[],
  mockAverage: number | null
) => {
  const completionRate = subject.totalLectures
    ? (subject.completedLectures / subject.totalLectures) * 100
    : 0;
  const subjectTokens = [subject.id, subject.name.toLowerCase()];
  const relatedLogs = logs.filter((log) =>
    subjectTokens.some((token) => log.subject?.toLowerCase().includes(token))
  );
  const activityBonus = clamp(relatedLogs.length * 2, 0, 10);
  const mockAnchor = mockAverage == null ? 0 : (mockAverage - 60) * 0.15;
  return Math.round(clamp(35 + completionRate * 0.55 + activityBonus + mockAnchor, 25, 96));
};

const buildSubjectPerformance = (
  subjects: LectureSubject[],
  logs: DailyStudyLog[],
  mocks: MockResult[]
): StudentSubjectPerformance[] => {
  const mockAverage =
    mocks.length > 0
      ? mocks.reduce((sum, mock) => sum + (mock.score / Math.max(mock.totalMarks, 1)) * 100, 0) /
        mocks.length
      : null;

  return subjects.map((subject) => {
    const completionRate = subject.totalLectures
      ? Math.round((subject.completedLectures / subject.totalLectures) * 100)
      : 0;
    const accuracy = calculateSubjectAccuracy(subject, logs, mockAverage);
    const topics = TOPIC_BANK[subject.id] || [
      `${subject.name} fundamentals`,
      `${subject.name} PYQs`,
      `${subject.name} revision`,
    ];
    const weakCount = accuracy < 55 ? 3 : accuracy < 70 ? 2 : accuracy < 82 ? 1 : 0;
    const strongCount = completionRate > 80 ? 2 : completionRate > 60 ? 1 : 0;

    return {
      id: subject.id,
      name: subject.name,
      phase: subject.phase,
      topicsCompleted: subject.completedLectures,
      topicsTotal: subject.totalLectures,
      completionRate,
      accuracy,
      weakTopics: topics.slice(0, weakCount),
      strongTopics: strongCount > 0 ? topics.slice(-strongCount) : [],
      examWeight: EXAM_WEIGHTS[subject.id] || 5,
    };
  });
};

export const getStudentProfile = (): StudentProfile => {
  const subjects = getStoredSubjects();
  const logs = getDailyLogs();
  const weeklyTargets = getWeeklyTargets();
  const mocks = getMockResults();
  const pyqEntries = getPYQEntries();
  const streakData = safeParse<{ currentStreak: number }>(
    localStorage.getItem('gate_streak_data'),
    { currentStreak: 0 }
  );
  const currentPhase = getCurrentPhaseSummary();
  const streakDays = Number(streakData.currentStreak || 0);

  return {
    target: {
      AIR: 1,
      score: 90,
    },
    daysTillExam: calculateDaysTillGate2027(),
    currentPhase: currentPhase.title,
    subjects: buildSubjectPerformance(subjects, logs, mocks),
    mocks,
    pyqEntries,
    pyqPerformance: buildPYQPerformance(pyqEntries),
    studyMetrics: {
      dailyHours: calculateAverageHours(logs),
      consistencyScore: calculateConsistencyScore(logs, streakDays),
      learningStyle: 'visual',
      streakDays,
      weeklyTargetCompletion: calculateWeeklyTargetCompletion(weeklyTargets),
    },
    recentLogs: getRecentLogs(logs, 14),
    weeklyTargets,
    revisionProgress: getRevisionProgress(),
    roadmapProgress: getRoadmapProgress(),
  };
};

export const applyAlertToToday = (subject: string, goalDescription: string) => {
  const date = todayKey();
  const key = `gate_daily_target_${date}`;
  const existing = safeParse<DailyStudyLog>(localStorage.getItem(key), {
    date,
    subject: '',
    goalDescription: '',
    hoursStudied: 0,
    completionPercentage: 0,
  });

  const updated = {
    ...existing,
    subject: subject || existing.subject,
    goalDescription,
  };

  localStorage.setItem(key, JSON.stringify(updated));
  window.dispatchEvent(new Event('storage'));
};
