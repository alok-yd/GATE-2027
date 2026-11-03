import {
  ActivityData,
  ActivityEventLog,
  ActivityType,
  FaceVisibilityCategory,
  FocusConfidenceVector,
  FocusEngineSettings,
  FocusState,
  PersonPresenceState,
  StateTransitionLog,
  StudyMedium,
  UserSettings,
  VisionData,
} from '../types';
import { DEFAULT_FOCUS_SETTINGS } from '../constants';

export interface FocusEngineOutput {
  state: FocusState;
  score: number;
  rawScore: number;
  facePresent: boolean;
  personPresenceState: PersonPresenceState;
  cameraAvailable: boolean;
  visionQualityScore: number;
  activity?: ActivityType;
  confidenceVector?: FocusConfidenceVector;
  faceVisibility?: FaceVisibilityCategory;
  distractionReason?: string;
  stateExplanation: string;
  isGracePeriodActive: boolean;
  graceSecondsRemaining: number;
  returnConfirmationRemaining: number;
  signalBreakdown: {
    faceScore: number;
    headPoseScore: number;
    eyeGazeScore: number;
    activityScore: number;
    appContextScore: number;
    deskActivityScore?: number;
    postureStableScore?: number;
    lightingScore?: number;
  };
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
    studyMedium: StudyMedium;
    faceCount?: number;
    primaryActivity?: ActivityType;
    personPresenceState: PersonPresenceState;
    visionQualityScore: number;
    isPersonPresent: boolean;
  };
  recentTransitions: StateTransitionLog[];
  activityEvents: ActivityEventLog[];
}

export type FocusEngineCallback = (output: FocusEngineOutput) => void;

const CAMERA_STALE_AFTER_MS = 8000;
const PRESENCE_HISTORY_LENGTH = 3;
const REQUIRED_PRESENT_FRAMES = 2;

const isFocusedState = (state: FocusState) =>
  state === 'FOCUSED' ||
  state === 'FOCUSED_SCREEN' ||
  state === 'FOCUSED_PAPER' ||
  state === 'FOCUSED_MIXED';

export class FocusEngine {
  private settings: FocusEngineSettings;
  private medium: StudyMedium;
  private currentState: FocusState = 'IDLE';
  private sessionActive = false;
  private manualPauseRequested = false;
  private breakActive = false;

  private lastVision: VisionData = {
    facePresent: false,
    confidence: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    eyeOpen: false,
    gazeScore: 0,
    handActivity: false,
    bodyPostureStable: false,
    deskActivityScore: 0,
    isLookingDown: false,
    cameraHealthy: false,
    isSimulated: false,
    timestamp: 0,
  };

  private presenceHistory: boolean[] = [];
  private callbacks = new Set<FocusEngineCallback>();
  private transitions: StateTransitionLog[] = [];
  private lastEvaluationOutput: FocusEngineOutput | null = null;

  constructor(settings: FocusEngineSettings = DEFAULT_FOCUS_SETTINGS) {
    this.settings = settings;
    this.medium = settings.studyMedium || 'Screen Study';
  }

  getStudyMedium(): StudyMedium {
    return this.medium;
  }

  setStudyMedium(medium: StudyMedium): void {
    this.medium = medium;
    this.evaluate();
  }

  updateSettings(newSettings: FocusEngineSettings | UserSettings): void {
    if ('focusSettings' in newSettings) {
      this.settings = newSettings.focusSettings;
      this.medium = newSettings.studyMedium || newSettings.focusSettings.studyMedium || this.medium;
    } else {
      this.settings = newSettings;
      this.medium = newSettings.studyMedium || this.medium;
    }
    this.evaluate();
  }

  beginSession(): void {
    this.sessionActive = true;
    this.manualPauseRequested = false;
    this.breakActive = false;
    this.presenceHistory = [];
    this.currentState = 'UNVERIFIED';
    this.evaluate(true);
  }

  endSession(completed = false): void {
    this.sessionActive = false;
    this.manualPauseRequested = false;
    this.breakActive = false;
    this.presenceHistory = [];
    this.currentState = completed ? 'COMPLETED' : 'IDLE';
    this.evaluate(true);
  }

  getTransitionLogs(): StateTransitionLog[] {
    return this.transitions.slice(-100);
  }

  // Kept as a compatibility method for the existing Analytics and AI Coach pages.
  // Presence-only focus sessions do not generate separate activity classifications.
  getActivityEvents(): ActivityEventLog[] {
    return [];
  }

  getCurrentOutput(): FocusEngineOutput {
    if (!this.lastEvaluationOutput) this.evaluate(true);
    return this.lastEvaluationOutput!;
  }

  updateVision(data: VisionData): void {
    this.lastVision = data;

    if (data.cameraHealthy !== true || data.isSimulated === true) {
      this.presenceHistory = [];
    } else {
      this.presenceHistory.push(Boolean(data.facePresent));
      if (this.presenceHistory.length > PRESENCE_HISTORY_LENGTH) {
        this.presenceHistory.shift();
      }
    }

    this.evaluate();
  }

  // Keyboard, mouse, browser-tab and active-window events are deliberately ignored.
  updateActivity(_data: ActivityData): void {
    // Presence-only rule: user activity is not a timer signal.
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

  setState(newState: FocusState, customReason?: string): void {
    if (customReason === 'Session initiated') {
      this.beginSession();
      return;
    }

    if (customReason === 'User paused session') {
      this.manualPauseRequested = true;
    } else if (
      customReason === 'User resumed session' ||
      newState === 'IDLE' ||
      newState === 'COMPLETED'
    ) {
      this.manualPauseRequested = false;
    }

    if (newState === 'BREAK') {
      this.breakActive = true;
    } else if (customReason === 'User resumed session' || newState === 'IDLE' || newState === 'COMPLETED') {
      this.breakActive = false;
    }

    if (newState === 'IDLE' || newState === 'COMPLETED') {
      this.sessionActive = false;
      this.presenceHistory = [];
      this.currentState = newState;
      this.evaluate(true);
      return;
    }

    if (newState === 'PAUSED') this.manualPauseRequested = true;
    if (newState === 'UNVERIFIED' && customReason === 'User continued without camera verification') {
      this.manualPauseRequested = false;
    }

    this.evaluate(true);
  }

  private evaluate(forceEmit = false): void {
    const now = Date.now();
    const frameAge = this.lastVision.timestamp > 0
      ? Math.max(0, now - this.lastVision.timestamp)
      : Number.POSITIVE_INFINITY;
    const cameraAvailable =
      this.lastVision.cameraHealthy === true &&
      this.lastVision.isSimulated !== true &&
      frameAge <= CAMERA_STALE_AFTER_MS;

    const recentPresenceCount = this.presenceHistory.filter(Boolean).length;
    const isPersonPresent =
      cameraAvailable &&
      this.presenceHistory.length >= 2 &&
      recentPresenceCount >= REQUIRED_PRESENT_FRAMES;

    let nextState = this.currentState;
    let stateExplanation = 'Start a session to activate webcam presence detection.';
    let personPresenceState: PersonPresenceState = 'VISION_UNCERTAIN';

    if (!this.sessionActive) {
      nextState = this.currentState === 'COMPLETED' ? 'COMPLETED' : 'IDLE';
      stateExplanation = this.currentState === 'COMPLETED'
        ? 'SESSION COMPLETED — Target study time reached.'
        : 'READY — Start a session to activate webcam presence detection.';
    } else if (this.manualPauseRequested) {
      nextState = 'PAUSED';
      stateExplanation = 'MANUALLY PAUSED — Countdown is held.';
      personPresenceState = cameraAvailable
        ? (isPersonPresent ? 'PERSON_PRESENT' : 'PERSON_ABSENT')
        : 'VISION_UNCERTAIN';
    } else if (this.breakActive) {
      nextState = 'BREAK';
      stateExplanation = 'BREAK — Countdown is held.';
      personPresenceState = cameraAvailable
        ? (isPersonPresent ? 'PERSON_PRESENT' : 'PERSON_ABSENT')
        : 'VISION_UNCERTAIN';
    } else if (!cameraAvailable) {
      nextState = 'UNVERIFIED';
      stateExplanation = 'CAMERA UNAVAILABLE — Timer paused. Reconnect the webcam to continue.';
      personPresenceState = 'VISION_UNCERTAIN';
    } else if (isPersonPresent) {
      nextState = this.medium === 'Paper / PYQ Study'
        ? 'FOCUSED_PAPER'
        : this.medium === 'Mixed Study'
          ? 'FOCUSED_MIXED'
          : 'FOCUSED_SCREEN';
      stateExplanation = 'PRESENT — TIMER RUNNING.';
      personPresenceState = 'PERSON_PRESENT';
    } else {
      nextState = 'AWAY';
      stateExplanation = 'ABSENT — TIMER PAUSED. Return in front of the webcam to resume.';
      personPresenceState = 'PERSON_ABSENT';
    }

    const cameraOrPresenceChanged =
      !this.lastEvaluationOutput ||
      this.lastEvaluationOutput.cameraAvailable !== cameraAvailable ||
      this.lastEvaluationOutput.facePresent !== isPersonPresent;

    const stateChanged = nextState !== this.currentState;
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

    const score = isPersonPresent && isFocusedState(nextState) ? 100 : 0;
    const activity: ActivityType = isPersonPresent ? 'SCREEN_READING' : 'AWAY';
    const output: FocusEngineOutput = {
      state: this.currentState,
      score,
      rawScore: score,
      facePresent: isPersonPresent,
      personPresenceState,
      cameraAvailable,
      visionQualityScore: cameraAvailable ? 1 : 0,
      activity,
      distractionReason: isPersonPresent ? undefined : stateExplanation,
      stateExplanation,
      isGracePeriodActive: false,
      graceSecondsRemaining: 0,
      returnConfirmationRemaining: 0,
      signalBreakdown: {
        faceScore: isPersonPresent ? 100 : 0,
        headPoseScore: 0,
        eyeGazeScore: 0,
        activityScore: 0,
        appContextScore: 0,
        deskActivityScore: 0,
        postureStableScore: 0,
        lightingScore: cameraAvailable ? 100 : 0,
      },
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
        studyMedium: this.medium,
        personPresenceState,
        visionQualityScore: cameraAvailable ? 1 : 0,
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
          console.error('[AI Focus] Focus listener failed:', error);
        }
      });
    }
  }
}

export const focusEngine = new FocusEngine();
