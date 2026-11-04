import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TitleBar } from './focus/components/TitleBar';
import { Dashboard } from './focus/components/Dashboard';
import type { CameraConnectionStatus } from './focus/components/Dashboard';
import { AnalyticsPage } from './focus/components/AnalyticsPage';
import { AICoachPage } from './focus/components/AICoachPage';
import { GoogleCalendarSync } from './focus/components/GoogleCalendarSync';
import { SettingsPage } from './focus/components/SettingsPage';
import { SessionSetupModal } from './focus/components/SessionSetupModal';

import {
  FocusMode,
  FocusSession,
  FocusTimelineEvent,
  SubjectItem,
  UserSettings,
  StudyMedium,
} from './focus/types';
import { DEFAULT_SETTINGS, GATE_SUBJECTS } from './focus/constants';
import { getTodayDateString, StorageService } from './focus/services/storage';

import { focusEngine } from './focus/services/focusEngine';
import { timerEngine, TimerTickData } from './focus/services/timerEngine';
import { visionEngine } from './focus/vision/visionEngine';
import { soundFx } from './focus/services/audio';
import {
  LayoutDashboard,
  BarChart3,
  Brain,
  Calendar,
  Settings,
  Shield,
} from 'lucide-react';

let focusRuntimeBridgeInstalled = false;

/**
 * Keep the webcam-to-FocusEngine bridge alive for the lifetime of the app,
 * not just while the /focus route is mounted. This lets an active session
 * continue counting verified time while the user visits Lecture Tracker.
 */
const ensureFocusRuntimeBridge = () => {
  if (focusRuntimeBridgeInstalled) return;
  focusRuntimeBridgeInstalled = true;

  visionEngine.subscribe((data) => focusEngine.updateVision(data));
  focusEngine.subscribe((output) => {
    if (output.state === 'COMPLETED') visionEngine.stop();
  });

  window.addEventListener('beforeunload', () => {
    timerEngine.stopSession();
    visionEngine.stop();
  });
};



const initialTickData: TimerTickData = {
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
  efficiency: 0,
  currentScore: 0,
  averageScore: 0,
  peakScore: 0,
  distractionCount: 0,
  targetSeconds: 7200,
  activeSubject: 'Algorithms',
  activeTopic: 'General Study',
  activeGoal: 'Study session',
  activeMode: 'Deep Focus',
  activeMedium: 'Screen Study',
  isCompleted: false,
};

export default function FocusTracker() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'coach' | 'calendar' | 'settings'>('dashboard');
  const [showSetupModal, setShowSetupModal] = useState(false);

  const [settings, setSettings] = useState<UserSettings>(() => StorageService.getSettings());
  const [subjects, setSubjects] = useState<SubjectItem[]>(() => StorageService.getSubjects());
  const [sessions, setSessions] = useState<FocusSession[]>(() => StorageService.getSessions());
  const [timelineEvents, setTimelineEvents] = useState<FocusTimelineEvent[]>(() => StorageService.getTimelineEvents());

  const [tickData, setTickData] = useState<TimerTickData>(initialTickData);
  const [cameraStatus, setCameraStatus] = useState<CameraConnectionStatus>(() =>
    timerEngine.hasActiveSession()
      ? (visionEngine.isActive() ? 'AVAILABLE' : 'UNAVAILABLE')
      : 'OFF'
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraRetryInProgressRef = useRef(false);
  const sessionStartGenerationRef = useRef(0);

  const todaySummary = useMemo(
    () => StorageService.getTodaySummary(sessions, settings.dailyTargetHours * 3600),
    [sessions, settings.dailyTargetHours]
  );

  // The persistent verified-time ledger is the single source of truth for
  // the dashboard total. It is updated by TimerEngine while the webcam
  // confirms presence, and remains available after STOP saves the session.
  const todayVerifiedSeconds = useMemo(
    () => StorageService.getVerifiedStudySecondsForDate(getTodayDateString()),
    [tickData.focusedSeconds, sessions]
  );

  const todaySessions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return sessions.filter((session) => new Date(session.startTime).toISOString().slice(0, 10) === today);
  }, [sessions]);

  useEffect(() => {
    // The runtime vision bridge is app-scoped so AI Focus keeps counting while
    // the user navigates to Lecture Tracker or another route.
    ensureFocusRuntimeBridge();

    const unsubFailure = visionEngine.subscribeFailure((reason) => {
      setCameraStatus('UNAVAILABLE');
      setCameraError(reason);
    });

    const unsubTimer = timerEngine.subscribe((tick) => {
      setTickData(tick);
    });

    return () => {
      sessionStartGenerationRef.current += 1;
      unsubFailure();
      unsubTimer();
      // Route navigation must not stop an active verified study session.
      // The app-scoped camera bridge and singleton timer continue until the
      // user presses STOP, the target completes, or the page is unloaded.
    };
  }, []);

  // A completed countdown is saved by TimerEngine. Release the webcam after
  // completion and refresh the stored session list for the daily summary.
  useEffect(() => {
    if (tickData.state !== 'COMPLETED') return;
    visionEngine.stop();
    setCameraStatus('OFF');
    setCameraError(null);
    setSessions(StorageService.getSessions());
    setTimelineEvents(StorageService.getTimelineEvents());
  }, [tickData.state]);

  const handleStartSession = async (
    subject: string,
    topic: string,
    targetSeconds: number,
    mode: FocusMode,
    goal: string,
    medium?: StudyMedium
  ) => {
    // Unlock browser audio from the user's Start Session interaction so the
    // completion melody can play later when the target is reached.
    soundFx.unlock();
    const startGeneration = ++sessionStartGenerationRef.current;
    setActiveTab('dashboard');
    setCameraStatus('CONNECTING');
    setCameraError(null);

    // Start the session clock in a paused/verification state first. It cannot
    // accrue study time until real webcam frames confirm a person is present.
    timerEngine.startSession(subject, topic, targetSeconds, mode, goal, medium);

    const result = await visionEngine.start(
      settings.selectedCameraId || undefined,
      settings.frameRateFps || 4
    );

    if (startGeneration !== sessionStartGenerationRef.current) return;

    if (result.success) {
      setCameraStatus('AVAILABLE');
      setCameraError(null);
      window.dispatchEvent(new Event('ai-focus-camera-started'));
    } else {
      setCameraStatus('UNAVAILABLE');
      setCameraError(result.error || 'Camera unavailable. The timer is paused.');
    }
  };

  const handleRetryCamera = async () => {
    if (cameraRetryInProgressRef.current || tickData.state === 'IDLE' || tickData.state === 'COMPLETED') return;
    cameraRetryInProgressRef.current = true;
    const retryGeneration = sessionStartGenerationRef.current;
    setCameraStatus('CONNECTING');
    setCameraError(null);

    try {
      const result = await visionEngine.start(
        settings.selectedCameraId || undefined,
        settings.frameRateFps || 4
      );
      if (retryGeneration !== sessionStartGenerationRef.current) return;
      if (result.success) {
        setCameraStatus('AVAILABLE');
        setCameraError(null);
        window.dispatchEvent(new Event('ai-focus-camera-started'));
      } else {
        setCameraStatus('UNAVAILABLE');
        setCameraError(result.error || 'Camera unavailable. The timer remains paused.');
      }
    } finally {
      cameraRetryInProgressRef.current = false;
    }
  };

  const handlePauseSession = () => timerEngine.pauseSession();

  const handleResumeSession = () => timerEngine.resumeSession();

  const handleStartBreak = () => timerEngine.startBreak();

  const handleEndBreak = () => timerEngine.endBreak();

  const handleStudyMediumChange = (medium: StudyMedium) => timerEngine.setStudyMedium(medium);

  const handleStopSession = () => {
    sessionStartGenerationRef.current += 1;
    timerEngine.stopSession();
    visionEngine.stop();
    setCameraStatus('OFF');
    setCameraError(null);
    setSessions(StorageService.getSessions());
    setTimelineEvents(StorageService.getTimelineEvents());
  };

  const handleAddSubject = (name: string, category: string): SubjectItem => {
    const newSubject: SubjectItem = {
      id: `sub_${Date.now()}`,
      name,
      category,
      isGateSubject: false,
    };
    StorageService.saveSubject(newSubject);
    setSubjects(StorageService.getSubjects());
    return newSubject;
  };

  const handleUpdateSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    StorageService.saveSettings(newSettings);
  };

  const handleResetAllData = () => {
    sessionStartGenerationRef.current += 1;
    if (tickData.state !== 'IDLE' && tickData.state !== 'COMPLETED') {
      timerEngine.stopSession();
    }
    visionEngine.stop();
    StorageService.clearAll();
    setSessions([]);
    setTimelineEvents([]);
    setSubjects(GATE_SUBJECTS);
    setSettings(DEFAULT_SETTINGS);
    setCameraStatus('OFF');
    setCameraError(null);
    setTickData(initialTickData);
  };

  const handleRefreshData = () => {
    setSessions(StorageService.getSessions());
    setTimelineEvents(StorageService.getTimelineEvents());
  };

  return (
    <div
      ref={containerRef}
      className="flex min-h-[850px] w-full select-none flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 font-sans text-zinc-100 shadow-2xl"
    >
      <TitleBar
        focusState={tickData.state}
        activeSubject={tickData.activeSubject}
        activeTopic={tickData.activeTopic}
        onOpenTray={() => setActiveTab('settings')}
        onMinimize={() => setActiveTab('dashboard')}
        onMaximize={() => {
          if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen?.().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }}
        onClose={() => setActiveTab('dashboard')}
      />

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-16 shrink-0 flex-col justify-between border-r border-zinc-800/80 bg-zinc-950/90 p-2 lg:w-56 lg:p-3">
          <div className="space-y-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'analytics', label: 'Analytics & Logs', icon: BarChart3 },
              { id: 'coach', label: 'AI Coach', icon: Brain },
              { id: 'calendar', label: 'Calendar Sync', icon: Calendar },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id as typeof activeTab)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden lg:inline">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden space-y-1 rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-3 text-[11px] text-zinc-400 lg:block">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
              <Shield className="h-3.5 w-3.5" />
              Presence detection
            </div>
            <p className="text-[10px] leading-relaxed text-zinc-500">
              Person present = timer runs. Person absent = timer pauses.
            </p>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950">
          {activeTab === 'dashboard' && (
            <Dashboard
              tickData={tickData}
              todayTargetHours={settings.dailyTargetHours}
              todayVerifiedSeconds={todayVerifiedSeconds}
              cameraStatus={cameraStatus}
              cameraError={cameraError}
              onOpenSetup={() => setShowSetupModal(true)}
              onStop={handleStopSession}
              onRetryCamera={handleRetryCamera}
              onPause={handlePauseSession}
              onResume={handleResumeSession}
              onStartBreak={handleStartBreak}
              onEndBreak={handleEndBreak}
              onChangeStudyMedium={handleStudyMediumChange}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsPage
              sessions={sessions}
              todaySummary={todaySummary}
              timelineEvents={timelineEvents}
              onRefresh={handleRefreshData}
            />
          )}

          {activeTab === 'coach' && (
            <AICoachPage
              todaySummary={todaySummary}
              recentSessions={sessions}
              examTarget="GATE 2027 CSE"
            />
          )}

          {activeTab === 'calendar' && (
            <GoogleCalendarSync
              todaySessions={todaySessions}
              onRefresh={handleRefreshData}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsPage
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onResetAllData={handleResetAllData}
            />
          )}
        </main>
      </div>

      <SessionSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        subjects={subjects}
        onAddSubject={handleAddSubject}
        onStartSession={handleStartSession}
      />
    </div>
  );
}
