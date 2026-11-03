import React, { useEffect, useRef } from 'react';
import { Camera, CameraOff, CheckCircle2, Play, Square, UserRound } from 'lucide-react';
import { TimerTickData } from '../services/timerEngine';
import { visionEngine } from '../vision/visionEngine';
import { formatDigitalClock, formatTimeHoursMins } from '../services/storage';

export type CameraConnectionStatus = 'OFF' | 'CONNECTING' | 'AVAILABLE' | 'UNAVAILABLE';

interface DashboardProps {
  tickData: TimerTickData;
  todayTargetHours: number;
  todayVerifiedSeconds: number;
  cameraStatus: CameraConnectionStatus;
  cameraError: string | null;
  onOpenSetup: () => void;
  onStop: () => void;
  onRetryCamera: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  tickData,
  todayTargetHours,
  todayVerifiedSeconds,
  cameraStatus,
  cameraError,
  onOpenSetup,
  onStop,
  onRetryCamera,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionActive = tickData.state !== 'IDLE' && tickData.state !== 'COMPLETED';
  const personPresent = sessionActive && tickData.state === 'FOCUSED';

  const activeSessionContribution = sessionActive ? tickData.focusedSeconds : 0;
  const totalVerifiedToday = todayVerifiedSeconds + activeSessionContribution;
  const todayTargetSeconds = todayTargetHours * 3600;
  const todayRemainingSeconds = Math.max(0, todayTargetSeconds - totalVerifiedToday);
  const todayProgress = todayTargetSeconds > 0
    ? Math.min(100, Math.round((totalVerifiedToday / todayTargetSeconds) * 100))
    : 0;
  const sessionProgress = tickData.targetSeconds > 0
    ? Math.min(100, Math.round((tickData.focusedSeconds / tickData.targetSeconds) * 100))
    : 0;

  useEffect(() => {
    const attachPreview = () => {
      if (videoRef.current && visionEngine.isActive()) {
        visionEngine.attachPreview(videoRef.current);
      }
    };

    // Run after the preview element mounts as cameraStatus changes to AVAILABLE.
    attachPreview();
    window.addEventListener('ai-focus-camera-started', attachPreview);

    return () => {
      window.removeEventListener('ai-focus-camera-started', attachPreview);
      if (videoRef.current) visionEngine.detachPreview(videoRef.current);
    };
  }, [cameraStatus]);

  const cameraUnavailable = cameraStatus === 'UNAVAILABLE';
  const cameraSignalLost =
    tickData.state === 'UNVERIFIED' &&
    (tickData.stateExplanation || '').includes('CAMERA SIGNAL LOST');
  const waitingForCameraFrame =
    cameraStatus === 'AVAILABLE' &&
    tickData.state === 'UNVERIFIED' &&
    !cameraSignalLost;

  const presenceStatus = !sessionActive
    ? tickData.state === 'COMPLETED'
      ? 'SESSION COMPLETED'
      : 'READY'
    : cameraStatus === 'CONNECTING'
      ? 'CAMERA CONNECTING — TIMER PAUSED'
      : cameraUnavailable
        ? 'CAMERA UNAVAILABLE — TIMER PAUSED'
        : cameraSignalLost
          ? 'CAMERA SIGNAL LOST — TIMER PAUSED'
          : waitingForCameraFrame
            ? 'WAITING FOR CAMERA FRAME — TIMER PAUSED'
            : personPresent
              ? 'PRESENT — TIMER RUNNING'
              : 'ABSENT — TIMER PAUSED';

  const statusColour = !sessionActive
    ? tickData.state === 'COMPLETED'
      ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
      : 'text-zinc-300 border-zinc-700 bg-zinc-800/60'
    : cameraStatus === 'CONNECTING' || cameraUnavailable || cameraSignalLost || waitingForCameraFrame
      ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
      : personPresent
        ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
        : 'text-rose-300 border-rose-500/30 bg-rose-500/10';

  const statusMessage = !sessionActive
    ? tickData.state === 'COMPLETED'
      ? 'Your target study duration has been reached.'
      : 'Start a session to turn on the webcam and begin presence-based timing.'
    : cameraStatus === 'CONNECTING'
      ? 'Connecting to your webcam. The countdown is paused until a person is detected.'
      : cameraUnavailable
        ? cameraError || 'Camera access is unavailable. Allow camera permission and retry.'
        : cameraSignalLost
          ? tickData.stateExplanation || 'No fresh webcam frames are arriving. The countdown is paused.'
          : waitingForCameraFrame
            ? 'The webcam is connected. Waiting for the first usable frame; the countdown remains paused.'
            : personPresent
              ? 'A person is detected in front of the webcam. Your countdown is running.'
              : 'No person is detected in front of the webcam. Your remaining time is preserved.';

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto space-y-6 overflow-y-auto p-4 lg:p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm">
          <p className="text-xs font-semibold text-zinc-400">TODAY'S STUDY TARGET</p>
          <p className="mt-3 text-3xl font-bold text-white">{todayTargetHours}h</p>
          <p className="mt-1 text-xs text-zinc-500">Daily verified study-time goal</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all"
              style={{ width: `${todayProgress}%` }}
            />
          </div>
          <p className="mt-2 text-right text-xs font-semibold text-emerald-300">{todayProgress}% complete</p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm">
          <p className="text-xs font-semibold text-zinc-400">TOTAL VERIFIED STUDY TIME</p>
          <p className="mt-3 text-3xl font-bold text-emerald-300">
            {formatDigitalClock(totalVerifiedToday)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Counted only while a person is detected</p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm">
          <p className="text-xs font-semibold text-zinc-400">REMAINING STUDY TIME TODAY</p>
          <p className="mt-3 text-3xl font-bold text-white">{formatTimeHoursMins(todayRemainingSeconds)}</p>
          <p className="mt-1 text-xs text-zinc-500">Time left to reach today's target</p>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm xl:col-span-3 lg:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Current session</p>
              <h2 className="mt-2 text-xl font-bold text-white">
                {sessionActive ? tickData.activeSubject : 'AI Focus Timer'}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                {sessionActive ? tickData.activeTopic : 'Webcam-based presence tracking'}
              </p>
            </div>
            {sessionActive && (
              <span className={`rounded-full border px-3 py-1.5 text-[11px] font-bold ${statusColour}`}>
                {presenceStatus}
              </span>
            )}
          </div>

          <div className="mt-8 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Remaining session time
            </p>
            <div className="mt-3 font-mono text-5xl font-bold tracking-tight text-white sm:text-6xl">
              {sessionActive || tickData.state === 'COMPLETED'
                ? formatDigitalClock(tickData.remainingTargetSeconds)
                : '--:--:--'}
            </div>
            <p className="mt-3 text-sm text-zinc-400">
              {sessionActive
                ? `${formatDigitalClock(tickData.focusedSeconds)} verified in this session`
                : tickData.state === 'COMPLETED'
                  ? 'Target duration completed'
                  : 'Choose a session duration to begin'}
            </p>
          </div>

          <div className="mt-8 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all"
              style={{ width: `${sessionProgress}%` }}
            />
          </div>

          {sessionActive && tickData.activeGoal && (
            <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Session goal</p>
              <p className="mt-1 text-sm font-semibold text-zinc-200">{tickData.activeGoal}</p>
            </div>
          )}

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 border-t border-zinc-800 pt-6">
            {!sessionActive ? (
              <button
                type="button"
                onClick={onOpenSetup}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-900/30 transition hover:brightness-110"
              >
                <Play className="h-4 w-4 fill-current" />
                START SESSION
              </button>
            ) : (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-7 py-3.5 text-sm font-bold text-rose-300 transition hover:bg-rose-500/20"
              >
                <Square className="h-4 w-4" />
                STOP SESSION
              </button>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-emerald-300" />
              <h3 className="text-sm font-bold text-white">Webcam Presence</h3>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusColour}`}>
              {presenceStatus}
            </span>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-700 bg-black">
            {cameraStatus === 'AVAILABLE' && !cameraUnavailable ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="aspect-video w-full object-cover"
              />
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-zinc-950 text-center text-zinc-500">
                {cameraUnavailable ? (
                  <CameraOff className="h-7 w-7" />
                ) : (
                  <UserRound className="h-7 w-7" />
                )}
                <p className="text-xs">
                  {cameraStatus === 'CONNECTING'
                    ? 'Connecting to webcam…'
                    : cameraUnavailable
                      ? 'Camera unavailable'
                      : 'Camera starts when you start a session'}
                </p>
              </div>
            )}
          </div>

          <div className={`mt-4 rounded-xl border p-4 ${statusColour}`}>
            <div className="flex items-center gap-2">
              {personPresent ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : cameraUnavailable ? (
                <CameraOff className="h-5 w-5" />
              ) : (
                <UserRound className="h-5 w-5" />
              )}
              <p className="text-xs font-bold">{presenceStatus}</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed opacity-90">{statusMessage}</p>
            {sessionActive && (cameraUnavailable || cameraSignalLost || waitingForCameraFrame) && (
              <button
                type="button"
                onClick={onRetryCamera}
                className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-400/20"
              >
                RETRY CAMERA
              </button>
            )}
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-zinc-500">
            Camera frames are analysed locally in this browser. No webcam footage is uploaded or stored.
          </p>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
