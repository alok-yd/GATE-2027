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
import { listMistakes, listTestAnalyses } from '../AINativeServices';
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

const parseGoalDurationMinutes = (line: string): number | null => {
  const hours = line.match(/\\b(\\d+(?:\\.\\d+)?)\\s*(?:h|hr|hrs|hour|hours)\\b/i);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const minutes = line.match(/\\b(\\d+)\\s*(?:m|min|mins|minute|minutes)\\b/i);
  return minutes ? Number(minutes[1]) : null;
};

const buildDailyGoalDigest = (
  selectedDate: string,
  todayLog: ReturnType<typeof getDailyLogs>[number] | null
) => {
  const rawLines = String(todayLog?.goalDescription || '')
    .split(/\\r?\\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const groups = new Map<string, { subject: string; items: string[]; estimatedMinutes: number; timedItems: number }>();
  rawLines.forEach((rawLine) => {
    const cleaned = rawLine.replace(/^\\[AI Mentor\\]\\s*/i, '');
    const match = cleaned.match(/^([^:]{2,48}):\\s*(.+)$/);
    const subject = (match?.[1] || todayLog?.subject || 'Unassigned').trim();
    const item = (match?.[2] || cleaned).trim();
    const duration = parseGoalDurationMinutes(item);
    const current = groups.get(subject) || {
      subject,
      items: [],
      estimatedMinutes: 0,
      timedItems: 0,
    };
    current.items.push(item);
    if (duration !== null) {
      current.estimatedMinutes += duration;
      current.timedItems += 1;
    }
    groups.set(subject, current);
  });

  const subjectGroups = Array.from(groups.values()).map((group) => ({
    subject: group.subject,
    plannedItemCount: group.items.length,
    plannedItems: group.items,
    estimatedMinutesFromExplicitDurations: group.estimatedMinutes,
    itemsWithExplicitDuration: group.timedItems,
    itemsWithoutExplicitDuration: group.items.length - group.timedItems,
  }));

  const settings = StorageService.getSettings();
  const verifiedToday = StorageService.getVerifiedStudyBreakdownForDate(selectedDate);
  const targetSeconds = Math.max(0, Number(settings.dailyTargetHours || 0) * 3600);

  return {
    date: selectedDate,
    hasDailyLog: Boolean(todayLog),
    primaryFocusSubjects: subjectGroups.map((group) => group.subject),
    subjectGroups,
    totalPlannedItems: rawLines.length,
    estimatedMinutesWithExplicitDurations: subjectGroups.reduce(
      (sum, group) => sum + group.estimatedMinutesFromExplicitDurations,
      0
    ),
    itemsWithoutExplicitDuration: subjectGroups.reduce(
      (sum, group) => sum + group.itemsWithoutExplicitDuration,
      0
    ),
    trackerCompletionPercent: todayLog?.completionPercentage ?? null,
    manuallyLoggedStudyHours: todayLog?.hoursStudied ?? null,
    verifiedStudyTime: {
      ...verifiedToday,
      dailyTargetSeconds: targetSeconds,
      remainingTargetSeconds: Math.max(0, targetSeconds - verifiedToday.totalSeconds),
    },
    weeklyTargets: getWeeklyTargets().slice(-8),
    interpretationRules: [
      'Goal-description lines are grouped by the subject prefix before the first colon when present; otherwise the Daily Study Log subject is used.',
      'These lines are planned work, not verified task-completion records.',
      'The existing tracker does not store an individual completed/pending state for each goal line.',
      'Duration estimates include only explicit time values written in the goal text; no duration is invented for untimed items.',
      'Verified study time comes from the AI Focus persistent ledger; manually logged hours are shown separately.',
    ],
  };
};

export const getLectureTrackerMentorContext = (requestedDate = getTodayDateString()) => {
  const today = /^\\d{4}-\\d{2}-\\d{2}$/.test(requestedDate) ? requestedDate : getTodayDateString();
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
    todayGoalDigest: buildDailyGoalDigest(today, todayLog),
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

const normalizeTestLabel = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const getTestDateTimestamp = (value: unknown): number | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const isoDate = raw.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  const timestamp = isoDate
    ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3])).getTime()
    : new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const safeReadRawMockFields = () => {
  try {
    const value = localStorage.getItem('gate_mocks');
    const parsed: unknown = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return new Map<string, Record<string, unknown>>();
    const entries: Array<[string, Record<string, unknown>]> = parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => [String(item.id || ''), item]);
    return new Map<string, Record<string, unknown>>(entries);
  } catch {
    return new Map<string, Record<string, unknown>>();
  }
};

export const getTestPerformanceMentorContext = (limit = 10, requestedDays = 30) => {
  const validLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 10;
  const validDays = Number.isFinite(requestedDays) ? Math.max(1, Math.min(365, Math.floor(requestedDays))) : 30;
  const now = Date.now();
  const cutoff = now - validDays * 24 * 60 * 60 * 1000;
  const allMocks = getMockResults();
  const rawFields = safeReadRawMockFields();

  // Saved gate_mocks entries are completed test-result records. Do not use
  // getMockResults' UI display defaults as evidence for missing duration fields.
  const inWindow = allMocks
    .map((mock) => {
      const raw = rawFields.get(String(mock.id || '')) || {};
      const testTimestamp = getTestDateTimestamp(mock.date);
      if (testTimestamp === null) return null;
      const normalizedScorePercent = Number(mock.totalMarks) > 0
        ? Number(((Number(mock.score) / Number(mock.totalMarks)) * 100).toFixed(1))
        : null;
      const correct = raw.rightQuestions == null ? null : Number(raw.rightQuestions);
      const wrong = raw.wrongQuestions == null ? null : Number(raw.wrongQuestions);
      const explicitAttempted = raw.attempted == null ? null : Number(raw.attempted);
      const attempted = explicitAttempted != null && Number.isFinite(explicitAttempted)
        ? explicitAttempted
        : correct != null && wrong != null && Number.isFinite(correct) && Number.isFinite(wrong)
          ? correct + wrong
          : null;
      const measuredAccuracy = attempted != null && attempted > 0 && correct != null && Number.isFinite(correct)
        ? Number(((correct / attempted) * 100).toFixed(1))
        : raw.accuracy != null && Number.isFinite(Number(raw.accuracy))
          ? Number(Number(raw.accuracy).toFixed(1))
          : null;

      const label = String(raw.sheet || mock.sheet || '');
      const notes = String(raw.notes || mock.notes || '');
      const labelText = normalizeTestLabel(label);
      const notesText = normalizeTestLabel(notes);
      const subjectMatches = getStoredSubjects()
        .map((subject) => String(subject.name || '').trim())
        .filter((subject) => subject.length >= 3)
        .filter((subject) =>
          labelText.includes(normalizeTestLabel(subject)) ||
          notesText.includes(normalizeTestLabel(subject))
        );

      const topicLabel = /(?:topic|chapter)\\s*[:=-]\\s*([^,;\\n]+)/i.exec(notes)?.[1]?.trim() || null;
      const rawDuration = raw.durationMinutes == null ? null : Number(raw.durationMinutes);
      const durationMinutes = rawDuration != null && Number.isFinite(rawDuration) && rawDuration > 0
        ? rawDuration
        : null;

      return {
        id: mock.id,
        date: mock.date,
        timestamp: testTimestamp,
        testName: label || 'Unnamed test',
        testType: mock.testType || null,
        seriesName: mock.seriesName || null,
        seriesId: mock.seriesId || null,
        score: Number(mock.score),
        totalMarks: Number(mock.totalMarks),
        normalizedScorePercent,
        attemptedQuestions: attempted,
        correctQuestions: correct,
        wrongQuestions: wrong,
        measuredAccuracyPercent: measuredAccuracy,
        durationMinutes,
        recordedSubjectHints: Array.from(new Set(subjectMatches)),
        explicitTopicLabel: topicLabel,
        notes: notes ? notes.slice(0, 360) : null,
      };
    })
    .filter((test): test is NonNullable<typeof test> => Boolean(test && test.timestamp >= cutoff && test.timestamp <= now + 24 * 60 * 60 * 1000))
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-validLimit);

  const scoreRows = inWindow.filter((test) => test.normalizedScorePercent != null);
  const scoreValues = scoreRows.map((test) => test.normalizedScorePercent as number);
  const mean = (values: number[]) => values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
    : null;
  const averageScore = mean(scoreValues);
  const peakScore = scoreValues.length ? Number(Math.max(...scoreValues).toFixed(1)) : null;
  const latestScoredTest = [...inWindow].reverse().find((test) => test.normalizedScorePercent != null) || null;

  let scoreTrend: Record<string, unknown> = {
    direction: 'insufficient_data',
    earlierAveragePercent: null,
    latestAveragePercent: null,
    changePercentagePoints: null,
    note: 'At least four tests with valid maximum marks are required for a balanced first-half vs second-half trend comparison.',
  };
  if (scoreValues.length >= 4) {
    const midpoint = Math.floor(scoreValues.length / 2);
    const earlierAverage = mean(scoreValues.slice(0, midpoint));
    const latestAverage = mean(scoreValues.slice(midpoint));
    const change = earlierAverage != null && latestAverage != null
      ? Number((latestAverage - earlierAverage).toFixed(1))
      : null;
    scoreTrend = {
      direction: change == null ? 'insufficient_data' : change > 2 ? 'improving' : change < -2 ? 'declining' : 'broadly_stable',
      earlierAveragePercent: earlierAverage,
      latestAveragePercent: latestAverage,
      changePercentagePoints: change,
      note: 'Comparison uses the chronological first half and second half of the selected recent test window; it is a descriptive trend, not a causal conclusion.',
    };
  }

  const accuracyRows = inWindow.filter((test) => test.measuredAccuracyPercent != null);
  const questionCountRows = inWindow.filter((test) =>
    test.attemptedQuestions != null &&
    test.correctQuestions != null &&
    test.attemptedQuestions > 0 &&
    test.correctQuestions >= 0
  );
  const totalAttempted = questionCountRows.reduce((sum, test) => sum + (test.attemptedQuestions || 0), 0);
  const totalCorrect = questionCountRows.reduce((sum, test) => sum + (test.correctQuestions || 0), 0);
  const weightedAccuracy = questionCountRows.length > 0 && totalAttempted > 0
    ? Number(((totalCorrect / totalAttempted) * 100).toFixed(1))
    : null;

  const subjectPerformance = new Map<string, { subject: string; tests: Array<{ date: string; testName: string; normalizedScorePercent: number }> }>();
  inWindow.forEach((test) => {
    if (test.recordedSubjectHints.length !== 1 || test.normalizedScorePercent == null) return;
    const subject = test.recordedSubjectHints[0];
    const row = subjectPerformance.get(subject) || { subject, tests: [] };
    row.tests.push({
      date: test.date,
      testName: test.testName,
      normalizedScorePercent: test.normalizedScorePercent,
    });
    subjectPerformance.set(subject, row);
  });

  const subjectSignals = Array.from(subjectPerformance.values()).map((row) => {
    const averagePercent = mean(row.tests.map((test) => test.normalizedScorePercent));
    return {
      subject: row.subject,
      testCount: row.tests.length,
      averageNormalizedScorePercent: averagePercent,
      evidence: row.tests,
      classification: row.tests.length >= 2 && averagePercent != null && averagePercent < 60
        ? 'suspected_subject_weakness'
        : row.tests.length >= 2 && averagePercent != null && averagePercent >= 80
          ? 'relative_strength_signal'
          : 'insufficient_subject_level_sample',
    };
  });

  const mistakeCutoff = now - Math.max(validDays, 90) * 24 * 60 * 60 * 1000;
  const recentMistakes = listMistakes().filter((mistake) => {
    const timestamp = Date.parse(mistake.createdAt);
    return Number.isFinite(timestamp) && timestamp >= mistakeCutoff && timestamp <= now;
  });
  const repeatedMistakes = new Map<string, {
    subject: string;
    topic: string;
    category: string;
    count: number;
    latestAt: string;
    preventionStrategies: string[];
  }>();
  recentMistakes.forEach((mistake) => {
    const key = [
      normalizeTestLabel(mistake.subject),
      normalizeTestLabel(mistake.topic),
      mistake.category,
    ].join('|');
    const existing = repeatedMistakes.get(key) || {
      subject: mistake.subject,
      topic: mistake.topic,
      category: mistake.category,
      count: 0,
      latestAt: mistake.createdAt,
      preventionStrategies: [],
    };
    existing.count += 1;
    if (mistake.createdAt > existing.latestAt) existing.latestAt = mistake.createdAt;
    if (mistake.preventionStrategy && !existing.preventionStrategies.includes(mistake.preventionStrategy)) {
      existing.preventionStrategies.push(mistake.preventionStrategy);
    }
    repeatedMistakes.set(key, existing);
  });

  const repeatedMistakePatterns = Array.from(repeatedMistakes.values())
    .filter((pattern) => pattern.count >= 2)
    .sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt))
    .slice(0, 12);

  const importedAnalyses = listTestAnalyses()
    .filter((analysis) => {
      const created = Date.parse(analysis.createdAt);
      return Number.isFinite(created) && created >= cutoff && created <= now;
    })
    .slice(0, Math.min(validLimit, 20))
    .map((analysis) => ({
      createdAt: analysis.createdAt,
      score: analysis.score,
      totalMarks: analysis.totalMarks,
      attempted: analysis.attempted,
      correct: analysis.correct,
      wrong: analysis.wrong,
      durationMinutes: analysis.durationMinutes,
      weakSubjects: analysis.weakSubjects,
      timeManagementIssues: analysis.timeManagementIssues,
      accuracyIssues: analysis.accuracyIssues,
      correctiveActions: analysis.correctiveActions,
      evidenceType: 'separate imported/manual document analysis; not merged into saved test score rows',
    }));

  const subjectHints = Array.from(new Set(inWindow.flatMap((test) => test.recordedSubjectHints)));
  const topicLabels = Array.from(new Set(inWindow.map((test) => test.explicitTopicLabel).filter((topic): topic is string => Boolean(topic))));

  return {
    source: 'Test Performance saved gate_mocks records; raw saved fields are used so UI fallback values are not mistaken for recorded evidence.',
    capturedAt: new Date().toISOString(),
    requestedWindow: { days: validDays, maximumTests: validLimit },
    totalRecordedTests: allMocks.length,
    testsWithValidDates: allMocks.filter((test) => getTestDateTimestamp(test.date) != null).length,
    testsInRequestedWindow: inWindow.length,
    availableTestsOutsideWindow: allMocks.length - inWindow.length,
    summary: {
      normalizedScoreAveragePercent: averageScore,
      normalizedScorePeakPercent: peakScore,
      latestScoredTest: latestScoredTest
        ? { date: latestScoredTest.date, testName: latestScoredTest.testName, normalizedScorePercent: latestScoredTest.normalizedScorePercent }
        : null,
      measuredWeightedAccuracyPercent: weightedAccuracy,
      testsWithQuestionAccuracy: accuracyRows.length,
      questionAttemptRatePercent: null,
      negativeMarking: 'Not recorded in the existing test-result schema.',
      timeManagement: {
        recordedDurationsMinutes: inWindow.filter((test) => test.durationMinutes != null).map((test) => ({
          date: test.date,
          testName: test.testName,
          durationMinutes: test.durationMinutes,
        })),
        perQuestionTime: 'Not recorded.',
        perSectionTime: 'Not recorded.',
        timeManagementConclusion: 'Insufficient timing evidence to diagnose time allocation from saved test rows alone.',
      },
    },
    scoreTrend,
    subjectPerformanceSignals: subjectSignals,
    weaknessEvidence: {
      repeatedSavedMistakePatterns: repeatedMistakePatterns,
      importedOrManualTestAnalysisSignals: importedAnalyses,
      confirmedWeakTopicsFromQuestionLevelTests: [],
      suspectedTopicLabelsFromTestNotes: topicLabels.map((topic) => ({
        topic,
        evidence: 'Explicitly labelled in test notes, but no question-level per-topic result is stored.',
        classification: 'suspected_only',
      })),
      knownDataGap: 'The current gate_mocks schema stores an overall score and optional question totals; it does not store subject/topic-wise question outcomes or negative marks. Do not claim confirmed test-derived weak topics when those fields are absent.',
    },
    recordedSubjectHints: subjectHints,
    recentTests: inWindow.map(({ timestamp, ...test }) => test),
    importedOrManualAnalyses: importedAnalyses,
    dataQuality: [
      'The default window is the latest 10 saved completed-test records whose dates fall within the previous 30 days.',
      'Scores are normalized to percentages before comparisons across different maximum marks.',
      'Question accuracy is measured only when attempted/correct counts or a saved accuracy value exist. It is distinct from normalized marks percentage.',
      'The saved schema does not record question attempt denominator, negative marks, per-question time, section time, or question-level topic outcomes; these are reported as unavailable.',
      'Subject names are treated as hints only when explicitly present in a test title or note. A test name alone is not proof of a topic weakness.',
      'Saved mistake patterns are separate AI Native learner logs; imported/manual test analysis is separate from completed test score rows.',
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
