import { DEFAULT_FOCUS_SETTINGS } from '../constants';
import {
  ActivityData,
  ActivityEventLog,
  ActivityType,
  FaceVisibilityCategory,
  FocusConfidenceVector,
  FocusEngineSettings,
  FocusState,
  FocusVerificationGateResult,
  isVerifiedFocusState,
  StateTransitionLog,
  StudyMedium,
  UserSettings,
  VisionData,
  DeviceStatus,
  DeviceInteractionEvidence,
  TimerGateState
} from '../types';
import { calibrationEngine } from './calibrationEngine';
import { FaceAnalyzer } from './focus/analyzers/FaceAnalyzer';
import { PoseAnalyzer } from './focus/analyzers/PoseAnalyzer';
import { HandAnalyzer } from './focus/analyzers/HandAnalyzer';
import { PhoneAnalyzer } from './focus/analyzers/PhoneAnalyzer';
import { ConversationAnalyzer } from './focus/analyzers/ConversationAnalyzer';
import { SleepAnalyzer } from './focus/analyzers/SleepAnalyzer';
import { ComputerActivityAnalyzer } from './focus/analyzers/ComputerActivityAnalyzer';
import { ActivityRecognizer, ActivityRecognitionResult } from './focus/ActivityRecognizer';
import { EvidenceFusionEngine, EvidenceFusionResult } from './focus/EvidenceFusionEngine';
import { ContextMemory } from './focus/ContextMemory';
import { TemporalEngine } from './focus/TemporalEngine';
import { FocusStateMachine } from './focus/FocusStateMachine';
import { signalValidator } from './focus/SignalValidator';
import { personPresenceEngine } from './focus/PersonPresenceEngine';
import { conflictResolver } from './focus/ConflictResolver';
import { PersonPresenceState, SignalConflictLog } from '../types';
import { focusSessionController, shouldTimerRun } from './FocusSessionController';

export interface FocusEngineOutput {
  state: FocusState;
  score: number;
  rawScore: number;
  facePresent: boolean;
  personPresenceState?: PersonPresenceState;
  deviceStatus?: DeviceStatus;
  deviceEvidence?: DeviceInteractionEvidence;
  timerGate?: TimerGateState;
  visionQualityScore?: number;
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
  telemetry?: {
    headPitch: number;
    headYaw: number;
    headRoll?: number;
    gazeScore: number;
    handActivity: boolean;
    bodyPostureStable: boolean;
    keyboardActive: boolean;
    mouseActive: boolean;
    idleSeconds: number;
    studyMedium: StudyMedium;
    lightingLevel?: string;
    faceCount?: number;
    primaryActivity?: ActivityType;
    phoneConfidence?: number;
    sleepConfidence?: number;
    conversationConfidence?: number;
    inStudyZone?: boolean;
    personPresenceState?: PersonPresenceState;
    visionQualityScore?: number;
    isPersonPresent?: boolean;
    signalConflicts?: SignalConflictLog[];
  };
  recentTransitions?: StateTransitionLog[];
  activityEvents?: ActivityEventLog[];
}

export type FocusEngineCallback = (output: FocusEngineOutput) => void;

export class FocusEngine {
  private settings: FocusEngineSettings;
  private currentState: FocusState = 'IDLE';

  // Modular Component Pipeline
  private faceAnalyzer = new FaceAnalyzer();
  private poseAnalyzer = new PoseAnalyzer();
  private handAnalyzer = new HandAnalyzer();
  private phoneAnalyzer = new PhoneAnalyzer();
  private conversationAnalyzer = new ConversationAnalyzer();
  private sleepAnalyzer = new SleepAnalyzer();
  private computerActivityAnalyzer = new ComputerActivityAnalyzer();
  private activityRecognizer = new ActivityRecognizer();
  private evidenceFusionEngine = new EvidenceFusionEngine();
  private contextMemory = new ContextMemory();
  private temporalEngine = new TemporalEngine();
  private focusStateMachine = new FocusStateMachine();

  // Cached last evaluation output
  private lastEvaluationOutput: FocusEngineOutput | null = null;

  // Last known raw sensory inputs — defaulted to unverified and absent
  private lastVision: VisionData = {
    facePresent: false,
    confidence: 0.0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    eyeOpen: false,
    gazeScore: 0.0,
    handActivity: false,
    bodyPostureStable: false,
    deskActivityScore: 0.0,
    isLookingDown: false,
    lightingLevel: 'normal',
    lightingScore: 0.5,
    faceCount: 0,
    cameraHealthy: false,
    cameraHealthConfidence: 0.0,
    isStale: true,
    timestamp: 0
  };

  private lastActivity: ActivityData = {
    keyboardActive: false,
    mouseActive: false,
    idleSeconds: 0,
    activeApp: 'Study Workspace',
    isWindowFocused: true,
    lastActivityTimestamp: Date.now()
  };

  private callbacks: Set<FocusEngineCallback> = new Set();
  private watchdogInterval: any = null;

  constructor(settings: FocusEngineSettings = DEFAULT_FOCUS_SETTINGS) {
    this.settings = settings;
    // Start watchdog to catch frozen or stalled camera streams
    if (typeof window !== 'undefined') {
      this.watchdogInterval = setInterval(() => {
        const now = Date.now();
        if (this.lastVision.timestamp > 0 && (now - this.lastVision.timestamp > 2500)) {
          if (!this.lastVision.isStale) {
            this.lastVision.isStale = true;
            this.lastVision.cameraHealthy = false;
            this.evaluate();
          }
        }
      }, 1000);
    }
  }

  getVerificationStatus(): import('../types').FocusVerificationGateResult {
    const out = this.getCurrentOutput();
    const isPresent = out.facePresent && out.personPresenceState !== 'PERSON_ABSENT';
    const isCamHealthy = !this.lastVision.isStale && this.lastVision.cameraHealthy !== false;
    return isVerifiedFocus(this.currentState, out, isCamHealthy, isPresent);
  }

  getStudyMedium(): StudyMedium {
    return this.settings.studyMedium || 'Screen Study';
  }

  setStudyMedium(medium: StudyMedium): void {
    this.settings.studyMedium = medium;
    this.evaluate();
  }

  updateSettings(newSettings: FocusEngineSettings | UserSettings): void {
    if ('focusSettings' in newSettings) {
      this.settings = {
        ...newSettings.focusSettings,
        studyMedium: newSettings.studyMedium ?? newSettings.focusSettings.studyMedium,
        focusThreshold: newSettings.focusThreshold ?? newSettings.focusSettings.focusThreshold,
        warningThreshold: newSettings.warningThreshold ?? newSettings.focusSettings.warningThreshold,
        distractionGraceSeconds: newSettings.distractionGracePeriodSeconds ?? newSettings.focusSettings.distractionGraceSeconds,
        returnConfirmationSeconds: newSettings.returnConfirmationSeconds ?? newSettings.focusSettings.returnConfirmationSeconds,
        awayThresholdSeconds: newSettings.awayThresholdSeconds ?? newSettings.focusSettings.awayThresholdSeconds,
        paperHeadDownToleranceSeconds: newSettings.paperHeadDownToleranceSeconds ?? newSettings.focusSettings.paperHeadDownToleranceSeconds,
        studyApps: newSettings.studyApplications ?? newSettings.focusSettings.studyApps,
        distractingApps: newSettings.distractingApplications ?? newSettings.focusSettings.distractingApps
      };
    } else {
      this.settings = newSettings;
    }
    if (this.lastVision.timestamp > 0) {
      this.evaluate();
    }
  }

  getTransitionLogs(): StateTransitionLog[] {
    return this.contextMemory.getTransitionLogs();
  }

  getActivityEvents(): ActivityEventLog[] {
    return this.contextMemory.getActivityEvents();
  }

  getCurrentOutput(): FocusEngineOutput {
    if (this.lastEvaluationOutput) {
      return this.lastEvaluationOutput;
    }
    if (this.lastVision.timestamp > 0) {
      this.evaluate();
      if (this.lastEvaluationOutput) return this.lastEvaluationOutput;
    }
    return {
      state: this.currentState,
      score: 85,
      rawScore: 85,
      facePresent: false,
      personPresenceState: 'PERSON_ABSENT',
      visionQualityScore: 0,
      activity: 'UNKNOWN',
      confidenceVector: {
        paperStudyConfidence: 0,
        screenStudyConfidence: 0,
        thinkingConfidence: 0,
        phoneConfidence: 0,
        conversationConfidence: 0,
        sleepConfidence: 0,
        awayConfidence: 1,
        overallFocusConfidence: 0
      },
      faceVisibility: 'LOW_VISIBILITY',
      distractionReason: undefined,
      stateExplanation: 'Waiting for camera initialization...',
      isGracePeriodActive: false,
      graceSecondsRemaining: 0,
      returnConfirmationRemaining: 0,
      signalBreakdown: { faceScore: 0, headPoseScore: 0, eyeGazeScore: 0, activityScore: 0, appContextScore: 0 },
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
        studyMedium: this.settings.studyMedium || 'Screen Study',
        lightingLevel: 'normal',
        faceCount: 0,
        primaryActivity: 'UNKNOWN',
        phoneConfidence: 0,
        sleepConfidence: 0,
        conversationConfidence: 0,
        inStudyZone: false,
        personPresenceState: 'PERSON_ABSENT',
        visionQualityScore: 0,
        isPersonPresent: false,
        signalConflicts: []
      },
      recentTransitions: [],
      activityEvents: []
    };
  }

  updateVision(data: VisionData): void {
    this.lastVision = data;
    this.evaluate();
  }

  updateActivity(data: ActivityData): void {
    this.lastActivity = data;
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
    const now = this.lastVision.timestamp || Date.now();
    if (this.currentState !== newState) {
      this.contextMemory.recordTransition(
        this.currentState,
        newState,
        this.temporalEngine.getSmoothedScore(),
        customReason || 'Manual state change',
        undefined,
        undefined,
        now
      );
    }
    this.currentState = newState;
    this.contextMemory.recordState(newState, now);

    if (newState === 'BREAK' || newState === 'IDLE' || newState === 'COMPLETED' || newState === 'UNVERIFIED') {
      this.temporalEngine.resetAllTimers();
    }
    if (this.lastVision.timestamp > 0) {
      this.evaluate();
    }
  }

  reset(): void {
    this.currentState = 'IDLE';
    this.temporalEngine.resetAllTimers();
    this.contextMemory.reset();
    this.faceAnalyzer = new FaceAnalyzer();
    this.poseAnalyzer = new PoseAnalyzer();
    this.handAnalyzer = new HandAnalyzer();
    this.phoneAnalyzer = new PhoneAnalyzer();
    this.conversationAnalyzer = new ConversationAnalyzer();
    this.sleepAnalyzer = new SleepAnalyzer();
    this.computerActivityAnalyzer = new ComputerActivityAnalyzer();
    this.activityRecognizer = new ActivityRecognizer();
    this.evidenceFusionEngine = new EvidenceFusionEngine();
    this.focusStateMachine = new FocusStateMachine();
    this.lastEvaluationOutput = null;
    this.lastVision = {
      facePresent: false,
      confidence: 0.0,
      headYaw: 0,
      headPitch: 0,
      headRoll: 0,
      eyeOpen: false,
      gazeScore: 0.0,
      handActivity: false,
      bodyPostureStable: false,
      deskActivityScore: 0.0,
      isLookingDown: false,
      lightingLevel: 'normal',
      lightingScore: 0.5,
      faceCount: 0,
      cameraHealthy: false,
      cameraHealthConfidence: 0.0,
      isStale: true,
      timestamp: 0
    };
  }

  private evaluate(): void {
    if (this.lastVision.timestamp === 0) {
      return;
    }
    const now = this.lastVision.timestamp || Date.now();
    const profile = calibrationEngine.getProfile();
    const medium = this.settings.studyMedium || 'Screen Study';

    // 0. Signal Validation & Person Presence Engine
    const validation = signalValidator.validate(this.lastVision);
    const presence = personPresenceEngine.evaluate(this.lastVision, validation, now);

    // 1. Modular Analyzers Execution
    const face = this.faceAnalyzer.analyze(this.lastVision, profile);
    const pose = this.poseAnalyzer.analyze(this.lastVision, profile, face);
    const hand = this.handAnalyzer.analyze(this.lastVision, profile, pose);
    const phone = this.phoneAnalyzer.analyze(this.lastVision, profile, pose, hand, this.lastActivity);
    const conv = this.conversationAnalyzer.analyze(this.lastVision, profile, pose, face);
    const sleep = this.sleepAnalyzer.analyze(this.lastVision, profile, face, pose, hand, this.lastActivity);
    const comp = this.computerActivityAnalyzer.analyze(this.lastActivity, this.settings, medium);

    // 2. Activity Recognition Layer
    const recentActivity = this.contextMemory.getRecentActivity();
    const activity: ActivityRecognitionResult = this.activityRecognizer.recognize(
      face,
      pose,
      hand,
      phone,
      conv,
      sleep,
      comp,
      medium,
      recentActivity
    );
    this.contextMemory.recordActivity(activity.primaryActivity, now);

    // 3. Evidence Fusion & Focus Confidence Vector
    const evidence: EvidenceFusionResult = this.evidenceFusionEngine.fuse(
      face,
      pose,
      hand,
      phone,
      conv,
      sleep,
      comp,
      activity,
      this.settings,
      medium,
      presence,
      validation
    );

    // 4. Temporal Reasoning & Smoothing
    this.temporalEngine.recordObservation({
      timestamp: now,
      focusScore: evidence.totalFocusScore,
      activity: activity.primaryActivity,
      confidenceVector: evidence.confidenceVector,
      facePresent: presence.isPersonPresent,
      faceVisibility: face.visibilityCategory,
      headYaw: pose.headYaw,
      headPitch: pose.headPitch,
      gazeScore: face.gazeScore,
      handActivity: hand.handActivity,
      bodyPostureStable: pose.isSeatedPostureStable,
      phoneScore: phone.phoneConfidence,
      conversationScore: conv.conversationConfidence,
      sleepScore: sleep.sleepConfidence,
      keyboardActive: comp.keyboardActive,
      mouseActive: comp.mouseActive,
      idleSeconds: comp.idleSeconds,
      activeApp: comp.activeApp
    });

    const smoothedScore = this.temporalEngine.getSmoothedScore();

    // 5. Hierarchical Focus State Machine
    const smResult = this.focusStateMachine.evaluate(
      this.currentState,
      activity,
      evidence,
      face,
      pose,
      hand,
      phone,
      conv,
      sleep,
      comp,
      this.temporalEngine,
      this.contextMemory,
      this.settings,
      medium,
      now,
      presence
    );

    if (smResult.hasStateChanged) {
      this.contextMemory.recordTransition(
        this.currentState,
        smResult.nextState,
        smoothedScore,
        smResult.distractionReason || smResult.stateExplanation,
        activity.primaryActivity,
        evidence.confidenceVector,
        now
      );
      this.currentState = smResult.nextState;
      this.contextMemory.recordState(this.currentState, now);
    }

    // 6. Feed Authoritative Session Controller
    const deviceStatus: DeviceStatus = phone.deviceStatus || (phone.isPersistentPhoneUse ? 'DEVICE_IN_USE' : (phone.phoneConfidence > 0.4 ? 'DEVICE_PRESENT' : 'NOT_DETECTED'));
    const deviceInUse: boolean = phone.deviceInUse ?? (deviceStatus === 'DEVICE_IN_USE');
    const cameraHealthy = validation.visionQuality.isAcceptable;

    focusSessionController.updatePerceptionState({
      studentPresent: presence.isPersonPresent,
      presenceConfidence: presence.confidence,
      deviceStatus,
      deviceInUse,
      deviceInteractionEvidence: phone.evidence,
      cameraHealthy,
      inferenceFps: this.lastVision.inferenceFps || 15
    });

    const currentGate = focusSessionController.getState().gate;

    // 7. Build Output
    this.lastEvaluationOutput = {
      state: this.currentState,
      score: smoothedScore,
      rawScore: evidence.totalFocusScore,
      facePresent: presence.isPersonPresent,
      personPresenceState: presence.state,
      deviceStatus,
      deviceEvidence: phone.evidence,
      timerGate: currentGate,
      visionQualityScore: validation.visionQuality.value,
      activity: activity.primaryActivity,
      confidenceVector: evidence.confidenceVector,
      faceVisibility: face.visibilityCategory,
      distractionReason: smResult.distractionReason,
      stateExplanation: smResult.stateExplanation,
      isGracePeriodActive: smResult.isGracePeriodActive,
      graceSecondsRemaining: smResult.graceSecondsRemaining,
      returnConfirmationRemaining: smResult.returnConfirmationRemaining,
      signalBreakdown: evidence.signalScores,
      telemetry: {
        headPitch: pose.headPitch,
        headYaw: pose.headYaw,
        headRoll: pose.headRoll,
        gazeScore: face.gazeScore,
        handActivity: hand.handActivity,
        bodyPostureStable: pose.isSeatedPostureStable,
        keyboardActive: comp.keyboardActive,
        mouseActive: comp.mouseActive,
        idleSeconds: comp.idleSeconds,
        studyMedium: medium,
        lightingLevel: face.lightingLevel,
        faceCount: face.faceCount,
        primaryActivity: activity.primaryActivity,
        phoneConfidence: phone.phoneConfidence,
        sleepConfidence: sleep.sleepConfidence,
        conversationConfidence: conv.conversationConfidence,
        inStudyZone: pose.inStudyZone,
        personPresenceState: presence.state,
        visionQualityScore: validation.visionQuality.value,
        isPersonPresent: presence.isPersonPresent,
        signalConflicts: conflictResolver.getConflictHistory()
      },
      recentTransitions: this.contextMemory.getTransitionLogs().slice(-10),
      activityEvents: this.contextMemory.getActivityEvents().slice(-10)
    };

    // 8. Dispatch to listeners
    this.callbacks.forEach(cb => cb(this.lastEvaluationOutput!));
  }
}

export const focusEngine = new FocusEngine();

/**
 * Authoritative Focus Verification Check (Rules 1-5, Section 17 & 58)
 * Timer pauses ONLY when:
 * 1. Student is absent / away.
 * 2. Device is actively IN USE (in hand / near face).
 * 3. Manual pause.
 * 4. Camera / monitoring error.
 * 
 * Phone on desk, looking down at paper PYQs, thinking, no keyboard, low focus score
 * NEVER independently pause the timer.
 */
export function isVerifiedFocus(
  state: FocusState,
  output?: FocusEngineOutput | null,
  cameraHealthy?: boolean,
  isPersonPresent?: boolean
): FocusVerificationGateResult {
  const camOk = cameraHealthy ?? (output?.visionQualityScore !== undefined ? output.visionQualityScore >= 0.25 : true);
  const present = isPersonPresent ?? (output?.facePresent ?? (output?.personPresenceState !== 'ABSENT'));
  const isDeviceInUse = output?.timerGate?.deviceInUse ?? (output?.deviceStatus === 'DEVICE_IN_USE' || state === 'PHONE_USE');
  const isDeviceOnDesk = output?.deviceStatus === 'DEVICE_PRESENT';
  const manualPause = state === 'PAUSED';

  const allowed = shouldTimerRun({
    manualPause,
    monitoringHealthy: camOk,
    studentPresent: present,
    deviceInUse: isDeviceInUse
  });

  if (!camOk || state === 'UNVERIFIED') {
    return {
      verified: false,
      state: 'PAUSED_CAMERA_ERROR',
      reason: 'Camera unverified, blocked, or stream frozen',
      confidence: 0.0,
      personPresent: present,
      cameraHealthy: false,
      phoneDetected: isDeviceInUse || isDeviceOnDesk,
      studyEvidence: false,
      studyMedium: output?.telemetry?.studyMedium || 'Screen Study'
    };
  }

  if (state === 'AWAY' || !present) {
    return {
      verified: false,
      state: 'PAUSED_ABSENT',
      reason: 'Student is away from desk',
      confidence: 0.0,
      personPresent: false,
      cameraHealthy: camOk,
      phoneDetected: isDeviceInUse || isDeviceOnDesk,
      studyEvidence: false,
      studyMedium: output?.telemetry?.studyMedium || 'Screen Study'
    };
  }

  if (isDeviceInUse) {
    return {
      verified: false,
      state: 'PAUSED_PHONE',
      reason: 'Smartphone actively in use (in hand or near face)',
      confidence: 0.0,
      personPresent: present,
      cameraHealthy: true,
      phoneDetected: true,
      studyEvidence: false,
      studyMedium: output?.telemetry?.studyMedium || 'Screen Study'
    };
  }

  if (manualPause) {
    return {
      verified: false,
      state: 'PAUSED_MANUAL',
      reason: 'Session paused manually',
      confidence: 0.0,
      personPresent: present,
      cameraHealthy: true,
      phoneDetected: isDeviceOnDesk,
      studyEvidence: false,
      studyMedium: output?.telemetry?.studyMedium || 'Screen Study'
    };
  }

  // If student is present, device is not in use, and camera is healthy:
  // Timer runs with verified focus! Phone on desk, paper notes, thinking, or low score will NOT pause.
  return {
    verified: allowed,
    state: allowed ? 'VERIFIED' : 'PAUSED_UNCERTAIN',
    reason: isDeviceOnDesk 
      ? 'Device present on desk (inactive) — Verified study active' 
      : (output?.stateExplanation || 'Verified study active'),
    confidence: Math.max(0.75, (output?.score ?? 85) / 100),
    personPresent: true,
    cameraHealthy: true,
    phoneDetected: isDeviceOnDesk,
    studyEvidence: true,
    studyMedium: output?.telemetry?.studyMedium || 'Screen Study'
  };
}


