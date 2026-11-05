import type {
  DailyPracticeLog,
  MilestoneStatus,
  SpeakingProgress,
  SpeakingSession,
} from '../SpeakingServiceHub';

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const readList = <T,>(key: string): T[] => {
  if (typeof window === 'undefined') return [];
  try {
    const value = safeParse<unknown>(window.localStorage.getItem(key), []);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
};

/**
 * Strictly read-only adapter for the existing Speaking Coach data.
 * Read the exact storage keys used by SpeakingServiceHub rather than calling
 * its lazy initialisers or progress writers while the student is chatting.
 */
export const getSpeakingCoachMentorContext = () => {
  const sessions = readList<SpeakingSession>('gate_speaking_sessions')
    .filter((session) => session && typeof session.date === 'string')
    .sort((a, b) => a.date.localeCompare(b.date));
  const dailyLogs = readList<DailyPracticeLog>('gate_speaking_daily_log');
  const milestones = readList<MilestoneStatus>('gate_speaking_milestones');
  const progress = typeof window === 'undefined'
    ? null
    : (() => {
        try {
          return safeParse<SpeakingProgress | null>(
            window.localStorage.getItem('gate_speaking_progress_meta'),
            null
          );
        } catch {
          return null;
        }
      })();

  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter((session) => session.date.slice(0, 10) === today);
  const totalMinutes = sessions.reduce(
    (sum, session) => sum + Math.max(0, Number(session.durationMinutes) || 0),
    0
  );

  return {
    source: 'Read-only view of the exact browser-local records used by SpeakingServiceHub.',
    capturedAt: new Date().toISOString(),
    progress,
    derivedTotals: {
      totalRecordedSessions: sessions.length,
      totalRecordedMinutes: totalMinutes,
      totalDailyLogEntries: dailyLogs.length,
      scoredSessions: sessions.filter((session) => Number(session.scores?.overall) > 0).length,
    },
    today: {
      date: today,
      sessionCount: todaySessions.length,
      totalMinutes: todaySessions.reduce(
        (sum, session) => sum + Math.max(0, Number(session.durationMinutes) || 0),
        0
      ),
      sessions: todaySessions.map((session) => ({
        id: session.id,
        type: session.type,
        topic: session.topic || null,
        durationMinutes: session.durationMinutes,
        scores: session.scores,
      })),
    },
    dailyPracticeLogs: dailyLogs.slice(-30).reverse(),
    recentSessions: sessions.slice(-15).reverse().map((session) => ({
      id: session.id,
      date: session.date,
      type: session.type,
      topic: session.topic || null,
      durationMinutes: session.durationMinutes,
      scores: session.scores,
      audioMetrics: session.audioMetrics || null,
      aiAnalysis: session.aiAnalysis || null,
      notes: session.notes || null,
      transcript: session.transcript ? session.transcript.slice(0, 1800) : null,
    })),
    milestones: milestones.map((milestone) => ({
      id: milestone.id,
      week: milestone.week,
      title: milestone.title,
      description: milestone.description,
      completed: milestone.completed,
      completedDate: milestone.completedDate || null,
      targetDate: milestone.targetDate,
    })),
    milestoneSummary: milestones.length
      ? {
          total: milestones.length,
          completed: milestones.filter((milestone) => milestone.completed).length,
          remaining: milestones.filter((milestone) => !milestone.completed).length,
        }
      : null,
    dataQuality: [
      'This adapter only reads localStorage and does not initialise milestones or rewrite cached progress.',
      'Speaking scores are self-ratings or saved AI analysis attached to practice sessions.',
      'Only the 15 most recent sessions and 30 daily log rows are included.',
      'No transcript or score is inferred when the saved session does not contain it.',
      'A missing progress or milestone record is reported as unavailable/not initialised, not zero.',
    ],
  };
};
