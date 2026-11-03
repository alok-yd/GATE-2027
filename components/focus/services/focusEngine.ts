import {
  ActivityEventLog,
  FocusState,
  PersonPresenceState,
  StateTransitionLog,
  VisionData,
} from '../types';

const CAMERA_STALE_AFTER_MS = 8000;
const REQUIRED_STABLE_FRAMES = 2;

export interface FocusEngineOutput {
  state: FocusState;
  facePresent: boolean;
  personPresenceState: PersonPresenceState;
  cameraAvailable: boolean;
  /** Last point in time that can safely be credited before the camera signal is stale. */
  cameraAccrualCutoffTimestamp: number;
  stateExplanation: string;
  recentTransitions: StateTransitionLog[];
  activityEvents: ActivityEventLog[];
}

export type FocusEngineCallback = (output: FocusEngineOutput) => void;

/**
 * Presence is the sole timer gate:
 * - one or more faces detected in fresh camera frames => FOCUSED
 * - no face detected in fresh camera frames => AWAY
 * - camera unavailable/stale => UNVERIFIED
 *
 * No gaze, posture, head-pose, desk, app, keyboard, mouse, speaking or
 * study-mode signal participates in this decision.
 */
export class FocusEngine {
  private currentState: FocusState = 'IDLE';
  private sessionActive = false;
  private completed = false;
  private manualPauseRequested = false;
  private breakActive = false;
  private lastVision: VisionData | null = null;

  private candidatePresence: boolean | null = null;
  private consecutiveFrames = 0;
  private confirmedPresence: boolean | null = null;

  private callbacks = new Set<FocusEngineCallback>();
  private transitions: StateTransitionLog[] = [];
  private lastEvaluationOutput: FocusEngineOutput | null = null;

  beginSession(): void {
    this.sessionActive = true;
    this.completed = false;
    this.manualPauseRequested = false;
    this.breakActive = false;
    this.candidatePresence = null;
    this.consecutiveFrames = 0;
    this.confirmedPresence = null;
    this.currentState = 'UNVERIFIED';
    this.evaluate(true);
  }

  endSession(completed = false): void {
    this.sessionActive = false;
    this.completed = completed;
    this.manualPauseRequested = false;
    this.breakActive = false;
    this.candidatePresence = null;
    this.consecutiveFrames = 0;
    this.confirmedPresence = null;
    this.currentState = completed ? 'COMPLETED' : 'IDLE';
    this.evaluate(true);
  }

  pauseManually(): void {
    if (!this.sessionActive || this.completed) return;
    this.manualPauseRequested = true;
    this.breakActive = false;
    this.evaluate(true);
  }

  resumeManually(): void {
    if (!this.sessionActive || this.completed) return;
    this.manualPauseRequested = false;
    this.evaluate(true);
  }

  startBreak(): void {
    if (!this.sessionActive || this.completed) return;
    this.manualPauseRequested = false;
    this.breakActive = true;
    this.evaluate(true);
  }

  endBreak(): void {
    if (!this.sessionActive || this.completed) return;
    this.breakActive = false;
    this.evaluate(true);
  }

  updateVision(data: VisionData): void {
    const timestamp = Number(data.timestamp) || 0;

    // Ignore out-of-order frames; a late async detector result must never
    // overwrite a newer camera observation.
    if (this.lastVision && timestamp < this.lastVision.timestamp) return;

    this.lastVision = data;

    if (data.cameraHealthy !== true || timestamp <= 0) {
      this.resetPresenceStability();
      this.evaluate();
      return;
    }

    const detected = Boolean(data.facePresent);
    if (detected === this.candidatePresence) {
      this.consecutiveFrames += 1;
    } else {
      this.candidatePresence = detected;
      this.consecutiveFrames = 1;
    }

    if (this.consecutiveFrames >= REQUIRED_STABLE_FRAMES) {
      this.confirmedPresence = detected;
    }

    this.evaluate();
  }

  refresh(): void {
    this.evaluate();
  }

  subscribe(callback: FocusEngineCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  getState(): FocusState {
    return this.currentState;
  }

  getCurrentOutput(): FocusEngineOutput {
    if (!this.lastEvaluationOutput) this.evaluate(true);
    return this.lastEvaluationOutput!;
  }

  getTransitionLogs(): StateTransitionLog[] {
    return this.transitions.slice(-100);
  }

  // Retained for existing AI Focus analytics interfaces; presence-only
  // sessions intentionally do not generate activity classifications.
  getActivityEvents(): ActivityEventLog[] {
    return [];
  }

  private resetPresenceStability(): void {
    this.candidatePresence = null;
    this.consecutiveFrames = 0;
    this.confirmedPresence = null;
  }

  private evaluate(forceEmit = false): void {
    const now = Date.now();
    const lastFrameTimestamp = this.lastVision?.timestamp || 0;
    const frameAge = lastFrameTimestamp > 0
      ? Math.max(0, now - lastFrameTimestamp)
      : Number.POSITIVE_INFINITY;
    const cameraAvailable =
      this.lastVision?.cameraHealthy === true &&
      frameAge <= CAMERA_STALE_AFTER_MS;

    if (this.sessionActive && !cameraAvailable && this.confirmedPresence !== null) {
      // A camera pause breaks frame continuity. Require two fresh frames
      // before resuming after the camera signal returns.
      this.resetPresenceStability();
    }

    const isPersonPresent = cameraAvailable && this.confirmedPresence === true;
    const hasConfirmedAbsence = cameraAvailable && this.confirmedPresence === false;

    let nextState: FocusState;
    let stateExplanation: string;
    let personPresenceState: PersonPresenceState;

    if (!this.sessionActive) {
      nextState = this.completed ? 'COMPLETED' : 'IDLE';
      stateExplanation = this.completed
        ? 'SESSION COMPLETED — Target study time reached.'
        : 'READY — Start a session to activate webcam presence detection.';
      personPresenceState = 'VISION_UNCERTAIN';
    } else if (this.manualPauseRequested) {
      nextState = 'PAUSED';
      stateExplanation = 'MANUALLY PAUSED — Resume to continue presence-based timing.';
      personPresenceState = cameraAvailable
        ? (isPersonPresent ? 'PERSON_PRESENT' : 'PERSON_ABSENT')
        : 'VISION_UNCERTAIN';
    } else if (this.breakActive) {
      nextState = 'BREAK';
      stateExplanation = 'BREAK — Countdown is held. End break to resume presence-based timing.';
      personPresenceState = cameraAvailable
        ? (isPersonPresent ? 'PERSON_PRESENT' : 'PERSON_ABSENT')
        : 'VISION_UNCERTAIN';
    } else if (!cameraAvailable) {
      nextState = 'UNVERIFIED';
      stateExplanation = !this.lastVision
        ? 'WAITING FOR FIRST CAMERA FRAME — Timer paused.'
        : this.lastVision.cameraHealthy !== true
          ? 'CAMERA UNAVAILABLE — Timer paused. Reconnect the webcam to continue.'
          : 'CAMERA SIGNAL LOST — Timer paused. Reconnect the webcam to continue.';
      personPresenceState = 'VISION_UNCERTAIN';
    } else if (isPersonPresent) {
      nextState = 'FOCUSED';
      stateExplanation = 'PRESENT — TIMER RUNNING.';
      personPresenceState = 'PERSON_PRESENT';
    } else {
      nextState = 'AWAY';
      stateExplanation = hasConfirmedAbsence
        ? 'ABSENT — TIMER PAUSED. Return in front of the webcam to resume.'
        : 'WAITING FOR PERSON DETECTION — Timer paused.';
      personPresenceState = 'PERSON_ABSENT';
    }

    const previousOutput = this.lastEvaluationOutput;
    const stateChanged = nextState !== this.currentState;
    const cameraOrPresenceChanged =
      !previousOutput ||
      previousOutput.cameraAvailable !== cameraAvailable ||
      previousOutput.facePresent !== isPersonPresent ||
      previousOutput.personPresenceState !== personPresenceState;

    if (stateChanged) {
      const previous = this.currentState;
      this.currentState = nextState;
      this.transitions.push({
        id: `presence_${now}_${this.transitions.length}`,
        timestamp: now,
        oldState: previous,
        newState: nextState,
        focusScore: isPersonPresent ? 100 : 0,
        reason: stateExplanation,
      });
      if (this.transitions.length > 100) this.transitions.shift();
    }

    const output: FocusEngineOutput = {
      state: this.currentState,
      facePresent: isPersonPresent,
      personPresenceState,
      cameraAvailable,
      cameraAccrualCutoffTimestamp:
        this.lastVision?.cameraHealthy === true
          ? lastFrameTimestamp + CAMERA_STALE_AFTER_MS
          : (lastFrameTimestamp || now),
      stateExplanation,
      recentTransitions: this.getTransitionLogs().slice(-10),
      activityEvents: [],
    };

    this.lastEvaluationOutput = output;
    if (forceEmit || stateChanged || cameraOrPresenceChanged) {
      this.callbacks.forEach((callback) => {
        try {
          callback(output);
        } catch (error) {
          console.error('[AI Focus] Presence listener failed:', error);
        }
      });
    }
  }
}

export const focusEngine = new FocusEngine();
