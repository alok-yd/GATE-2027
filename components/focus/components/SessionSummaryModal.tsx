import React from 'react';
import { FocusSession } from '../types';

interface Props {
  session: FocusSession;
  onClose: () => void;
}

const formatDuration = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

export const SessionSummaryModal: React.FC<Props> = ({ session, onClose }) => {
  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-r from-amber-500/20 via-indigo-500/20 to-emerald-500/20 p-6 border-b border-slate-800 text-center">
          <div className="inline-flex p-3 bg-amber-500/20 border border-amber-500/40 rounded-full mb-3 text-amber-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">FOCUS SESSION COMPLETE</h2>
          <p className="text-sm text-slate-400 mt-1">{session.subject} • {session.topic}</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-center">
              <div className="text-xs text-slate-400 uppercase font-semibold">Verified Study Time</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
                {formatDuration(session.verifiedFocusMs)}
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 text-center">
              <div className="text-xs text-slate-400 uppercase font-semibold">Total Session Time</div>
              <div className="text-2xl font-bold text-slate-200 mt-1 font-mono">
                {formatDuration(session.totalSessionMs)}
              </div>
            </div>
          </div>

          {/* Detailed Breakdown */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Time Away from Desk:
              </span>
              <span className="font-mono text-slate-200">{formatDuration(session.awayMs)}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                Device / Phone Interruption:
              </span>
              <span className="font-mono text-slate-200">{formatDuration(session.deviceUseMs)}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                Manual Pause:
              </span>
              <span className="font-mono text-slate-200">{formatDuration(session.manualPauseMs)}</span>
            </div>
            <div className="flex justify-between text-slate-300 border-t border-slate-800/80 pt-2 font-semibold">
              <span>Study Efficiency:</span>
              <span className="text-emerald-400">{session.efficiencyPercentage}%</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Session Focus Score:</span>
              <span className="text-amber-400 font-bold">{session.focusScore} / 100</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-amber-500 text-slate-950 font-bold rounded-xl hover:bg-amber-400 transition"
          >
            Acknowledge & Continue
          </button>
        </div>
      </div>
    </div>
  );
};
