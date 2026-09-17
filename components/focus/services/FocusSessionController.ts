import {
  FocusMode,
  FocusSegment,
  FocusSession,
  FocusState,
  HighLevelVerificationState,
  DeviceStatus,
  DeviceInteractionEvidence,
  TimerGateState,
  StudyMedium
} from '../types';
import { StorageService } from './storage';
import { soundFx } from './audio';
import { visionEngine } from '../vision/visionEngine';

export interface FocusSessionState {
  sessionId: string | null;
  isActive: boolean;
  isPaused: boolean;
  subject: string;
  topic: string;
  goal: string;
  mode: FocusMode;
  medium: StudyMedium;
  targetSeconds: number;
  sessionStartTime: number;

  // Authoritative Milliseconds Accumulators
  accumulatedFocusedMs: number;
  accumulatedScreenMs: number;
  accumulatedPaperMs: number;
  accumulatedMixedMs: number;
  accumulatedThinkingMs: number;
  accumulatedAwayMs: number;
  accumulatedDeviceMs: number;
  accumulatedManualPauseMs: number;
  accumulatedErrorMs: number;
  totalSessionMs: number;

  // Single Authoritative Timer Gate
  gate: TimerGateState;

  // Vision & Perception telemetry
  lastVisionUpdateAt: number;
  presenceConfidence: number;
  deviceStatus: DeviceStatus;
  deviceInteractionEvidence?: DeviceInteractionEvidence;
  inferenceFps: number;

  // Segments & History
  segments: FocusSegment[];
  currentSegment: FocusSegment | null;
  stateTransitions: Array<{
    id: string;
    timestamp: number;
    fromState: HighLevelVerificationState;
    toState: HighLevelVerificationState;
    reason: string;
    metrics?: Record<string, unknown>;
  }>;
}

export type FocusSessionSubscriber = (state: FocusSessionState) => void;

/**
 * Authoritative Single Timer Gate Decision Function (Prompt Rule 4 & Section 17, 58)
 */
export function shouldTimerRun(gate: {
  manualPause: boolean;
  monitoringHealthy: boolean;
  studentPresent: boolean;
  deviceInUse: boolean;
}): boolean {
  if (gate.manualPause) return false;
  if (!gate.monitoringHealthy) return false;
  if (!gate.studentPresent) return false;
  if (gate.deviceInUse) return false;
  return true;
}

export class FocusSessionController {
  private subscribers: Set<FocusSessionSubscriber> = new Set();
  private timerIntervalId: any = null;
  private lastTickTimestamp: number = 0;
  private timerWorker: Worker | null = null;

  private state: FocusSessionState = {
    sessionId: null,
    isActive: false,
    isPaused: false,
    subject: 'Algorithms',
    topic: 'Dynamic Programming',
    goal: 'Solve 30 PYQs with verified focus',
    mode: 'Deep Focus',
    medium: 'Screen Study',
    targetSeconds: 7200,
    sessionStartTime: 0,
    accumulatedFocusedMs: 0,
    accumulatedScreenMs: 0,
    accumulatedPaperMs: 0,
    accumulatedMixedMs: 0,
    accumulatedThinkingMs: 0,
    accumulatedAwayMs: 0,
    accumulatedDeviceMs: 0,
    accumulatedManualPauseMs: 0,
    accumulatedErrorMs: 0,
    totalSessionMs: 0,
    gate: {
      studentPresent: true,
      deviceInUse: false,
      manualPause: false,
      monitoringHealthy: true,
      verifiedTimerAllowed: true,
      highLevelState: 'ACTIVE',
      blockReason: 'NONE'
    },
    lastVisionUpdateAt: Date.now(),
    presenceConfidence: 0.95,
    deviceStatus: 'NOT_DETECTED',
    inferenceFps: 12,
    segments: [],
    currentSegment: null,
    stateTransitions: []
  };

  constructor() {
    this.initBackgroundWorker();

    if (typeof window !== 'undefined' && (window as any).electronAPI?.onToggleFocus) {
      (window as any).electronAPI.onToggleFocus((action: string) => {
        if (action === 'pause') this.pauseSession();
        else if (action === 'resume') this.resumeSession();
        else if (action === 'stop') this.stopSession();
      });
    }
  }

  private initBackgroundWorker(): void {
    // Create inline blob worker for resilient background ticks if Worker is available
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        const workerScript = `
          let intervalId = null;
          self.onmessage = function(e) {
            if (e.data === 'start') {
              if (intervalId) clearInterval(intervalId);
              intervalId = setInterval(function() {
                self.postMessage('tick');
              }, 250);
            } else if (e.data === 'stop') {
              if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
              }
            }
          };
        `;
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        this.timerWorker = new Worker(URL.createObjectURL(blob));
        this.timerWorker.onmessage = () => {
          this.tick();
        };
      } catch (err) {
        console.warn('FocusSessionController: Web Worker fallback to setInterval', err);
      }
    }
  }

  getState(): FocusSessionState {
    return { ...this.state };
  }

  subscribe(subscriber: FocusSessionSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.state);
    return () => this.subscribers.delete(subscriber);
  }

  private notify(): void {
    const clone = { ...this.state };
    this.subscribers.forEach(sub => sub(clone));

    if (typeof window !== 'undefined' && (window as any).electronAPI?.updateFocusStatus) {
      (window as any).electronAPI.updateFocusStatus({
        isActive: this.state.isActive,
        highLevelState: this.state.gate.highLevelState,
        focusedMs: this.state.accumulatedFocusedMs
      });
    }
  }

  startSession(
    subject: string,
    topic: string,
    targetSeconds: number,
    mode: FocusMode,
    goal: string,
    medium: StudyMedium
  ): void {
    const now = Date.now();
    const sessionId = `foc_${now}_${Math.random().toString(36).slice(2, 7)}`;

    this.state = {
      ...this.state,
      sessionId,
      isActive: true,
      isPaused: false,
      subject,
      topic,
      targetSeconds,
      mode,
      goal,
      medium,
      sessionStartTime: now,
      accumulatedFocusedMs: 0,
      accumulatedScreenMs: 0,
      accumulatedPaperMs: 0,
      accumulatedMixedMs: 0,
      accumulatedThinkingMs: 0,
      accumulatedAwayMs: 0,
      accumulatedDeviceMs: 0,
      accumulatedManualPauseMs: 0,
      accumulatedErrorMs: 0,
      totalSessionMs: 0,
      lastVisionUpdateAt: now,
      segments: [],
      currentSegment: null,
      stateTransitions: []
    };

    this.lastTickTimestamp = now;
    this.transitionHighLevelState('ACTIVE', 'Session started');

    // Start ticker (Web Worker + window interval fallback)
    if (this.timerWorker) {
      this.timerWorker.postMessage('start');
    }
    if (this.timerIntervalId) clearInterval(this.timerIntervalId);
    this.timerIntervalId = setInterval(() => this.tick(), 250);

    soundFx.playFocusRestored();
    this.notify();
  }

  pauseSession(reason: string = 'User paused manually'): void {
    if (!this.state.isActive) return;
    this.state.isPaused = true;
    this.updatePerceptionState({ manualPause: true }, reason);
    soundFx.playAutoPaused();
  }

  resumeSession(): void {
    if (!this.state.isActive) return;
    this.state.isPaused = false;
    this.lastTickTimestamp = Date.now();
    this.updatePerceptionState({ manualPause: false }, 'User resumed session');
    soundFx.playFocusRestored();
  }

  stopSession(): FocusSession | null {
    if (!this.state.isActive || !this.state.sessionId) return null;

    if (this.timerWorker) {
      this.timerWorker.postMessage('stop');
    }
    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }

    const now = Date.now();
    if (this.state.currentSegment) {
      this.state.currentSegment.end = now;
      this.state.currentSegment.durationMs = Math.max(0, now - this.state.currentSegment.start);
      this.state.segments.push({ ...this.state.currentSegment });
      this.state.currentSegment = null;
    }

    const focusedSec = Math.round(this.state.accumulatedFocusedMs / 1000);
    const screenSec = Math.round(this.state.accumulatedScreenMs / 1000);
    const paperSec = Math.round(this.state.accumulatedPaperMs / 1000);
    const mixedSec = Math.round(this.state.accumulatedMixedMs / 1000);
    const thinkingSec = Math.round(this.state.accumulatedThinkingMs / 1000);
    const awaySec = Math.round(this.state.accumulatedAwayMs / 1000);
    const deviceSec = Math.round(this.state.accumulatedDeviceMs / 1000);
    const pausedSec = Math.round(this.state.accumulatedManualPauseMs / 1000);
    const elapsedSec = Math.round((now - this.state.sessionStartTime) / 1000);

    const completedSession: FocusSession = {
      id: this.state.sessionId,
      subject: this.state.subject,
      topic: this.state.topic,
      goal: this.state.goal,
      mode: this.state.mode,
      studyMedium: this.state.medium,
      startTime: this.state.sessionStartTime,
      endTime: now,
      targetSeconds: this.state.targetSeconds,
      focusedSeconds: focusedSec,
      screenFocusedSeconds: screenSec,
      paperFocusedSeconds: paperSec,
      mixedFocusedSeconds: mixedSec,
      thinkingSeconds: thinkingSec,
      uncertainSeconds: 0,
      unverifiedSeconds: 0,
      pausedSeconds: pausedSec,
      warningSeconds: 0,
      distractedSeconds: deviceSec,
      phoneDistractedSeconds: deviceSec,
      conversationSeconds: 0,
      possibleSleepSeconds: 0,
      awaySeconds: awaySec,
      breakSeconds: 0,
      elapsedSeconds: elapsedSec,
      averageFocusScore: 90,
      peakFocusScore: 100,
      distractionCount: this.state.stateTransitions.filter(t => t.toState === 'DEVICE_IN_USE' || t.toState === 'AWAY').length,
      efficiency: elapsedSec > 0 ? Math.min(100, Math.round((focusedSec / elapsedSec) * 100)) : 100,
      segments: [...this.state.segments],
      syncStatus: 'local'
    };

    StorageService.saveSession(completedSession);

    this.state = {
      ...this.state,
      isActive: false,
      isPaused: false,
      sessionId: null
    };

    this.notify();
    return completedSession;
  }

  /**
   * Authoritative Perception Feed from Vision / ML Pipeline
   */
  updatePerceptionState(
    params: {
      studentPresent?: boolean;
      presenceConfidence?: number;
      deviceStatus?: DeviceStatus;
      deviceInUse?: boolean;
      deviceInteractionEvidence?: DeviceInteractionEvidence;
      cameraHealthy?: boolean;
      manualPause?: boolean;
      inferenceFps?: number;
    },
    transitionReason?: string
  ): void {
    const now = Date.now();
    this.state.lastVisionUpdateAt = now;

    if (params.presenceConfidence !== undefined) {
      this.state.presenceConfidence = params.presenceConfidence;
    }
    if (params.deviceStatus !== undefined) {
      this.state.deviceStatus = params.deviceStatus;
    }
    if (params.deviceInteractionEvidence !== undefined) {
      this.state.deviceInteractionEvidence = params.deviceInteractionEvidence;
    }
    if (params.inferenceFps !== undefined) {
      this.state.inferenceFps = params.inferenceFps;
    }

    const currentGate = this.state.gate;
    const studentPresent = params.studentPresent !== undefined ? params.studentPresent : currentGate.studentPresent;
    const deviceInUse = params.deviceInUse !== undefined ? params.deviceInUse : (params.deviceStatus === 'DEVICE_IN_USE');
    const manualPause = params.manualPause !== undefined ? params.manualPause : currentGate.manualPause;
    const cameraHealthy = params.cameraHealthy !== undefined ? params.cameraHealthy : currentGate.monitoringHealthy;

    // Evaluate single timer gate (Section 4 & 58)
    const allowed = shouldTimerRun({
      manualPause,
      monitoringHealthy: cameraHealthy,
      studentPresent,
      deviceInUse
    });

    let highLevelState: HighLevelVerificationState = 'ACTIVE';
    let blockReason: TimerGateState['blockReason'] = 'NONE';

    if (manualPause) {
      highLevelState = 'MANUAL_PAUSE';
      blockReason = 'MANUAL_PAUSE';
    } else if (!cameraHealthy) {
      highLevelState = 'MONITORING_ERROR';
      blockReason = 'MONITORING_ERROR';
    } else if (!studentPresent) {
      highLevelState = 'AWAY';
      blockReason = 'AWAY';
    } else if (deviceInUse) {
      highLevelState = 'DEVICE_IN_USE';
      blockReason = 'DEVICE_IN_USE';
    } else {
      highLevelState = 'ACTIVE';
      blockReason = 'NONE';
    }

    const oldState = this.state.gate.highLevelState;
    this.state.gate = {
      studentPresent,
      deviceInUse,
      manualPause,
      monitoringHealthy: cameraHealthy,
      verifiedTimerAllowed: allowed,
      highLevelState,
      blockReason
    };

    if (oldState !== highLevelState) {
      this.transitionHighLevelState(
        highLevelState,
        transitionReason || `State transition: ${oldState} -> ${highLevelState}`
      );
    } else {
      this.notify();
    }
  }

  private transitionHighLevelState(newState: HighLevelVerificationState, reason: string): void {
    const now = Date.now();
    const oldState = this.state.gate.highLevelState;

    // Finalize previous segment
    if (this.state.currentSegment) {
      this.state.currentSegment.end = now;
      this.state.currentSegment.durationMs = Math.max(0, now - this.state.currentSegment.start);
      this.state.segments.push({ ...this.state.currentSegment });
    }

    // Map high level state to FocusState for segments
    const segmentFocusState: FocusState =
      newState === 'ACTIVE' ? (this.state.medium === 'Paper / PYQ Study' ? 'FOCUSED_PAPER' : 'FOCUSED_SCREEN') :
      newState === 'AWAY' ? 'AWAY' :
      newState === 'DEVICE_IN_USE' ? 'PHONE_USE' :
      newState === 'MANUAL_PAUSE' ? 'PAUSED' : 'UNCERTAIN';

    this.state.currentSegment = {
      id: `seg_${now}_${this.state.segments.length + 1}`,
      sessionId: this.state.sessionId || 'active',
      start: now,
      end: now,
      durationMs: 0,
      state: segmentFocusState,
      verified: newState === 'ACTIVE',
      medium: this.state.medium,
      reason
    };

    this.state.stateTransitions.unshift({
      id: `tr_${now}`,
      timestamp: now,
      fromState: oldState,
      toState: newState,
      reason,
      metrics: {
        presenceConfidence: this.state.presenceConfidence,
        deviceStatus: this.state.deviceStatus,
        fps: this.state.inferenceFps
      }
    });

    if (this.state.stateTransitions.length > 50) {
      this.state.stateTransitions.pop();
    }

    // Sound cues on transitions
    if (newState === 'ACTIVE' && (oldState === 'AWAY' || oldState === 'DEVICE_IN_USE' || oldState === 'MANUAL_PAUSE')) {
      soundFx.playFocusRestored();
    } else if (newState === 'AWAY' || newState === 'DEVICE_IN_USE') {
      soundFx.playAutoPaused();
    }

    this.notify();
  }

  /**
   * Main Timestamp-Based Clock Tick (Section 18 & 50)
   * Guaranteed zero timer drift regardless of background throttling or interval jitter.
   */
  private tick(): void {
    if (!this.state.isActive) return;

    const now = Date.now();
    const deltaMs = Math.max(0, now - this.lastTickTimestamp);
    this.lastTickTimestamp = now;

    // Watchdog check: If camera / vision stopped updating for > 4000ms, pause for safety (Section 35)
    const visionLagMs = now - this.state.lastVisionUpdateAt;
    if (visionLagMs > 4000 && this.state.gate.monitoringHealthy && !this.state.gate.manualPause) {
      this.updatePerceptionState({ cameraHealthy: false }, 'Monitoring paused — AI detection unavailable.');
      return;
    }

    this.state.totalSessionMs += deltaMs;

    // Single source of truth gate
    if (this.state.gate.verifiedTimerAllowed) {
      this.state.accumulatedFocusedMs += deltaMs;

      if (this.state.medium === 'Paper / PYQ Study') {
        this.state.accumulatedPaperMs += deltaMs;
      } else if (this.state.medium === 'Mixed Study') {
        this.state.accumulatedMixedMs += deltaMs;
      } else {
        this.state.accumulatedScreenMs += deltaMs;
      }
    } else {
      switch (this.state.gate.highLevelState) {
        case 'AWAY':
          this.state.accumulatedAwayMs += deltaMs;
          break;
        case 'DEVICE_IN_USE':
          this.state.accumulatedDeviceMs += deltaMs;
          break;
        case 'MANUAL_PAUSE':
          this.state.accumulatedManualPauseMs += deltaMs;
          break;
        case 'MONITORING_ERROR':
          this.state.accumulatedErrorMs += deltaMs;
          break;
      }
    }

    // Update active segment end timestamp
    if (this.state.currentSegment) {
      this.state.currentSegment.end = now;
      this.state.currentSegment.durationMs = Math.max(0, now - this.state.currentSegment.start);
    }

    this.notify();
  }

  setStudyMedium(medium: StudyMedium): void {
    this.state.medium = medium;
    this.notify();
  }
}

export const focusSessionController = new FocusSessionController();
