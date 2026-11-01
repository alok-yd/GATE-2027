import { CalibrationProfile, VisionData, ActivityData } from '../../../types';
import { FaceAnalysisResult } from './FaceAnalyzer';
import { PoseAnalysisResult } from './PoseAnalyzer';
import { HandAnalysisResult } from './HandAnalyzer';

export interface SleepAnalysisResult {
  sleepConfidence: number;
  isPossibleRest: boolean;
  isPossibleSleepWarning: boolean;
  isConfirmedSleepPause: boolean;
  sleepDurationSeconds: number;
  reason?: string;
}

export class SleepAnalyzer {
  private eyeClosedStartTime: number | null = null;
  private headDownStartTime: number | null = null;

  analyze(
    vision: VisionData,
    profile: CalibrationProfile,
    face: FaceAnalysisResult,
    pose: PoseAnalysisResult,
    hand: HandAnalysisResult,
    activity: ActivityData,
    configuredHeadDownToleranceSeconds: number = 360
  ): SleepAnalysisResult {
    const now = vision.timestamp || Date.now();
    const eyeClosedGraceSeconds = Math.max(30, profile.tolerances?.sleepGraceSeconds ?? 35);

    // Keep the long head-down threshold within the user's requested 5–7 minute range.
    // Older saved settings at 300 seconds remain a valid 5-minute choice.
    const headDownGraceSeconds = Math.max(
      300,
      Math.min(420, configuredHeadDownToleranceSeconds || 360)
    );
    const headDownWarningSeconds = Math.max(240, headDownGraceSeconds - 60);
    const eyeClosedWarningSeconds = Math.max(15, Math.floor(eyeClosedGraceSeconds * 0.6));

    const personSeatedAtDesk =
      face.facePresent &&
      pose.bodyPresence &&
      pose.isSeatedPostureStable;

    const purposefulMovement =
      hand.handActivity ||
      activity.keyboardActive ||
      activity.mouseActive ||
      activity.idleSeconds < 8;

    // Head-down reading, calculations and PYQ solving are normal study behavior.
    // Only prolonged, stationary head-down posture becomes a sleep candidate.
    const headDownCandidate =
      personSeatedAtDesk &&
      face.eyeOpen &&
      (pose.isLookingDown || face.isDeepHeadDown) &&
      !purposefulMovement;

    if (headDownCandidate) {
      if (this.headDownStartTime === null) this.headDownStartTime = now;
    } else {
      this.headDownStartTime = null;
    }

    // A closed-eye sleep signal is only trusted when the face is clearly visible.
    // This avoids treating low-light frames or a partially occluded face as sleep.
    const eyesClosedCandidate =
      personSeatedAtDesk &&
      face.visibilityCategory === 'HIGH_VISIBILITY' &&
      !face.eyeOpen &&
      !purposefulMovement;

    if (eyesClosedCandidate) {
      if (this.eyeClosedStartTime === null) this.eyeClosedStartTime = now;
    } else {
      this.eyeClosedStartTime = null;
    }

    const headDownSeconds = this.headDownStartTime === null
      ? 0
      : Math.max(0, Math.floor((now - this.headDownStartTime) / 1000));
    const eyesClosedSeconds = this.eyeClosedStartTime === null
      ? 0
      : Math.max(0, Math.floor((now - this.eyeClosedStartTime) / 1000));

    const headDownWarning = headDownSeconds >= headDownWarningSeconds;
    const headDownConfirmed = headDownSeconds >= headDownGraceSeconds;
    const eyesClosedWarning = eyesClosedSeconds >= eyeClosedWarningSeconds;
    const eyesClosedConfirmed = eyesClosedSeconds >= eyeClosedGraceSeconds;

    const sleepConfidence = eyesClosedCandidate
      ? 0.92
      : headDownCandidate
        ? 0.65
        : 0.02;

    const isConfirmedSleepPause = headDownConfirmed || eyesClosedConfirmed;
    const isPossibleSleepWarning =
      !isConfirmedSleepPause && (headDownWarning || eyesClosedWarning);
    const isPossibleRest =
      !isPossibleSleepWarning &&
      !isConfirmedSleepPause &&
      headDownSeconds >= 30;

    let reason: string | undefined;
    if (headDownConfirmed) {
      reason = `Stationary head-down posture persisted for ${headDownSeconds}s (limit ${headDownGraceSeconds}s)`;
    } else if (eyesClosedConfirmed) {
      reason = `Eyes remained closed while stationary for ${eyesClosedSeconds}s`;
    } else if (headDownWarning) {
      reason = `Head-down posture has lasted ${headDownSeconds}s; checking for sleep`;
    } else if (eyesClosedWarning) {
      reason = `Prolonged closed-eye posture detected (${eyesClosedSeconds}s)`;
    } else if (isPossibleRest) {
      reason = `Head-down stillness observed (${headDownSeconds}s); normal study time is preserved`;
    }

    return {
      sleepConfidence,
      isPossibleRest,
      isPossibleSleepWarning,
      isConfirmedSleepPause,
      sleepDurationSeconds: Math.max(headDownSeconds, eyesClosedSeconds),
      reason
    };
  }

  reset(): void {
    this.eyeClosedStartTime = null;
    this.headDownStartTime = null;
  }
}

export const sleepAnalyzer = new SleepAnalyzer();
