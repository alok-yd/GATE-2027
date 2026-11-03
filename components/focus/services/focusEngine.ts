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
  score: number;
  rawScore: number;
  facePresent: boolean;
  personPresenceState: PersonPresenceState;
  cameraAvailable: boolean;
  /** Last point in time that can safely be credited before the camera signal is stale. */
  cameraAccrualCutoffTimestamp: number;
  stateExplanation: string;
  telemetry: {
    headPitch: number;
    headYaw: number;
    headRoll: number;
    gazeScore: number;
    handActivity: boolean;
    bodyPostureStable: boolean;
    keyboardActive: boolean;
    mouseActive: boolean;
    idleSeconds: number;
    studyMedium: 'Screen Study' | 'Paper / PYQ Study' | 'Mixed Study';
    faceCount?: number;
    personPresenceState: PersonPresenceState;
    visionQualityScore: number;
    isPersonPresent: boolean;
  };
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
    this.candidatePresence = null;
    this.consecutiveFrames = 0;
    this.confirmedPresence = null;
    this.currentState = 'UNVERIFIED';
    this.evaluate(true);
  }

  endSession(completed = false): void {
    this.sessionActive = false;
    this.completed = completed;
    this.candidatePresence = null;
    this.consecutiveFrames = 0;
    this.confirmedPresence = null;
    this.currentState = completed ? 'COMPLETED' : 'IDLE';
    this.evaluate(true);
  }

  updateVision(data: VisionData): void {
    const timestamp = Number(data.timestamp) || 0;

    // Ignore out-of-order frames; a late async detector result must never
    // overwrite a newer camera observation.
    if (this.lastVision && timestamp < this.lastVision.timestamp) return;

    this.lastVision = data;

    if (data.cameraHealthy !== true || data.isSimulated === true || timestamp <= 0) {
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
      this.lastVision?.isSimulated !== true &&
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

    const quality = cameraAvailable ? 1 : 0;
    const output: FocusEngineOutput = {
      state: this.currentState,
      score: isPersonPresent ? 100 : 0,
      rawScore: isPersonPresent ? 100 : 0,
      facePresent: isPersonPresent,
      personPresenceState,
      cameraAvailable,
      cameraAccrualCutoffTimestamp:
        this.lastVision?.cameraHealthy === true && this.lastVision?.isSimulated !== true
          ? lastFrameTimestamp + CAMERA_STALE_AFTER_MS
          : (lastFrameTimestamp || now),
      stateExplanation,
      telemetry: {
        headPitch: 0,
        headYaw: 0,
        headRoll: 0,
        gazeScore: 0,
        handActivity: false,
        bodyPostureStable: false,
        keyboardActive: false,
        mouseActive: false,
        idleSeconds: 0,
        studyMedium: 'Screen Study',
        personPresenceState,
        visionQualityScore: quality,
        isPersonPresent,
      },
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
