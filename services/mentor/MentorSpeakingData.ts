import { MilestoneManager, SessionManager } from '../SpeakingServiceHub';

/**
 * Read-only adapter for the existing Speaking Coach data.
 * It consumes the section's own managers and does not create or update sessions.
 */
export const getSpeakingCoachMentorContext = () => {
  const sessions = SessionManager.getAll();
  const progress = SessionManager.getProgress();
  const milestones = MilestoneManager.getAll();
  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter((session) => session.date.slice(0, 10) === today);

  return {
    source: 'Existing Speaking Coach SessionManager and MilestoneManager records.',
    capturedAt: new Date().toISOString(),
    progress,
    today: {
      date: today,
      sessionCount: todaySessions.length,
      totalMinutes: todaySessions.reduce((sum, session) => sum + session.durationMinutes, 0),
      sessions: todaySessions.map((session) => ({
        id: session.id,
        type: session.type,
        topic: session.topic,
        durationMinutes: session.durationMinutes,
        scores: session.scores,
      })),
    },
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
    milestoneSummary: {
      total: milestones.length,
      completed: milestones.filter((milestone) => milestone.completed).length,
      remaining: milestones.filter((milestone) => !milestone.completed).length,
    },
    dataQuality: [
      'Speaking scores are user self-ratings or saved AI analysis attached to practice sessions.',
      'Only the 15 most recent sessions are included; ask for a specific period before drawing longer-term conclusions.',
      'No transcript or score is inferred when the saved session does not contain it.',
    ],
  };
};
