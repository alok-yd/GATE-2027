import { FocusConfidenceVector, FocusEngineSettings, StudyMedium } from '../../types';
import { FaceAnalysisResult } from './analyzers/FaceAnalyzer';
import { PoseAnalysisResult } from './analyzers/PoseAnalyzer';
import { HandAnalysisResult } from './analyzers/HandAnalyzer';
import { PhoneAnalysisResult } from './analyzers/PhoneAnalyzer';
import { ConversationAnalysisResult } from './analyzers/ConversationAnalyzer';
import { SleepAnalysisResult } from './analyzers/SleepAnalyzer';
import { ComputerActivityAnalysisResult } from './analyzers/ComputerActivityAnalyzer';
import { ActivityRecognitionResult } from './ActivityRecognizer';
import { PersonPresenceResult } from './PersonPresenceEngine';
import { SignalValidationReport } from './SignalValidator';
import { conflictResolver } from './ConflictResolver';

export interface EvidenceFusionResult {
  confidenceVector: FocusConfidenceVector;
  totalFocusScore: number; // 0 to 100
  signalScores: {
    faceScore: number;
    headPoseScore: number;
    eyeGazeScore: number;
    activityScore: number;
    appContextScore: number;
    deskActivityScore: number;
    postureStableScore: number;
    lightingScore: number;
  };
  primaryStudyEvidence: string;
}

export class EvidenceFusionEngine {
  fuse(
    face: FaceAnalysisResult,
    pose: PoseAnalysisResult,
    hand: HandAnalysisResult,
    phone: PhoneAnalysisResult,
    conv: ConversationAnalysisResult,
    sleep: SleepAnalysisResult,
    comp: ComputerActivityAnalysisResult,
    activity: ActivityRecognitionResult,
    settings: FocusEngineSettings,
    medium: StudyMedium,
    presence?: PersonPresenceResult,
    validation?: SignalValidationReport
  ): EvidenceFusionResult {
    const isPersonPresent = presence ? presence.isPersonPresent : (face.facePresent || pose.bodyPresence);

    // 1. Calculate Individual Confidence Vector Components (0.0 to 1.0)
    
    // Screen study confidence:
    let screenConf = 0.0;
    if (isPersonPresent && pose.isYawWithinStudyTolerance && !pose.isLookingDown) {
      screenConf = (face.gazeScore * 0.5) + (comp.isStudyApp ? 0.35 : 0.2) + (comp.keyboardActive ? 0.15 : 0.1);
      if (comp.isDistractionApp) screenConf *= 0.2;
    }
    const screenStudyConfidence = Math.min(1.0, Math.max(0.0, screenConf));

    // Paper study confidence (SPECIFICITY: suppressed if phone is detected):
    let paperConf = 0.0;
    if (isPersonPresent && (pose.isLookingDown || pose.isPitchCompatibleWithPaper)) {
      if (phone.phoneConfidence >= 0.55) {
        paperConf = 0.10; // Phone interaction suppresses paper confidence
      } else {
        paperConf = 0.60;
        if (hand.isWritingBurst) paperConf += 0.35;
        else if (hand.handActivity) paperConf += 0.25;
        else if (hand.isThinkingPause) paperConf += 0.30;
        else paperConf += 0.20; // Reading paper
      }
    }
    const paperStudyConfidence = Math.min(1.0, Math.max(0.0, paperConf));

    // Thinking confidence:
    let thinkConf = 0.0;
    if (isPersonPresent && pose.isSeatedPostureStable && phone.phoneConfidence < 0.50) {
      if (hand.isThinkingPause) thinkConf = 0.92;
      else if (pose.isLookingDown && !comp.keyboardActive && !hand.isWritingBurst) thinkConf = 0.78;
      else if (pose.isYawWithinStudyTolerance && !comp.isDistractionApp) thinkConf = 0.65;
    }
    const thinkingConfidence = Math.min(1.0, Math.max(0.0, thinkConf));

    // Phone, Conversation, Sleep, Away confidences
    const phoneConfidence = phone.phoneConfidence;
    const conversationConfidence = conv.conversationConfidence;
    const sleepConfidence = sleep.sleepConfidence;
    const awayConfidence = !isPersonPresent ? 0.99 : 0.02;

    // 2. Continuous Multi-Signal Scalar Focus Score (0 to 100)
    let score = 50;

    // Base Face & Presence score
    let faceScore = 0;
    if (isPersonPresent) {
      faceScore = face.visibilityCategory === 'HIGH_VISIBILITY' ? 100 : (face.visibilityCategory === 'MEDIUM_VISIBILITY' ? 85 : 70);
      score += 25;
    } else {
      faceScore = 0;
      score -= 40;
    }

    // Seated Posture Stability (+15)
    let postureStableScore = pose.postureScore;
    if (pose.isSeatedPostureStable && pose.inStudyZone) {
      score += 15;
    } else if (pose.bodyPresence) {
      score += 8;
    }

    // Desk & Writing Activity (+12 to +20)
    let deskActivityScore = hand.deskScore;
    if (hand.isWritingBurst) {
      score += 20;
    } else if (hand.isThinkingPause || medium === 'Paper / PYQ Study') {
      score += 15;
    } else if (hand.handActivity) {
      score += 12;
    }

    // Computer Activity (+10)
    let activityScore = comp.activityScore;
    if (comp.keyboardActive || comp.mouseActive) {
      score += comp.isDistractionApp ? -10 : 10;
    }

    // App Context (-45 to +10)
    let appContextScore = comp.appScore;
    if (settings.enableWindowContext) {
      if (comp.isDistractionApp) {
        score -= 45;
        if (comp.keyboardActive || comp.mouseActive) {
          score -= 10; // gaming/browsing inputs
        }
      } else if (comp.isStudyApp) {
        score += 10;
      }
    }

    // Head Pose & Desk Angle (Paper boost vs screen tolerance)
    let headPoseScore = 90;
    if (pose.isLookingDown || pose.isPitchCompatibleWithPaper) {
      if (medium === 'Paper / PYQ Study' || medium === 'Mixed Study') {
        headPoseScore = 98;
        score += 10; // Positive study evidence for notebook orientation
      } else {
        headPoseScore = 88;
        score -= 2; // Gentle glance at keyboard/desk notes
      }
    } else if (!pose.isYawWithinStudyTolerance) {
      headPoseScore = 65;
      score -= 6;
    } else {
      headPoseScore = 95;
      score += 5;
    }

    // Gaze Score
    let eyeGazeScore = Math.round(face.gazeScore * 100);
    if ((pose.isLookingDown || pose.isPitchCompatibleWithPaper) && (medium === 'Paper / PYQ Study' || medium === 'Mixed Study')) {
      eyeGazeScore = 95;
      score += 5;
    } else if (face.gazeScore < 0.6) {
      score -= 3;
    }

    // Multi-face handling
    if (face.faceCount > 1 && !conv.isConfirmedConversation) {
      score -= 5;
    }

    // Threats deductions
    if (phone.isPhoneWarning) score -= 15;
    if (phone.isPersistentPhoneUse || phone.phoneConfidence >= 0.65) score -= 40;
    if (conv.isConversationWarning) score -= 15;
    if (conv.isConfirmedConversation) score -= 40;
    if (sleep.isPossibleSleepWarning) score -= 20;
    if (sleep.isConfirmedSleepPause) score -= 45;

    const totalFocusScore = Math.min(100, Math.max(0, score));

    // Overall focus confidence (0.0 to 1.0)
    const overallFocusConfidence = Number((totalFocusScore / 100).toFixed(2));

    // 3. Sensor Conflict Resolution for Visual HUD Signals
    let resolvedFaceScore = isPersonPresent ? 88 : 0;
    let resolvedHeadPoseScore = headPoseScore;
    let resolvedEyeGazeScore = eyeGazeScore;
    let resolvedDeskScore = deskActivityScore;
    let resolvedLightingScore = Math.round(face.lightingScore * 100);

    if (validation && presence) {
      const resolved = conflictResolver.resolve(
        validation,
        presence,
        headPoseScore,
        eyeGazeScore,
        deskActivityScore,
        pose.isLookingDown,
        phone.phoneConfidence >= 0.55
      );
      resolvedFaceScore = resolved.faceScore;
      resolvedHeadPoseScore = resolved.headPoseScore;
      resolvedEyeGazeScore = resolved.eyeGazeScore;
      resolvedDeskScore = resolved.deskActivityScore;
      resolvedLightingScore = resolved.lightingScore;
    } else if (!face.facePresent && isPersonPresent) {
      resolvedFaceScore = 80; // Upgraded face score because person presence is verified
    }

    const confidenceVector: FocusConfidenceVector = {
      screenStudyConfidence: Number(screenStudyConfidence.toFixed(2)),
      paperStudyConfidence: Number(paperStudyConfidence.toFixed(2)),
      thinkingConfidence: Number(thinkingConfidence.toFixed(2)),
      phoneConfidence: Number(phoneConfidence.toFixed(2)),
      conversationConfidence: Number(conversationConfidence.toFixed(2)),
      sleepConfidence: Number(sleepConfidence.toFixed(2)),
      awayConfidence: Number(awayConfidence.toFixed(2)),
      overallFocusConfidence,
      pScreen: Number(screenStudyConfidence.toFixed(2)),
      pPaper: Number(paperStudyConfidence.toFixed(2)),
      pThinking: Number(thinkingConfidence.toFixed(2)),
      pPhone: Number(phoneConfidence.toFixed(2)),
      pConversation: Number(conversationConfidence.toFixed(2)),
      pSleep: Number(sleepConfidence.toFixed(2)),
      pAway: Number(awayConfidence.toFixed(2))
    };

    return {
      confidenceVector,
      totalFocusScore,
      signalScores: {
        faceScore: resolvedFaceScore,
        headPoseScore: resolvedHeadPoseScore,
        eyeGazeScore: resolvedEyeGazeScore,
        activityScore,
        appContextScore,
        deskActivityScore: resolvedDeskScore,
        postureStableScore,
        lightingScore: resolvedLightingScore
      },
      primaryStudyEvidence: activity.explanation
    };
  }
}

export const evidenceFusionEngine = new EvidenceFusionEngine();
