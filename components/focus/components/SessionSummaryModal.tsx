import React from 'react';
import { FocusSession } from '../types';
import {
  CheckCircle2,
  Clock,
  Target,
  Award,
  BookOpen,
  Monitor,
  FileText,
  Smartphone,
  AlertTriangle,
  Flame,
  Brain,
  X
} from 'lucide-react';
import { formatTimeHoursMins } from '../services/storage';

interface SessionSummaryModalProps {
  session: FocusSession | null;
  onClose: () => void;
}

export const SessionSummaryModal: React.FC<SessionSummaryModalProps> = ({ session, onClose }) => {
  if (!session) return null;

  const targetMins = Math.round(session.targetSeconds / 60);
  const actualMins = Math.round(session.elapsedSeconds / 60);
  const focusedMins = Math.round(session.focusedSeconds / 60);
  const paperMins = Math.round(session.paperFocusedSeconds / 60);
  const screenMins = Math.round(session.screenFocusedSeconds / 60);
  const thinkingMins = Math.round((session.thinkingSeconds || 0) / 60);
  const phoneMins = Math.round((session.phoneDistractedSeconds || 0) / 60);
  const distractionMins = Math.round(session.distractedSeconds / 60);
  const awayMins = Math.round(session.awaySeconds / 60);
  const breakMins = Math.round(session.breakSeconds / 60);

  const efficiency = Math.min(100, Math.max(0, Math.round((session.focusedSeconds / Math.max(1, session.elapsedSeconds)) * 100)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-white/10"
            aria-label="Close summary modal"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                Session Complete
              </span>
              <h2 className="text-2xl font-bold text-white">
                {session.subject}
              </h2>
            </div>
          </div>
          <p className="text-sm text-slate-300 ml-11">
            {session.topic || 'General Practice'} • <span className="text-amber-400 font-semibold">{session.mode}</span> ({session.studyMedium || 'Screen Study'})
          </p>
          {session.goal && (
            <p className="text-xs text-slate-400 ml-11 mt-1 italic">
              Target Goal: “{session.goal}”
            </p>
          )}
        </div>

        {/* Primary Stats Grid */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-center">
              <span className="text-xs font-bold uppercase text-slate-400 block mb-1">Target</span>
              <span className="text-xl font-bold text-slate-700">{targetMins} min</span>
            </div>
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-center">
              <span className="text-xs font-bold uppercase text-slate-400 block mb-1">Actual</span>
              <span className="text-xl font-bold text-slate-700">{actualMins} min</span>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 text-center">
              <span className="text-xs font-bold uppercase text-indigo-500 block mb-1">Focused</span>
              <span className="text-xl font-bold text-indigo-700">{focusedMins} min</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-center">
              <span className="text-xs font-bold uppercase text-amber-600 block mb-1">Focus Score</span>
              <span className="text-xl font-bold text-amber-600">{Math.round(session.averageFocusScore)}</span>
            </div>
          </div>

          {/* Efficiency Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Session Focus Efficiency
              </span>
              <span className="text-sm font-bold text-slate-800">{efficiency}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${efficiency}%` }}
              />
            </div>
          </div>

          {/* Time Breakdown Cards */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Study Time Breakdown
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2.5 text-slate-700">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>Paper / PYQ Study</span>
                </div>
                <span className="font-bold text-slate-900">{paperMins} min</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2.5 text-slate-700">
                  <Monitor className="w-4 h-4 text-blue-600" />
                  <span>Screen Study</span>
                </div>
                <span className="font-bold text-slate-900">{screenMins} min</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2.5 text-slate-700">
                  <Brain className="w-4 h-4 text-purple-600" />
                  <span>Thinking / Reasoning</span>
                </div>
                <span className="font-bold text-slate-900">{thinkingMins} min</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2.5 text-slate-700">
                  <Clock className="w-4 h-4 text-sky-600" />
                  <span>Planned Breaks</span>
                </div>
                <span className="font-bold text-slate-900">{breakMins} min</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2.5 text-slate-700">
                  <Smartphone className="w-4 h-4 text-rose-500" />
                  <span>Phone Interruptions</span>
                </div>
                <span className="font-bold text-rose-600">{phoneMins} min</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2.5 text-slate-700">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>Distractions / Away</span>
                </div>
                <span className="font-bold text-amber-600">{distractionMins + awayMins} min</span>
              </div>
            </div>
          </div>

          {/* GATE Tracker Synchronized Notification */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
            <Flame className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-emerald-800">
                Saved & Synchronized to GATE 2027 Tracker
              </p>
              <p className="text-emerald-700 leading-relaxed">
                +{focusedMins} minutes added to your daily study target. Streak tracking and student AI memory state updated automatically.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
