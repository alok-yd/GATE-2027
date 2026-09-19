import { VisionData } from '../../types';

export interface ValidatedSignal<T> {
  value: T;
  confidence: number; // 0.0 to 1.0
  quality: number;    // 0.0 to 1.0
  timestamp: number;
  isTrustworthy: boolean;
  notes?: string;
}

export interface SignalValidationReport {
  facePresence: ValidatedSignal<boolean>;
  headPose: ValidatedSignal<{ yaw: number; pitch: number; roll: number }>;
  gaze: ValidatedSignal<number>;
  deskMotion: ValidatedSignal<number>;
  handActivity: ValidatedSignal<boolean>;
  visionQuality: ValidatedSignal<number>;
  hasSensorConflict: boolean;
  conflictDescription?: string;
  timestamp: number;
}

export class SignalValidator {
  validate(vision: VisionData): SignalValidationReport {
    const now = vision.timestamp || Date.now();
    const rawConf = Math.min(1.0, Math.max(0.0, vision.confidence ?? 0.5));
    
    // 1. Vision Quality Assessment (Lighting & Frame Health)
    let visionQualityScore = 0.85;
    if (vision.lightingScore !== undefined) {
      // Optimal lighting is between 0.35 and 0.85
      if (vision.lightingScore < 0.25) {
        visionQualityScore = Math.max(0.30, vision.lightingScore * 2);
      } else if (vision.lightingScore > 0.90) {
        visionQualityScore = 0.65; // Specular glare
      } else {
        visionQualityScore = 0.90;
      }
    }
    if (vision.cameraHealthy === false) {
      visionQualityScore = 0.10;
    }

    const visionQuality: ValidatedSignal<number> = {
      value: visionQualityScore,
      confidence: 0.95,
      quality: visionQualityScore,
      timestamp: now,
      isTrustworthy: visionQualityScore >= 0.40,
      notes: visionQualityScore < 0.40 ? 'Low ambient lighting or camera noise' : 'Normal illumination'
    };

    // 2. Validate Head Pose
    const yaw = vision.headYaw ?? 0;
    const pitch = vision.headPitch ?? -4;
    const roll = vision.headRoll ?? 0;
    const poseConfidence = Math.abs(pitch) > 50 || Math.abs(yaw) > 60
      ? 0.50
      : (visionQualityScore >= 0.6 ? 0.92 : 0.75);

    const headPose: ValidatedSignal<{ yaw: number; pitch: number; roll: number }> = {
      value: { yaw, pitch, roll },
      confidence: poseConfidence,
      quality: visionQualityScore,
      timestamp: now,
      isTrustworthy: poseConfidence >= 0.60
    };

    // 3. Validate Gaze
    const rawGaze = vision.gazeScore ?? 0.85;
    const gazeConfidence = visionQualityScore >= 0.60 ? 0.88 : 0.60;
    const gaze: ValidatedSignal<number> = {
      value: rawGaze,
      confidence: gazeConfidence,
      quality: visionQualityScore,
      timestamp: now,
      isTrustworthy: gazeConfidence >= 0.55
    };

    // 4. Validate Desk & Hand Activity
    const deskMotionVal = vision.deskActivityScore ?? 0.2;
    const handActVal = vision.handActivity ?? false;
    const deskConfidence = 0.85;

    const deskMotion: ValidatedSignal<number> = {
      value: deskMotionVal,
      confidence: deskConfidence,
      quality: 0.90,
      timestamp: now,
      isTrustworthy: true
    };

    const handActivity: ValidatedSignal<boolean> = {
      value: handActVal,
      confidence: deskConfidence,
      quality: 0.90,
      timestamp: now,
      isTrustworthy: true
    };

    // 5. Cross-Sensor Face Presence Validation & Conflict Detection
    // If raw facePresent is false, but headPose and gaze have valid non-trivial measurements:
    // This is an internal sensor contradiction caused by downward pitch or shadow.
    const isPoseValid = headPose.isTrustworthy && Math.abs(pitch) <= 45 && Math.abs(yaw) <= 45;
    const isGazeValid = gaze.isTrustworthy && rawGaze >= 0.40;
    const hasFaceConflict = !vision.facePresent && isPoseValid && isGazeValid;

    let facePresentConfidence = rawConf;
    let facePresentValue = vision.facePresent;
    let conflictDescription: string | undefined;

    if (hasFaceConflict) {
      // Detected contradiction: raw detector lost skin boundary while pose/gaze remained coherent
      conflictDescription = 'Raw face presence = false, but head pose & gaze signals remain valid (head-down/shadow contradiction)';
      facePresentConfidence = 0.82; // Upgraded by pose evidence
    }

    const facePresence: ValidatedSignal<boolean> = {
      value: facePresentValue,
      confidence: facePresentConfidence,
      quality: visionQualityScore,
      timestamp: now,
      isTrustworthy: visionQualityScore >= 0.35,
      notes: hasFaceConflict ? conflictDescription : undefined
    };

    return {
      facePresence,
      headPose,
      gaze,
      deskMotion,
      handActivity,
      visionQuality,
      hasSensorConflict: hasFaceConflict,
      conflictDescription,
      timestamp: now
    };
  }
}

export const signalValidator = new SignalValidator();
