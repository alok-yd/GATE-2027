import { CalibrationProfile, VisionData, ActivityData } from '../../../types';
import { PoseAnalysisResult } from './PoseAnalyzer';
import { HandAnalysisResult } from './HandAnalyzer';
import { phoneDisambiguation } from '../PhoneDisambiguation';

export interface PhoneAnalysisResult {
  phoneConfidence: number; // 0.0 to 1.0
  isPossiblePhoneUse: boolean;
  isPhoneWarning: boolean;
  isPersistentPhoneUse: boolean;
  phoneDurationSeconds: number;
  reason?: string;
}

export class PhoneAnalyzer {
  private phoneHistory: number[] = [];
  private phoneStartTime: number | null = null;

  analyze(
    vision: VisionData,
    profile: CalibrationProfile,
    pose: PoseAnalysisResult,
    hand: HandAnalysisResult,
    activity: ActivityData
  ): PhoneAnalysisResult {
    const now = vision.timestamp || Date.now();

    // 1. Explicit Phone vs. Paper Disambiguation Layer
    const disambiguation = phoneDisambiguation.disambiguate(vision, pose, hand, activity, now);

    let instantaneousScore = disambiguation.phoneConfidence;
    if (disambiguation.isPhone) {
      instantaneousScore = Math.max(instantaneousScore, 0.90);
    } else if (disambiguation.dominantObject === 'PAPER') {
      instantaneousScore = Math.min(instantaneousScore, 0.15);
    }

    // 2. Temporal rolling window smoothing (last 8 samples)
    this.phoneHistory.push(instantaneousScore);
    if (this.phoneHistory.length > 8) this.phoneHistory.shift();

    const smoothedPhoneConfidence =
      this.phoneHistory.reduce((a, b) => a + b, 0) / this.phoneHistory.length;

    const isPossiblePhoneUse = smoothedPhoneConfidence >= 0.45 || disambiguation.isPhone;

    let phoneDurationSeconds = 0;
    let isPhoneWarning = false;
    let isPersistentPhoneUse = false;
    let reason: string | undefined;

    if (isPossiblePhoneUse) {
      if (this.phoneStartTime === null) {
        this.phoneStartTime = now;
      }
      phoneDurationSeconds = Math.max(0, Number(((now - this.phoneStartTime) / 1000).toFixed(1)));

      // Fast, reliable 1.5s confirmation
      if (phoneDurationSeconds >= 1.5 || (disambiguation.isPhone && phoneDurationSeconds >= 1.0)) {
        isPersistentPhoneUse = true;
        reason = `Smartphone interaction confirmed (${phoneDurationSeconds}s)`;
      } else if (phoneDurationSeconds >= 0.8) {
        isPhoneWarning = true;
        reason = `Potential phone interaction detected (${phoneDurationSeconds}s)`;
      } else {
        reason = 'Verifying handheld device';
      }
    } else {
      // Cooldown: only reset start time after low confidence has stabilized
      if (smoothedPhoneConfidence < 0.25) {
        this.phoneStartTime = null;
      }
    }

    return {
      phoneConfidence: Number(smoothedPhoneConfidence.toFixed(2)),
      isPossiblePhoneUse,
      isPhoneWarning,
      isPersistentPhoneUse,
      phoneDurationSeconds,
      reason
    };
  }

  reset(): void {
    this.phoneHistory = [];
    this.phoneStartTime = null;
  }
}

export const phoneAnalyzer = new PhoneAnalyzer();
