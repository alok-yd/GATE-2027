import { cleanGatewayJson, generateGatewayText } from './AIGatewayClient';

export type SpeakingSessionType =
  | 'shadow'
  | 'record'
  | 'conversation'
  | 'tongue_twister'
  | 'presentation'
  | 'free';

export interface SpeakingSession {
  id: string;
  date: string;
  type: SpeakingSessionType;
  durationMinutes: number;
  topic?: string;
  transcript?: string;
  scores: SessionScores;
  aiAnalysis?: AIFeedback;
  audioMetrics?: AudioMetrics;
  notes?: string;
}

export interface SessionScores {
  clarity: number;
  confidence: number;
  fluency: number;
  pronunciation: number;
  pace: number;
  overall: number;
}

export interface AudioMetrics {
  durationSeconds: number;
  estimatedWPM: number;
  pauseCount: number;
  fillerWordCount: number;
  fillerWords: string[];
  longestPauseSeconds: number;
}

export interface AIFeedback {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: string;
  strengths: string[];
  improvements: string[];
  fillerWordAnalysis: string;
  paceFeedback: string;
  pronunciationTips: string[];
  nextSessionFocus: string;
  encouragement: string;
}

export interface MilestoneStatus {
  id: string;
  week: number;
  title: string;
  description: string;
  completed: boolean;
  completedDate?: string;
  targetDate: string;
}

export interface DailyPracticeLog {
  date: string;
  sessions: string[];
  totalMinutes: number;
  completed: boolean;
  streak: number;
}

export interface SpeakingProgress {
  totalSessions: number;
  totalMinutes: number;
  currentStreak: number;
  longestStreak: number;
  averageScores: SessionScores;
  weeklyMinutes: number[];
  dayStarted: string;
  day90Target: string;
}

const SESSIONS_KEY = 'gate_speaking_sessions';
const MILESTONES_KEY = 'gate_speaking_milestones';
const DAILY_LOG_KEY = 'gate_speaking_daily_log';
const PROGRESS_KEY = 'gate_speaking_progress_meta';

const DAY_MS = 24 * 60 * 60 * 1000;

const emptyScores: SessionScores = {
  clarity: 0,
  confidence: 0,
  fluency: 0,
  pronunciation: 0,
  pace: 0,
  overall: 0,
};

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

const emitStorageChange = () => {
  window.dispatchEvent(new Event('storage'));
};

const addDays = (date: string, days: number) => {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().split('T')[0];
};

const getDefaultProgress = (): SpeakingProgress => {
  const start = todayKey();
  return {
    totalSessions: 0,
    totalMinutes: 0,
    currentStreak: 0,
    longestStreak: 0,
    averageScores: { ...emptyScores },
    weeklyMinutes: new Array(8).fill(0),
    dayStarted: start,
    day90Target: addDays(start, 90),
  };
};

export const DEFAULT_MILESTONES: Omit<MilestoneStatus, 'completed' | 'completedDate' | 'targetDate'>[] = [
  {
    id: 'm1',
    week: 1,
    title: 'First Recording Done',
    description: 'Record or transcribe yourself speaking for at least 2 minutes.',
  },
  {
    id: 'm2',
    week: 1,
    title: 'Five-Day Warmup',
    description: 'Complete five short pronunciation or tongue-twister sessions.',
  },
  {
    id: 'm3',
    week: 2,
    title: 'Mirror Work Habit',
    description: 'Log 10 days of mirror or read-aloud practice.',
  },
  {
    id: 'm4',
    week: 4,
    title: 'Pronunciation Baseline',
    description: 'Self-rate pronunciation at 7 or higher for three sessions.',
  },
  {
    id: 'm5',
    week: 4,
    title: 'Three-Minute Fluency',
    description: 'Speak for 3 minutes without major hesitation.',
  },
  {
    id: 'm6',
    week: 6,
    title: 'Self-Introduction Pro',
    description: 'Record a polished 1-minute self-introduction with 7.5+ overall score.',
  },
  {
    id: 'm7',
    week: 8,
    title: 'Conversation Ready',
    description: 'Complete five conversation-style practice sessions.',
  },
  {
    id: 'm8',
    week: 8,
    title: 'Error Spotter',
    description: 'Identify and write down 20 personal speaking errors from practice.',
  },
  {
    id: 'm9',
    week: 10,
    title: 'Five-Minute Presenter',
    description: 'Complete a 5-minute presentation with 8+ overall score.',
  },
  {
    id: 'm10',
    week: 11,
    title: 'Filler-Word Reducer',
    description: 'Bring filler words below 5 per minute in one analyzed session.',
  },
  {
    id: 'm11',
    week: 12,
    title: 'Sixty-Day Consistent',
    description: 'Reach 60 logged speaking-practice days.',
  },
  {
    id: 'm12',
    week: 12,
    title: 'Ninety-Day Champion',
    description: 'Finish the 90-day speaking journey with clear score improvement.',
  },
];

export class SessionManager {
  static getAll(): SpeakingSession[] {
    return safeParse<SpeakingSession[]>(localStorage.getItem(SESSIONS_KEY), [])
      .map((session) => ({
        ...session,
        durationMinutes: Number(session.durationMinutes || 0),
        scores: {
          ...emptyScores,
          ...session.scores,
          overall: Number(session.scores?.overall || 0),
        },
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  static getToday(): SpeakingSession[] {
    const today = todayKey();
    return this.getAll().filter((session) => session.date.slice(0, 10) === today);
  }

  static save(session: SpeakingSession): SpeakingSession {
    const all = this.getAll();
    const idx = all.findIndex((item) => item.id === session.id);
    const normalized: SpeakingSession = {
      ...session,
      durationMinutes: Math.max(0, Math.round(Number(session.durationMinutes || 0))),
      scores: {
        ...emptyScores,
        ...session.scores,
        overall: Number(session.scores?.overall || 0),
      },
    };

    if (idx >= 0) all[idx] = normalized;
    else all.push(normalized);

    const next = all.sort((a, b) => a.date.localeCompare(b.date)).slice(-365);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
    this.rebuildDailyLogs(next);
    this.updateProgress(next);
    emitStorageChange();
    return normalized;
  }

  static createSession(type: SpeakingSessionType, topic?: string): SpeakingSession {
    return {
      id: `speak_${Date.now()}`,
      date: new Date().toISOString(),
      type,
      durationMinutes: 0,
      topic,
      scores: { ...emptyScores },
    };
  }

  static calculateOverall(scores: Partial<Omit<SessionScores, 'overall'>>): number {
    const values = [
      Number(scores.clarity || 0),
      Number(scores.confidence || 0),
      Number(scores.fluency || 0),
      Number(scores.pronunciation || 0),
      Number(scores.pace || 0),
    ].filter((value) => value > 0);

    return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0;
  }

  static getDailyLogs(): DailyPracticeLog[] {
    const logs = safeParse<DailyPracticeLog[]>(localStorage.getItem(DAILY_LOG_KEY), []);
    if (logs.length > 0) return logs.sort((a, b) => a.date.localeCompare(b.date));
    this.rebuildDailyLogs(this.getAll());
    return safeParse<DailyPracticeLog[]>(localStorage.getItem(DAILY_LOG_KEY), []);
  }

  static getProgress(): SpeakingProgress {
    return this.updateProgress(this.getAll());
  }

  private static rebuildDailyLogs(sessions: SpeakingSession[]) {
    const byDate = new Map<string, DailyPracticeLog>();

    sessions.forEach((session) => {
      const date = session.date.slice(0, 10);
      const existing = byDate.get(date) || {
        date,
        sessions: [],
        totalMinutes: 0,
        completed: false,
        streak: 0,
      };

      if (!existing.sessions.includes(session.id)) {
        existing.sessions.push(session.id);
        existing.totalMinutes += Math.max(0, Math.round(Number(session.durationMinutes || 0)));
      }
      existing.completed = existing.totalMinutes >= 30;
      byDate.set(date, existing);
    });

    const logs = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    const completedDates = new Set(logs.filter((log) => log.completed).map((log) => log.date));

    logs.forEach((log) => {
      let streak = 0;
      const cursor = new Date(`${log.date}T00:00:00`);
      for (let i = 0; i < 365; i += 1) {
        const key = cursor.toISOString().split('T')[0];
        if (!completedDates.has(key)) break;
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      log.streak = streak;
    });

    localStorage.setItem(DAILY_LOG_KEY, JSON.stringify(logs.slice(-180)));
  }

  private static updateProgress(sessions: SpeakingSession[]) {
    const existing = safeParse<Partial<SpeakingProgress>>(localStorage.getItem(PROGRESS_KEY), {});
    const start = existing.dayStarted || todayKey();
    const logs = safeParse<DailyPracticeLog[]>(localStorage.getItem(DAILY_LOG_KEY), []);
    const completedDates = new Set(logs.filter((log) => log.completed).map((log) => log.date));
    let currentStreak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i += 1) {
      const key = cursor.toISOString().split('T')[0];
      if (!completedDates.has(key)) {
        if (i === 0) {
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        break;
      }
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const scoredSessions = sessions.slice(-10).filter((session) => session.scores.overall > 0);
    const averageScores = scoredSessions.length
      ? {
          clarity: average(scoredSessions.map((session) => session.scores.clarity)),
          confidence: average(scoredSessions.map((session) => session.scores.confidence)),
          fluency: average(scoredSessions.map((session) => session.scores.fluency)),
          pronunciation: average(scoredSessions.map((session) => session.scores.pronunciation)),
          pace: average(scoredSessions.map((session) => session.scores.pace)),
          overall: average(scoredSessions.map((session) => session.scores.overall)),
        }
      : { ...emptyScores };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weeklyMinutes = Array.from({ length: 8 }, (_, index) => {
      const startOffset = 7 * (7 - index);
      const endOffset = 7 * (6 - index);
      const weekStart = new Date(today.getTime() - startOffset * DAY_MS);
      const weekEnd = new Date(today.getTime() - endOffset * DAY_MS);
      return sessions
        .filter((session) => {
          const date = new Date(session.date);
          return date >= weekStart && date < weekEnd;
        })
        .reduce((sum, session) => sum + session.durationMinutes, 0);
    });

    const progress: SpeakingProgress = {
      totalSessions: sessions.length,
      totalMinutes: sessions.reduce((sum, session) => sum + session.durationMinutes, 0),
      currentStreak,
      longestStreak: Math.max(Number(existing.longestStreak || 0), currentStreak),
      averageScores,
      weeklyMinutes,
      dayStarted: start,
      day90Target: addDays(start, 90),
    };

    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    return progress;
  }
}

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
};

export class MilestoneManager {
  static getAll(): MilestoneStatus[] {
    const stored = safeParse<MilestoneStatus[]>(localStorage.getItem(MILESTONES_KEY), []);
    if (stored.length > 0) return stored;
    return this.initMilestones();
  }

  static initMilestones(): MilestoneStatus[] {
    const progress = SessionManager.getProgress() || getDefaultProgress();
    const milestones = DEFAULT_MILESTONES.map((milestone) => ({
      ...milestone,
      completed: false,
      targetDate: addDays(progress.dayStarted, milestone.week * 7),
    }));
    localStorage.setItem(MILESTONES_KEY, JSON.stringify(milestones));
    return milestones;
  }

  static toggle(id: string): void {
    const all = this.getAll();
    const next = all.map((milestone) =>
      milestone.id === id
        ? {
            ...milestone,
            completed: !milestone.completed,
            completedDate: milestone.completed ? undefined : todayKey(),
          }
        : milestone
    );
    localStorage.setItem(MILESTONES_KEY, JSON.stringify(next));
    emitStorageChange();
  }

  static getCompletionRate(): number {
    const all = this.getAll();
    return all.length ? (all.filter((milestone) => milestone.completed).length / all.length) * 100 : 0;
  }
}

export class AICoach {
  static getRuntimeLabel() {
    return 'AI Gateway routed';
  }

  static async analyzeTranscript(
    transcript: string,
    sessionType: string,
    durationMinutes: number,
    selfScores: Partial<SessionScores>
  ): Promise<AIFeedback> {
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;
    const fillerCounts = this.detectFillerWords(transcript);
    const prompt = `
Return only valid JSON matching:
{
  "overallScore": number,
  "grade": "A" | "B" | "C" | "D" | "F",
  "summary": string,
  "strengths": string[],
  "improvements": string[],
  "fillerWordAnalysis": string,
  "paceFeedback": string,
  "pronunciationTips": string[],
  "nextSessionFocus": string,
  "encouragement": string
}

You are an English speaking coach for an Indian engineering student preparing for GATE 2027.
Analyze the transcript for clarity, confidence, fluency, pronunciation habits, filler words, and pace.

Session type: ${sessionType}
Duration: ${durationMinutes} minutes
Word count: ${wordCount}
Estimated WPM: ${durationMinutes > 0 ? Math.round(wordCount / durationMinutes) : 0}
Self scores: ${JSON.stringify(selfScores)}
Filler words: ${JSON.stringify(fillerCounts)}
Transcript:
${transcript.slice(0, 2500)}
`;

    const generated = await this.generateJson<AIFeedback>(prompt);
    return generated || this.getFallbackFeedback(wordCount, durationMinutes, fillerCounts);
  }

  static async getDailyExercise(
    weekNumber: number,
    recentScores: Partial<SessionScores>
  ): Promise<{ title: string; instructions: string[]; duration: string; focus: string }> {
    const weakness =
      recentScores.pronunciation && recentScores.pronunciation < 6
        ? 'pronunciation'
        : recentScores.fluency && recentScores.fluency < 6
          ? 'fluency'
          : recentScores.confidence && recentScores.confidence < 6
            ? 'confidence'
            : 'general clarity';

    const prompt = `
Return only JSON matching:
{
  "title": string,
  "instructions": string[],
  "duration": string,
  "focus": string
}

Generate one specific English speaking exercise for week ${weekNumber} of a 90-day program.
Student profile: Indian engineering student preparing for GATE 2027.
Current weakness: ${weakness}.
Keep it practical and finishable today.
`;

    const generated = await this.generateJson<{ title: string; instructions: string[]; duration: string; focus: string }>(
      prompt
    );

    return (
      generated || {
        title: 'Mirror Articulation Drill',
        instructions: [
          'Stand in front of a mirror with good lighting.',
          'Read one paragraph slowly and exaggerate mouth movement.',
          'Repeat the same paragraph at natural pace.',
          'Record one minute and write one fix for tomorrow.',
        ],
        duration: '15 minutes',
        focus: 'Pronunciation and mouth clarity',
      }
    );
  }

  static detectFillerWords(transcript: string): { word: string; count: number; positions: number[] }[] {
    const fillers = [
      'um',
      'uh',
      'like',
      'you know',
      'basically',
      'literally',
      'right',
      'so',
      'well',
      'actually',
      'kind of',
      'sort of',
      'i mean',
      'you see',
    ];

    return fillers
      .map((word) => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        const matches = [...transcript.matchAll(regex)];
        return {
          word,
          count: matches.length,
          positions: matches.map((match) => match.index || 0),
        };
      })
      .filter((item) => item.count > 0);
  }

  private static async generateJson<T>(prompt: string): Promise<T | null> {
    try {
      const result = await generateGatewayText({
        prompt,
        system:
          'You are Achiever Speaking Coach. Return only valid JSON for structured speaking feedback and exercises.',
      });
      return JSON.parse(cleanGatewayJson(result.content)) as T;
    } catch {
      return null;
    }
  }

  private static getFallbackFeedback(
    wordCount: number,
    duration: number,
    fillerCounts: { word: string; count: number }[]
  ): AIFeedback {
    const wpm = duration > 0 ? Math.round(wordCount / duration) : 0;
    const totalFillers = fillerCounts.reduce((sum, item) => sum + item.count, 0);
    const paceMessage =
      wpm < 110
        ? 'Your pace is slow. Build speed with short repeated paragraphs.'
        : wpm > 170
          ? 'Your pace is fast. Slow down slightly and land each sentence.'
          : 'Your pace is in a useful speaking range.';

    return {
      overallScore: clamp(62 + Math.min(12, wordCount / 30) - Math.min(12, totalFillers), 40, 82),
      grade: totalFillers <= 3 && wpm >= 110 && wpm <= 170 ? 'B' : 'C',
      summary: `You spoke ${wordCount} words in ${duration} minute(s). ${paceMessage}`,
      strengths: ['You completed a measurable speaking session.', 'You are building feedback instead of guessing progress.'],
      improvements: [
        'Replace filler words with a deliberate one-second pause.',
        'Open and close each sentence cleanly instead of trailing off.',
        'Repeat the same topic once more with a stricter 2-minute timer.',
      ],
      fillerWordAnalysis:
        totalFillers > 0
          ? `${totalFillers} filler word(s) detected. Track the top repeated word first.`
          : 'No major filler words detected in this transcript.',
      paceFeedback: paceMessage,
      pronunciationTips: [
        'Open the mouth wider for vowel-heavy words.',
        'Slow down at technical terms and names.',
        'Record the same paragraph twice and compare clarity.',
      ],
      nextSessionFocus: totalFillers > 6 ? 'Reduce filler words with deliberate pauses.' : 'Improve sentence endings and confidence.',
      encouragement: 'Communication improves through repetitions. Keep the session short, honest, and daily.',
    };
  }
}

export const TONGUE_TWISTERS = [
  { text: 'She sells seashells by the seashore', focus: 'S and SH sounds' },
  { text: 'Red lorry, yellow lorry', focus: 'R and L sounds' },
  { text: 'Unique New York, unique New York', focus: 'Vowel control' },
  { text: 'Thirty-three thirsty thinkers thought thoroughly', focus: 'TH sounds' },
  { text: 'A proper copper coffee pot', focus: 'P and K sounds' },
];

export const SPEAKING_TOPICS: Record<'beginner' | 'intermediate' | 'advanced', string[]> = {
  beginner: [
    'Introduce yourself in one minute',
    'Describe your daily GATE routine',
    'Explain your favorite subject',
    'Talk about a recent productive day',
    'Describe your study desk',
  ],
  intermediate: [
    'Explain why error logs improve marks',
    'Describe a difficult concept you recently fixed',
    'Compare revision and new learning',
    'Explain how you analyze a mock test',
    'Describe your ideal exam-day routine',
  ],
  advanced: [
    'Present a 3-minute argument for consistency over intensity',
    'Explain a technical topic to a non-technical friend',
    'Summarize your AIR-1 strategy like an interview answer',
    'Defend why sleep matters for exam performance',
    'Teach one GATE concept using an example',
  ],
};
