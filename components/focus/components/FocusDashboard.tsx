import React, { useEffect, useRef, useState } from 'react';
import { focusSessionController, FocusControllerState } from '../controllers/FocusSessionController';
import { cameraManager } from '../perception/CameraManager';
import { MotivationEngine } from '../motivation/MotivationEngine';
import { DiagnosticsHUD } from './DiagnosticsHUD';
import { SimulationControlPanel } from './SimulationControlPanel';
import { SessionSummaryModal } from './SessionSummaryModal';
import { FocusSession, StudyMode } from '../types';

const formatTime = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
};

export const FocusDashboard: React.FC = () => {
  const [controllerState, setControllerState] = useState<FocusControllerState>(() =>
    focusSessionController.getState()
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Setup form fields for starting a session
  const [subject, setSubject] = useState('Operating Systems');
  const [topic, setTopic] = useState('Virtual Memory & Paging PYQs');
  const [studyMode, setStudyMode] = useState<StudyMode>('mixed');
  const [targetMinutes, setTargetMinutes] = useState(50);
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [completedSessionModal, setCompletedSessionModal] = useState<FocusSession | null>(null);

  useEffect(() => {
    const unsubscribe = focusSessionController.subscribe(setControllerState);
    return () => unsubscribe();
  }, []);

  // Wire video element to camera manager
  useEffect(() => {
    if (videoRef.current) {
      cameraManager.attachVideoElement(videoRef.current);
    }
    return () => {
      cameraManager.detachVideoElement();
    };
  }, []);

  const { session, isActive, gate, timer } = controllerState;

  const handleStart = async () => {
    await focusSessionController.startSession(subject, topic, studyMode, targetMinutes);
    if (videoRef.current) {
      cameraManager.attachVideoElement(videoRef.current);
    }
  };

  const handlePause = () => {
    focusSessionController.pauseSession('MANUAL_PAUSE');
  };

  const handleResume = () => {
    focusSessionController.resumeSession();
  };

  const handleStop = () => {
    const summary = focusSessionController.stopSession();
    if (summary) {
      setCompletedSessionModal(summary);
    }
  };

  const contextualMessage = MotivationEngine.getContextualMessage(
    gate.studentPresent,
    gate.deviceInUse,
    gate.manualPause
  );

  return (
    <div className="space-y-6">
      {/* Motivation & Execution Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-amber-500/20 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between shadow-lg gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="text-xs font-mono font-bold tracking-widest text-amber-500 uppercase">
              GATE 2027 EXECUTION PROTOCOL
            </div>
            <div className="text-base sm:text-lg font-bold text-white tracking-wide mt-0.5">
              {contextualMessage}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="text-xs font-mono px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition"
          >
            {showDiagnostics ? 'Hide HUD' : 'Show HUD'}
          </button>
        </div>
      </div>

      {/* Main Focus Control Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera Feed & Real-Time Presence HUD (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center group">
            {/* Live Camera Feed */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />

            {!isActive && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-white">Camera Standby</h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Camera and local MediaPipe detectors initialize when you start a focus session.
                </p>
              </div>
            )}

            {/* Overlaid Live State Badge */}
            {isActive && (
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                <div className={`px-3 py-1.5 rounded-full text-xs font-mono font-bold flex items-center gap-2 backdrop-blur-md shadow-lg ${
                  gate.isOpen
                    ? 'bg-emerald-950/80 border border-emerald-500/60 text-emerald-300'
                    : gate.pauseReason === 'DEVICE_IN_USE'
                    ? 'bg-rose-950/80 border border-rose-500/60 text-rose-300 animate-pulse'
                    : gate.pauseReason === 'STUDENT_AWAY'
                    ? 'bg-amber-950/80 border border-amber-500/60 text-amber-300'
                    : 'bg-slate-900/80 border border-slate-700 text-slate-300'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    gate.isOpen ? 'bg-emerald-400 animate-ping' :
                    gate.pauseReason === 'DEVICE_IN_USE' ? 'bg-rose-400' :
                    gate.pauseReason === 'STUDENT_AWAY' ? 'bg-amber-400' : 'bg-slate-400'
                  }`} />
                  <span>
                    {gate.isOpen
                      ? 'VERIFIED STUDYING'
                      : gate.pauseReason === 'DEVICE_IN_USE'
                      ? 'PHONE IN USE (PAUSED)'
                      : gate.pauseReason === 'STUDENT_AWAY'
                      ? 'STUDENT AWAY (PAUSED)'
                      : 'PAUSED'}
                  </span>
                </div>
              </div>
            )}

            {/* Live FPS watermark */}
            {isActive && (
              <div className="absolute bottom-3 right-3 text-[10px] font-mono text-slate-400/80 bg-black/60 px-2 py-0.5 rounded backdrop-blur-xs">
                {controllerState.fps} FPS • {controllerState.latencyMs}ms
              </div>
            )}
          </div>

          {/* Diagnostics HUD */}
          {showDiagnostics && <DiagnosticsHUD state={controllerState} />}

          {/* Developer Simulation Panel */}
          <SimulationControlPanel />
        </div>

        {/* Right Column: Timer Engine, Session Setup & Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Authoritative Verified Timer Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="text-center space-y-1">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                VERIFIED STUDY TIME
              </span>
              <div className="text-5xl sm:text-6xl font-black font-mono tracking-tight text-white py-2">
                {formatTime(timer.verifiedFocusMs)}
              </div>
              <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
                <span>Total: <strong className="text-slate-200 font-mono">{formatTime(timer.totalSessionMs)}</strong></span>
                <span>•</span>
                <span>Away: <strong className="text-amber-400/90 font-mono">{formatTime(timer.awayMs)}</strong></span>
                <span>•</span>
                <span>Phone: <strong className="text-rose-400/90 font-mono">{formatTime(timer.deviceUseMs)}</strong></span>
              </div>
            </div>

            {/* Progress Bar towards Target */}
            {isActive && session && session.targetDurationMinutes > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Goal: {session.targetDurationMinutes} mins</span>
                  <span className="font-bold text-amber-400">
                    {Math.min(100, Math.round((timer.verifiedFocusMs / (session.targetDurationMinutes * 60000)) * 100))}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (timer.verifiedFocusMs / (session.targetDurationMinutes * 60000)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="pt-2">
              {!isActive ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 uppercase font-semibold mb-1">Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-500/50"
                      placeholder="e.g. Computer Networks"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 uppercase font-semibold mb-1">Target Topic / Chapter</label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-500/50"
                      placeholder="e.g. TCP Congestion Control PYQs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 uppercase font-semibold mb-1">Study Medium</label>
                      <select
                        value={studyMode}
                        onChange={(e) => setStudyMode(e.target.value as StudyMode)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-500/50"
                      >
                        <option value="mixed">Mixed (Screen + Paper)</option>
                        <option value="paper">Paper / Notes Only</option>
                        <option value="screen">Screen Only</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-400 uppercase font-semibold mb-1">Target Duration</label>
                      <select
                        value={targetMinutes}
                        onChange={(e) => setTargetMinutes(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-500/50"
                      >
                        <option value={25}>25 mins (Pomodoro)</option>
                        <option value={50}>50 mins (Standard)</option>
                        <option value={90}>90 mins (GATE Sprint)</option>
                        <option value={180}>180 mins (Full Mock)</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleStart}
                    className="w-full mt-2 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 transition flex items-center justify-center gap-2 text-base"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>START AI FOCUS SESSION</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    {gate.manualPause ? (
                      <button
                        onClick={handleResume}
                        className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        </svg>
                        Resume
                      </button>
                    ) : (
                      <button
                        onClick={handlePause}
                        className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold rounded-xl border border-slate-700 transition flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Manual Pause
                      </button>
                    )}

                    <button
                      onClick={handleStop}
                      className="flex-1 py-3 bg-rose-600/90 hover:bg-rose-500 text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      End & Save
                    </button>
                  </div>

                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>Subject:</span>
                      <span className="font-semibold text-slate-200">{session?.subject}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Topic:</span>
                      <span className="font-semibold text-slate-200">{session?.topic}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mode:</span>
                      <span className="font-semibold text-indigo-400 capitalize">{session?.studyMode}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Modal on End */}
      {completedSessionModal && (
        <SessionSummaryModal
          session={completedSessionModal}
          onClose={() => setCompletedSessionModal(null)}
        />
      )}
    </div>
  );
};
