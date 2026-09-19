import React, { useRef, useEffect, useState } from 'react';
import { FocusEngineOutput } from '../services/focusEngine';
import { TimerTickData } from '../services/timerEngine';
import { StudyMedium, VisionData } from '../types';
import { visionEngine } from '../vision/visionEngine';
import { AIDiagnosticsHUD } from './AIDiagnosticsHUD';
import { ExecutionCoachBanner } from './ExecutionCoachBanner';
import { focusSessionController } from '../services/FocusSessionController';
import { StorageService } from '../services/storage';
import { UserSettings } from '../types';
import {
  Play,
  Pause,
  Square,
  Coffee,
  Camera,
  CameraOff,
  Clock,
  Flame,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Layers,
  Sparkles,
  RefreshCw,
  Eye,
  Activity,
  UserCheck,
  Shield,
  BookOpen,
  Monitor,
  FileText,
  Terminal,
  Compass,
  Award,
  Sun
} from 'lucide-react';
import { formatDigitalClock, formatTimeHoursMins } from '../services/storage';

interface DashboardProps {
  tickData: TimerTickData;
  engineOutput: FocusEngineOutput;
  todayTargetHours: number;
  todayVerifiedSeconds: number;
  todayDistractionSeconds: number;
  todaySessionCount: number;
  todayLongestSession: number;
  onOpenSetup: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onStartBreak: () => void;
  onResetTimer: () => void;
  onSelectMedium?: (medium: StudyMedium) => void;
  onOpenCalibration?: () => void;
  onOpenEvaluation?: () => void;
  settings?: UserSettings;
}

export const Dashboard: React.FC<DashboardProps> = ({
  tickData,
  engineOutput,
  todayTargetHours,
  todayVerifiedSeconds,
  todayDistractionSeconds,
  todaySessionCount,
  todayLongestSession,
  onOpenSetup,
  onPause,
  onResume,
  onStop,
  onStartBreak,
  onResetTimer,
  onSelectMedium,
  onOpenCalibration,
  onOpenEvaluation,
  settings
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => settings || StorageService.getSettings());

  useEffect(() => {
    if (settings) {
      setUserSettings(settings);
    }
  }, [settings]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [visionLive, setVisionLive] = useState<VisionData | null>(null);
  const [pipelineHealth, setPipelineHealth] = useState(() => visionEngine.getPipelineHealth());
  const [showTooltip, setShowTooltip] = useState(false);
  const [showSignalBreakdown, setShowSignalBreakdown] = useState(false);
  const [showDiagnosticHUD, setShowDiagnosticHUD] = useState(false);
  const [sessionCtrlState, setSessionCtrlState] = useState(() => focusSessionController.getState());

  useEffect(() => {
    return focusSessionController.subscribe(setSessionCtrlState);
  }, []);

  useEffect(() => {
    return visionEngine.subscribePipelineHealth(setPipelineHealth);
  }, []);

  const videoCallbackRef = (node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoElement(node);
    if (node && isCameraActive) {
      visionEngine.attachPreview(node);
    }
  };

  useEffect(() => {
    if (videoElement && isCameraActive) {
      visionEngine.attachPreview(videoElement);
    }
  }, [videoElement, isCameraActive]);

  // Target calculations
  const totalTargetSec = todayTargetHours * 3600;
  const progressPercent = Math.min(100, Math.round((todayVerifiedSeconds / totalTargetSec) * 100));
  const remainingSeconds = Math.max(0, totalTargetSec - todayVerifiedSeconds);

  const isSessionActive = tickData.state !== 'IDLE' && tickData.state !== 'COMPLETED';
  const activeMedium = tickData.activeMedium || 'Screen Study';

  // Toggle Camera
  const handleToggleCamera = async () => {
    if (isCameraActive) {
      if (videoRef.current) visionEngine.detachPreview(videoRef.current);
      visionEngine.stop();
      setIsCameraActive(false);
    } else {
      setCameraError(null);
      const res = await visionEngine.start(userSettings.selectedCameraId);
      if (res.success) {
        setIsCameraActive(true);
        if (videoRef.current) {
          visionEngine.attachPreview(videoRef.current);
        }
      } else {
        setCameraError(res.error || 'Could not start camera');
      }
    }
  };

  useEffect(() => {
    let unmounted = false;

    // Check permissions and initialize camera or fallback safely
    const initCamera = async () => {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const perm = await navigator.permissions.query({ name: 'camera' as PermissionName }).catch(() => null);
          if (perm && perm.state === 'denied') {
            visionEngine.startSimulation();
            if (!unmounted) {
              setCameraError('Webcam permission not granted in browser');
              setIsCameraActive(false);
            }
            return;
          }
        }
      } catch {}

      const res = await visionEngine.start();
      if (!unmounted) {
        if (res.success) {
          setIsCameraActive(true);
          setCameraError(null);
          if (videoRef.current) {
            visionEngine.attachPreview(videoRef.current);
          }
        } else {
          setIsCameraActive(false);
          setCameraError(res.error || 'Camera permission required');
        }
      }
    };

    initCamera();

    const unsub = visionEngine.subscribe((v) => {
      setVisionLive(v);
    });

    return () => {
      unmounted = true;
      unsub();
    };
  }, []);

  // Visual state styling with Section 42 Authoritative Statuses
  const getStateVisuals = () => {
    if (tickData.state === 'IDLE') {
      return {
        title: 'READY',
        subtitle: 'Set your subject and start verified focus session',
        tooltip: 'Click Start Session to begin.',
        color: 'text-zinc-400',
        bg: 'bg-zinc-900 border-zinc-800',
        dot: 'bg-zinc-500'
      };
    }

    if (tickData.state === 'BREAK') {
      return {
        title: 'BREAK',
        subtitle: 'Intentional cognitive rest in progress',
        tooltip: 'Take a restorative break to reset mental clarity.',
        color: 'text-sky-400',
        bg: 'bg-sky-500/10 border-sky-500/30',
        dot: 'bg-sky-400'
      };
    }

    const gate = sessionCtrlState.gate || engineOutput.timerGate;
    const highLevel = gate?.highLevelState || (tickData.isVerifiedFocus ? 'ACTIVE' : 'AWAY');
    const deviceStatus = sessionCtrlState.deviceStatus || engineOutput.deviceStatus;

    switch (highLevel) {
      case 'ACTIVE':
        if (deviceStatus === 'DEVICE_PRESENT') {
          return {
            title: '● DEVICE PRESENT — VERIFIED TIMER RUNNING',
            subtitle: 'Device is resting on desk (inactive) — Verified study active',
            tooltip: 'Smartphone detected on desk without hand interaction. Verified study timer continues running.',
            color: 'text-teal-400',
            bg: 'bg-teal-500/15 border-teal-500/40',
            dot: 'bg-teal-400 animate-pulse'
          };
        }
        return {
          title: '● STUDENT PRESENT ● DEVICE NOT IN USE — VERIFIED FOCUS TIMER RUNNING',
          subtitle: tickData.stateExplanation || `Verified focus timer active (${activeMedium})`,
          tooltip: 'Student is present at workstation with no device in use. Verified timer running.',
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/15 border-emerald-500/40',
          dot: 'bg-emerald-400 animate-pulse'
        };

      case 'AWAY':
        return {
          title: '● STUDENT AWAY — VERIFIED TIMER PAUSED',
          subtitle: 'No student detected at workstation — verified focus paused',
          tooltip: 'Workstation empty. The timer will automatically resume as soon as you return.',
          color: 'text-amber-400',
          bg: 'bg-amber-500/15 border-amber-500/40',
          dot: 'bg-amber-400'
        };

      case 'DEVICE_IN_USE':
        return {
          title: '● DEVICE IN USE — VERIFIED TIMER PAUSED',
          subtitle: tickData.verificationReason || 'Smartphone actively in hand or near face — verified focus paused',
          tooltip: 'Active smartphone interaction detected. Put the device away to automatically resume.',
          color: 'text-rose-400',
          bg: 'bg-rose-500/15 border-rose-500/40',
          dot: 'bg-rose-400'
        };

      case 'MONITORING_ERROR':
        return {
          title: '● MONITORING ERROR — VERIFIED TIMER PAUSED',
          subtitle: 'AI vision or camera feed unavailable — countdown paused safely',
          tooltip: 'Camera stream disconnected or AI perception stalled. Reconnect camera to resume.',
          color: 'text-zinc-400',
          bg: 'bg-zinc-800/60 border-zinc-700/60',
          dot: 'bg-zinc-400'
        };

      case 'MANUAL_PAUSE':
        return {
          title: '● MANUAL PAUSE — VERIFIED TIMER PAUSED',
          subtitle: 'Session paused manually by student',
          tooltip: 'Click Resume Session when you are ready to study.',
          color: 'text-rose-400',
          bg: 'bg-rose-500/10 border-rose-500/30',
          dot: 'bg-rose-400'
        };

      default:
        return {
          title: '● STUDENT PRESENT ● DEVICE NOT IN USE — VERIFIED FOCUS TIMER RUNNING',
          subtitle: tickData.stateExplanation || 'Verified study active',
          tooltip: 'Verified study active.',
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10 border-emerald-500/30',
          dot: 'bg-emerald-400 animate-pulse'
        };
    }
  };

  const currentVisual = getStateVisuals();
  const telemetry = engineOutput.telemetry;

  return (
    <div className="flex-1 p-4 lg:p-6 overflow-y-auto space-y-6 max-w-7xl mx-auto w-full">
      {/* Top Banner: Today's Verified Progress Ring & Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Today's Target */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Today's Target</span>
            <span className="font-mono text-zinc-300 font-semibold">{todayTargetHours} Hours</span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold tracking-tight text-zinc-100">
              {formatTimeHoursMins(todayVerifiedSeconds)}
            </div>
            <div className="text-xs text-zinc-400 flex items-center justify-between mt-1">
              <span>Remaining: <strong className="text-zinc-200 font-mono">{formatTimeHoursMins(remainingSeconds)}</strong></span>
              <span className="text-emerald-400 font-semibold">{progressPercent}%</span>
            </div>
          </div>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-emerald-400 to-teal-400 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Card 2: Focus Efficiency */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Focus Efficiency</span>
            <Flame className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold tracking-tight text-emerald-400">
              {tickData.efficiency}%
            </div>
            <div className="text-xs text-zinc-400 mt-1">
              Verified study vs. total elapsed time
            </div>
          </div>
          <div className="text-[11px] text-zinc-500">
            Distraction: <span className="text-zinc-300 font-mono">{formatTimeHoursMins(todayDistractionSeconds)}</span>
          </div>
        </div>

        {/* Card 3: Sessions Count */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span>Sessions Today</span>
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-bold tracking-tight text-zinc-100">
              {todaySessionCount} <span className="text-xs font-normal text-zinc-500">sprints</span>
            </div>
            <div className="text-xs text-zinc-400 mt-1">
              Longest: <strong className="text-zinc-200 font-mono">{formatTimeHoursMins(todayLongestSession)}</strong>
            </div>
          </div>
          <div className="text-[11px] text-zinc-500">
            Avg: <span className="text-zinc-300 font-mono">{todaySessionCount > 0 ? formatTimeHoursMins(Math.round(todayVerifiedSeconds / todaySessionCount)) : '0m'}</span>
          </div>
        </div>

        {/* Card 4: Estimated Focus Confidence */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs relative">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="flex items-center gap-1">
              <span>Focus Confidence</span>
              <button
                onClick={() => setShowTooltip(!showTooltip)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                title="Explain focus confidence"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </span>
            <span className={`text-xs font-semibold ${engineOutput.score >= 75 ? 'text-emerald-400' : engineOutput.score >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
              {engineOutput.score} / 100
            </span>
          </div>

          <div className="my-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight font-mono text-zinc-100">
              {engineOutput.score}
            </span>
            <span className="text-xs text-zinc-400">
              Peak: <strong className="text-zinc-200 font-mono">{tickData.peakScore || engineOutput.score}</strong>
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[11px] flex-wrap gap-1">
            <button
              onClick={() => setShowSignalBreakdown(!showSignalBreakdown)}
              className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>{showSignalBreakdown ? 'Hide Weights' : 'Weights'}</span>
              <Activity className="w-3 h-3" />
            </button>

            <button
              onClick={() => setShowDiagnosticHUD(!showDiagnosticHUD)}
              className="text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>{showDiagnosticHUD ? 'Close HUD' : 'Diagnostics'}</span>
              <Terminal className="w-3 h-3" />
            </button>

            {onOpenCalibration && (
              <button
                onClick={onOpenCalibration}
                className="text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors cursor-pointer"
                title="Calibrate desk camera angles"
              >
                <span>Calibrate</span>
                <Compass className="w-3 h-3" />
              </button>
            )}

            {onOpenEvaluation && (
              <button
                onClick={onOpenEvaluation}
                className="text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer"
                title="Run reliability & accuracy tests"
              >
                <span>Benchmark</span>
                <Award className="w-3 h-3" />
              </button>
            )}
          </div>

          {showTooltip && (
            <div className="absolute top-10 right-3 z-30 w-72 bg-zinc-950 border border-zinc-700 p-3 rounded-xl shadow-xl text-xs text-zinc-300 space-y-1.5">
              <p className="font-semibold text-zinc-100">Estimated Focus Confidence</p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                An estimate based on camera posture and computer-activity signals.
                <strong> Head-down looking at notes or solving calculations on paper is recognized as verified focus in Paper & Mixed modes.</strong>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Optional Diagnostic Telemetry HUD */}
      {showDiagnosticHUD && telemetry && (
        <div className="bg-zinc-950 border border-teal-500/30 rounded-2xl p-4 font-mono text-xs text-zinc-300 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="flex items-center gap-2 text-teal-400 font-bold">
              <Terminal className="w-4 h-4" />
              <span>Developer Diagnostics & Live Telemetry HUD</span>
            </span>
            <span className="text-[10px] text-zinc-500">{new Date().toLocaleTimeString()}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-[11px]">
            <div>
              <span className="text-zinc-500 block">State:</span>
              <span className="text-emerald-400 font-bold">{tickData.state}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Primary Activity:</span>
              <span className="text-indigo-400 font-bold uppercase tracking-wider">
                {telemetry.primaryActivity || engineOutput.activity || 'STUDYING'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Confidence / Raw:</span>
              <span className="text-zinc-200">{engineOutput.score} / {engineOutput.rawScore}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Face Visibility:</span>
              <span className={`font-semibold ${
                engineOutput.faceVisibility === 'HIGH' ? 'text-emerald-400' :
                engineOutput.faceVisibility === 'MED' ? 'text-amber-400' : 'text-rose-400'
              }`}>
                {engineOutput.faceVisibility || 'HIGH'} {telemetry.faceCount && telemetry.faceCount > 1 ? `(${telemetry.faceCount} faces)` : ''}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Pitch (Desk Angle):</span>
              <span className={telemetry.headPitch < -8 ? 'text-teal-400' : 'text-zinc-200'}>
                {telemetry.headPitch}° {telemetry.headPitch < -8 ? '(Looking Down)' : ''}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Head Yaw:</span>
              <span className={Math.abs(telemetry.headYaw) > 25 ? 'text-amber-400' : 'text-zinc-200'}>
                {telemetry.headYaw}°
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Hand / Writing:</span>
              <span className={telemetry.handActivity ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
                {telemetry.handActivity ? 'Active (Writing)' : 'Resting'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">In Study Zone:</span>
              <span className={telemetry.inStudyZone !== false ? 'text-emerald-400' : 'text-amber-400'}>
                {telemetry.inStudyZone !== false ? 'Yes (Desk Bound)' : 'Outside Bounds'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Posture Stable:</span>
              <span className={telemetry.bodyPostureStable ? 'text-emerald-400' : 'text-amber-400'}>
                {String(telemetry.bodyPostureStable)}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Phone Risk:</span>
              <span className={(telemetry.phoneConfidence || 0) > 0.4 ? 'text-rose-400 font-bold' : 'text-zinc-400'}>
                {Math.round((telemetry.phoneConfidence || 0) * 100)}%
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Conversation Risk:</span>
              <span className={(telemetry.conversationConfidence || 0) > 0.4 ? 'text-rose-400 font-bold' : 'text-zinc-400'}>
                {Math.round((telemetry.conversationConfidence || 0) * 100)}%
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Sleep Risk:</span>
              <span className={(telemetry.sleepConfidence || 0) > 0.4 ? 'text-rose-400 font-bold' : 'text-zinc-400'}>
                {Math.round((telemetry.sleepConfidence || 0) * 100)}%
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Keyboard / Mouse:</span>
              <span className="text-zinc-200">
                {telemetry.keyboardActive ? 'Key ' : ''}
                {telemetry.mouseActive ? 'Mouse ' : ''}
                {!telemetry.keyboardActive && !telemetry.mouseActive ? 'Idle' : ''}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Idle Time:</span>
              <span className="text-zinc-200">{telemetry.idleSeconds}s</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Lighting:</span>
              <span className="text-zinc-200 capitalize">{telemetry.lightingLevel || 'Normal'}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Person Presence:</span>
              <span className={`font-semibold ${
                telemetry.personPresenceState === 'PERSON_PRESENT' ? 'text-emerald-400' :
                telemetry.personPresenceState === 'PERSON_PROBABLY_PRESENT' ? 'text-teal-300' :
                telemetry.personPresenceState === 'VISION_UNCERTAIN' ? 'text-amber-400' : 'text-rose-400'
              }`}>
                {telemetry.personPresenceState === 'PERSON_PRESENT' ? 'Present' :
                 telemetry.personPresenceState === 'PERSON_PROBABLY_PRESENT' ? 'Probable (Desk)' :
                 telemetry.personPresenceState === 'VISION_UNCERTAIN' ? 'Uncertain' : 'Absent'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Vision Quality:</span>
              <span className="text-zinc-200 font-mono">
                {telemetry.visionQualityScore !== undefined ? `${Math.round(telemetry.visionQualityScore * 100)}%` : '90%'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Study Medium:</span>
              <span className="text-indigo-400 font-semibold">{telemetry.studyMedium}</span>
            </div>
          </div>

          {/* Explainable State Decision Banner */}
          {engineOutput.stateExplanation && (
            <div className="bg-zinc-900/90 border border-zinc-800 p-2.5 rounded-xl flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold uppercase text-[10px]">
                  Reason
                </span>
                <span className="text-zinc-200">{engineOutput.stateExplanation}</span>
              </div>
              {engineOutput.isGracePeriodActive && (
                <span className="text-amber-400 text-[10px] font-semibold animate-pulse">
                  Grace Period ({engineOutput.graceSecondsRemaining}s)
                </span>
              )}
            </div>
          )}

          {/* Signal Conflict Auto-Resolution Banner */}
          {telemetry.signalConflicts && telemetry.signalConflicts.length > 0 && (
            <div className="bg-teal-950/40 border border-teal-500/30 p-2.5 rounded-xl flex items-center justify-between text-[11px] animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold uppercase text-[10px]">
                  Conflict Auto-Resolved
                </span>
                <span className="text-zinc-300">
                  {telemetry.signalConflicts[telemetry.signalConflicts.length - 1].description}
                </span>
              </div>
              <span className="text-teal-400 text-[10px] font-mono">
                &rarr; {telemetry.signalConflicts[telemetry.signalConflicts.length - 1].resolvedState}
              </span>
            </div>
          )}

          {/* Focus Confidence Vector Gauges */}
          {engineOutput.confidenceVector && (
            <div className="border-t border-zinc-800/80 pt-2 space-y-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">
                Focus Confidence Vector (Probability Distribution)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[10px]">
                <div className="bg-zinc-900/60 p-2 rounded border border-zinc-800">
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>Screen</span>
                    <span className="text-emerald-400 font-mono">{Math.round(engineOutput.confidenceVector.pScreen * 100)}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.round(engineOutput.confidenceVector.pScreen * 100)}%` }} />
                  </div>
                </div>

                <div className="bg-zinc-900/60 p-2 rounded border border-zinc-800">
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>Paper</span>
                    <span className="text-teal-400 font-mono">{Math.round(engineOutput.confidenceVector.pPaper * 100)}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-teal-400 h-full rounded-full" style={{ width: `${Math.round(engineOutput.confidenceVector.pPaper * 100)}%` }} />
                  </div>
                </div>

                <div className="bg-zinc-900/60 p-2 rounded border border-zinc-800">
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>Thinking</span>
                    <span className="text-amber-400 font-mono">{Math.round(engineOutput.confidenceVector.pThinking * 100)}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-amber-400 h-full rounded-full" style={{ width: `${Math.round(engineOutput.confidenceVector.pThinking * 100)}%` }} />
                  </div>
                </div>

                <div className="bg-zinc-900/60 p-2 rounded border border-zinc-800">
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>Phone</span>
                    <span className="text-rose-400 font-mono">{Math.round(engineOutput.confidenceVector.pPhone * 100)}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-rose-500 h-full rounded-full" style={{ width: `${Math.round(engineOutput.confidenceVector.pPhone * 100)}%` }} />
                  </div>
                </div>

                <div className="bg-zinc-900/60 p-2 rounded border border-zinc-800">
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>Speaking</span>
                    <span className="text-rose-400 font-mono">{Math.round(engineOutput.confidenceVector.pConversation * 100)}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-rose-500 h-full rounded-full" style={{ width: `${Math.round(engineOutput.confidenceVector.pConversation * 100)}%` }} />
                  </div>
                </div>

                <div className="bg-zinc-900/60 p-2 rounded border border-zinc-800">
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>Sleep</span>
                    <span className="text-purple-400 font-mono">{Math.round(engineOutput.confidenceVector.pSleep * 100)}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full rounded-full" style={{ width: `${Math.round(engineOutput.confidenceVector.pSleep * 100)}%` }} />
                  </div>
                </div>

                <div className="bg-zinc-900/60 p-2 rounded border border-zinc-800">
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>Away</span>
                    <span className="text-zinc-400 font-mono">{Math.round(engineOutput.confidenceVector.pAway * 100)}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-zinc-500 h-full rounded-full" style={{ width: `${Math.round(engineOutput.confidenceVector.pAway * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* State Transition History Logs */}
          {engineOutput.recentTransitions && engineOutput.recentTransitions.length > 0 && (
            <div className="border-t border-zinc-800/80 pt-2 space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">
                Recent State Transitions
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-[10px]">
                {engineOutput.recentTransitions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-zinc-400 bg-zinc-900/60 p-1 rounded">
                    <span>
                      <strong className="text-zinc-300">{new Date(t.timestamp).toLocaleTimeString()}</strong>: {t.oldState} &rarr; <span className="text-emerald-400 font-bold">{t.newState}</span>
                    </span>
                    <span className="text-zinc-500 truncate max-w-xs">{t.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Optional Signal Breakdown Accordion */}
      {showSignalBreakdown && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs animate-in fade-in duration-150">
          <div className="space-y-1">
            <div className="text-zinc-400 flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-emerald-400" />
              <span>Face Presence</span>
            </div>
            <div className="font-mono text-zinc-200 text-sm font-semibold">
              {engineOutput.signalBreakdown.faceScore}/100
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-zinc-400 flex items-center gap-1">
              <Activity className="w-3 h-3 text-indigo-400" />
              <span>Head Pose (Soft)</span>
            </div>
            <div className="font-mono text-zinc-200 text-sm font-semibold">
              {engineOutput.signalBreakdown.headPoseScore}/100
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-zinc-400 flex items-center gap-1">
              <Eye className="w-3 h-3 text-sky-400" />
              <span>Eye/Gaze State</span>
            </div>
            <div className="font-mono text-zinc-200 text-sm font-semibold">
              {engineOutput.signalBreakdown.eyeGazeScore}/100
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-zinc-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>Desk & Writing</span>
            </div>
            <div className="font-mono text-zinc-200 text-sm font-semibold">
              {engineOutput.signalBreakdown.activityScore}/100
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-zinc-400 flex items-center gap-1">
              <Layers className="w-3 h-3 text-purple-400" />
              <span>App Context</span>
            </div>
            <div className="font-mono text-zinc-200 text-sm font-semibold">
              {engineOutput.signalBreakdown.appContextScore}/100
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-zinc-400 flex items-center gap-1">
              <Sun className="w-3 h-3 text-amber-300" />
              <span>Lighting Quality</span>
            </div>
            <div className="font-mono text-zinc-200 text-sm font-semibold">
              {engineOutput.signalBreakdown.lightingScore || 65}/100
            </div>
          </div>
        </div>
      )}

      {/* Real-Time AI Diagnostics HUD */}
      <AIDiagnosticsHUD engineOutput={engineOutput} tickData={tickData} />

      {/* Main Focus Arena: Timer + State Status Banner + Camera Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Giant Timer & Session Controls */}
        <div className="lg:col-span-7 bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 lg:p-8 space-y-6 shadow-xl relative overflow-hidden">
          {/* Ambient Focus Glow */}
          <div className={`absolute -top-16 -left-16 w-48 h-48 rounded-full blur-3xl pointer-events-none transition-all duration-500 ${
            tickData.state === 'FOCUSED_SCREEN' || tickData.state === 'FOCUSED' ? 'bg-emerald-500/15' :
            tickData.state === 'FOCUSED_PAPER' ? 'bg-teal-500/20' :
            tickData.state === 'FOCUSED_MIXED' ? 'bg-indigo-500/20' :
            tickData.state === 'UNCERTAIN' || tickData.state === 'WARNING' ? 'bg-amber-500/15' :
            tickData.state === 'PAUSED' ? 'bg-rose-500/15' : 'bg-indigo-500/10'
          }`} />

          {/* Mode, Subject & Medium Selector Header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                {tickData.activeMode}
              </span>
              <span className="text-xs font-medium text-zinc-400">
                Subject: <strong className="text-zinc-200">{tickData.activeSubject}</strong>
              </span>
            </div>

            {/* Study Medium Selector Pills: Screen Study vs Paper / PYQ Study vs Mixed Study */}
            <div className="flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-xs">
              {(['Screen Study', 'Paper / PYQ Study', 'Mixed Study'] as StudyMedium[]).map((med) => {
                const isActive = activeMedium === med;
                return (
                  <button
                    key={med}
                    onClick={() => onSelectMedium?.(med)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {med === 'Screen Study' && <Monitor className="w-3 h-3" />}
                    {med === 'Paper / PYQ Study' && <FileText className="w-3 h-3 text-teal-300" />}
                    {med === 'Mixed Study' && <BookOpen className="w-3 h-3 text-amber-300" />}
                    <span>{med}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current Focus State Status Banner */}
          <div className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-300 ${currentVisual.bg}`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${currentVisual.dot}`} />
              <div>
                <div className={`text-sm font-bold tracking-wide flex items-center gap-1.5 ${currentVisual.color}`}>
                  <span>{currentVisual.title}</span>
                  {(tickData.state === 'FOCUSED' || tickData.state === 'FOCUSED_SCREEN' || tickData.state === 'FOCUSED_PAPER' || tickData.state === 'FOCUSED_MIXED') && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  {(tickData.state === 'WARNING' || tickData.state === 'UNCERTAIN') && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                </div>
                <div className="text-xs text-zinc-400">{currentVisual.subtitle}</div>
              </div>
            </div>

            {engineOutput.returnConfirmationRemaining > 0 && (
              <div className="text-xs text-emerald-400 font-medium px-2.5 py-1 bg-emerald-500/15 rounded-lg border border-emerald-500/30 animate-pulse">
                Verifying focus: {engineOutput.returnConfirmationRemaining}s
              </div>
            )}
          </div>

          {/* Large Countdown Clock */}
          <div className="text-center py-3 sm:py-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
              Verified Focus Countdown
            </div>
            <div className="font-mono text-5xl sm:text-7xl font-extrabold tracking-tight text-zinc-100 select-all">
              {formatDigitalClock(tickData.remainingTargetSeconds)}
            </div>

            {/* Execution Coach Banner: Permanent line "FOCUS ON TODAY'S EXECUTION." + Contextual coach pill */}
            <div className="my-3">
              <ExecutionCoachBanner
                motivationalMessagesEnabled={userSettings.motivationalMessagesEnabled}
                eventMessagesEnabled={userSettings.eventMessagesEnabled}
              />
            </div>

            {isSessionActive && (
              <div className="mt-3 flex items-center justify-center">
                {tickData.isVerifiedFocus ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Verified Study Active — Countdown Running</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Verified Countdown Paused &bull; {tickData.verificationReason || 'Waiting for study evidence'}</span>
                  </span>
                )}
              </div>
            )}

            {/* Total Verified Focus with Screen & Paper Breakdown */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs font-mono">
              <div className="bg-zinc-950/70 px-3 py-1.5 rounded-lg border border-zinc-800">
                <span className="text-zinc-400">Total Verified: </span>
                <strong className="text-emerald-400 font-bold">{formatDigitalClock(tickData.focusedSeconds)}</strong>
              </div>
              <div className="bg-zinc-950/70 px-3 py-1.5 rounded-lg border border-zinc-800">
                <span className="text-zinc-500">Screen: </span>
                <span className="text-indigo-300">{formatTimeHoursMins(tickData.screenFocusedSeconds || 0)}</span>
              </div>
              <div className="bg-zinc-950/70 px-3 py-1.5 rounded-lg border border-zinc-800">
                <span className="text-zinc-500">Paper/Desk: </span>
                <span className="text-teal-300">{formatTimeHoursMins(tickData.paperFocusedSeconds || 0)}</span>
              </div>
              {tickData.thinkingSeconds > 0 && (
                <div className="bg-zinc-950/70 px-3 py-1.5 rounded-lg border border-zinc-800">
                  <span className="text-zinc-500">Thinking: </span>
                  <span className="text-amber-300">{formatTimeHoursMins(tickData.thinkingSeconds)}</span>
                </div>
              )}
              {tickData.mixedFocusedSeconds > 0 && (
                <div className="bg-zinc-950/70 px-3 py-1.5 rounded-lg border border-zinc-800">
                  <span className="text-zinc-500">Mixed: </span>
                  <span className="text-indigo-300">{formatTimeHoursMins(tickData.mixedFocusedSeconds)}</span>
                </div>
              )}
              {tickData.unverifiedSeconds > 0 && (
                <div className="bg-zinc-950/70 px-3 py-1.5 rounded-lg border border-zinc-800">
                  <span className="text-zinc-500">Unverified: </span>
                  <span className="text-zinc-400">{formatTimeHoursMins(tickData.unverifiedSeconds)}</span>
                </div>
              )}
              <div className="bg-zinc-950/70 px-3 py-1.5 rounded-lg border border-zinc-800">
                <span className="text-zinc-500">Distracted: </span>
                <span className="text-rose-400">{formatTimeHoursMins(tickData.distractedSeconds)}</span>
              </div>
            </div>
          </div>

          {/* Goal Display */}
          {tickData.activeGoal && (
            <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80 text-xs text-zinc-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Target Outcome: <strong className="text-zinc-100">{tickData.activeGoal}</strong></span>
            </div>
          )}

          {/* Action Button Bar */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/80">
            <div className="flex items-center gap-2">
              {!isSessionActive ? (
                <button
                  onClick={onOpenSetup}
                  className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>START SESSION</span>
                </button>
              ) : tickData.state === 'PAUSED' ? (
                <button
                  onClick={onResume}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>RESUME SESSION</span>
                </button>
              ) : (
                <button
                  onClick={onPause}
                  className="px-5 py-3 bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-semibold text-sm rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Pause className="w-4 h-4" />
                  <span>PAUSE</span>
                </button>
              )}

              {isSessionActive && (
                <button
                  onClick={onStop}
                  className="px-4 py-3 bg-zinc-800/70 hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 font-semibold text-sm rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border border-zinc-700/60 hover:border-rose-700/60"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>STOP</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onStartBreak}
                className="px-4 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-sky-300 hover:text-sky-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors border border-zinc-700/60 cursor-pointer"
              >
                <Coffee className="w-3.5 h-3.5 text-sky-400" />
                <span>START BREAK</span>
              </button>

              <button
                onClick={onResetTimer}
                title="Reset active timer"
                className="p-2.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Local Camera & Computer Vision HUD */}
        <div className="lg:col-span-5 bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 space-y-4 shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isCameraActive ? 'bg-emerald-400 animate-pulse' : visionEngine.isSimulating() ? 'bg-indigo-400' : 'bg-zinc-600'}`} />
              <span className="text-xs font-bold text-zinc-200 tracking-wide">
                {isCameraActive ? 'Webcam Focus Monitor' : 'Smart Focus Monitor'}
              </span>
            </div>

            <button
              onClick={handleToggleCamera}
              className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                isCameraActive
                  ? 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
                  : 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30'
              }`}
            >
              {isCameraActive ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
              <span>{isCameraActive ? 'Turn Off' : 'Enable Camera'}</span>
            </button>
          </div>

          {/* Video Viewport with Vision HUD */}
          <div className="relative aspect-4/3 w-full bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 flex items-center justify-center">
            {/* Auto-Recovery & Degraded Non-Blocking Badges */}
            {pipelineHealth.status === 'RECOVERING' && (
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/25 border border-amber-500/50 text-amber-200 text-xs font-semibold backdrop-blur-md animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300" />
                <span>AI Monitoring Recovering ({pipelineHealth.recoveryAttempts}/3)...</span>
              </div>
            )}
            {pipelineHealth.status === 'DEGRADED' && (
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium backdrop-blur-md">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>Degraded Camera Signal</span>
              </div>
            )}

            {/* Real Webcam Video Stream */}
            <video
              ref={videoCallbackRef}
              playsInline
              muted
              className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${
                isCameraActive ? 'opacity-85' : 'opacity-0 pointer-events-none'
              }`}
            />

            {!isCameraActive && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 space-y-2 text-center bg-zinc-950/60">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-1">
                  <Camera className="w-6 h-6 text-indigo-400" />
                </div>
                <p className="text-xs font-semibold text-zinc-300">Smart Activity Mode Active</p>
                <p className="text-[11px] text-zinc-500 max-w-xs">
                  Attention and keystroke awareness enabled. Click &apos;Enable Camera&apos; above anytime to switch to optical tracking.
                </p>
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 bg-zinc-950/95 flex flex-col items-center justify-center p-5 text-center z-10">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-2">
                  <Shield className="w-5 h-5 text-amber-400" />
                </div>
                <p className="text-xs text-zinc-200 font-semibold mb-1">Camera Permission Paused</p>
                <p className="text-[11px] text-zinc-400 max-w-xs mb-3 leading-relaxed">
                  Browser camera access not granted. AI Focus Timer is currently operating in <strong>Smart Activity & Focus Mode</strong>.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleCamera}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-indigo-600/20"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Grant Permission</span>
                  </button>
                  <button
                    onClick={() => setCameraError(null)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  >
                    Use Activity Mode
                  </button>
                </div>
              </div>
            )}

            {/* Live Computer Vision Overlays */}
            {visionLive && !cameraError && (
              <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">
                {/* Face Bounding Box */}
                {visionLive.facePresent && (
                  <div
                    className={`absolute border-2 rounded-lg shadow-lg transition-all duration-100 ${
                      visionLive.isLookingDown
                        ? 'border-teal-400/90 shadow-teal-500/20'
                        : 'border-emerald-400/80 shadow-emerald-500/20'
                    }`}
                    style={{
                      left: `${visionLive.faceBox?.x ?? 20}%`,
                      top: `${visionLive.faceBox?.y ?? 15}%`,
                      width: `${visionLive.faceBox?.width ?? 60}%`,
                      height: `${visionLive.faceBox?.height ?? 65}%`
                    }}
                  >
                    <div className={`absolute -top-5 left-0 text-[10px] font-bold px-1.5 py-0.5 rounded text-zinc-950 ${
                      visionLive.isLookingDown ? 'bg-teal-400' : 'bg-emerald-400'
                    }`}>
                      {visionLive.isLookingDown ? 'DESK / PAPER FOCUS' : 'SCREEN FOCUS'} ({Math.round(visionLive.confidence * 100)}%)
                    </div>
                  </div>
                )}

                {/* Top Telemetry */}
                <div className="flex justify-between items-start text-[10px] font-mono text-zinc-300 drop-shadow-md">
                  <div className="bg-zinc-950/80 backdrop-blur-xs px-2 py-1 rounded border border-zinc-800">
                    Yaw: <span className={Math.abs(visionLive.headYaw) > 20 ? 'text-amber-400' : 'text-emerald-400'}>{visionLive.headYaw}°</span> |
                    Pitch: <span className={visionLive.isLookingDown ? 'text-teal-400 font-bold' : 'text-zinc-200'}>{visionLive.headPitch}°</span>
                  </div>
                  <div className="bg-zinc-950/80 backdrop-blur-xs px-2 py-1 rounded border border-zinc-800">
                    Desk: <span className={visionLive.handActivity ? 'text-emerald-400 font-bold' : 'text-zinc-400'}>{visionLive.handActivity ? 'Writing' : 'Stable'}</span>
                  </div>
                </div>

                {/* Bottom Telemetry */}
                <div className="flex justify-between items-end text-[10px] font-mono text-zinc-300 drop-shadow-md">
                  <div className="bg-zinc-950/80 backdrop-blur-xs px-2 py-1 rounded border border-zinc-800">
                    Gaze: <span className="text-emerald-400 font-bold">{Math.round(visionLive.gazeScore * 100)}%</span>
                  </div>
                  <div className="bg-emerald-950/80 text-emerald-400 px-2 py-1 rounded border border-emerald-800/80 text-[10px] font-sans font-semibold">
                    {activeMedium}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Anti-False-Positive Assurance Card */}
          <div className="p-3 bg-zinc-950/70 border border-zinc-800/80 rounded-xl space-y-1 text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
              <UserCheck className="w-3.5 h-3.5 text-teal-400" />
              <span>Multi-Signal Study Verification</span>
            </div>
            <p className="text-zinc-500 leading-relaxed">
              Notebook reading, writing equations, solving GATE PYQs, thinking pauses, and posture shifts count as verified focus. Absence or clear departure is required to pause.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
