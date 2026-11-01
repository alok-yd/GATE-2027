import { CalibrationProfile, PersonPresenceState, VisionData } from '../../types';
import { SignalValidationReport } from './SignalValidator';

export interface PersonPresenceResult {
  state: PersonPresenceState;
  confidence: number;
  isPersonPresent: boolean;
  evidence: {
    faceEvidence: boolean;
    bodyEvidence: boolean;
    recentFramesEvidence: boolean;
    deskEvidence: boolean;
  };
  explanation: string;
}

export class PersonPresenceEngine {
  private presenceHistory: boolean[] = [];
  private lastConfirmedPresenceTimestamp: number = Date.now();

  evaluate(
    vision: VisionData,
    validation: SignalValidationReport,
    profile: CalibrationProfile,
    now: number = Date.now()
  ): PersonPresenceResult {
    const faceBox = vision.faceBox;
    const centerX = faceBox ? faceBox.x + faceBox.width / 2 : -1;
    const centerY = faceBox ? faceBox.y + faceBox.height / 2 : -1;
    const faceWidthRatio = faceBox ? faceBox.width / 100 : 0;
    const faceHeightRatio = faceBox ? faceBox.height / 100 : 0;
    const faceAspectRatio = faceBox
      ? faceBox.width / Math.max(1, faceBox.height)
      : 0;

    // When calibrated, use the learned study zone. Otherwise require a
    // reasonably large, central foreground face rather than distant room occupants.
    const zone = profile.isCalibrated ? profile.studyZone : undefined;
    const inExpectedStudyZone = zone
      ? centerX >= zone.minX &&
        centerX <= zone.maxX &&
        centerY >= zone.minY &&
        centerY <= zone.maxY
      : centerX >= 15 && centerX <= 85 && centerY >= 5 && centerY <= 82;

    const calibratedFaceWidth = profile.isCalibrated
      ? profile.faceBoundingBoxRatio
      : 0;
    const minimumFaceWidth = calibratedFaceWidth > 0.05
      ? Math.max(0.12, calibratedFaceWidth * 0.35)
      : 0.16;
    const maximumFaceWidth = calibratedFaceWidth > 0.05
      ? Math.min(0.85, calibratedFaceWidth * 1.80)
      : 0.80;

    const faceGeometryValid =
      Boolean(faceBox) &&
      faceWidthRatio >= minimumFaceWidth &&
      faceWidthRatio <= maximumFaceWidth &&
      faceHeightRatio >= 0.10 &&
      faceAspectRatio >= 0.35 &&
      faceAspectRatio <= 2.10;

    const cameraFrameValid =
      vision.cameraHealthy !== false &&
      vision.isSimulated !== true &&
      validation.visionQuality.value >= 0.35;

    const faceEvidence =
      cameraFrameValid &&
      vision.facePresent &&
      validation.facePresence.confidence >= 0.50 &&
      faceGeometryValid &&
      inExpectedStudyZone;

    const bodyPostureStable = vision.bodyPostureStable ?? false;
    const isPosePlausible =
      faceEvidence &&
      validation.headPose.isTrustworthy &&
      Math.abs(vision.headPitch) <= 55;

    // Movement on another person's desk can look like writing. Keep it for
    // analytics only; it must never create or renew student-presence evidence.
    const deskEvidence = (vision.deskActivityScore ?? 0) > 0.55;
    const bodyEvidence = faceEvidence && (bodyPostureStable || isPosePlausible);

    this.presenceHistory.push(faceEvidence);
    if (this.presenceHistory.length > 20) this.presenceHistory.shift();
    const recentFramesEvidence =
      this.presenceHistory.filter(Boolean).length >= Math.min(3, this.presenceHistory.length);

    // Only a foreground face matching the expected zone and size renews presence.
    if (faceEvidence) {
      this.lastConfirmedPresenceTimestamp = now;
    }
    const secondsSinceConfirmed = Math.max(
      0,
      Math.floor((now - this.lastConfirmedPresenceTimestamp) / 1000)
    );

    let state: PersonPresenceState;
    let confidence: number;
    let explanation: string;

    if (faceEvidence && bodyEvidence) {
      state = 'PERSON_PRESENT';
      confidence = 0.98;
      explanation = 'Foreground subject matched the expected study zone and face size.';
    } else if (faceEvidence) {
      state = 'PERSON_PROBABLY_PRESENT';
      confidence = 0.82;
      explanation = 'Foreground face matched the expected study zone; validating posture.';
    } else if (validation.visionQuality.value < 0.35 && secondsSinceConfirmed < 12) {
      state = 'VISION_UNCERTAIN';
      confidence = 0.50;
      explanation = 'Camera quality is too low to verify the student reliably.';
    } else if (secondsSinceConfirmed >= 8) {
      state = 'PERSON_ABSENT';
      confidence = 0.97;
      explanation = `No matching foreground subject for ${secondsSinceConfirmed}s. Desk movement is not counted as student presence.`;
    } else {
      state = 'VISION_UNCERTAIN';
      confidence = 0.55;
      explanation = 'No matching foreground face detected yet; waiting briefly for camera reacquisition.';
    }

    const isPersonPresent =
      state === 'PERSON_PRESENT' || state === 'PERSON_PROBABLY_PRESENT';

    return {
      state,
      confidence,
      isPersonPresent,
      evidence: {
        faceEvidence,
        bodyEvidence,
        recentFramesEvidence,
        deskEvidence
      },
      explanation
    };
  }

  reset(): void {
    this.presenceHistory = [];
    this.lastConfirmedPresenceTimestamp = Date.now();
  }
}

export const personPresenceEngine = new PersonPresenceEngine();
