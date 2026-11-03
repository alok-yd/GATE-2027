import {
  ROADMAP_PHASE_1,
  ROADMAP_PHASE_2_WEEKLY,
  ROADMAP_PHASE_3_MASTERY,
  STRATEGIES,
} from '../../data';
import {
  getDailyLogs,
  getMockResults,
  getPYQEntries,
  getStudentProfile,
  getStoredSubjects,
  getSubjectLectureStatus,
  getWeeklyTargets,
} from '../DataExtractor';
import { listTestAnalyses } from '../AINativeServices';
import {
  getTodayDateString,
  StorageService,
} from '../../components/focus/services/storage';

const localDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const safeReadObject = <T extends Record<string, unknown>>(key: string): T => {
  try {
    const value = localStorage.getItem(key);
    if (!value) return {} as T;
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as T
      : {} as T;
  } catch {
    return {} as T;
  }
};

const cleanRoadmapItem = (item: (typeof ROADMAP_PHASE_1)[number]) => ({
  id: item.id,
  title: item.title,
  period: item.period,
  focus: item.focus,
  tasks: item.tasks,
  goal: item.goal,
  configuredStatus: item.status,
});

export const getRoadmapMentorContext = () => {
  const profile = getStudentProfile();
  return {
    source: 'Roadmap section records in data.ts plus current subject progress from DataExtractor.',
    capturedAt: new Date().toISOString(),
    currentPreparationPhase: profile.currentPhase,
    overallSubjectProgress: {
      completedSubjects: profile.subjects.filter((subject) => subject.completionRate >= 100).map((subject) => subject.name),
      remainingSubjects: profile.subjects
        .filter((subject) => subject.completionRate < 100)
        .map((subject) => ({
          subject: subject.name,
          completedUnits: subject.topicsCompleted,
          totalUnits: subject.topicsTotal,
          completionPercent: subject.completionRate,
        })),
      totalSubjects: profile.subjects.length,
    },
    roadmapProgress: profile.roadmapProgress,
    phases: [
      { id: 'phase-1', label: 'AIR-1 Baseline', items: ROADMAP_PHASE_1.map(cleanRoadmapItem) },
      { id: 'phase-2', label: 'Revision + PYQ Mastery', items: ROADMAP_PHASE_2_WEEKLY.map(cleanRoadmapItem) },
      { id: 'phase-3', label: 'Mock Blitz + Final Sharpening', items: ROADMAP_PHASE_3_MASTERY.map(cleanRoadmapItem) },
    ],
    interpretationNotes: [
      'Subject completion values come from the current Lecture Tracker subject records.',
      'Roadmap item statuses are the configured values currently present in the Roadmap data; the Roadmap section does not persist separate per-item completion timestamps.',
      'Period values are the original roadmap labels. No exact due date is inferred from a month or descriptive period.',
    ],
  };
};

export const getAIFocusMentorContext = (requestedDays = 14) => {
  const today = getTodayDateString();
  const validDays = Number.isFinite(requestedDays)
    ? Math.max(1, Math.min(90, Math.floor(requestedDays)))
    : 14;
  const history = StorageService.getVerifiedStudyTimeHistory(3650);
  const historyByDate = new Map(history.map((day) => [day.date, day]));
  const recentDailyHistory = history.slice(-validDays);
  const todayBreakdown = StorageService.getVerifiedStudyBreakdownForDate(today);
  const settings = StorageService.getSettings();
  const dailyTargetSeconds = Math.max(0, Number(settings.dailyTargetHours || 0) * 3600);
  const todayAchievementPercent = dailyTargetSeconds > 0
    ? Number(((todayBreakdown.totalSeconds / dailyTargetSeconds) * 100).toFixed(1))
    : null;

  // StorageService seeds two illustrative demo sessions when no sessions exist.
  // Exclude those fixed IDs so Mentor never presents sample rows as user activity.
  const realSessions = StorageService.getSessions()
    .filter((session) => /^sess_\d+_\d+$/.test(String(session.id || '')))
    .sort((a, b) => Number(b.startTime) - Number(a.startTime))
    .slice(0, 20)
    .map((session) => ({
      id: session.id,
      subject: session.subject,
      topic: session.topic,
      studyMedium: session.studyMedium,
      startedAt: new Date(session.startTime).toISOString(),
      endedAt: Number.isFinite(Number(session.endTime)) ? new Date(session.endTime).toISOString() : null,
      targetSeconds: session.targetSeconds,
      verifiedFocusedSeconds: session.focusedSeconds,
      screenStudySeconds: session.screenFocusedSeconds,
      paperPyqStudySeconds: session.paperFocusedSeconds,
      mixedStudySeconds: session.mixedFocusedSeconds,
      awaySeconds: session.awaySeconds,
      manualPausedSeconds: session.pausedSeconds,
      breakSeconds: session.breakSeconds,
      status: session.status,
    }));

  const lastSevenDates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return localDateKey(date);
  });

  return {
    source: 'Persistent AI Focus verified-study-time ledger. Timer elapsed time is not used as a substitute for verified focus.',
    capturedAt: new Date().toISOString(),
    today: {
      date: today,
      ...todayBreakdown,
      targetSeconds: dailyTargetSeconds,
      targetHours: Number(settings.dailyTargetHours || 0),
      targetAchievementPercent: todayAchievementPercent,
      remainingTargetSeconds: Math.max(0, dailyTargetSeconds - todayBreakdown.totalSeconds),
    },
    lastSevenDays: lastSevenDates.map((date) => ({
      date,
      ...(historyByDate.get(date) || {
        totalSeconds: 0,
        screenStudySeconds: 0,
        paperPyqStudySeconds: 0,
        mixedStudySeconds: 0,
        sessionCount: 0,
      }),
    })),
    recentDailyHistory,
    allTimeVerifiedSeconds: history.reduce((sum, day) => sum + day.totalSeconds, 0),
    savedSessionHistory: realSessions,
    dataQuality: [
      'Daily verified seconds are read from the same persistent ledger used by Lecture Tracker synchronization.',
      'Only webcam-verified FOCUSED intervals are included in that ledger; absent, manual-pause, break and unverified time are excluded.',
      'The live verified-time ledger may include a session that has not yet been finalized in saved session history.',
      'Only the most recent 20 finalized non-demo session records are returned.',
    ],
  };
};

export const getLectureTrackerMentorContext = () => {
  const today = getTodayDateString();
  const subjects = getStoredSubjects();
  const logs = getDailyLogs();
  const weeklyTargets = getWeeklyTargets();
  const todayLog = logs.find((log) => log.date === today) || null;
  const recentLogs = logs.slice(-45).map((log) => {
    const extended = log as typeof log & {
      hoursStudiedSource?: 'ai_focus' | 'manual';
      aiFocusVerifiedSeconds?: number;
    };
    return {
      ...log,
      studyHoursSource: extended.hoursStudiedSource || 'legacy_or_unlabelled',
      aiFocusVerifiedSeconds: extended.aiFocusVerifiedSeconds,
      plannedGoalLines: String(log.goalDescription || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      note: 'Goal lines are planning text. The existing Daily Study Log does not record completion status for each individual line.',
    };
  });

  const subjectProgress = subjects.map((subject) => ({
    id: subject.id,
    subject: subject.name,
    phase: subject.phase,
    ...getSubjectLectureStatus(subject),
  }));

  return {
    source: 'Lecture Tracker current localStorage records: gate_subjects, gate_daily_target_*, and gate_weekly_target_*.',
    capturedAt: new Date().toISOString(),
    today,
    subjectProgress,
    totals: {
      totalSubjects: subjectProgress.length,
      completedSubjects: subjectProgress.filter((subject) => subject.isComplete).length,
      totalLectures: subjectProgress.reduce((sum, subject) => sum + subject.totalLectures, 0),
      completedLectures: subjectProgress.reduce((sum, subject) => sum + subject.completedLectures, 0),
      remainingLectures: subjectProgress.reduce((sum, subject) => sum + subject.remainingLectures, 0),
    },
    todayLog,
    recentDailyLogs: recentLogs,
    weeklyTargets: weeklyTargets.slice(-16),
    dataQuality: [
      'Daily goalDescription lines are stored as free text; the current tracker does not persist a separate completed/pending status for each line.',
      'Per-subject lecture counts are actual Lecture Tracker values.',
      'Study-hour source metadata is included when present; legacy entries may not have a source label.',
    ],
  };
};

export const getPYQExecutionMentorContext = (subjectFilter = '') => {
  const entries = getPYQEntries();
  const filter = subjectFilter.trim().toLowerCase();
  const selected = filter
    ? entries.filter((entry) => entry.subject.toLowerCase().includes(filter))
    : entries;

  const grouped = new Map<string, {
    subject: string;
    loggedQuestionCount: number;
    attempted: number;
    correct: number;
    entries: number;
  }>();

  selected.forEach((entry) => {
    const current = grouped.get(entry.subject) || {
      subject: entry.subject,
      loggedQuestionCount: 0,
      attempted: 0,
      correct: 0,
      entries: 0,
    };
    current.loggedQuestionCount += Number(entry.count || 0);
    current.attempted += Number(entry.attempted || 0);
    current.correct += Number(entry.correct || 0);
    current.entries += 1;
    grouped.set(entry.subject, current);
  });

  const subjectSummaries = Array.from(grouped.values()).map((row) => ({
    ...row,
    measuredAccuracyPercent: row.attempted > 0
      ? Number(((row.correct / row.attempted) * 100).toFixed(1))
      : null,
    accuracyStatus: row.attempted > 0
      ? 'Measured using recorded correct / attempted counts.'
      : 'Not recorded: no correct/attempted denominator is available.',
  }));

  return {
    source: 'PYQ Execution Tracker gate_pyq_entries through DataExtractor.getPYQEntries().',
    capturedAt: new Date().toISOString(),
    totalLoggedQuestions: selected.reduce((sum, entry) => sum + Number(entry.count || 0), 0),
    totalEntries: selected.length,
    subjects: subjectSummaries,
    recentEntries: selected.slice(-60).reverse(),
    dataQuality: [
      'The logged question count is a tracker counter; it is not automatically the same as the attempted denominator.',
      'Accuracy is reported only where attempted and correct counts have both been recorded.',
      'First-pass/second-pass status and difficulty are not present in the current PYQ entry schema.',
    ],
  };
};

export const getTestPerformanceMentorContext = (limit = 20) => {
  const validLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 20;
  const mocks = getMockResults().slice(-validLimit).reverse();
  const analyses = listTestAnalyses().slice(0, Math.min(validLimit, 20));

  return {
    source: 'Test Performance gate_mocks records plus separate AI Native imported/manual test-analysis records.',
    capturedAt: new Date().toISOString(),
    totalRecordedTests: getMockResults().length,
    recentTests: mocks,
    importedOrManualAnalyses: analyses,
    dataQuality: [
      'Question-level correct/wrong/attempted values are included only when present in the saved test record.',
      'Imported/manual analyses are kept separate from actual saved mock result rows.',
      'No question-wise analysis is inferred when the test record does not contain it.',
    ],
  };
};

export const getRevisionMentorContext = () => {
  const profile = getStudentProfile();
  const done = safeReadObject<Record<string, unknown>>('gate_revision_done');
  const tasks = [
    { id: 'cycle-1', label: 'Cycle 1: Full Revision', detail: 'All GATE CS subjects from short notes.', target: 'Finish by 31 July 2026' },
    { id: 'pyq-2015-2020', label: 'PYQs 2015-2020', detail: 'Solve with each subject in the Deep Revision Sprint.', target: 'One subject per week' },
    { id: 'error-log', label: 'Error Log Setup', detail: 'Every wrong answer gets reason, concept gap, and revisit date.', target: 'Daily' },
    { id: 'cycle-2', label: 'Cycle 2: Weak Chapters', detail: 'Only error log and weak chapters. Skip strong topics.', target: 'Aug-Oct 2026' },
    { id: 'pyq-2010-2024', label: 'All PYQs 2010-2024', detail: 'Tier 1 first, then Tier 2, then depth practice.', target: '90%+ accuracy' },
    { id: 'cycle-3', label: 'Cycle 3: Formula Sheets', detail: 'Concise notes, formulas, traps, and wrong PYQs only.', target: 'Nov-Jan 2027' },
  ].map((task) => ({
    ...task,
    completed: done[task.id] === true,
    status: done[task.id] === true ? 'completed' : 'not marked complete',
  }));

  return {
    source: 'Revision checklist gate_revision_done used by the existing Revision section.',
    capturedAt: new Date().toISOString(),
    // Preserve the legacy revision tool payload fields while adding exact checklist state.
    revisionProgress: profile.revisionProgress,
    roadmapProgress: profile.roadmapProgress,
    weeklyTargets: profile.weeklyTargets,
    completedCount: tasks.filter((task) => task.completed).length,
    totalCount: tasks.length,
    completionPercent: tasks.length
      ? Math.round((tasks.filter((task) => task.completed).length / tasks.length) * 100)
      : 0,
    tasks,
    dataQuality: [
      'The existing Revision section persists a boolean checkbox per checklist item, not a per-subject topic schedule.',
      'Individual completion timestamps and spaced-repetition dates are not currently recorded.',
      'A task not marked complete is reported as not marked complete, not as proof that it was never studied.',
    ],
  };
};

export const getStrategyTipsMentorContext = () => ({
  source: 'Static STRATEGIES records currently rendered by the Strategy & Tips section.',
  capturedAt: new Date().toISOString(),
  strategies: STRATEGIES,
  note: 'These are configured strategy cards, not a separate log of which recommendations the user has accepted or completed.',
});
