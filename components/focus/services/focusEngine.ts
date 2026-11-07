import {
  ActivityEventLog,
  FocusState,
  PersonPresenceState,
  StateTransitionLog,
  VisionData,
  StudyMedium,
} from '../types';

// Browser background-tab scheduling and on-device inference can briefly
// delay webcam analysis. Keep a wider freshness window before declaring the
// camera unusable; a real track disconnect still pauses immediately.
const CAMERA_STALE_AFTER_MS = 15_000;
const REQUIRED_PRESENT_FRAMES = 2;

// Face-only detectors can miss a face during blinking, movement, or when the
// student looks down at paper/PYQs. Confirm absence over a sustained interval,
// with a longer grace period for paper-based work (the student explicitly
// selected that study medium). This prevents normal note-taking from losing
// large blocks of verified time.
const REQUIRED_ABSENT_FRAMES = 6;
const SCREEN_ABSENCE_CONFIRMATION_MS = 20_000;
const MIXED_ABSENCE_CONFIRMATION_MS = 90_000;
const PAPER_ABSENCE_CONFIRMATION_MS = 5 * 60_000;
// At session start, allow the camera and face detector to stabilise. The
// selected study medium controls how long a missing face is treated as a
// temporary visibility dropout before the session is marked AWAY.
const INITIAL_ABSENCE_CONFIRMATION_FRAMES = 4;

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
 * Webcam presence is the timer gate:
 * - a confirmed face in fresh frames => FOCUSED
 * - brief face-detection dropouts remain FOCUSED within a study-medium grace window
 * - sustained absence after that window => AWAY
 * - camera unavailable/stale => UNVERIFIED
 *
 * Paper/PYQ and mixed study use longer face-visibility grace periods because
 * looking down at notes is normal. No gaze, app, keyboard, or mouse activity
 * is treated as proof of presence.
 */
export class FocusEngine {
  private currentState: FocusState = 'IDLE';
  private sessionActive = false;
  private completed = false;
  private manualPauseRequested = false;
  private breakActive = false;
  private lastVision: VisionData | null = null;
  private studyMedium: StudyMedium = 'Screen Study';

  private candidatePresence: boolean | null = null;
  private candidateSinceTimestamp = 0;
  private consecutiveFrames = 0;
  private confirmedPresence: boolean | null = null;

  private callbacks = new Set<FocusEngineCallback>();
  private transitions: StateTransitionLog[] = [];
  private lastEvaluationOutput: FocusEngineOutput | null = null;

  setStudyMedium(medium: StudyMedium): void {
    this.studyMedium = medium;
  }

  private getAbsenceConfirmationMs(): number {
    if (this.studyMedium === 'Paper / PYQ Study') return PAPER_ABSENCE_CONFIRMATION_MS;
    if (this.studyMedium === 'Mixed Study') return MIXED_ABSENCE_CONFIRMATION_MS;
    return SCREEN_ABSENCE_CONFIRMATION_MS;
  }

  beginSession(): void {
    this.sessionActive = true;
    this.completed = false;
    this.manualPauseRequested = false;
    this.breakActive = false;
    this.candidatePresence = null;
    this.candidateSinceTimestamp = 0;
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
    this.candidateSinceTimestamp = 0;
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
      this.candidateSinceTimestamp = timestamp;
      this.consecutiveFrames = 1;
    }

    if (detected) {
      // Confirm presence quickly, then require a sustained absence before
      // pausing. One or several dropped face detections must not make the UI
      // flicker between PRESENT and ABSENT.
      if (this.consecutiveFrames >= REQUIRED_PRESENT_FRAMES) {
        this.confirmedPresence = true;
      }
    } else if (this.confirmedPresence === true) {
      const absenceDuration = Math.max(0, timestamp - this.candidateSinceTimestamp);
      if (
        this.consecutiveFrames >= REQUIRED_ABSENT_FRAMES &&
        absenceDuration >= this.getAbsenceConfirmationMs()
      ) {
        this.confirmedPresence = false;
      }
    } else {
      const initialAbsenceDuration = Math.max(0, timestamp - this.candidateSinceTimestamp);
      if (
        this.consecutiveFrames >= INITIAL_ABSENCE_CONFIRMATION_FRAMES &&
        initialAbsenceDuration >= this.getAbsenceConfirmationMs()
      ) {
        this.confirmedPresence = false;
      }
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
    this.candidateSinceTimestamp = 0;
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

    // The user explicitly starts a session after choosing a study medium.
    // During the initial face-detector warm-up, a healthy camera plus a
    // temporary no-face result is treated as probable presence for that
    // medium's grace window. Once absence is sustained, timing pauses.
    const initialPresenceGrace =
      cameraAvailable &&
      this.sessionActive &&
      this.confirmedPresence === null &&
      this.candidatePresence === false;
    const isPersonPresent =
      cameraAvailable && (this.confirmedPresence === true || initialPresenceGrace);
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
      personPresenceState = cameraAvailable && this.confirmedPresence !== null
        ? (isPersonPresent ? 'PERSON_PRESENT' : 'PERSON_ABSENT')
        : 'VISION_UNCERTAIN';
    } else if (this.breakActive) {
      nextState = 'BREAK';
      stateExplanation = 'BREAK — Countdown is held. End break to resume presence-based timing.';
      personPresenceState = cameraAvailable && this.confirmedPresence !== null
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
      stateExplanation = initialPresenceGrace
        ? 'PRESENCE GRACE — Camera is healthy; allowing temporary face-visibility loss during the selected study mode.'
        : 'PRESENT — TIMER RUNNING.';
      personPresenceState = initialPresenceGrace ? 'PERSON_PROBABLY_PRESENT' : 'PERSON_PRESENT';
    } else if (hasConfirmedAbsence) {
      nextState = 'AWAY';
      stateExplanation = 'ABSENT — TIMER PAUSED. Return in front of the webcam to resume.';
      personPresenceState = 'PERSON_ABSENT';
    } else {
      nextState = 'UNVERIFIED';
      stateExplanation = 'CHECKING PRESENCE — Waiting for a stable face signal. Timer paused.';
      personPresenceState = 'VISION_UNCERTAIN';
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
