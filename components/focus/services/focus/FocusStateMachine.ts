import { FocusEngineSettings, FocusState, StudyMedium } from '../../types';
import { ActivityRecognitionResult } from './ActivityRecognizer';
import { EvidenceFusionResult } from './EvidenceFusionEngine';
import { FaceAnalysisResult } from './analyzers/FaceAnalyzer';
import { PoseAnalysisResult } from './analyzers/PoseAnalyzer';
import { HandAnalysisResult } from './analyzers/HandAnalyzer';
import { PhoneAnalysisResult } from './analyzers/PhoneAnalyzer';
import { ConversationAnalysisResult } from './analyzers/ConversationAnalyzer';
import { SleepAnalysisResult } from './analyzers/SleepAnalyzer';
import { ComputerActivityAnalysisResult } from './analyzers/ComputerActivityAnalyzer';
import { ContextMemory } from './ContextMemory';
import { TemporalEngine } from './TemporalEngine';
import { PersonPresenceResult } from './PersonPresenceEngine';

export interface StateMachineEvaluation {
  nextState: FocusState;
  stateExplanation: string;
  distractionReason?: string;
  isGracePeriodActive: boolean;
  graceSecondsRemaining: number;
  returnConfirmationRemaining: number;
  hasStateChanged: boolean;
}

export class FocusStateMachine {
  private uncertaintyStartTimestamp: number | null = null;

  evaluate(
    currentState: FocusState,
    activity: ActivityRecognitionResult,
    evidence: EvidenceFusionResult,
    face: FaceAnalysisResult,
    pose: PoseAnalysisResult,
    _hand: HandAnalysisResult,
    phone: PhoneAnalysisResult,
    conv: ConversationAnalysisResult,
    sleep: SleepAnalysisResult,
    _comp: ComputerActivityAnalysisResult,
    temporal: TemporalEngine,
    context: ContextMemory,
    settings: FocusEngineSettings,
    medium: StudyMedium,
    now: number = Date.now(),
    presence?: PersonPresenceResult
  ): StateMachineEvaluation {
    // 1. Inactive / Special States
    if (
      currentState === 'IDLE' ||
      currentState === 'BREAK' ||
      currentState === 'COMPLETED' ||
      currentState === 'UNVERIFIED'
    ) {
      return {
        nextState: currentState,
        stateExplanation: `Session is currently in ${currentState} state.`,
        isGracePeriodActive: false,
        graceSecondsRemaining: 0,
        returnConfirmationRemaining: 0,
        hasStateChanged: false
      };
    }

    const smoothedScore = temporal.getSmoothedScore();
    const {
      focusThreshold,
      warningThreshold,
      distractionGraceSeconds,
      returnConfirmationSeconds,
      awayThresholdSeconds
    } = settings;

    let nextState = currentState;
    let isGraceActive = false;
    let graceSecondsRemaining = 0;
    let returnSecondsRemaining = 0;
    let stateExplanation = evidence.primaryStudyEvidence;
    let distractionReason: string | undefined;

    // 2. Person Presence & Absence / AWAY Check
    // When person presence engine determines absence, transition immediately to AWAY
    const isPersonPresent = presence ? presence.isPersonPresent : (face.facePresent && pose.bodyPresence);
    const isAbsenceConfirmed = presence ? presence.state === 'PERSON_ABSENT' : !isPersonPresent;

    if (!isPersonPresent) {
      this.uncertaintyStartTimestamp = null;
      // If PersonPresenceEngine has confirmed absence or awayTiming confirmed:
      const awayTiming = temporal.handleAwayTiming(false, now, 2); // 2s max grace
      
      if (isAbsenceConfirmed || awayTiming.isConfirmedAway) {
        nextState = 'AWAY';
        distractionReason = presence?.explanation || 'No subject detected at workstation';
        stateExplanation = 'Workstation unoccupied. Verified timer paused.';
      } else {
        nextState = 'AWAY'; // Strictly AWAY when not present
        isGraceActive = false;
        distractionReason = 'Subject absent from workstation';
        stateExplanation = 'Subject left workstation. Verified timer paused.';
      }

      return {
        nextState,
        stateExplanation,
        distractionReason,
        isGracePeriodActive: false,
        graceSecondsRemaining: 0,
        returnConfirmationRemaining: 0,
        hasStateChanged: nextState !== currentState
      };
    }

    // 3. Specific Threat Check: Smartphone In Active Use (Section 10-13)
    // Only pause when device is confirmed in active use (held in hand or near face)
    if (phone.deviceInUse || phone.isPersistentPhoneUse) {
      nextState = 'PHONE_USE';
      distractionReason = phone.reason || 'Smartphone in active use.';
      stateExplanation = 'Smartphone interaction active; study session paused.';
      return {
        nextState,
        stateExplanation,
        distractionReason,
        isGracePeriodActive: false,
        graceSecondsRemaining: 0,
        returnConfirmationRemaining: 0,
        hasStateChanged: nextState !== currentState
      };
    }

    // 4. Specific Threat Check: Conversation
    if (conv.isConfirmedConversation) {
      nextState = 'CONVERSATION';
      distractionReason = conv.reason || 'Conversation confirmed.';
      stateExplanation = 'Discussion with external individual detected; timer held.';
      return {
        nextState,
        stateExplanation,
        distractionReason,
        isGracePeriodActive: false,
        graceSecondsRemaining: 0,
        returnConfirmationRemaining: 0,
        hasStateChanged: nextState !== currentState
      };
    }

    // 5. Specific Threat Check: Sleep / Prolonged Rest
    if (sleep.isConfirmedSleepPause) {
      nextState = 'POSSIBLE_SLEEP';
      distractionReason = sleep.reason || 'Prolonged sleep or rest posture detected.';
      stateExplanation = 'Zero movement and closed eyes detected for extended period; timer paused.';
      return {
        nextState,
        stateExplanation,
        distractionReason,
        isGracePeriodActive: false,
        graceSecondsRemaining: 0,
        returnConfirmationRemaining: 0,
        hasStateChanged: nextState !== currentState
      };
    }

    // 6. Normal Study Activity Assignment (Prompt Section 16 & 59)
    let targetFocusedState: FocusState = 'FOCUSED_SCREEN';

    if (activity.primaryActivity === 'THINKING') {
      targetFocusedState = 'THINKING';
      stateExplanation = 'Quiet contemplation or mental calculation at study desk.';
    } else if (medium === 'Paper / PYQ Study' || pose.isLookingDown || pose.isPitchCompatibleWithPaper) {
      targetFocusedState = 'FOCUSED_PAPER';
      stateExplanation = phone.deviceStatus === 'DEVICE_PRESENT' 
        ? 'Notebook-oriented study (device on desk, not in use). Verified timer running.'
        : 'Notebook-oriented posture with verified desk presence.';
    } else if (medium === 'Mixed Study') {
      const isPaperOrientation = pose.isLookingDown || pose.isPitchCompatibleWithPaper || context.wasRecentlyInPaperFocus(60, now);
      targetFocusedState = isPaperOrientation ? 'FOCUSED_PAPER' : 'FOCUSED_SCREEN';
      stateExplanation = isPaperOrientation
        ? 'Notebook-oriented focus during mixed study session.'
        : 'Monitor-oriented focus during mixed study session.';
    } else {
      targetFocusedState = 'FOCUSED_SCREEN';
      stateExplanation = phone.deviceStatus === 'DEVICE_PRESENT'
        ? 'Direct screen study (device on desk, not in use). Verified timer running.'
        : 'Direct screen study concentration detected.';
    }

    // 7. Stable Study State Transition (Prompt Section 5: Focus score does NOT block timer)
    // As long as student is present and not using device, timer is allowed to run.
    const wasInterrupted =
      currentState === 'PAUSED' ||
      currentState === 'AWAY' ||
      currentState === 'PHONE_USE';

    if (wasInterrupted) {
      // Automatic Return Stabilization (Section 8)
      if (presence?.isReturnStabilizing) {
        returnSecondsRemaining = presence.returnStabilizationRemainingSeconds || 1.0;
        stateExplanation = `Confirming return to workstation (${returnSecondsRemaining}s)...`;
      } else {
        nextState = targetFocusedState;
        stateExplanation = 'Focus re-established and confirmed.';
      }
    } else {
      nextState = targetFocusedState;
    }

    return {
      nextState,
      stateExplanation,
      distractionReason,
      isGracePeriodActive: isGraceActive,
      graceSecondsRemaining,
      returnConfirmationRemaining: returnSecondsRemaining,
      hasStateChanged: nextState !== currentState
    };
  }
}

export const focusStateMachine = new FocusStateMachine();
