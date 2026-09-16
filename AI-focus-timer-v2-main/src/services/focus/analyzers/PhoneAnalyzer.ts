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
    const phoneGraceSeconds = profile.tolerances?.phoneGraceSeconds ?? 10;
    const warningGraceSeconds = Math.max(3, Math.floor(phoneGraceSeconds / 2));

    // 1. Explicit Phone vs. Paper Disambiguation Layer
    const disambiguation = phoneDisambiguation.disambiguate(vision, pose, hand, activity, now);

    let instantaneousScore = disambiguation.phoneConfidence;
    if (disambiguation.isPhone) {
      instantaneousScore = Math.max(instantaneousScore, 0.82);
    } else if (disambiguation.dominantObject === 'PAPER') {
      instantaneousScore = Math.min(instantaneousScore, 0.20);
    }

    // 2. Temporal rolling window smoothing (last 10 samples)
    this.phoneHistory.push(instantaneousScore);
    if (this.phoneHistory.length > 10) this.phoneHistory.shift();

    const smoothedPhoneConfidence =
      this.phoneHistory.reduce((a, b) => a + b, 0) / this.phoneHistory.length;

    const isPossiblePhoneUse = smoothedPhoneConfidence >= 0.50;

    let phoneDurationSeconds = 0;
    let isPhoneWarning = false;
    let isPersistentPhoneUse = false;
    let reason: string | undefined;

    if (isPossiblePhoneUse) {
      if (this.phoneStartTime === null) {
        this.phoneStartTime = now;
      }
      phoneDurationSeconds = Math.max(0, Math.floor((now - this.phoneStartTime) / 1000));

      if (phoneDurationSeconds >= phoneGraceSeconds && smoothedPhoneConfidence >= 0.70) {
        isPersistentPhoneUse = true;
        reason = `Persistent smartphone use detected for ${phoneDurationSeconds}s`;
      } else if (phoneDurationSeconds >= warningGraceSeconds) {
        isPhoneWarning = true;
        reason = `Potential phone interaction in progress (${phoneDurationSeconds}s)`;
      } else {
        reason = 'Brief smartphone interaction suspected';
      }
    } else {
      // Cooldown: reset if phone confidence drops below 0.35
      if (smoothedPhoneConfidence < 0.35) {
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
