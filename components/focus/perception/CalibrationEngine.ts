import { FocusConfig, safeGetStorageItem, safeSetStorageItem, safeRemoveStorageItem } from '../storage/FocusConfig';
import { StudentCalibration } from '../types';

interface Point3D {
  x: number;
  y: number;
  z?: number;
}

/**
 * CalibrationEngine
 * 
 * Extracts scale-invariant geometric facial landmark ratios to establish
 * a local biometric identity baseline. Protects against another person replacing the student.
 * All computations run locally; no images or embeddings are transmitted.
 */
export class CalibrationEngine {
  private static instance: CalibrationEngine;
  private currentCalibration: StudentCalibration | null = null;

  public static getInstance(): CalibrationEngine {
    if (!CalibrationEngine.instance) {
      CalibrationEngine.instance = new CalibrationEngine();
    }
    return CalibrationEngine.instance;
  }

  constructor() {
    this.loadCalibration();
  }

  public getCalibration(): StudentCalibration | null {
    return this.currentCalibration;
  }

  public loadCalibration(): StudentCalibration | null {
    try {
      const raw = safeGetStorageItem(FocusConfig.STORAGE_KEY_CALIBRATION);
      if (raw) {
        this.currentCalibration = JSON.parse(raw) as StudentCalibration;
      }
    } catch (e) {
      console.warn('Failed to load student calibration:', e);
    }
    return this.currentCalibration;
  }

  public saveCalibration(calibration: StudentCalibration): void {
    this.currentCalibration = calibration;
    try {
      safeSetStorageItem(
        FocusConfig.STORAGE_KEY_CALIBRATION,
        JSON.stringify(calibration)
      );
    } catch (e) {
      console.error('Failed to save student calibration:', e);
    }
  }

  public clearCalibration(): void {
    this.currentCalibration = null;
    try {
      safeRemoveStorageItem(FocusConfig.STORAGE_KEY_CALIBRATION);
    } catch (e) {
      console.warn('Failed to clear calibration:', e);
    }
  }

  /**
   * Extract 8-point scale-invariant geometric ratios from MediaPipe 478 landmarks.
   */
  public extractGeometricVector(landmarks: Point3D[]): number[] | null {
    if (!landmarks || landmarks.length < 468) return null;

    // Helper: 2D Euclidean distance
    const dist = (p1: Point3D, p2: Point3D): number => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const eyeLeftOuter = landmarks[33];
    const eyeLeftInner = landmarks[133];
    const eyeRightInner = landmarks[362];
    const eyeRightOuter = landmarks[263];
    const noseTip = landmarks[1];
    const upperLip = landmarks[0];
    const lowerLip = landmarks[17];
    const chin = landmarks[152];
    const mouthLeft = landmarks[61];
    const mouthRight = landmarks[291];
    const cheekLeft = landmarks[234];
    const cheekRight = landmarks[454];
    const noseWingLeft = landmarks[98];
    const noseWingRight = landmarks[327];

    const eyeSpan = dist(eyeLeftOuter, eyeRightOuter);
    if (eyeSpan < 0.001) return null; // Face too small or invalid

    const midEye: Point3D = {
      x: (eyeLeftInner.x + eyeRightInner.x) / 2,
      y: (eyeLeftInner.y + eyeRightInner.y) / 2,
    };

    // Scale-invariant facial proportions
    return [
      dist(eyeLeftInner, eyeRightInner) / eyeSpan,     // 0: Inter-canthal ratio
      dist(midEye, noseTip) / eyeSpan,                 // 1: Eye-to-nose ratio
      dist(noseTip, upperLip) / eyeSpan,               // 2: Nose-to-mouth ratio
      dist(lowerLip, chin) / eyeSpan,                  // 3: Mouth-to-chin ratio
      dist(mouthLeft, mouthRight) / eyeSpan,           // 4: Mouth width ratio
      dist(midEye, chin) / eyeSpan,                    // 5: Overall face height ratio
      dist(cheekLeft, cheekRight) / eyeSpan,           // 6: Cheek span ratio
      dist(noseWingLeft, noseWingRight) / eyeSpan,     // 7: Nose width ratio
    ];
  }

  /**
   * Compares detected facial vector with the student's calibrated baseline.
   * Returns a match confidence between 0.0 and 1.0.
   */
  public computeMatchConfidence(detectedVector: number[]): number {
    if (!this.currentCalibration || !this.currentCalibration.faceVector) {
      // If no explicit calibration exists, default to acceptable match for initial session
      return 0.90;
    }

    const baseline = this.currentCalibration.faceVector;
    if (baseline.length !== detectedVector.length) return 0.50;

    // Compute normalized mean absolute percentage difference
    let totalDifference = 0;
    for (let i = 0; i < baseline.length; i++) {
      const b = baseline[i];
      const d = detectedVector[i];
      const relDiff = Math.abs(b - d) / Math.max(0.001, (b + d) / 2);
      totalDifference += relDiff;
    }

    const meanDiff = totalDifference / baseline.length;
    // Difference of 0.0 -> confidence 1.0; difference of 0.30 -> confidence ~0.0
    const confidence = Math.max(0, Math.min(1.0, 1.0 - meanDiff / 0.25));
    return Math.round(confidence * 100) / 100;
  }
}

export const calibrationEngine = CalibrationEngine.getInstance();
