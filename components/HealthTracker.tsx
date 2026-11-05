import React, { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { describeAIGatewayError, generateGatewayText } from '../services/AIGatewayClient';
import { safeParseJson } from '../services/ai/jsonRepair';

type Mood = 'great' | 'good' | 'neutral' | 'low' | 'bad';
type StudyMode = 'Deep Work' | 'Normal Study' | 'Light Revision' | 'Recovery Mode';
type AlertSeverity = 'critical' | 'warning' | 'info';

interface HealthEntry {
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
  mood: Mood;
  symptoms: string[];
}

interface HealthAlert {
  severity: AlertSeverity;
  title: string;
  message: string;
  action: string;
}

interface DietPlan {
  breakfast: string[];
  lunch: string[];
  dinner: string[];
  snacks: string[];
  avoid: string[];
  hydrationGoal: string;
  guidance: string;
}

interface SupplementItem {
  name: string;
  timing: string;
  purpose: string;
  caution: string;
}

interface HealthAnalysis {
  source: 'ai_gateway' | 'local';
  generatedAt: string;
  healthScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  cognitiveReadiness: number;
  studyMode: StudyMode;
  recommendedStudyHours: number;
  peakWindow: string;
  message: string;
  alerts: HealthAlert[];
  actionItems: string[];
  diet: DietPlan;
  supplements: SupplementItem[];
  insights: string[];
  failureNote?: string;
}

interface ExistingAppContext {
  studyHoursToday: number;
  streakDays: number;
  mockCount: number;
  latestMockPercent: number | null;
  mockTrend: number | null;
}

interface MeditationLog {
  date: string;
  completed: boolean;
  minutes: number;
  note: string;
}

interface ChallengeAttemptSummary {
  startedAt: string;
  resetAt: string;
  targetDays: number;
  completedDays: number;
  missedDays: number;
  bestStreak: number;
}

interface MeditationChallenge {
  startedAt: string | null;
  targetDays: number;
  dailyTargetMinutes: number;
  logs: Record<string, MeditationLog>;
  archivedAttempts: ChallengeAttemptSummary[];
}

interface NoFapLog {
  date: string;
  completed: boolean;
  note: string;
}

interface NoFapChallenge {
  startedAt: string | null;
  targetDays: number;
  logs: Record<string, NoFapLog>;
  archivedAttempts: ChallengeAttemptSummary[];
}

interface ChallengeProgressMemory {
  started: boolean;
  startedAt: string | null;
  targetDays: number;
  challengeDay: number;
  completedDays: number;
  missedDays: number;
  currentStreak: number;
  bestStreak: number;
  progressPercent: number;
  dailyTargetMinutes?: number;
  recentCheckIns: Array<{ date: string; completed: boolean; minutes?: number }>;
  streakInterrupted: boolean;
  missedDates: string[];
  lastMissedDate: string | null;
  previousAttempts: ChallengeAttemptSummary[];
}

interface ChallengeAIMemory {
  skyMeditation: ChallengeProgressMemory;
  noFap: ChallengeProgressMemory;
}

interface SupplementLog {
  date: string;
  taken: string[];
}

interface HealthFormState {
  steps: string;
  heartRate: string;
  oxygenLevel: string;
  sleepHours: string;
  deepSleepHours: string;
  sleepScore: string;
  stressLevel: string;
  activeMinutes: string;
  hydration: string;
  mood: Mood;
  symptoms: string;
}

interface MeditationFormState {
  minutes: string;
  note: string;
}

const HEALTH_ENTRIES_KEY = 'gate_health_entries';
const HEALTH_ANALYSIS_KEY = 'gate_health_analysis';
const HEALTH_SUPPLEMENTS_KEY = 'gate_health_supplements';
const SKY_CHALLENGE_KEY = 'gate_sky_meditation_challenge';
const NO_FAP_CHALLENGE_KEY = 'gate_no_fap_100_day_challenge';
const DAY_MS = 24 * 60 * 60 * 1000;

const todayKey = () => new Date().toISOString().split('T')[0];

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const numberOrDefault = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dateToTime = (date: string) => new Date(`${date}T00:00:00Z`).getTime();

const daysBetween = (from: string, to: string) =>
  Math.max(0, Math.floor((dateToTime(to) - dateToTime(from)) / DAY_MS));

const getHealthEntries = () =>
  safeParse<HealthEntry[]>(localStorage.getItem(HEALTH_ENTRIES_KEY), []).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

const saveHealthEntries = (entries: HealthEntry[]) => {
  localStorage.setItem(HEALTH_ENTRIES_KEY, JSON.stringify(entries.slice(-90)));
  window.dispatchEvent(new Event('storage'));
};

const getSupplementLog = () =>
  safeParse<SupplementLog[]>(localStorage.getItem(HEALTH_SUPPLEMENTS_KEY), []);

const saveSupplementLog = (logs: SupplementLog[]) => {
  localStorage.setItem(HEALTH_SUPPLEMENTS_KEY, JSON.stringify(logs.slice(-90)));
};

const createDefaultChallenge = (): MeditationChallenge => ({
  startedAt: null,
  targetDays: 90,
  dailyTargetMinutes: 20,
  logs: {},
  archivedAttempts: [],
});

const getChallenge = (): MeditationChallenge => {
  const parsed = safeParse<Partial<MeditationChallenge>>(
    localStorage.getItem(SKY_CHALLENGE_KEY),
    {}
  );
  return {
    ...createDefaultChallenge(),
    ...parsed,
    targetDays: 90,
    dailyTargetMinutes: Number(parsed.dailyTargetMinutes || 20),
    logs: parsed.logs || {},
    archivedAttempts: parsed.archivedAttempts || [],
  };
};

const saveChallenge = (challenge: MeditationChallenge) => {
  localStorage.setItem(SKY_CHALLENGE_KEY, JSON.stringify(challenge));
};

const createDefaultNoFapChallenge = (): NoFapChallenge => ({
  startedAt: null,
  targetDays: 100,
  logs: {},
  archivedAttempts: [],
});

const getNoFapChallenge = (): NoFapChallenge => {
  const parsed = safeParse<Partial<NoFapChallenge>>(
    localStorage.getItem(NO_FAP_CHALLENGE_KEY),
    {}
  );
  return {
    ...createDefaultNoFapChallenge(),
    ...parsed,
    targetDays: 100,
    logs: parsed.logs || {},
    archivedAttempts: parsed.archivedAttempts || [],
  };
};

const saveNoFapChallenge = (challenge: NoFapChallenge) => {
  localStorage.setItem(NO_FAP_CHALLENGE_KEY, JSON.stringify(challenge));
};

const getExistingAppContext = (): ExistingAppContext => {
  const today = todayKey();
  const dailyLog = safeParse<{ hoursStudied?: number }>(
    localStorage.getItem(`gate_daily_target_${today}`),
    {}
  );
  const streakData = safeParse<{ currentStreak?: number }>(
    localStorage.getItem('gate_streak_data'),
    {}
  );
  const mocks = safeParse<Array<{ score: number; totalMarks: number }>>(
    localStorage.getItem('gate_mocks'),
    []
  );
  const percentages = mocks.map((mock) => (Number(mock.score || 0) / Math.max(Number(mock.totalMarks || 1), 1)) * 100);
  const latestMockPercent = percentages.length ? Math.round(percentages[percentages.length - 1] * 10) / 10 : null;
  const mockTrend =
    percentages.length >= 2
      ? Math.round((percentages[percentages.length - 1] - percentages[percentages.length - 2]) * 10) / 10
      : null;

  return {
    studyHoursToday: Number(dailyLog.hoursStudied || 0),
    streakDays: Number(streakData.currentStreak || 0),
    mockCount: mocks.length,
    latestMockPercent,
    mockTrend,
  };
};

const scoreGrade = (score: number): HealthAnalysis['grade'] => {
  if (score >= 85) return 'A';
  if (score >= 72) return 'B';
  if (score >= 58) return 'C';
  if (score >= 42) return 'D';
  return 'F';
};

const scoreColor = (score: number) => {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-rose-600';
};

const getStudyMode = (readiness: number): StudyMode => {
  if (readiness >= 82) return 'Deep Work';
  if (readiness >= 64) return 'Normal Study';
  if (readiness >= 45) return 'Light Revision';
  return 'Recovery Mode';
};

const getDefaultSupplements = (): SupplementItem[] => [
  {
    name: 'Vitamin D3 + K2',
    timing: 'Morning with food',
    purpose: 'Supports mood, immunity, and energy when diet/sunlight are inconsistent.',
    caution: 'Educational reminder only. Consult a doctor before starting or changing dosage.',
  },
  {
    name: 'Omega-3',
    timing: 'With lunch',
    purpose: 'Supports general brain health and inflammation balance.',
    caution: 'Avoid without medical advice if you use blood thinners or have surgery planned.',
  },
  {
    name: 'Magnesium Glycinate',
    timing: 'Evening',
    purpose: 'Supports relaxation and sleep routine quality.',
    caution: 'Consult a doctor if you have kidney issues or take regular medication.',
  },
  {
    name: 'B-Complex / Multivitamin',
    timing: 'Morning',
    purpose: 'Supports energy metabolism during heavy study days.',
    caution: 'Use only as needed and avoid stacking multiple multivitamins.',
  },
  {
    name: 'Ashwagandha',
    timing: 'After food',
    purpose: 'May support stress resilience for some people.',
    caution: 'Avoid without medical advice if thyroid, autoimmune, liver, or medication concerns exist.',
  },
];

const getDefaultDiet = (entry: HealthEntry): DietPlan => {
  const lightDay = entry.sleepHours < 6.5 || entry.stressLevel > 70 || entry.symptoms.length > 0;
  return {
    guidance: lightDay
      ? 'Keep food simple today: hydration, protein, fruit, and light meals. Avoid heavy study immediately after heavy food.'
      : 'Use steady-energy meals today: protein, complex carbs, healthy fats, and regular water breaks.',
    breakfast: ['Oats or poha with peanuts', 'Eggs or paneer/tofu', 'Fruit', 'Water before caffeine'],
    lunch: ['Dal or curd for protein', 'Rice or roti', 'Vegetable sabzi', 'Salad with lemon'],
    dinner: lightDay
      ? ['Moong dal khichdi', 'Curd if it suits you', 'Warm water', 'Early dinner']
      : ['Roti with sabzi', 'Dal or paneer', 'Light salad', 'Avoid very spicy/fried food late'],
    snacks: ['Walnuts or almonds', 'Roasted chana', 'Banana or apple', 'Coconut water if dehydrated'],
    avoid: ['Sugary drinks', 'Very heavy fried snacks', 'Excess caffeine after 4 PM', 'Large late-night meals'],
    hydrationGoal: entry.hydration >= 2500 ? 'Maintain 2.5-3.0 L today' : 'Target 2.5-3.0 L today',
  };
};

const buildLocalAnalysis = (
  entry: HealthEntry,
  history: HealthEntry[],
  appContext: ExistingAppContext,
  failureNote?: string
): HealthAnalysis => {
  const sleepScore =
    entry.sleepHours >= 7.5 ? 25 : entry.sleepHours >= 7 ? 22 : entry.sleepHours >= 6 ? 15 : 6;
  const oxygenScore = entry.oxygenLevel >= 97 ? 20 : entry.oxygenLevel >= 95 ? 15 : 5;
  const stressScore = entry.stressLevel <= 30 ? 20 : entry.stressLevel <= 60 ? 13 : 4;
  const activityScore =
    clamp(entry.steps / 8000, 0, 1) * 10 + clamp(entry.activeMinutes / 35, 0, 1) * 5;
  const hydrationScore = entry.hydration >= 2500 ? 10 : entry.hydration >= 1800 ? 7 : 3;
  const symptomPenalty = entry.symptoms.length > 0 || entry.mood === 'bad' ? 10 : entry.mood === 'low' ? 5 : 0;
  const healthScore = Math.round(
    clamp(sleepScore + oxygenScore + stressScore + activityScore + hydrationScore - symptomPenalty, 0, 100)
  );
  const cognitiveReadiness = Math.round(
    clamp(
      healthScore * 0.72 +
        Math.min(12, appContext.streakDays * 0.35) +
        clamp(appContext.studyHoursToday / 10, 0, 1) * 8 +
        (appContext.mockTrend == null ? 0 : clamp(appContext.mockTrend, -8, 8) * 0.6),
      0,
      100
    )
  );
  const studyMode = getStudyMode(cognitiveReadiness);
  const recommendedStudyHours =
    studyMode === 'Deep Work' ? 10 : studyMode === 'Normal Study' ? 8 : studyMode === 'Light Revision' ? 5 : 3;
  const alerts: HealthAlert[] = [];

  if (entry.sleepHours < 6.5) {
    alerts.push({
      severity: 'critical',
      title: 'Sleep debt is active',
      message: `You logged ${entry.sleepHours}h sleep. Memory consolidation may be weaker today.`,
      action: 'Use light revision until energy returns, and protect sleep tonight.',
    });
  }

  if (entry.oxygenLevel < 95) {
    alerts.push({
      severity: 'critical',
      title: 'Low SpO2 entry',
      message: `You logged ${entry.oxygenLevel}% SpO2. This is worth treating seriously.`,
      action: 'Rest, hydrate, re-check from the device, and consult a doctor if it persists or you feel unwell.',
    });
  }

  if (entry.stressLevel > 70) {
    alerts.push({
      severity: 'warning',
      title: 'High stress load',
      message: `Stress is ${entry.stressLevel}/100. Pushing speed work may create more errors.`,
      action: 'Start with breathing, SKY practice, or 25 minutes of low-pressure revision.',
    });
  }

  if (entry.steps < 3000) {
    alerts.push({
      severity: 'warning',
      title: 'Low movement day',
      message: `${entry.steps} steps logged. Long sitting blocks may hurt focus.`,
      action: 'Add two 10-minute walks between study blocks.',
    });
  }

  if (entry.symptoms.length > 0) {
    alerts.push({
      severity: 'info',
      title: 'Symptoms logged',
      message: `You noted: ${entry.symptoms.join(', ')}.`,
      action: 'Prefer recovery, hydration, and light revision. Seek medical help if symptoms are severe or persistent.',
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      severity: 'info',
      title: 'Vitals support studying',
      message: 'No major health blockers are visible from the latest entry.',
      action: 'Put the hardest GATE task in the first high-energy block.',
    });
  }

  const avgSleep = average(history.slice(-7).map((item) => item.sleepHours));
  const avgSteps = average(history.slice(-7).map((item) => item.steps));
  const insights = [
    history.length >= 2
      ? `7-day sleep average: ${avgSleep.toFixed(1)}h. Target 7.0-7.5h for retention.`
      : 'Sync health data for several days to unlock stronger trend insights.',
    history.length >= 2
      ? `7-day step average: ${Math.round(avgSteps)}. Movement breaks can protect long study sessions.`
      : `Current app context: ${appContext.streakDays} day study streak and ${appContext.mockCount} test logs.`,
    appContext.latestMockPercent == null
      ? 'Mock trend is not available yet. Add test logs to compare health and performance.'
      : `Latest test score context: ${appContext.latestMockPercent}%${
          appContext.mockTrend == null ? '' : `, trend ${appContext.mockTrend >= 0 ? '+' : ''}${appContext.mockTrend}%`
        }.`,
  ];

  return {
    source: 'local',
    generatedAt: new Date().toISOString(),
    healthScore,
    grade: scoreGrade(healthScore),
    cognitiveReadiness,
    studyMode,
    recommendedStudyHours,
    peakWindow: entry.sleepHours >= 7 ? '9:00 AM - 12:00 PM' : 'After recovery block',
    message:
      studyMode === 'Recovery Mode'
        ? 'Health load is high today. Keep the streak alive with light revision and recovery.'
        : studyMode === 'Light Revision'
          ? 'Useful work is possible, but avoid forcing your hardest timed work.'
          : studyMode === 'Normal Study'
            ? 'Good enough for serious work. Use one hard block and one repair block.'
            : 'Strong readiness. Put the hardest subject first and protect breaks.',
    alerts,
    actionItems: [
      studyMode === 'Deep Work' ? 'Start with the highest ROI weak subject.' : 'Start with a short review block.',
      entry.hydration < 2500 ? 'Raise water intake toward 2.5 L today.' : 'Maintain hydration through each block.',
      entry.stressLevel > 60 ? 'Do 20 minutes SKY meditation before the next deep session.' : 'Keep SKY practice as a daily anchor.',
    ],
    diet: getDefaultDiet(entry),
    supplements: getDefaultSupplements(),
    insights,
    failureNote,
  };
};

const analyzeWithGateway = async (
  entry: HealthEntry,
  history: HealthEntry[],
  appContext: ExistingAppContext,
  challengeMemory: ChallengeAIMemory
) => {
  const prompt = `
Return only JSON matching this TypeScript shape:
{
  "healthScore": number,
  "grade": "A" | "B" | "C" | "D" | "F",
  "cognitiveReadiness": number,
  "studyMode": "Deep Work" | "Normal Study" | "Light Revision" | "Recovery Mode",
  "recommendedStudyHours": number,
  "peakWindow": string,
  "message": string,
  "alerts": [{"severity":"critical"|"warning"|"info","title":string,"message":string,"action":string}],
  "actionItems": string[],
  "diet": {"guidance":string,"breakfast":string[],"lunch":string[],"dinner":string[],"snacks":string[],"avoid":string[],"hydrationGoal":string},
  "supplements": [{"name":string,"timing":string,"purpose":string,"caution":string}],
  "insights": string[]
}

Rules:
- This is wellness support, not medical diagnosis.
- Do not prescribe medicine.
- Supplements must include doctor-consult caution.
- Symptoms should produce rest/hydration/doctor-warning guidance only.
- Keep recommendations for a GATE 2027 aspirant.
- Include separate, factual insights about SKY practice and the 100-day No-Fap challenge.
- Treat all challenge check-ins as self-reported habit records, not independently verified facts.
- For No-Fap progress, be neutral and non-judgmental. Do not claim that abstinence causes medical, hormonal, cognitive, or exam-performance benefits.
- Never invent missed days, completed days, or streaks; use only the supplied counts and dates.
- Mention the current streak and completed-day count for each challenge when available.

Challenge progress and recent check-ins (self-reported):
${JSON.stringify(challengeMemory, null, 2)}

Latest health entry:
${JSON.stringify(entry, null, 2)}

Recent health history:
${JSON.stringify(history.slice(-7), null, 2)}

Existing study context:
${JSON.stringify(appContext, null, 2)}
`;

  const result = await generateGatewayText({
    prompt,
    system:
      'You are Achiever Kusha, a safe wellness and study-readiness coach. Provide educational wellness support only; do not diagnose or prescribe medicine.',
  });
  const parsed = safeParseJson<Omit<HealthAnalysis, 'source' | 'generatedAt' | 'failureNote'>>(result.content);
  return {
    ...parsed,
    healthScore: clamp(Math.round(Number(parsed.healthScore) || 0), 0, 100),
    cognitiveReadiness: clamp(Math.round(Number(parsed.cognitiveReadiness) || 0), 0, 100),
    recommendedStudyHours: clamp(Number(parsed.recommendedStudyHours) || 4, 1, 12),
    source: 'ai_gateway' as const,
    generatedAt: new Date().toISOString(),
  };
};

const initialHealthForm: HealthFormState = {
  steps: '5000',
  heartRate: '72',
  oxygenLevel: '98',
  sleepHours: '7',
  deepSleepHours: '1.4',
  sleepScore: '75',
  stressLevel: '35',
  activeMinutes: '30',
  hydration: '2200',
  mood: 'neutral',
  symptoms: '',
};

const buildEntryFromForm = (form: HealthFormState): HealthEntry => {
  const date = todayKey();
  return {
    id: `health_${Date.now()}`,
    date,
    timestamp: new Date().toISOString(),
    steps: Math.max(0, Math.round(numberOrDefault(form.steps, 0))),
    heartRate: Math.max(0, Math.round(numberOrDefault(form.heartRate, 72))),
    oxygenLevel: clamp(numberOrDefault(form.oxygenLevel, 98), 0, 100),
    sleepHours: clamp(numberOrDefault(form.sleepHours, 7), 0, 16),
    deepSleepHours: clamp(numberOrDefault(form.deepSleepHours, 1.5), 0, 8),
    sleepScore: clamp(Math.round(numberOrDefault(form.sleepScore, 70)), 0, 100),
    stressLevel: clamp(Math.round(numberOrDefault(form.stressLevel, 30)), 0, 100),
    activeMinutes: Math.max(0, Math.round(numberOrDefault(form.activeMinutes, 30))),
    hydration: Math.max(0, Math.round(numberOrDefault(form.hydration, 0))),
    mood: form.mood,
    symptoms: form.symptoms
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  };
};

const formatDate = (date: string) => {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
};

const HealthTracker: React.FC = () => {
  const [entries, setEntries] = useState<HealthEntry[]>(() => getHealthEntries());
  const [analysis, setAnalysis] = useState<HealthAnalysis | null>(() =>
    safeParse<HealthAnalysis | null>(localStorage.getItem(HEALTH_ANALYSIS_KEY), null)
  );
  const [form, setForm] = useState<HealthFormState>(initialHealthForm);
  const [showSyncForm, setShowSyncForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'diet' | 'supplements' | 'insights'>('overview');
  const [challenge, setChallenge] = useState<MeditationChallenge>(() => getChallenge());
  const [meditationForm, setMeditationForm] = useState<MeditationFormState>({
    minutes: '20',
    note: '',
  });
  const [noFapChallenge, setNoFapChallenge] = useState<NoFapChallenge>(() => getNoFapChallenge());
  const [noFapNote, setNoFapNote] = useState('');
  const [supplementLogs, setSupplementLogs] = useState<SupplementLog[]>(() => getSupplementLog());

  const latestEntry = entries[entries.length - 1] || null;
  const appContext = useMemo(() => getExistingAppContext(), [entries, analysis]);
  const today = todayKey();
  const todaySupplementLog = supplementLogs.find((log) => log.date === today) || { date: today, taken: [] };

  const challengeStats = useMemo(() => {
    if (!challenge.startedAt) {
      return {
        dayNumber: 0,
        elapsedDays: 0,
        completedDays: 0,
        missedDays: 0,
        missedDates: [] as string[],
        currentStreak: 0,
        bestStreak: 0,
        progress: 0,
        todayLog: challenge.logs[today],
      };
    }

    const elapsedDays = Math.min(challenge.targetDays, daysBetween(challenge.startedAt, today) + 1);
    const completedDates = (Object.values(challenge.logs) as MeditationLog[])
      .filter((log) => log.completed && log.date >= challenge.startedAt! && log.date <= today)
      .map((log) => log.date)
      .sort();
    const completedDays = completedDates.length;
    const pastDaysElapsed = Math.max(0, Math.min(challenge.targetDays, daysBetween(challenge.startedAt, today)));
    const missedDates = Array.from({ length: pastDaysElapsed }, (_, index) =>
      new Date(dateToTime(challenge.startedAt!) + index * DAY_MS).toISOString().split('T')[0]
    ).filter((date) => !challenge.logs[date]?.completed);

    // Today is still in progress until the user finishes the day. Preserve
    // yesterday's streak until today's check-in is submitted.
    const streakAnchor = challenge.logs[today]?.completed
      ? today
      : new Date(dateToTime(today) - DAY_MS).toISOString().split('T')[0];
    const anchorElapsedDays = streakAnchor >= challenge.startedAt
      ? Math.min(elapsedDays, daysBetween(challenge.startedAt, streakAnchor) + 1)
      : 0;
    let currentStreak = 0;
    for (let index = 0; index < anchorElapsedDays; index += 1) {
      const checkDate = new Date(dateToTime(streakAnchor) - index * DAY_MS).toISOString().split('T')[0];
      if (challenge.logs[checkDate]?.completed) currentStreak += 1;
      else break;
    }

    let bestStreak = 0;
    let running = 0;
    for (let index = 0; index < elapsedDays; index += 1) {
      const checkDate = new Date(dateToTime(challenge.startedAt) + index * DAY_MS).toISOString().split('T')[0];
      if (challenge.logs[checkDate]?.completed) {
        running += 1;
        bestStreak = Math.max(bestStreak, running);
      } else {
        running = 0;
      }
    }

    return {
      dayNumber: elapsedDays,
      elapsedDays,
      completedDays,
      missedDays: missedDates.length,
      missedDates,
      currentStreak,
      bestStreak,
      progress: Math.round((completedDays / challenge.targetDays) * 100),
      todayLog: challenge.logs[today],
    };
  }, [challenge, today]);

  const noFapStats = useMemo(() => {
    if (!noFapChallenge.startedAt) {
      return {
        dayNumber: 0,
        elapsedDays: 0,
        completedDays: 0,
        missedDays: 0,
        missedDates: [] as string[],
        currentStreak: 0,
        bestStreak: 0,
        progress: 0,
        todayLog: noFapChallenge.logs[today],
      };
    }

    const elapsedDays = Math.min(100, daysBetween(noFapChallenge.startedAt, today) + 1);
    const completedDays = Object.values(noFapChallenge.logs)
      .filter((log) => log.completed && log.date >= noFapChallenge.startedAt! && log.date <= today)
      .length;
    const pastDaysElapsed = Math.max(0, Math.min(100, daysBetween(noFapChallenge.startedAt, today)));
    const missedDates = Array.from({ length: pastDaysElapsed }, (_, index) =>
      new Date(dateToTime(noFapChallenge.startedAt!) + index * DAY_MS).toISOString().split('T')[0]
    ).filter((date) => !noFapChallenge.logs[date]?.completed);

    const streakAnchor = noFapChallenge.logs[today]?.completed
      ? today
      : new Date(dateToTime(today) - DAY_MS).toISOString().split('T')[0];
    const anchorElapsedDays = streakAnchor >= noFapChallenge.startedAt
      ? Math.min(elapsedDays, daysBetween(noFapChallenge.startedAt, streakAnchor) + 1)
      : 0;
    let currentStreak = 0;
    for (let index = 0; index < anchorElapsedDays; index += 1) {
      const checkDate = new Date(dateToTime(streakAnchor) - index * DAY_MS).toISOString().split('T')[0];
      if (noFapChallenge.logs[checkDate]?.completed) currentStreak += 1;
      else break;
    }

    let bestStreak = 0;
    let running = 0;
    for (let index = 0; index < elapsedDays; index += 1) {
      const checkDate = new Date(dateToTime(noFapChallenge.startedAt) + index * DAY_MS).toISOString().split('T')[0];
      if (noFapChallenge.logs[checkDate]?.completed) {
        running += 1;
        bestStreak = Math.max(bestStreak, running);
      } else {
        running = 0;
      }
    }

    return {
      dayNumber: elapsedDays,
      elapsedDays,
      completedDays,
      missedDays: missedDates.length,
      missedDates,
      currentStreak,
      bestStreak,
      progress: Math.round((completedDays / 100) * 100),
      todayLog: noFapChallenge.logs[today],
    };
  }, [noFapChallenge, today]);

  const challengeAIMemory = useMemo<ChallengeAIMemory>(() => ({
    skyMeditation: {
      started: Boolean(challenge.startedAt),
      startedAt: challenge.startedAt,
      targetDays: challenge.targetDays,
      challengeDay: challengeStats.dayNumber,
      completedDays: challengeStats.completedDays,
      missedDays: challengeStats.missedDays,
      currentStreak: challengeStats.currentStreak,
      bestStreak: challengeStats.bestStreak,
      progressPercent: challengeStats.progress,
      dailyTargetMinutes: challenge.dailyTargetMinutes,
      recentCheckIns: Object.values(challenge.logs)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-14)
        .map((log) => ({ date: log.date, completed: log.completed, minutes: log.minutes })),
      streakInterrupted: challengeStats.missedDays > 0,
      missedDates: challengeStats.missedDates.slice(-14),
      lastMissedDate: challengeStats.missedDates[challengeStats.missedDates.length - 1] || null,
      previousAttempts: challenge.archivedAttempts.slice(-5),
    },
    noFap: {
      started: Boolean(noFapChallenge.startedAt),
      startedAt: noFapChallenge.startedAt,
      targetDays: 100,
      challengeDay: noFapStats.dayNumber,
      completedDays: noFapStats.completedDays,
      missedDays: noFapStats.missedDays,
      currentStreak: noFapStats.currentStreak,
      bestStreak: noFapStats.bestStreak,
      progressPercent: noFapStats.progress,
      recentCheckIns: Object.values(noFapChallenge.logs)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-14)
        .map((log) => ({ date: log.date, completed: log.completed })),
      streakInterrupted: noFapStats.missedDays > 0,
      missedDates: noFapStats.missedDates.slice(-14),
      lastMissedDate: noFapStats.missedDates[noFapStats.missedDates.length - 1] || null,
      previousAttempts: noFapChallenge.archivedAttempts.slice(-5),
    },
  }), [challenge, challengeStats, noFapChallenge, noFapStats]);

  const persistAnalysis = (nextAnalysis: HealthAnalysis) => {
    setAnalysis(nextAnalysis);
    localStorage.setItem(HEALTH_ANALYSIS_KEY, JSON.stringify(nextAnalysis));
  };

  const handleSync = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    const entry = buildEntryFromForm(form);
    const nextEntries = [...entries.filter((item) => item.date !== entry.date), entry].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    saveHealthEntries(nextEntries);
    setEntries(nextEntries);

    const context = getExistingAppContext();
    try {
      const gatewayAnalysis = await analyzeWithGateway(entry, nextEntries, context, challengeAIMemory);
      persistAnalysis(gatewayAnalysis);
    } catch (error) {
      persistAnalysis(buildLocalAnalysis(entry, nextEntries, context, describeAIGatewayError(error)));
    } finally {
      setLoading(false);
      setShowSyncForm(false);
    }
  };

  const handleRetryAI = async () => {
    if (loading || !latestEntry) return;
    setLoading(true);
    const context = getExistingAppContext();
    try {
      const gatewayAnalysis = await analyzeWithGateway(latestEntry, entries, context, challengeAIMemory);
      persistAnalysis(gatewayAnalysis);
    } catch (error) {
      persistAnalysis(buildLocalAnalysis(latestEntry, entries, context, describeAIGatewayError(error)));
    } finally {
      setLoading(false);
    }
  };

  const startChallenge = () => {
    const next = {
      ...createDefaultChallenge(),
      startedAt: today,
    };
    saveChallenge(next);
    setChallenge(next);
  };

  const resetChallenge = () => {
    if (!window.confirm(
      'Reset SKY Meditation Practice and start a fresh 90-day run today? Your current attempt summary will be archived; its daily check-ins will no longer count toward the new run.'
    )) return;

    const archivedAttempts = challenge.startedAt
      ? [
          ...challenge.archivedAttempts,
          {
            startedAt: challenge.startedAt,
            resetAt: today,
            targetDays: challenge.targetDays,
            completedDays: challengeStats.completedDays,
            missedDays: challengeStats.missedDays,
            bestStreak: challengeStats.bestStreak,
          },
        ].slice(-10)
      : challenge.archivedAttempts;

    const freshChallenge: MeditationChallenge = {
      ...createDefaultChallenge(),
      startedAt: today,
      dailyTargetMinutes: challenge.dailyTargetMinutes,
      archivedAttempts,
    };
    saveChallenge(freshChallenge);
    setChallenge(freshChallenge);
    setMeditationForm({ minutes: String(freshChallenge.dailyTargetMinutes), note: '' });
  };

  const saveMeditationLog = (event: React.FormEvent) => {
    event.preventDefault();
    const minutes = Math.max(0, Math.round(numberOrDefault(meditationForm.minutes, 0)));
    const completed = minutes >= challenge.dailyTargetMinutes;
    const next = {
      ...challenge,
      logs: {
        ...challenge.logs,
        [today]: {
          date: today,
          completed,
          minutes,
          note: meditationForm.note.trim(),
        },
      },
    };
    saveChallenge(next);
    setChallenge(next);
  };

  const startNoFapChallenge = () => {
    const next: NoFapChallenge = {
      ...createDefaultNoFapChallenge(),
      startedAt: today,
    };
    saveNoFapChallenge(next);
    setNoFapChallenge(next);
  };

  const resetNoFapChallenge = () => {
    if (!window.confirm(
      'Reset the No-Fap Tracker and start a fresh 100-day run today? Your current attempt summary will be archived; its daily check-ins will no longer count toward the new run.'
    )) return;

    const archivedAttempts = noFapChallenge.startedAt
      ? [
          ...noFapChallenge.archivedAttempts,
          {
            startedAt: noFapChallenge.startedAt,
            resetAt: today,
            targetDays: 100,
            completedDays: noFapStats.completedDays,
            missedDays: noFapStats.missedDays,
            bestStreak: noFapStats.bestStreak,
          },
        ].slice(-10)
      : noFapChallenge.archivedAttempts;

    const freshChallenge: NoFapChallenge = {
      ...createDefaultNoFapChallenge(),
      startedAt: today,
      archivedAttempts,
    };
    saveNoFapChallenge(freshChallenge);
    setNoFapChallenge(freshChallenge);
    setNoFapNote('');
  };

  const saveNoFapCheckIn = (event: React.FormEvent) => {
    event.preventDefault();
    if (!noFapChallenge.startedAt) return;
    const next: NoFapChallenge = {
      ...noFapChallenge,
      logs: {
        ...noFapChallenge.logs,
        [today]: {
          date: today,
          completed: true,
          note: noFapNote.trim(),
        },
      },
    };
    saveNoFapChallenge(next);
    setNoFapChallenge(next);
  };

  const toggleSupplement = (name: string) => {
    const current = todaySupplementLog.taken;
    const taken = current.includes(name) ? current.filter((item) => item !== name) : [...current, name];
    const nextLogs = [...supplementLogs.filter((log) => log.date !== today), { date: today, taken }];
    saveSupplementLog(nextLogs);
    setSupplementLogs(nextLogs);
  };

  const tabButton = (id: typeof activeTab, label: string) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
        activeTab === id
          ? 'bg-slate-900 text-white'
          : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-xl bg-slate-900 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Health Tracker</p>
            <h2 className="mt-2 text-2xl font-bold md:text-3xl">Body, Brain, SKY Practice</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-300 md:text-base">
              Manual health sync, cognitive readiness, safe wellness guidance, and a 90-day SKY meditation challenge
              connected to your current GATE execution data.
            </p>
          </div>
          <button
            onClick={() => setShowSyncForm((value) => !value)}
            className="rounded-lg bg-amber-500 px-5 py-3 text-sm font-black text-slate-900 hover:bg-amber-400"
          >
            {showSyncForm ? 'Close Sync' : 'Sync Health Today'}
          </button>
        </div>
      </section>

      {showSyncForm && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <form onSubmit={handleSync} className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[
              ['Sleep Hours', 'sleepHours', '7.5'],
              ['Deep Sleep', 'deepSleepHours', '1.5'],
              ['Sleep Score', 'sleepScore', '78'],
              ['Steps', 'steps', '8000'],
              ['Heart Rate', 'heartRate', '72'],
              ['SpO2', 'oxygenLevel', '98'],
              ['Stress Level', 'stressLevel', '35'],
              ['Active Minutes', 'activeMinutes', '35'],
              ['Hydration ml', 'hydration', '2500'],
            ].map(([label, key, placeholder]) => (
              <label key={key} className="text-sm font-semibold text-slate-700">
                {label}
                <input
                  type="number"
                  step="0.1"
                  value={form[key as keyof HealthFormState]}
                  placeholder={placeholder}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            ))}
            <label className="text-sm font-semibold text-slate-700">
              Mood
              <select
                value={form.mood}
                onChange={(event) => setForm({ ...form, mood: event.target.value as Mood })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="great">Great</option>
                <option value="good">Good</option>
                <option value="neutral">Neutral</option>
                <option value="low">Low</option>
                <option value="bad">Bad / unwell</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-3">
              Symptoms, if any
              <input
                value={form.symptoms}
                onChange={(event) => setForm({ ...form, symptoms: event.target.value })}
                placeholder="headache, cold, fatigue..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <div className="flex items-end md:col-span-4">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-slate-400"
              >
                {loading ? 'Analyzing...' : 'Save and Analyze'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          title="Health Score"
          value={analysis ? `${analysis.healthScore}/100` : 'No data'}
          detail={analysis ? `Grade ${analysis.grade}` : 'Sync health to begin'}
          accent={analysis ? scoreColor(analysis.healthScore) : 'text-slate-500'}
        />
        <MetricCard
          title="Cognitive Readiness"
          value={analysis ? `${analysis.cognitiveReadiness}%` : '0%'}
          detail={analysis?.studyMode || 'Waiting for analysis'}
          accent={analysis ? scoreColor(analysis.cognitiveReadiness) : 'text-slate-500'}
        />
        <MetricCard
          title="Study Context"
          value={`${appContext.studyHoursToday}h`}
          detail={`${appContext.streakDays} day streak, ${appContext.mockCount} tests`}
          accent="text-indigo-600"
        />
        <MetricCard
          title="SKY Challenge"
          value={challenge.startedAt ? `${challengeStats.dayNumber}/90` : 'Not started'}
          detail={`${challengeStats.completedDays} completed, ${challengeStats.currentStreak} streak`}
          accent="text-amber-600"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Readiness Brief</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {analysis
                    ? analysis.message
                    : 'Sync your Firebolt/watch data manually to create today\'s health brief.'}
                </p>
              </div>
              {analysis && (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    analysis.source === 'ai_gateway'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {analysis.source === 'ai_gateway' ? 'AI Gateway analysis' : 'Local analysis mode'}
                </span>
              )}
            </div>

            {analysis?.failureNote && (
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-amber-900">AI Notice:</span>
                  <span>{analysis.failureNote}</span>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleRetryAI}
                  className="self-start sm:self-auto rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Retrying...' : 'Retry AI'}
                </button>
              </div>
            )}

            {latestEntry && analysis && (
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Vital title="Sleep" value={`${latestEntry.sleepHours}h`} good={latestEntry.sleepHours >= 7} />
                <Vital title="SpO2" value={`${latestEntry.oxygenLevel}%`} good={latestEntry.oxygenLevel >= 95} />
                <Vital title="Steps" value={latestEntry.steps.toLocaleString()} good={latestEntry.steps >= 6000} />
                <Vital title="Stress" value={`${latestEntry.stressLevel}/100`} good={latestEntry.stressLevel <= 60} />
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap gap-2">
              {tabButton('overview', 'Alerts')}
              {tabButton('diet', 'Diet')}
              {tabButton('supplements', 'Supplements')}
              {tabButton('insights', 'Insights')}
            </div>

            {!analysis ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
                No health analysis yet. Use Sync Health Today to create your first entry.
              </div>
            ) : (
              <>
                {activeTab === 'overview' && (
                  <div className="space-y-3">
                    {analysis.alerts.map((alert) => (
                      <div
                        key={`${alert.title}_${alert.message}`}
                        className={`rounded-xl border-l-4 p-4 ${
                          alert.severity === 'critical'
                            ? 'border-rose-500 bg-rose-50'
                            : alert.severity === 'warning'
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-blue-500 bg-blue-50'
                        }`}
                      >
                        <p className="font-bold text-slate-900">{alert.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{alert.message}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-800">{alert.action}</p>
                      </div>
                    ))}
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-sm font-bold text-slate-900">Today action items</p>
                      <ul className="mt-3 space-y-2 text-sm text-slate-600">
                        {analysis.actionItems.map((item) => (
                          <li key={item} className="flex gap-2">
                            <span className="font-bold text-indigo-600">-</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {activeTab === 'diet' && (
                  <div className="space-y-4">
                    <p className="rounded-xl bg-indigo-50 p-4 text-sm font-semibold text-indigo-800">
                      {analysis.diet.guidance}
                    </p>
                    <Meal title="Breakfast" items={analysis.diet.breakfast} />
                    <Meal title="Lunch" items={analysis.diet.lunch} />
                    <Meal title="Dinner" items={analysis.diet.dinner} />
                    <Meal title="Snacks" items={analysis.diet.snacks} />
                    <Meal title={`Avoid - ${analysis.diet.hydrationGoal}`} items={analysis.diet.avoid} danger />
                  </div>
                )}

                {activeTab === 'supplements' && (
                  <div className="space-y-3">
                    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                      Optional wellness reminders only. Do not start supplements blindly; consult a doctor if you have
                      medical conditions, regular medicines, or abnormal reports.
                    </p>
                    {analysis.supplements.map((supplement) => (
                      <label
                        key={supplement.name}
                        className="flex gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={todaySupplementLog.taken.includes(supplement.name)}
                          onChange={() => toggleSupplement(supplement.name)}
                          className="mt-1 h-4 w-4 accent-indigo-600"
                        />
                        <span>
                          <span className="block font-bold text-slate-900">{supplement.name}</span>
                          <span className="block text-sm text-slate-600">{supplement.purpose}</span>
                          <span className="mt-1 block text-xs font-semibold text-indigo-600">{supplement.timing}</span>
                          <span className="mt-1 block text-xs text-amber-700">{supplement.caution}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {activeTab === 'insights' && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {analysis.insights.map((insight) => (
                      <div key={insight} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        {insight}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <aside className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">90-Day Challenge</p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">SKY Meditation Practice</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                  {challenge.dailyTargetMinutes} min/day
                </span>
                {challenge.startedAt && (
                  <button
                    type="button"
                    onClick={resetChallenge}
                    title="Archive this attempt and start a new 90-day challenge"
                    className="rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-50"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {!challenge.startedAt ? (
              <div className="mt-5 rounded-xl bg-slate-50 p-5">
                <p className="text-sm text-slate-600">
                  Start a 90-day SKY practice streak. The goal is daily consistency, not perfection.
                </p>
                <button
                  onClick={startChallenge}
                  className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"
                >
                  Start 90-Day Challenge
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-4xl font-black text-slate-900">{challengeStats.dayNumber}/90</p>
                      <p className="text-sm text-slate-500">Current challenge day</p>
                    </div>
                    <p className="text-2xl font-black text-amber-600">{challengeStats.progress}%</p>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${challengeStats.progress}%` }} />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <MiniStat label="Done" value={challengeStats.completedDays} />
                  <MiniStat label="Streak" value={challengeStats.currentStreak} />
                  <MiniStat label="Best" value={challengeStats.bestStreak} />
                </div>

                <form onSubmit={saveMeditationLog} className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <p className="font-bold text-slate-900">
                    {challengeStats.todayLog?.completed ? 'Today complete' : 'Practice now'}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Missing days do not erase progress, but they break the current streak.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      min="0"
                      value={meditationForm.minutes}
                      onChange={(event) => setMeditationForm({ ...meditationForm, minutes: event.target.value })}
                      className="rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-black text-slate-900 hover:bg-amber-400"
                    >
                      Save Check-In
                    </button>
                  </div>
                  <input
                    value={meditationForm.note}
                    onChange={(event) => setMeditationForm({ ...meditationForm, note: event.target.value })}
                    placeholder="Optional note"
                    className="mt-3 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="mt-3 text-xs font-semibold text-amber-800">
                    Missed days before today: {challengeStats.missedDays}
                  </p>
                  {challengeStats.missedDays > 0 && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-white/80 p-3">
                      <p className="text-xs leading-relaxed text-amber-900">
                        You have {challengeStats.missedDays} earlier missed day(s). Your completed days are preserved; the missed days interrupt the streak, not your ability to continue.
                      </p>
                      <NavLink
                        to="/mentor?ask=Review%20my%20SKY%20Meditation%20Practice%20and%20No-Fap%20Tracker.%20Check%20actual%20missed%20days%20and%20streak%20status%20for%20both%20challenges%2C%20then%20give%20me%20a%20practical%2C%20non-judgmental%20recovery%20plan."
                        className="mt-2 inline-flex text-xs font-bold text-amber-800 underline underline-offset-2 hover:text-amber-950"
                      >
                        Get AI Mentor recovery guidance →
                      </NavLink>
                    </div>
                  )}
                </form>
              </>
            )}
            <p className="mt-3 text-xs text-slate-400">
              SKY practice totals, streaks, and recent check-ins are included in the next Gemini health analysis.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">100-Day Challenge</p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">No-Fap Tracker</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                  Daily check-in
                </span>
                {noFapChallenge.startedAt && (
                  <button
                    type="button"
                    onClick={resetNoFapChallenge}
                    title="Archive this attempt and start a new 100-day challenge"
                    className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-800 transition hover:bg-indigo-50"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {!noFapChallenge.startedAt ? (
              <div className="mt-5 rounded-xl bg-slate-50 p-5">
                <p className="text-sm text-slate-600">
                  Start your 100-day personal habit challenge. Progress is based on your own daily check-ins.
                </p>
                <button
                  type="button"
                  onClick={startNoFapChallenge}
                  className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"
                >
                  Start 100-Day Challenge
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-4xl font-black text-slate-900">{noFapStats.dayNumber}/100</p>
                      <p className="text-sm text-slate-500">Current challenge day</p>
                    </div>
                    <p className="text-2xl font-black text-indigo-600">{noFapStats.progress}%</p>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${noFapStats.progress}%` }} />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <MiniStat label="Done" value={noFapStats.completedDays} />
                  <MiniStat label="Streak" value={noFapStats.currentStreak} />
                  <MiniStat label="Best" value={noFapStats.bestStreak} />
                </div>

                <form onSubmit={saveNoFapCheckIn} className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                  <p className="font-bold text-slate-900">
                    {noFapStats.todayLog?.completed ? 'Today complete' : 'Today’s check-in'}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Mark the day complete when you have followed your personal goal. A missed day breaks the current streak but does not erase earlier completed days.
                  </p>
                  <input
                    value={noFapNote}
                    onChange={(event) => setNoFapNote(event.target.value)}
                    placeholder="Optional private note"
                    className="mt-3 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-black text-white hover:bg-indigo-700"
                  >
                    {noFapStats.todayLog?.completed ? 'Update Today’s Check-In' : 'Save Check-In'}
                  </button>
                  <p className="mt-3 text-xs font-semibold text-indigo-800">
                    Missed days before today: {noFapStats.missedDays}
                  </p>
                  {noFapStats.missedDays > 0 && (
                    <div className="mt-3 rounded-lg border border-indigo-200 bg-white/80 p-3">
                      <p className="text-xs leading-relaxed text-indigo-900">
                        You have {noFapStats.missedDays} earlier day(s) without a completed check-in. This is a habit-tracking signal, not a judgement; you can continue from today.
                      </p>
                      <NavLink
                        to="/mentor?ask=Review%20my%20SKY%20Meditation%20Practice%20and%20No-Fap%20Tracker.%20Check%20actual%20missed%20days%20and%20streak%20status%20for%20both%20challenges%2C%20then%20give%20me%20a%20practical%2C%20non-judgmental%20recovery%20plan."
                        className="mt-2 inline-flex text-xs font-bold text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                      >
                        Get AI Mentor recovery guidance →
                      </NavLink>
                    </div>
                  )}
                </form>
              </>
            )}
            <p className="mt-3 text-xs text-slate-400">
              Challenge totals and recent check-ins are included in the next Gemini health analysis. Notes stay in this browser.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-900">Recent Health Logs</h3>
            <div className="mt-4 space-y-3">
              {entries.slice(-5).reverse().map((entry) => (
                <div key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-800">{formatDate(entry.date)}</p>
                    <p className="text-xs font-bold text-slate-500">{entry.mood}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Sleep {entry.sleepHours}h, Steps {entry.steps.toLocaleString()}, Stress {entry.stressLevel}/100
                  </p>
                </div>
              ))}
              {entries.length === 0 && <p className="text-sm text-slate-500">No health logs yet.</p>}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
};

const MetricCard: React.FC<{ title: string; value: string; detail: string; accent: string }> = ({
  title,
  value,
  detail,
  accent,
}) => (
  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</p>
    <p className={`mt-2 text-3xl font-black ${accent}`}>{value}</p>
    <p className="mt-1 text-sm text-slate-500">{detail}</p>
  </div>
);

const Vital: React.FC<{ title: string; value: string; good: boolean }> = ({ title, value, good }) => (
  <div className="rounded-xl bg-slate-50 p-4">
    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</p>
    <p className={`mt-2 text-xl font-black ${good ? 'text-emerald-600' : 'text-amber-600'}`}>{value}</p>
  </div>
);

const Meal: React.FC<{ title: string; items: string[]; danger?: boolean }> = ({ title, items, danger = false }) => (
  <div>
    <p className={`mb-2 font-bold ${danger ? 'text-rose-700' : 'text-slate-900'}`}>{title}</p>
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            danger ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {item}
        </span>
      ))}
    </div>
  </div>
);

const MiniStat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 p-3">
    <p className="text-2xl font-black text-slate-900">{value}</p>
    <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
  </div>
);

export default HealthTracker;
