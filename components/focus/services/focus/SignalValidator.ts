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
    
    // 0. Frame Freshness & Stale Frame Check
    const isStale = (now - vision.timestamp > 2500) || (vision.isStale === true);

    // 1. Vision Quality Assessment (Lighting & Frame Health)
    let visionQualityScore = 0.85;
    if (isStale || vision.cameraHealthy === false) {
      visionQualityScore = 0.0;
    } else if (vision.lightingScore !== undefined) {
      // Optimal lighting is between 0.35 and 0.85
      if (vision.lightingScore < 0.25) {
        visionQualityScore = Math.max(0.30, vision.lightingScore * 2);
      } else if (vision.lightingScore > 0.90) {
        visionQualityScore = 0.65; // Specular glare
      } else {
        visionQualityScore = 0.90;
      }
    }

    const visionQuality: ValidatedSignal<number> = {
      value: visionQualityScore,
      confidence: isStale ? 0.0 : 0.95,
      quality: visionQualityScore,
      timestamp: now,
      isTrustworthy: !isStale && visionQualityScore >= 0.40,
      notes: isStale 
        ? 'Frame is stale or frozen' 
        : visionQualityScore < 0.40 
          ? 'Low ambient lighting or camera noise' 
          : 'Normal illumination'
    };

    // 2. Validate Head Pose (Strictly requires actual face presence)
    const rawFacePresent = !!vision.facePresent && !isStale;
    const yaw = rawFacePresent ? (vision.headYaw ?? 0) : 0;
    const pitch = rawFacePresent ? (vision.headPitch ?? 0) : 0;
    const roll = rawFacePresent ? (vision.headRoll ?? 0) : 0;
    
    const poseConfidence = !rawFacePresent 
      ? 0.0 
      : (Math.abs(pitch) > 50 || Math.abs(yaw) > 60)
        ? 0.50
        : (visionQualityScore >= 0.6 ? 0.92 : 0.75);

    const headPose: ValidatedSignal<{ yaw: number; pitch: number; roll: number }> = {
      value: { yaw, pitch, roll },
      confidence: poseConfidence,
      quality: rawFacePresent ? visionQualityScore : 0.0,
      timestamp: now,
      isTrustworthy: rawFacePresent && poseConfidence >= 0.60
    };

    // 3. Validate Gaze (Strictly requires face presence)
    const rawGaze = rawFacePresent ? (vision.gazeScore ?? 0.85) : 0.0;
    const gazeConfidence = rawFacePresent 
      ? (visionQualityScore >= 0.60 ? 0.88 : 0.60)
      : 0.0;
    const gaze: ValidatedSignal<number> = {
      value: rawGaze,
      confidence: gazeConfidence,
      quality: rawFacePresent ? visionQualityScore : 0.0,
      timestamp: now,
      isTrustworthy: rawFacePresent && gazeConfidence >= 0.55
    };

    // 4. Validate Desk & Hand Activity
    const deskMotionVal = !isStale ? (vision.deskActivityScore ?? 0.0) : 0.0;
    const handActVal = !isStale ? (vision.handActivity ?? false) : false;
    const deskConfidence = isStale ? 0.0 : 0.85;

    const deskMotion: ValidatedSignal<number> = {
      value: deskMotionVal,
      confidence: deskConfidence,
      quality: isStale ? 0.0 : 0.90,
      timestamp: now,
      isTrustworthy: !isStale
    };

    const handActivity: ValidatedSignal<boolean> = {
      value: handActVal,
      confidence: deskConfidence,
      quality: isStale ? 0.0 : 0.90,
      timestamp: now,
      isTrustworthy: !isStale
    };

    // 5. Cross-Sensor Face Presence Validation & Conflict Detection
    // Real conflict: Desk motion or hand activity observed while face is momentarily out of frame
    const hasDeskActivityWithoutFace = !rawFacePresent && (handActVal || deskMotionVal > 0.35);

    let facePresentConfidence = rawFacePresent ? rawConf : 0.0;
    let facePresentValue = rawFacePresent;
    let conflictDescription: string | undefined;

    if (hasDeskActivityWithoutFace) {
      conflictDescription = 'Desk/hand activity detected while face is out of camera view (potential low head-down note taking)';
      // Acknowledge possible desk activity, but NEVER falsely set facePresence.value to true
      facePresentConfidence = 0.25;
    }

    const facePresence: ValidatedSignal<boolean> = {
      value: facePresentValue,
      confidence: facePresentConfidence,
      quality: visionQualityScore,
      timestamp: now,
      isTrustworthy: !isStale && (rawFacePresent ? visionQualityScore >= 0.35 : true),
      notes: hasDeskActivityWithoutFace ? conflictDescription : undefined
    };

    return {
      facePresence,
      headPose,
      gaze,
      deskMotion,
      handActivity,
      visionQuality,
      hasSensorConflict: hasDeskActivityWithoutFace,
      conflictDescription,
      timestamp: now
    };
  }
}

export const signalValidator = new SignalValidator();
