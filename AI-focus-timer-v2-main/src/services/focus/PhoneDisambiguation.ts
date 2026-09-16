import { PhoneDisambiguationResult, VisionData, ActivityData } from '../../types';
import { PoseAnalysisResult } from './analyzers/PoseAnalyzer';
import { HandAnalysisResult } from './analyzers/HandAnalyzer';

export class PhoneDisambiguation {
  private phonePersistenceHistory: number[] = [];
  private lastEvaluationTime: number = Date.now();

  disambiguate(
    vision: VisionData,
    pose: PoseAnalysisResult,
    hand: HandAnalysisResult,
    activity: ActivityData,
    now: number = Date.now()
  ): PhoneDisambiguationResult {
    // 1. Evaluate Phone Indicators
    let phoneScore = 0.0;
    const phoneIndicators: string[] = [];

    // Explicit vision sensor score (if available from vision pipeline)
    if (vision.phoneDetectedScore !== undefined && vision.phoneDetectedScore > 0) {
      phoneScore = Math.max(phoneScore, vision.phoneDetectedScore);
      phoneIndicators.push(`Sensor phone confidence: ${Math.round(vision.phoneDetectedScore * 100)}%`);
    }

    // Kinematic & Posture indicators:
    // A) Looking down while computer is idle
    const isLookingDown = pose.isLookingDown || vision.headPitch < -8;
    if (isLookingDown && activity.idleSeconds > 8) {
      phoneScore += 0.25;
      phoneIndicators.push('Head-down angle with idle workstation');
    }

    // B) Hand activity in upper desk / lap quadrant without writing burst
    // In phone usage: hand motion is localized, steady holding or thumb scrolling, unlike broad pen writing strokes
    if (hand.handActivity && !hand.isWritingBurst) {
      // Localized hand holding
      phoneScore += 0.35;
      phoneIndicators.push('Hand holding/interaction without writing burst strokes');
    }

    // C) Head roll or high lateral angle while looking down (leaning on hand or angle toward phone)
    if (Math.abs(pose.headRoll) > 12 && isLookingDown) {
      phoneScore += 0.20;
      phoneIndicators.push('Lateral head tilt angled toward handheld device');
    }

    // D) Gaze focused down but hands not on keyboard or writing surface
    if (isLookingDown && !activity.keyboardActive && !activity.mouseActive && (hand.handActivity || activity.idleSeconds > 15)) {
      phoneScore += 0.15;
    }

    // 2. Evaluate Paper Indicators
    let paperScore = 0.0;
    const paperIndicators: string[] = [];

    if (isLookingDown && pose.inStudyZone) {
      paperScore += 0.35;
      paperIndicators.push('Seated in calibrated desk study zone looking down');
    }

    if (hand.isWritingBurst) {
      paperScore += 0.50;
      paperIndicators.push('Active pen strokes & writing burst detected on desk');
    } else if (hand.isThinkingPause && hand.secondsSinceLastMovement <= 120) {
      paperScore += 0.40;
      paperIndicators.push('Post-writing cognitive thinking pause');
    } else if (vision.deskActivityScore > 0.40) {
      paperScore += 0.25;
      paperIndicators.push('Desk workspace surface interaction');
    }

    // 3. Temporal Persistence & Smoothing for Phone
    this.phonePersistenceHistory.push(phoneScore);
    if (this.phonePersistenceHistory.length > 10) this.phonePersistenceHistory.shift();

    const smoothedPhone = this.phonePersistenceHistory.reduce((a, b) => a + b, 0) / this.phonePersistenceHistory.length;
    const finalPhoneConf = Math.min(1.0, Math.max(0.0, Number(smoothedPhone.toFixed(2))));
    const finalPaperConf = Math.min(1.0, Math.max(0.0, Number(paperScore.toFixed(2))));

    // 4. Disambiguation Decision (Specificity Rule: High phone evidence overrides paper)
    // If phone confidence >= 0.55 and there is NO active writing burst, phone wins
    let dominantObject: 'PHONE' | 'PAPER' | 'NONE' = 'NONE';
    let isPhone = false;
    let reason = '';

    if (finalPhoneConf >= 0.55 && !hand.isWritingBurst) {
      dominantObject = 'PHONE';
      isPhone = true;
      reason = `Smartphone interaction dominant (${Math.round(finalPhoneConf * 100)}% confidence). ` + phoneIndicators.join('; ');
    } else if (finalPaperConf >= 0.50) {
      dominantObject = 'PAPER';
      isPhone = false;
      reason = `Paper study verified (${Math.round(finalPaperConf * 100)}% confidence). ` + paperIndicators.join('; ');
    } else if (isLookingDown) {
      dominantObject = 'PAPER'; // Default to paper if benign desk gaze
      isPhone = false;
      reason = 'Desk reading posture observed; no strong phone evidence.';
    } else {
      dominantObject = 'NONE';
      isPhone = false;
      reason = 'Monitor or ambient workstation posture.';
    }

    return {
      isPhone,
      phoneConfidence: finalPhoneConf,
      paperConfidence: finalPaperConf,
      dominantObject,
      handGripConfidence: hand.handActivity ? 0.75 : 0.20,
      aspectRatioMatch: isPhone,
      reason
    };
  }

  reset(): void {
    this.phonePersistenceHistory = [];
  }
}

export const phoneDisambiguation = new PhoneDisambiguation();
