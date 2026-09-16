import React, { useEffect, useState } from 'react';
import { MilestoneManager, SessionManager, SpeakingProgress } from '../services/SpeakingServiceHub';

interface SpeakingWidgetProps {
  onOpen?: () => void;
}

const getSnapshot = () => {
  const progress = SessionManager.getProgress();
  const todayMinutes = SessionManager.getToday().reduce((sum, session) => sum + session.durationMinutes, 0);
  const milestoneRate = MilestoneManager.getCompletionRate();
  return { progress, todayMinutes, milestoneRate };
};

const getDayNumber = (progress: SpeakingProgress) => {
  const start = new Date(`${progress.dayStarted || new Date().toISOString().split('T')[0]}T00:00:00`);
  return Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86400000));
};

const scoreClass = (score: number) => {
  if (score >= 8) return 'text-emerald-600';
  if (score >= 6) return 'text-amber-600';
  if (score >= 4) return 'text-orange-600';
  return 'text-rose-600';
};

const SpeakingWidget: React.FC<SpeakingWidgetProps> = ({ onOpen }) => {
  const [snapshot, setSnapshot] = useState(() => getSnapshot());

  useEffect(() => {
    const refresh = () => setSnapshot(getSnapshot());
    refresh();
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  const { progress, todayMinutes, milestoneRate } = snapshot;
  const dayNumber = getDayNumber(progress);
  const todayDone = todayMinutes >= 30;
  const averageScore = progress.averageScores?.overall || 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18a4 4 0 004-4V7a4 4 0 10-8 0v7a4 4 0 004 4z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 11v3a7 7 0 0014 0v-3M12 21v-3" />
            </svg>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900">Speaking Coach</h3>
              {todayDone && (
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                  Today Done
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Separate 90-day communication practice track for interviews, explanations, and confidence.
            </p>
          </div>
        </div>
        <span className="text-sm font-bold text-indigo-600">Open</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Day" value={`${dayNumber}/90`} />
        <Metric label="Streak" value={`${progress.currentStreak || 0}d`} />
        <Metric label="Today" value={`${todayMinutes}m`} />
        <Metric label="Milestones" value={`${Math.round(milestoneRate)}%`} />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-400">
          <span>Daily Speaking Target</span>
          <span>{todayMinutes}/30 min</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${todayDone ? 'bg-emerald-500' : 'bg-indigo-500'}`}
            style={{ width: `${Math.min(100, (todayMinutes / 30) * 100)}%` }}
          />
        </div>
      </div>

      {averageScore > 0 ? (
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Average Score</p>
          <p className={`mt-1 text-lg font-black ${scoreClass(averageScore)}`}>{averageScore.toFixed(1)} / 10</p>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm font-medium text-slate-500">
          Start with one 2-minute recording or manually log your first session.
        </p>
      )}
    </button>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg bg-slate-50 p-3">
    <p className="text-lg font-black text-slate-900">{value}</p>
    <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
  </div>
);

export default SpeakingWidget;
