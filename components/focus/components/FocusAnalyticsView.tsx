import React, { useState } from 'react';
import { focusSessionRepository } from '../storage/FocusSessionRepository';
import { FocusSession } from '../types';

const formatDuration = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const FocusAnalyticsView: React.FC = () => {
  const [sessions, setSessions] = useState<FocusSession[]>(() =>
    focusSessionRepository.listSessions()
  );

  const handleDelete = (id: string) => {
    if (confirm('Delete this session record?')) {
      focusSessionRepository.deleteSession(id);
      setSessions(focusSessionRepository.listSessions());
    }
  };

  // Cumulative computations
  const totalVerifiedMs = sessions.reduce((acc, s) => acc + (s.verifiedFocusMs || 0), 0);
  const totalSessionMs = sessions.reduce((acc, s) => acc + (s.totalSessionMs || 0), 0);
  const totalPhoneMs = sessions.reduce((acc, s) => acc + (s.deviceUseMs || 0), 0);
  const avgEfficiency = sessions.length > 0
    ? Math.round(sessions.reduce((acc, s) => acc + (s.efficiencyPercentage || 100), 0) / sessions.length)
    : 100;
  const avgFocusScore = sessions.length > 0
    ? Math.round(sessions.reduce((acc, s) => acc + (s.focusScore || 100), 0) / sessions.length)
    : 100;

  return (
    <div className="space-y-6">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="text-xs text-slate-400 uppercase font-semibold">Total Verified Study</div>
          <div className="text-3xl font-black font-mono text-emerald-400 mt-2">
            {formatDuration(totalVerifiedMs)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Across {sessions.length} sessions</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="text-xs text-slate-400 uppercase font-semibold">Study Efficiency</div>
          <div className="text-3xl font-black font-mono text-indigo-400 mt-2">
            {avgEfficiency}%
          </div>
          <div className="text-xs text-slate-500 mt-1">Verified vs Total time</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="text-xs text-slate-400 uppercase font-semibold">Average Focus Score</div>
          <div className="text-3xl font-black font-mono text-amber-400 mt-2">
            {avgFocusScore}
          </div>
          <div className="text-xs text-slate-500 mt-1">Out of 100</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="text-xs text-slate-400 uppercase font-semibold">Phone Distraction</div>
          <div className="text-3xl font-black font-mono text-rose-400 mt-2">
            {formatDuration(totalPhoneMs)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Total device interruption</div>
        </div>
      </div>

      {/* Session History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Focus Session History</h3>
            <p className="text-xs text-slate-400 mt-0.5">Normalized study records with verified timestamps</p>
          </div>
          <span className="text-xs font-mono bg-slate-800 text-slate-300 px-3 py-1 rounded-full">
            {sessions.length} Recorded
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No completed focus sessions recorded yet. Start your first session from Live Focus!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Subject & Topic</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Verified</th>
                  <th className="py-3 px-4">Away</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Efficiency</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-200">{s.subject}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs">{s.topic}</div>
                    </td>
                    <td className="py-3 px-4 capitalize text-indigo-300">
                      {s.studyMode}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                      {formatDuration(s.verifiedFocusMs)}
                    </td>
                    <td className="py-3 px-4 font-mono text-amber-400 whitespace-nowrap">
                      {formatDuration(s.awayMs)}
                    </td>
                    <td className="py-3 px-4 font-mono text-rose-400 whitespace-nowrap">
                      {formatDuration(s.deviceUseMs)}
                    </td>
                    <td className="py-3 px-4 font-semibold">
                      {s.efficiencyPercentage}%
                    </td>
                    <td className="py-3 px-4 font-bold text-amber-400">
                      {s.focusScore}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-slate-500 hover:text-rose-400 transition"
                        title="Delete Session"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
