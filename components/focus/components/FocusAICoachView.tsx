import React, { useState } from 'react';
import { focusSessionRepository } from '../storage/FocusSessionRepository';

export const FocusAICoachView: React.FC = () => {
  const sessions = focusSessionRepository.listSessions();
  const [analyzing, setAnalyzing] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);

  const totalVerifiedMs = sessions.reduce((acc, s) => acc + s.verifiedFocusMs, 0);
  const totalDeviceMs = sessions.reduce((acc, s) => acc + s.deviceUseMs, 0);
  const totalAwayMs = sessions.reduce((acc, s) => acc + s.awayMs, 0);

  const handleGenerateCoaching = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      if (sessions.length === 0) {
        setAdvice('Complete your first verified focus session to receive personalized study habit coaching.');
        return;
      }

      const totalHours = (totalVerifiedMs / 3600000).toFixed(1);
      const phoneMinutes = Math.round(totalDeviceMs / 60000);
      const awayMinutes = Math.round(totalAwayMs / 60000);

      let insight = `You have completed ${totalHours} verified study hours across ${sessions.length} sessions. `;

      if (phoneMinutes > 20) {
        insight += `Your phone was picked up for a total of ${phoneMinutes} minutes across sessions. Try keeping your smartphone physically outside your immediate desk reaching zone to minimize impulsive pickups during deep PYQ blocks. `;
      } else {
        insight += `Great phone discipline! Phone distractions were kept minimal (${phoneMinutes} mins total). `;
      }

      if (awayMinutes > 30) {
        insight += `Desk departure time accumulated to ${awayMinutes} minutes. Plan structured 5-minute Pomodoro breaks between intensive question solving blocks to prevent unintended prolonged absence.`;
      } else {
        insight += `Your desk consistency is solid. Keep up the high execution focus.`;
      }

      setAdvice(insight);
    }, 800);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">AI Focus Coach</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              High-level post-session productivity analysis based on your verified study segments.
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
          <p className="text-xs text-slate-300">
            The AI Coach analyzes patterns across your verified study records, device interruptions, and desk presence to recommend concrete habit optimizations for GATE 2027 prep.
          </p>

          {advice ? (
            <div className="p-4 bg-indigo-950/30 border border-indigo-500/40 rounded-xl text-sm text-indigo-200 leading-relaxed">
              {advice}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">
              Click below to generate an updated analysis of your recent focus sessions.
            </div>
          )}

          <button
            onClick={handleGenerateCoaching}
            disabled={analyzing}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
          >
            {analyzing ? 'Analyzing Focus Metrics...' : 'Generate Habit Analysis'}
          </button>
        </div>
      </div>
    </div>
  );
};
