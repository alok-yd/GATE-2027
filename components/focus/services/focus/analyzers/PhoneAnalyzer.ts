import { CalibrationProfile, VisionData, ActivityData, DeviceStatus, DeviceInteractionEvidence } from '../../../types';
import { PoseAnalysisResult } from './PoseAnalyzer';
import { HandAnalysisResult } from './HandAnalyzer';
import { PhoneDisambiguation } from '../PhoneDisambiguation';

export interface PhoneAnalysisResult {
  phoneConfidence: number; // 0.0 to 1.0
  isPossiblePhoneUse: boolean;
  isPhoneWarning: boolean;
  isPersistentPhoneUse: boolean;
  phoneDurationSeconds: number;
  deviceInUse: boolean;
  deviceStatus: DeviceStatus;
  deviceInteractionEvidence?: DeviceInteractionEvidence;
  reason?: string;
}

export class PhoneAnalyzer {
  private disambiguator = new PhoneDisambiguation();
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
    const disambiguation = this.disambiguator.disambiguate(vision, pose, hand, activity, now);

    const deviceInUse = !!disambiguation.deviceInUse;
    const deviceStatus = disambiguation.deviceStatus || (deviceInUse ? 'DEVICE_IN_USE' : 'NOT_DETECTED');

    // 2. Temporal rolling window smoothing
    const instantaneousScore = deviceInUse ? 0.95 : (deviceStatus === 'DEVICE_PRESENT' ? 0.35 : 0.0);
    this.phoneHistory.push(instantaneousScore);
    if (this.phoneHistory.length > 8) this.phoneHistory.shift();

    const smoothedPhoneConfidence =
      this.phoneHistory.reduce((a, b) => a + b, 0) / this.phoneHistory.length;

    let phoneDurationSeconds = 0;
    let isPhoneWarning = false;
    let isPersistentPhoneUse = false;
    let reason = disambiguation.reason;

    if (deviceInUse) {
      if (this.phoneStartTime === null) {
        this.phoneStartTime = now;
      }
      phoneDurationSeconds = Math.max(0, Number(((now - this.phoneStartTime) / 1000).toFixed(1)));
      isPersistentPhoneUse = true;
      reason = `Smartphone interaction confirmed in use (${phoneDurationSeconds}s)`;
    } else {
      if (this.phoneStartTime !== null && now - this.phoneStartTime > 1500) {
        this.phoneStartTime = null;
      }
      if (deviceStatus === 'DEVICE_PRESENT') {
        reason = 'Device visible on desk (not in use). Focus timer continues.';
      }
    }

    return {
      phoneConfidence: Number(smoothedPhoneConfidence.toFixed(2)),
      isPossiblePhoneUse: deviceInUse,
      isPhoneWarning: false,
      isPersistentPhoneUse,
      phoneDurationSeconds,
      deviceInUse,
      deviceStatus,
      deviceInteractionEvidence: disambiguation.deviceInteractionEvidence,
      reason
    };
  }

  reset(): void {
    this.phoneHistory = [];
    this.phoneStartTime = null;
    this.disambiguator.reset();
  }
}

export const phoneAnalyzer = new PhoneAnalyzer();
