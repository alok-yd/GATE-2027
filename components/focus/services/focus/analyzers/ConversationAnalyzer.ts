import { CalibrationProfile, VisionData } from '../../../types';
import { PoseAnalysisResult } from './PoseAnalyzer';
import { FaceAnalysisResult } from './FaceAnalyzer';

export interface ConversationAnalysisResult {
  conversationConfidence: number;
  isPossibleConversation: boolean;
  isConversationWarning: boolean;
  isConfirmedConversation: boolean;
  conversationDurationSeconds: number;
  hasMultiplePeople: boolean;
  isReadingAloudOrSolo: boolean;
  reason?: string;
}

export class ConversationAnalyzer {
  private history: number[] = [];
  private conversationStartTime: number | null = null;

  analyze(
    vision: VisionData,
    profile: CalibrationProfile,
    pose: PoseAnalysisResult,
    face: FaceAnalysisResult
  ): ConversationAnalysisResult {
    const now = vision.timestamp || Date.now();
    const faceCount = face.faceCount ?? vision.faceCount ?? (vision.facePresent ? 1 : 0);
    const hasMultiplePeople = faceCount >= 2;
    const defaultGraceSeconds = profile.tolerances?.conversationGraceSeconds ?? 12;
    const graceSeconds = hasMultiplePeople ? 3 : defaultGraceSeconds;
    const warningGraceSeconds = hasMultiplePeople ? 1 : Math.max(4, Math.floor(graceSeconds / 2));
    const absYaw = Math.abs(pose.headYaw);
    const yawTolerance = profile.isCalibrated ? profile.tolerances.yawTolerance : 30;

    const rawMouthMovement = vision.mouthMovementScore ?? 0.0;
    const isMouthActive = rawMouthMovement > 0.4;

    // Distinguish solo reading aloud vs. conversation:
    // If student is facing desk/paper (pitch down) or monitor (yaw normal) with mouth moving,
    // this is normal study behavior (reading definitions aloud, thinking out loud).
    const isFacingWorkstation = pose.isLookingDown || absYaw <= yawTolerance;
    const isReadingAloudOrSolo = isMouthActive && isFacingWorkstation && !hasMultiplePeople;

    // Do not infer conversation from a single detected person, normal gaze,
    // quiet study, or an isolated head movement. In the current local vision
    // pipeline mouth movement is optional, so the dependable cues are a stable
    // second foreground face or clear speaking + sustained lateral orientation.
    const hasExternalSpeakingCue =
      !hasMultiplePeople &&
      isMouthActive &&
      absYaw > yawTolerance + 10;
    const hasConversationCue = hasMultiplePeople || hasExternalSpeakingCue;

    if (!hasConversationCue) {
      this.history = [];
      this.conversationStartTime = null;
      return {
        conversationConfidence: 0,
        isPossibleConversation: false,
        isConversationWarning: false,
        isConfirmedConversation: false,
        conversationDurationSeconds: 0,
        hasMultiplePeople: false,
        isReadingAloudOrSolo
      };
    }

    let instantScore = hasMultiplePeople
      ? (isMouthActive ? 0.90 : 0.65)
      : 0.75;

    this.history.push(instantScore);
    if (this.history.length > 10) this.history.shift();

    const conversationConfidence =
      this.history.reduce((a, b) => a + b, 0) / this.history.length;

    const isPossibleConversation = conversationConfidence >= 0.55 && !isReadingAloudOrSolo;

    let conversationDurationSeconds = 0;
    let isConversationWarning = false;
    let isConfirmedConversation = false;
    let reason: string | undefined;

    if (isPossibleConversation) {
      if (this.conversationStartTime === null) {
        this.conversationStartTime = now;
      }
      conversationDurationSeconds = Math.max(0, Math.floor((now - this.conversationStartTime) / 1000));

      const confirmationConfidence = hasMultiplePeople ? 0.60 : 0.70;
      if (conversationDurationSeconds >= graceSeconds && conversationConfidence >= confirmationConfidence) {
        isConfirmedConversation = true;
        reason = hasMultiplePeople
          ? `Conversation with second person confirmed (${conversationDurationSeconds}s)`
          : `External conversation confirmed (${conversationDurationSeconds}s)`;
      } else if (conversationDurationSeconds >= warningGraceSeconds) {
        isConversationWarning = true;
        reason = `Potential conversation in progress (${conversationDurationSeconds}s)`;
      }
    } else {
      if (conversationConfidence < 0.40) {
        this.conversationStartTime = null;
      }
    }

    return {
      conversationConfidence: Number(conversationConfidence.toFixed(2)),
      isPossibleConversation,
      isConversationWarning,
      isConfirmedConversation,
      conversationDurationSeconds,
      hasMultiplePeople,
      isReadingAloudOrSolo,
      reason
    };
  }

  reset(): void {
    this.history = [];
    this.conversationStartTime = null;
  }
}

export const conversationAnalyzer = new ConversationAnalyzer();
