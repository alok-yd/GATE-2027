import { PhoneDisambiguationResult, VisionData, ActivityData } from '../../types';
import { PoseAnalysisResult } from './analyzers/PoseAnalyzer';
import { HandAnalysisResult } from './analyzers/HandAnalyzer';

export type PhoneState = 'NO_PHONE' | 'PHONE_CANDIDATE' | 'CONFIRMED_PHONE' | 'PHONE_USE';

export class PhoneDisambiguation {
  private phonePersistenceHistory: number[] = [];
  private currentState: PhoneState = 'NO_PHONE';
  private stateEnteredTimestamp: number = Date.now();
  private cleanFramesDurationMs: number = 0;
  private lastEvaluationTime: number = Date.now();

  disambiguate(
    vision: VisionData,
    pose: PoseAnalysisResult,
    hand: HandAnalysisResult,
    activity: ActivityData,
    now: number = Date.now()
  ): PhoneDisambiguationResult {
    const dt = Math.max(0, Math.min(1000, now - this.lastEvaluationTime));
    this.lastEvaluationTime = now;

    // 1. Multi-signal phone evidence extraction
    const visualEvidence = vision.phoneEvidence?.visualEvidence ?? vision.phoneDetectedScore ?? 0.0;
    const handEvidence = vision.phoneEvidence?.handPhoneEvidence ?? (hand.handActivity ? 0.35 : 0.0);
    const proximityEvidence = vision.phoneEvidence?.proximityEvidence ?? 0.2;

    let instantaneousPhoneScore = 0.0;
    const phoneIndicators: string[] = [];

    if (visualEvidence > 0.35) {
      instantaneousPhoneScore += visualEvidence * 0.60;
      phoneIndicators.push(`Visual rectangular device profile (${Math.round(visualEvidence * 100)}%)`);
    }

    // Kinematic & Posture indicators:
    const isLookingDown = pose.isLookingDown || vision.headPitch < -8;
    if (isLookingDown && activity.idleSeconds > 5) {
      instantaneousPhoneScore += 0.20;
      phoneIndicators.push('Gaze directed at desk/lap with idle workstation');
    }

    // Hand posture: handheld interaction vs writing
    if (hand.handActivity && !hand.isWritingBurst) {
      instantaneousPhoneScore += 0.25;
      phoneIndicators.push('Static holding/thumb interaction');
    }

    if (Math.abs(pose.headRoll) > 12 && isLookingDown) {
      instantaneousPhoneScore += 0.15;
      phoneIndicators.push('Lateral head tilt toward handheld position');
    }

    // 2. Paper study & Writing indicators (Negative Phone Evidence)
    let paperScore = 0.0;
    const paperIndicators: string[] = [];

    const hasStrongVisualPhone = visualEvidence >= 0.45 || (vision.phoneDetectedScore ?? 0) >= 0.45;
    const isPenWriting = hand.isWritingBurst && !hasStrongVisualPhone;

    if (hasStrongVisualPhone) {
      instantaneousPhoneScore = Math.max(instantaneousPhoneScore, visualEvidence, 0.80);
    }

    if (isPenWriting) {
      paperScore += 0.65;
      paperIndicators.push('Active pen strokes & writing movement');
      // Active pen strokes strongly suppress phone false positives
      instantaneousPhoneScore = Math.max(0.0, instantaneousPhoneScore - 0.45);
    } else if (hand.isThinkingPause && hand.secondsSinceLastMovement <= 60 && !hasStrongVisualPhone) {
      paperScore += 0.40;
      paperIndicators.push('Cognitive thinking pause');
    } else if (vision.deskActivityScore > 0.40 && isLookingDown && !hasStrongVisualPhone) {
      paperScore += 0.35;
      paperIndicators.push('Desk notebook interaction');
    }

    if (isLookingDown && pose.inStudyZone && !hasStrongVisualPhone) {
      paperScore += 0.30;
    }

    // 3. Temporal rolling history
    this.phonePersistenceHistory.push(instantaneousPhoneScore);
    if (this.phonePersistenceHistory.length > 10) this.phonePersistenceHistory.shift();

    const smoothedPhone = this.phonePersistenceHistory.reduce((a, b) => a + b, 0) / this.phonePersistenceHistory.length;
    const finalPhoneConf = Math.min(1.0, Math.max(0.0, Number(smoothedPhone.toFixed(2))));
    const finalPaperConf = hasStrongVisualPhone ? 0.05 : Math.min(1.0, Math.max(0.0, Number(paperScore.toFixed(2))));

    // 4. Temporal State Machine (NO_PHONE -> PHONE_CANDIDATE -> CONFIRMED_PHONE -> PHONE_USE)
    const rawCandidate = (finalPhoneConf >= 0.40 || hasStrongVisualPhone) && !isPenWriting;
    
    if (rawCandidate) {
      this.cleanFramesDurationMs = 0;
      const timeInState = now - this.stateEnteredTimestamp;

      if (this.currentState === 'NO_PHONE') {
        this.currentState = 'PHONE_CANDIDATE';
        this.stateEnteredTimestamp = now;
      } else if (this.currentState === 'PHONE_CANDIDATE' && (timeInState >= 800 || hasStrongVisualPhone)) {
        this.currentState = 'CONFIRMED_PHONE';
        this.stateEnteredTimestamp = now;
      } else if (this.currentState === 'CONFIRMED_PHONE' && (timeInState >= 800 || hasStrongVisualPhone)) {
        this.currentState = 'PHONE_USE';
      }
    } else {
      // Hysteresis: require 2.5 seconds of clean non-phone frames to recover
      this.cleanFramesDurationMs += dt;
      if (this.cleanFramesDurationMs >= 2500) {
        this.currentState = 'NO_PHONE';
        this.stateEnteredTimestamp = now;
      }
    }

    // 5. Final Disambiguation Decision
    const isPhone = (this.currentState === 'CONFIRMED_PHONE' || this.currentState === 'PHONE_USE') || 
                    (finalPhoneConf >= 0.55 && !isPenWriting) ||
                    (hasStrongVisualPhone && finalPhoneConf >= 0.40);
    let dominantObject: 'PHONE' | 'PAPER' | 'NONE' = 'NONE';
    let reason = '';

    if (isPhone) {
      dominantObject = 'PHONE';
      reason = `Smartphone interaction confirmed (${Math.round(finalPhoneConf * 100)}% confidence). ` + phoneIndicators.join('; ');
    } else if (finalPaperConf >= 0.45) {
      dominantObject = 'PAPER';
      reason = `Paper study verified (${Math.round(finalPaperConf * 100)}% confidence). ` + paperIndicators.join('; ');
    } else if (isLookingDown) {
      dominantObject = 'PAPER';
      reason = 'Downward desk gaze in study zone.';
    } else {
      dominantObject = 'NONE';
      reason = 'Monitor or ambient workstation view.';
    }

    return {
      isPhone,
      phoneConfidence: finalPhoneConf,
      paperConfidence: finalPaperConf,
      dominantObject,
      handGripConfidence: handEvidence,
      aspectRatioMatch: visualEvidence > 0.40,
      reason,
      phoneEvidence: {
        detected: isPhone,
        confidence: finalPhoneConf,
        visualEvidence,
        handPhoneEvidence: handEvidence,
        proximityEvidence,
        temporalEvidence: smoothedPhone
      }
    };
  }

  reset(): void {
    this.phonePersistenceHistory = [];
    this.currentState = 'NO_PHONE';
    this.stateEnteredTimestamp = Date.now();
    this.cleanFramesDurationMs = 0;
  }
}

export const phoneDisambiguation = new PhoneDisambiguation();
