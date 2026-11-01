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

    // A bounding box is expressed as percentages of frame width/height.
    // Convert it back to pixel proportions before checking its aspect ratio.
    const faceAspectRatio = faceBox
      ? (faceBox.width * 160) / Math.max(1, faceBox.height * 120)
      : 0;

    const zone = profile.isCalibrated ? profile.studyZone : undefined;
    const zoneMargin = 18; // tolerance for normal chair/head movement
    const insideCalibratedZone = zone
      ? centerX >= zone.minX - zoneMargin &&
        centerX <= zone.maxX + zoneMargin &&
        centerY >= zone.minY - zoneMargin &&
        centerY <= zone.maxY + zoneMargin
      : false;

    // Do not require an exact old calibration box: the detector's skin-region
    // box can vary with lighting, facial hair and downward PYQ posture.
    const insideBroadForegroundZone =
      centerX >= 8 && centerX <= 92 &&
      centerY >= 2 && centerY <= 96;

    const calibratedFaceWidth = profile.isCalibrated
      ? profile.faceBoundingBoxRatio
      : 0;
    const minimumFaceWidth = calibratedFaceWidth > 0.05
      ? Math.max(0.055, Math.min(0.11, calibratedFaceWidth * 0.22))
      : 0.075;

    const faceGeometryValid =
      Boolean(faceBox) &&
      faceWidthRatio >= minimumFaceWidth &&
      faceWidthRatio <= 0.95 &&
      faceHeightRatio >= 0.055 &&
      faceHeightRatio <= 0.98 &&
      faceAspectRatio >= 0.20 &&
      faceAspectRatio <= 3.50;

    const cameraFrameValid =
      vision.cameraHealthy !== false &&
      vision.isSimulated !== true &&
      validation.visionQuality.value >= 0.25;

    const hasReliableFaceSignal =
      vision.facePresent &&
      validation.facePresence.confidence >= 0.45 &&
      faceGeometryValid;

    // Prefer the calibrated zone, but retain a broad central-frame fallback
    // when the saved profile is from an older face-box detector.
    const faceEvidence =
      cameraFrameValid &&
      hasReliableFaceSignal &&
      (
        insideCalibratedZone ||
        (insideBroadForegroundZone && vision.confidence >= 0.62)
      );
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
