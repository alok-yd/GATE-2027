import { getStudentProfile } from '../DataExtractor';
import {
  analyzePreparationState,
  evaluateCollegeCompatibility,
  getAIRHistory,
  getCollegeCompatibilitySummary,
  predictAIR,
  runWhatIfSimulation,
} from '../airPrediction';

type CandidateCategory = 'GEN' | 'OBC' | 'SC' | 'ST' | 'EWS';

interface HealthEntryRecord {
  id: string;
  date: string;
  timestamp: string;
  steps: number;
  heartRate: number;
  oxygenLevel: number;
  sleepHours: number;
  deepSleepHours: number;
  sleepScore: number;
  stressLevel: number;
  activeMinutes: number;
  hydration: number;
  mood: string;
  symptoms: string[];
}

interface HealthAnalysisRecord {
  source?: 'ai_gateway' | 'local';
  generatedAt?: string;
  healthScore?: number;
  grade?: string;
  cognitiveReadiness?: number;
  studyMode?: string;
  recommendedStudyHours?: number;
  peakWindow?: string;
  message?: string;
  alerts?: Array<{ severity: string; title: string; message: string; action: string }>;
  actionItems?: string[];
  insights?: string[];
  failureNote?: string;
}

interface MeditationLogRecord {
  date: string;
  completed: boolean;
  minutes: number;
}

interface ChallengeAttemptRecord {
  startedAt: string;
  resetAt: string;
  targetDays: number;
  completedDays: number;
  missedDays: number;
  bestStreak: number;
}

interface ChallengeRecord {
  startedAt: string | null;
  targetDays?: number;
  dailyTargetMinutes?: number;
  logs?: Record<string, MeditationLogRecord | { date: string; completed: boolean; note?: string }>;
  archivedAttempts?: ChallengeAttemptRecord[];
}

interface SupplementLogRecord {
  date: string;
  taken: string[];
}

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const readLocalStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    return safeParse<T>(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
};

const average = (values: number[]): number | null => {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length
    ? Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10
    : null;
};

const getTodayKey = () => new Date().toISOString().slice(0, 10);
const dateTime = (date: string) => new Date(`${date}T00:00:00`).getTime();
const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.max(0, Math.floor((dateTime(to) - dateTime(from)) / 86400000));

const getChallengeProgress = (
  challenge: ChallengeRecord | null,
  targetDays: number,
  includeMinutes: boolean
) => {
  const logs = challenge?.logs || {};
  const startedAt = typeof challenge?.startedAt === 'string' ? challenge.startedAt : null;
  const previousAttempts = challenge?.archivedAttempts?.slice(-5) || [];
  const target = targetDays;
  if (!startedAt) {
    return {
      started: false,
      status: 'Not started',
      startedAt: null,
      targetDays: target,
      challengeDay: 0,
      completedDays: 0,
      missedDays: 0,
      missedDates: [],
      lastMissedDate: null,
      streakInterrupted: false,
      currentStreak: 0,
      bestStreak: 0,
      progressPercent: 0,
      ...(includeMinutes ? { dailyTargetMinutes: Number(challenge?.dailyTargetMinutes || 20) } : {}),
      recentCheckIns: [],
      todayCheckIn: null,
      previousAttempts,
      recordBasis: 'Self-reported daily check-ins stored in this browser; not independently verified.',
    };
  }

  const today = getTodayKey();
  const elapsedDays = Math.min(target, daysBetween(startedAt, today) + 1);
  const completedDates = Object.values(logs)
    .filter((log) => Boolean(log?.completed) && typeof log.date === 'string' && log.date >= startedAt && log.date <= today)
    .map((log) => log.date)
    .sort();
  const completedDays = completedDates.length;

  // A day is counted as missed only after it has ended. An unchecked current
  // day is still in progress and must not be reported as a missed day.
  const pastDaysElapsed = Math.max(0, Math.min(target, daysBetween(startedAt, today)));
  const missedDates = Array.from({ length: pastDaysElapsed }, (_, index) =>
    dayKey(dateTime(startedAt) + index * 86400000)
  ).filter((date) => !logs[date]?.completed);

  // Until today's check-in is complete, preserve yesterday's streak. This
  // avoids labelling an unsubmitted current day as a broken streak.
  const todayLog = logs[today];
  const streakAnchor = todayLog?.completed ? today : dayKey(dateTime(today) - 86400000);
  const anchorElapsedDays =
    streakAnchor >= startedAt
      ? Math.min(elapsedDays, daysBetween(startedAt, streakAnchor) + 1)
      : 0;
  let currentStreak = 0;
  for (let index = 0; index < anchorElapsedDays; index += 1) {
    const checkDate = dayKey(dateTime(streakAnchor) - index * 86400000);
    if (logs[checkDate]?.completed) currentStreak += 1;
    else break;
  }

  let bestStreak = 0;
  let running = 0;
  for (let index = 0; index < elapsedDays; index += 1) {
    const checkDate = dayKey(dateTime(startedAt) + index * 86400000);
    if (logs[checkDate]?.completed) {
      running += 1;
      bestStreak = Math.max(bestStreak, running);
    } else {
      running = 0;
    }
  }

  const recentCheckIns = Object.values(logs)
    .filter((log) => typeof log.date === 'string' && log.date >= startedAt && log.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map((log) => ({
      date: log.date,
      completed: Boolean(log.completed),
      ...(includeMinutes ? { minutes: Number((log as MeditationLogRecord).minutes || 0) } : {}),
    }));

  const status =
    elapsedDays >= target
      ? 'Challenge window completed'
      : missedDates.length > 0
        ? 'Missed days recorded — recovery recommended'
        : 'On track';
  return {
    started: true,
    status,
    startedAt,
    targetDays: target,
    challengeDay: elapsedDays,
    completedDays,
    missedDays: missedDates.length,
    missedDates: missedDates.slice(-14),
    lastMissedDate: missedDates[missedDates.length - 1] || null,
    streakInterrupted: missedDates.length > 0,
    currentStreak,
    bestStreak,
    progressPercent: Math.round((completedDays / target) * 100),
    ...(includeMinutes ? { dailyTargetMinutes: Number(challenge?.dailyTargetMinutes || 20) } : {}),
    recentCheckIns,
    todayCheckIn: todayLog
      ? {
          date: todayLog.date,
          completed: Boolean(todayLog.completed),
          ...(includeMinutes ? { minutes: Number((todayLog as MeditationLogRecord).minutes || 0) } : {}),
        }
      : null,
    previousAttempts,
    recordBasis: 'Self-reported daily check-ins stored in this browser; not independently verified.',
  };
};

const getCandidateCategory = (): CandidateCategory => {
  const value = readLocalStorage<string>('gate_candidate_category', 'GEN');
  return ['GEN', 'OBC', 'SC', 'ST', 'EWS'].includes(value) ? (value as CandidateCategory) : 'GEN';
};

/**
 * Returns the same deterministic preparation and AIR outputs that power the
 * AI Analytics / AIR Readiness Center. Does not save or change tracker state.
 */
export const getAIAnalyticsMentorContext = () => {
  const profile = getStudentProfile();
  const analysis = analyzePreparationState(profile);
  const prediction = predictAIR(analysis);
  const category = getCandidateCategory();
  const collegeMatches = evaluateCollegeCompatibility(
    prediction.marksEstimation.estimatedScore,
    category,
    'ALL'
  );
  const collegeSummary = getCollegeCompatibilitySummary(collegeMatches);
  const whatIf = runWhatIfSimulation(
    prediction,
    {
      mockMarksDelta: 5,
      pyqAccuracyDelta: 5,
      sillyMistakesSaved: 4,
      revisionCyclesComplete: 2,
    },
    category
  );
  const history = getAIRHistory();

  return {
    source: 'The same services/airPrediction preparation analyzer and AIR prediction engine used by the AI Analytics dashboard.',
    capturedAt: new Date().toISOString(),
    caveats: [
      'These are model estimates, not actual GATE marks or guaranteed AIR.',
      'Some preparation dimensions use explicit neutral/default assumptions when the tracker has no recorded value.',
      'College matches are historical compatibility indicators, not admission guarantees.',
      'The what-if simulator is a hypothetical projection using its displayed default assumptions, not a promise of score improvement.',
      'Only saved AIR history snapshots are returned; no synthetic historical points are added.',
    ],
    candidateCategory: category,
    preparation: {
      overallReadinessPercent: analysis.overallReadiness,
      dimensions: analysis.dimensionList,
      subjectReadiness: analysis.subjectReadiness,
      dataHealth: analysis.dataHealth,
    },
    airPrediction: {
      medianAIR: prediction.medianAIR,
      airDisplay: prediction.airDisplay,
      likelyRange: prediction.likelyRangeDisplay,
      optimisticAIR: prediction.lowerAIR,
      pessimisticAIR: prediction.upperAIR,
      confidencePercent: prediction.confidencePercentage,
      stability: prediction.stability,
      marksEstimation: prediction.marksEstimation,
      scenarios: prediction.scenarios,
      positiveDrivers: prediction.positiveDrivers,
      limitingFactors: prediction.limitingFactors,
      uncertaintySources: prediction.uncertaintySources,
      calculatedAt: prediction.timestamp,
    },
    collegeCompatibility: {
      category,
      summary: {
        historicallyAboveCount: collegeSummary.directOfferCount,
        historicallyCompetitiveCount: collegeSummary.competitiveCount,
        borderlineCount: collegeSummary.borderlineCount,
      },
      topMatches: collegeSummary.topMatches.map((match) => ({
        institute: match.record.institute,
        type: match.record.type,
        program: match.record.program,
        cutoffType: match.record.cutoffType,
        historicalClosingScore: match.closingScore,
        projectedUserScore: match.userScore,
        scoreDifference: match.delta,
        status: match.status,
        interpretation: match.statusText,
      })),
      allHistoricalMatches: collegeMatches.map((match) => ({
        institute: match.record.institute,
        type: match.record.type,
        program: match.record.program,
        cutoffType: match.record.cutoffType,
        historicalClosingScore: match.closingScore,
        projectedUserScore: match.userScore,
        scoreDifference: match.delta,
        status: match.status,
        interpretation: match.statusText,
      })),
    },
    defaultWhatIfSimulation: {
      assumptions: {
        mockMarksDelta: 5,
        pyqAccuracyDelta: 5,
        sillyMistakesSaved: 4,
        revisionCyclesComplete: 2,
      },
      result: whatIf,
      note: 'Default hypothetical scenario from the AI Analytics simulator; not a recorded achievement.',
    },
    savedAIRHistory: {
      count: history.length,
      snapshots: history.slice(-30),
    },
  };
};

/**
 * Read-only health context from the exact localStorage records used by
 * HealthTracker.tsx. Sensitive challenge and supplement details are included
 * only when the current user question asks for those categories.
 */
export const getHealthTrackerMentorContext = (options: {
  includeChallenges?: boolean;
  challengeSelection?: 'sky' | 'noFap' | 'both';
  includeSupplements?: boolean;
} = {}) => {
  const entries = readLocalStorage<HealthEntryRecord[]>('gate_health_entries', [])
    .filter((entry) => entry && typeof entry.date === 'string')
    .sort((a, b) => a.date.localeCompare(b.date));
  const analysis = readLocalStorage<HealthAnalysisRecord | null>('gate_health_analysis', null);
  const supplements = readLocalStorage<SupplementLogRecord[]>('gate_health_supplements', [])
    .filter((log) => log && typeof log.date === 'string')
    .sort((a, b) => a.date.localeCompare(b.date));
  const sky = readLocalStorage<ChallengeRecord | null>('gate_sky_meditation_challenge', null);
  const noFap = readLocalStorage<ChallengeRecord | null>('gate_no_fap_100_day_challenge', null);

  const recentEntries = entries.slice(-7);
  const latestEntry = entries[entries.length - 1] || null;
  const includeNoFapDetails =
    options.includeChallenges &&
    (options.challengeSelection === 'noFap' || options.challengeSelection === 'both');
  const shouldKeepHealthText = (value: string) => includeNoFapDetails || !/no.?fap/i.test(value);
  const latestAnalysis = analysis
    ? {
        source: analysis.source || 'unknown',
        generatedAt: analysis.generatedAt || null,
        healthScore: analysis.healthScore ?? null,
        grade: analysis.grade || null,
        cognitiveReadinessPercent: analysis.cognitiveReadiness ?? null,
        recommendedStudyMode: analysis.studyMode || null,
        recommendedStudyHours: analysis.recommendedStudyHours ?? null,
        peakWindow: analysis.peakWindow || null,
        message: analysis.message && shouldKeepHealthText(analysis.message) ? analysis.message : null,
        alerts: (analysis.alerts || []).filter((alert) =>
          [alert.title, alert.message, alert.action].every(shouldKeepHealthText)
        ),
        actionItems: (analysis.actionItems || []).filter(shouldKeepHealthText),
        insights: (analysis.insights || []).filter(shouldKeepHealthText),
        failureNote: analysis.failureNote && shouldKeepHealthText(analysis.failureNote)
          ? analysis.failureNote
          : null,
      }
    : null;

  const skyProgress = getChallengeProgress(sky, 90, true);
  const noFapProgress = getChallengeProgress(noFap, 100, false);
  const latestSupplementLog = supplements[supplements.length - 1] || null;

  const averageFields = {
    sleepHours: average(recentEntries.map((entry) => Number(entry.sleepHours))),
    deepSleepHours: average(recentEntries.map((entry) => Number(entry.deepSleepHours))),
    sleepScore: average(recentEntries.map((entry) => Number(entry.sleepScore))),
    steps: average(recentEntries.map((entry) => Number(entry.steps))),
    heartRate: average(recentEntries.map((entry) => Number(entry.heartRate))),
    oxygenLevel: average(recentEntries.map((entry) => Number(entry.oxygenLevel))),
    stressLevel: average(recentEntries.map((entry) => Number(entry.stressLevel))),
    activeMinutes: average(recentEntries.map((entry) => Number(entry.activeMinutes))),
    hydrationMl: average(recentEntries.map((entry) => Number(entry.hydration))),
  };

  const moodCounts: Record<string, number> = {};
  const symptomCounts: Record<string, number> = {};
  recentEntries.forEach((entry) => {
    if (entry.mood) moodCounts[entry.mood] = (moodCounts[entry.mood] || 0) + 1;
    (Array.isArray(entry.symptoms) ? entry.symptoms : []).forEach((symptom) => {
      const cleaned = String(symptom).trim().slice(0, 80);
      if (cleaned) symptomCounts[cleaned] = (symptomCounts[cleaned] || 0) + 1;
    });
  });

  return {
    source: 'Health Tracker browser-local records (gate_health_entries, gate_health_analysis, gate_health_supplements, gate_sky_meditation_challenge, gate_no_fap_100_day_challenge).',
    capturedAt: new Date().toISOString(),
    privacyAndInterpretation: [
      'Health values are user-entered/manual tracker records and are not independently verified by this app.',
      'This data is wellness context, not a medical record, diagnosis, or clinical measurement.',
      'Do not diagnose, prescribe treatment, or claim a wellness metric caused a change in GATE performance.',
      'SKY and No-Fap challenge completions are self-reported habit check-ins.',
      'Private free-text notes from SKY and No-Fap check-ins are not included in this AI context.',
    ],
    healthDataAvailability: {
      healthEntryCount: entries.length,
      hasHealthAnalysis: Boolean(analysis),
      ...(options.includeSupplements ? { supplementLogCount: supplements.length } : {}),
    },
    latestHealthEntry: latestEntry,
    recentSevenRecordedEntries: recentEntries,
    recentRecordedEntryAverages: averageFields,
    recentMoodCounts: moodCounts,
    recentSymptomCounts: symptomCounts,
    latestHealthAnalysis: latestAnalysis,
    ...(options.includeSupplements
      ? {
          supplements: {
            recentDailyLogs: supplements.slice(-14).map((log) => ({
              date: log.date,
              recordedTakenItems: Array.isArray(log.taken) ? log.taken : [],
            })),
            latestLog: latestSupplementLog
              ? {
                  date: latestSupplementLog.date,
                  recordedTakenItems: Array.isArray(latestSupplementLog.taken) ? latestSupplementLog.taken : [],
                }
              : null,
            note: 'These are only user-recorded taken/not-taken logs; they are not prescriptions or medication advice.',
          },
        }
      : {}),
    ...(options.includeChallenges
      ? {
          challenges: {
            ...(options.challengeSelection === 'sky' || options.challengeSelection === 'both'
              ? { skyMeditation90Day: skyProgress }
              : {}),
            ...(options.challengeSelection === 'noFap' || options.challengeSelection === 'both'
              ? { noFap100Day: noFapProgress }
              : {}),
          },
        }
      : {}),
  };
};
