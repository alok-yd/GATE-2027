import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dashboard } from './focus/components/Dashboard';
import { AnalyticsPage } from './focus/components/AnalyticsPage';
import { AICoachPage } from './focus/components/AICoachPage';
import { GoogleCalendarSync } from './focus/components/GoogleCalendarSync';
import { SettingsPage } from './focus/components/SettingsPage';
import { SessionSetupModal } from './focus/components/SessionSetupModal';
import { BreakModal } from './focus/components/BreakModal';
import { CalibrationModal } from './focus/components/CalibrationModal';
import { EvaluationModal } from './focus/components/EvaluationModal';
import { CameraFailureModal } from './focus/components/CameraFailureModal';
import { SessionSummaryModal } from './focus/components/SessionSummaryModal';

import {
  FocusMode,
  FocusSession,
  FocusTimelineEvent,
  SubjectItem,
  UserSettings,
  DailySummary,
  StudyMedium
} from './focus/types';
import { StorageService } from './focus/services/storage';
import { focusEngine, FocusEngineOutput } from './focus/services/focusEngine';
import { TimerEngine, TimerTickData } from './focus/services/timerEngine';
import { activityMonitor } from './focus/services/activityMonitor';
import { visionEngine } from './focus/vision/visionEngine';
import {
  Sparkles,
  BarChart3,
  Brain,
  Calendar,
  Settings,
  Shield,
  Compass,
  Play,
  Flame,
  CheckCircle2,
  Video,
  Monitor
} from 'lucide-react';

export const FocusTracker: React.FC = () => {
  // Initialize timer engine instance once
  const timerEngineRef = useRef<TimerEngine | null>(null);
  if (!timerEngineRef.current) {
    timerEngineRef.current = new TimerEngine(focusEngine);
  }
  const timerEngine = timerEngineRef.current;

  // Active Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'coach' | 'calendar' | 'settings'>('dashboard');

  // Modals
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [showCameraFailureModal, setShowCameraFailureModal] = useState(false);
  const [cameraFailureReason, setCameraFailureReason] = useState<string>('');
  const [completedSession, setCompletedSession] = useState<FocusSession | null>(null);

  // Application Persistent State
  const [settings, setSettings] = useState<UserSettings>(() => StorageService.getSettings());
  const [subjects, setSubjects] = useState<SubjectItem[]>(() => StorageService.getSubjects());
  const [sessions, setSessions] = useState<FocusSession[]>(() => StorageService.getSessions());
  const [timelineEvents, setTimelineEvents] = useState<FocusTimelineEvent[]>(() => StorageService.getTimelineEvents());

  // Real-Time Focus Engine Output
  const [engineOutput, setEngineOutput] = useState<FocusEngineOutput>(() => focusEngine.getCurrentOutput());

  // Real-Time Timer Tick State
  const [tickData, setTickData] = useState<TimerTickData>({
    state: 'IDLE',
    elapsedSeconds: 0,
    focusedSeconds: 0,
    screenFocusedSeconds: 0,
    paperFocusedSeconds: 0,
    mixedFocusedSeconds: 0,
    thinkingSeconds: 0,
    uncertainSeconds: 0,
    unverifiedSeconds: 0,
    pausedSeconds: 0,
    remainingTargetSeconds: 7200,
    distractedSeconds: 0,
    phoneSeconds: 0,
    conversationSeconds: 0,
    sleepSeconds: 0,
    awaySeconds: 0,
    breakSeconds: 0,
    efficiency: 100,
    currentScore: 85,
    averageScore: 85,
    peakScore: 0,
    distractionCount: 0,
    targetSeconds: 7200,
    activeSubject: 'Algorithms',
    activeTopic: 'Dynamic Programming',
    activeGoal: 'Solve 30 PYQs with no distractions',
    activeMode: 'Deep Focus',
    activeMedium: 'Screen Study',
    isCompleted: false,
    isVerifiedFocus: false,
    verificationReason: 'Session not started'
  });

  // Calculate Today's Summary
  const todaySummary: DailySummary = useMemo(() => {
    return StorageService.getTodaySummary(sessions, settings.dailyTargetHours * 3600);
  }, [sessions, settings.dailyTargetHours]);

  // Today's sessions subset
  const todaySessions = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return sessions.filter(s => new Date(s.startTime).toISOString().slice(0, 10) === todayStr);
  }, [sessions]);

  // Initialize Activity Monitor, Vision Listeners on Mount
  useEffect(() => {
    activityMonitor.start();

    const unsubActivity = activityMonitor.subscribe((data) => {
      focusEngine.updateActivity(data);
    });

    const unsubVision = visionEngine.subscribe((data) => {
      focusEngine.updateVision(data);
    });

    const unsubFailure = visionEngine.subscribeFailure((reason) => {
      setCameraFailureReason(reason);
      setShowCameraFailureModal(true);
    });

    const unsubFocus = focusEngine.subscribe((out) => {
      setEngineOutput(out);
    });

    const unsubTimer = timerEngine.subscribe((tick) => {
      setTickData(tick);
      if (tick.isCompleted && !completedSession) {
        const finished = timerEngine.stopSession();
        if (finished) {
          setCompletedSession(finished);
          setSessions(StorageService.getSessions());
          setTimelineEvents(StorageService.getTimelineEvents());
        }
      }
    });

    return () => {
      activityMonitor.stop();
      unsubActivity();
      unsubVision();
      unsubFailure();
      unsubFocus();
      unsubTimer();
    };
  }, [completedSession, timerEngine]);

  // Session Handlers
  const handleStartSession = (
    subject: string,
    topic: string,
    targetSeconds: number,
    mode: FocusMode,
    goal: string,
    medium: StudyMedium
  ) => {
    timerEngine.startSession(subject, topic, targetSeconds, mode, goal, medium);
    if (settings.autoStartCameraOnSession && !visionEngine.isActive()) {
      visionEngine.start(settings.selectedCameraId).catch(() => {});
    }
    setActiveTab('dashboard');
  };

  const handlePauseSession = () => {
    timerEngine.pauseSession();
  };

  const handleResumeSession = () => {
    timerEngine.resumeSession();
  };

  const handleStopSession = () => {
    const completed = timerEngine.stopSession();
    if (completed) {
      setCompletedSession(completed);
      setSessions(StorageService.getSessions());
      setTimelineEvents(StorageService.getTimelineEvents());
    }
  };

  const handleStartBreak = () => {
    timerEngine.startBreak(5);
    setShowBreakModal(true);
  };

  const handleEndBreak = () => {
    setShowBreakModal(false);
    timerEngine.endBreak();
  };

  const handleResetTimer = () => {
    if (confirm('Reset the current timer session?')) {
      timerEngine.stopSession();
      setTickData(prev => ({ ...prev, state: 'IDLE', elapsedSeconds: 0, focusedSeconds: 0 }));
    }
  };

  const handleAddSubject = (name: string, category: string): SubjectItem => {
    const newSub = StorageService.addSubject(name, category);
    setSubjects(StorageService.getSubjects());
    return newSub;
  };

  const handleUpdateSettings = (newSettings: UserSettings) => {
    StorageService.saveSettings(newSettings);
    setSettings(newSettings);
    focusEngine.updateSettings(newSettings.focusSettings);
  };

  const handleResetAllData = () => {
    if (confirm('Are you sure you want to reset all Focus Timer history? Your main GATE academic progress remains safe.')) {
      StorageService.clearAll();
      setSessions([]);
      setTimelineEvents([]);
    }
  };

  const handleSelectMedium = (medium: StudyMedium) => {
    timerEngine.setStudyMedium(medium);
  };

  const isSessionActive = tickData.state !== 'IDLE' && tickData.state !== 'COMPLETED';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest bg-amber-400/10 text-amber-400 border border-amber-400/20">
                AI Focus Mode • AIR 1 Sprint
              </span>
              {visionEngine.isSimulating() && (
                <span className="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide bg-amber-500/20 text-amber-300">
                  Simulation Mode Active
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              AI Study Focus & Workstation Monitor
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Multi-signal computer vision for screen reading, handwritten PYQs, thinking pauses, and distraction prevention.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowCalibrationModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-xs font-semibold text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
            >
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
              <span>Calibrate Camera</span>
            </button>

            <button
              onClick={() => setShowEvaluationModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-xs font-semibold text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
            >
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Benchmark Suite</span>
            </button>

            {!isSessionActive && (
              <button
                onClick={() => setShowSetupModal(true)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-bold transition flex items-center gap-1.5 shadow-md"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Focus Sprint</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Status Strip */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isSessionActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="font-semibold text-slate-200">
                {isSessionActive ? `${tickData.state.replace('_', ' ')} (${tickData.activeSubject})` : 'Ready to study'}
              </span>
            </span>
            <span>•</span>
            <span>Mode: <strong className="text-slate-200">{tickData.activeMedium}</strong></span>
            <span>•</span>
            <span>Focus Score: <strong className="text-amber-400">{Math.round(tickData.currentScore)}/100</strong></span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-400">Today Verified Focus:</span>
            <span className="font-bold text-emerald-400">
              {Math.round(todaySummary.focusedSeconds / 60)} min
            </span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-400 font-medium">
              {settings.dailyTargetHours}h Goal
            </span>
          </div>
        </div>
      </div>

      {/* Focus Sub-navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white rounded-xl px-4 py-2 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto py-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'dashboard'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Video className="w-4 h-4 text-indigo-400" />
            <span>Live Studio</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'analytics'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-emerald-500" />
            <span>Focus Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('coach')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'coach'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Brain className="w-4 h-4 text-purple-500" />
            <span>AI Coach</span>
          </button>

          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'calendar'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-4 h-4 text-blue-500" />
            <span>Google Calendar</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-4 h-4 text-slate-500" />
            <span>Settings</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
          <Flame className="w-4 h-4 text-amber-500" />
          <span className="font-semibold text-slate-700">{todaySessions.length} sessions today</span>
        </div>
      </div>

      {/* Main Tab Content */}
      <div>
        {activeTab === 'dashboard' && (
          <Dashboard
            tickData={tickData}
            engineOutput={engineOutput}
            todayTargetHours={settings.dailyTargetHours}
            todayVerifiedSeconds={todaySummary.focusedSeconds}
            todayDistractionSeconds={todaySummary.distractedSeconds}
            todaySessionCount={todaySummary.sessionCount}
            todayLongestSession={todaySummary.longestSessionSeconds}
            onOpenSetup={() => setShowSetupModal(true)}
            onPause={handlePauseSession}
            onResume={handleResumeSession}
            onStop={handleStopSession}
            onStartBreak={handleStartBreak}
            onResetTimer={handleResetTimer}
            onSelectMedium={handleSelectMedium}
            onOpenCalibration={() => setShowCalibrationModal(true)}
            onOpenEvaluation={() => setShowEvaluationModal(true)}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsPage
            sessions={sessions}
            todaySummary={todaySummary}
            timelineEvents={timelineEvents}
            onRefresh={() => {
              setSessions(StorageService.getSessions());
              setTimelineEvents(StorageService.getTimelineEvents());
            }}
          />
        )}

        {activeTab === 'coach' && (
          <AICoachPage
            todaySummary={todaySummary}
            recentSessions={sessions}
            examTarget={settings.examName || 'GATE 2027 CSE'}
          />
        )}

        {activeTab === 'calendar' && (
          <GoogleCalendarSync
            todaySessions={todaySessions}
            onRefresh={() => {
              setSessions(StorageService.getSessions());
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onResetAllData={handleResetAllData}
            onOpenCalibration={() => setShowCalibrationModal(true)}
            onOpenEvaluation={() => setShowEvaluationModal(true)}
          />
        )}
      </div>

      {/* Modals */}
      <SessionSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        subjects={subjects}
        onAddSubject={handleAddSubject}
        onStartSession={handleStartSession}
      />

      <BreakModal
        isOpen={showBreakModal}
        onClose={handleEndBreak}
      />

      <CalibrationModal
        isOpen={showCalibrationModal}
        onClose={() => setShowCalibrationModal(false)}
        onComplete={() => {
          setShowCalibrationModal(false);
          setSettings(StorageService.getSettings());
        }}
      />

      <EvaluationModal
        isOpen={showEvaluationModal}
        onClose={() => setShowEvaluationModal(false)}
      />

      <CameraFailureModal
        isOpen={showCameraFailureModal}
        errorReason={cameraFailureReason}
        onClose={() => setShowCameraFailureModal(false)}
        onRetry={async () => {
          setShowCameraFailureModal(false);
          await visionEngine.start(settings.selectedCameraId);
        }}
        onSwitchToSimulated={() => {
          setShowCameraFailureModal(false);
          visionEngine.startSimulation();
        }}
      />

      <SessionSummaryModal
        session={completedSession}
        onClose={() => setCompletedSession(null)}
      />
    </div>
  );
};

export default FocusTracker;
