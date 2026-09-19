import { StudentPresenceEvidence, HeadPose } from '../types';
import { FocusConfig } from '../storage/FocusConfig';
import { calibrationEngine } from './CalibrationEngine';

export class StudentPresenceEngine {
  private lastEvidence: StudentPresenceEvidence = {
    genericPersonDetected: false,
    studentFaceDetected: false,
    faceMatchConfidence: 0,
    faceDetectionConfidence: 0,
    poseConfidence: 0,
    temporalConfidence: 0,
    headPose: { pitch: 0, yaw: 0, roll: 0 },
    isReadingOrWritingPaper: false,
    timestamp: 0,
  };

  /**
   * Process raw MediaPipe detection results and compute student-specific presence evidence
   */
  public evaluate(
    faceResult: any,
    poseResult: any,
    objectResult: any,
    now: number = Date.now()
  ): StudentPresenceEvidence {
    const hasFaces = Boolean(faceResult?.faceLandmarks?.length > 0);
    const hasPose = Boolean(poseResult?.landmarks?.length > 0);

    // 1. Generic person detection
    let genericPersonDetected = false;
    if (objectResult?.detections) {
      for (const d of objectResult.detections) {
        const cat = d.categories?.[0];
        if (cat?.categoryName === 'person' && cat.score >= 0.40) {
          genericPersonDetected = true;
          break;
        }
      }
    }
    if (hasPose || hasFaces) {
      genericPersonDetected = true;
    }

    // 2. Primary face evaluation
    let studentFaceDetected = false;
    let faceDetectionConfidence = 0;
    let faceMatchConfidence = 0;
    let headPose: HeadPose = { pitch: 0, yaw: 0, roll: 0 };
    let isReadingOrWritingPaper = false;

    if (hasFaces) {
      const primaryFace = faceResult.faceLandmarks[0];
      faceDetectionConfidence = 0.85;

      // Estimate head pose angles
      headPose = this.estimateHeadPose(primaryFace);

      // Check if student is looking down reading or solving paper PYQs
      if (
        headPose.pitch <= FocusConfig.PAPER_STUDY_PITCH_MAX_DEG &&
        headPose.pitch >= FocusConfig.PAPER_STUDY_PITCH_MIN_DEG &&
        Math.abs(headPose.yaw) < 35
      ) {
        isReadingOrWritingPaper = true;
      }

      // Extract geometric proportion vector
      const vector = calibrationEngine.extractGeometricVector(primaryFace);
      if (vector) {
        faceMatchConfidence = calibrationEngine.computeMatchConfidence(vector);
      } else {
        faceMatchConfidence = 0.70;
      }

      // Check against student threshold
      if (faceMatchConfidence >= FocusConfig.STUDENT_MATCH_THRESHOLD) {
        studentFaceDetected = true;
      }
    }

    // 3. Pose complementary check (supporting partial occlusion e.g. resting chin in hand while thinking)
    let poseConfidence = 0;
    if (hasPose) {
      const poseLandmarks = poseResult.landmarks[0];
      // Landmarks 11 & 12 are left & right shoulders, 0 is nose
      const leftShoulder = poseLandmarks[11];
      const rightShoulder = poseLandmarks[12];
      const nose = poseLandmarks[0];

      if (leftShoulder && rightShoulder && leftShoulder.visibility > 0.5 && rightShoulder.visibility > 0.5) {
        poseConfidence = 0.80;
        // If face detector momentarily lost frontal visibility but shoulders/torso are present at desk
        if (!studentFaceDetected && isReadingOrWritingPaper && poseConfidence >= 0.7) {
          studentFaceDetected = true;
          faceMatchConfidence = Math.max(faceMatchConfidence, 0.68);
        }
      }
    }

    // 4. Multiple person detection protection:
    // If multiple faces are detected, ensure at least one matches student baseline
    if (faceResult?.faceLandmarks && faceResult.faceLandmarks.length > 1) {
      let matchedStudentInCrowd = false;
      for (const face of faceResult.faceLandmarks) {
        const v = calibrationEngine.extractGeometricVector(face);
        if (v && calibrationEngine.computeMatchConfidence(v) >= FocusConfig.STUDENT_MATCH_THRESHOLD) {
          matchedStudentInCrowd = true;
          break;
        }
      }
      studentFaceDetected = matchedStudentInCrowd;
    }

    const temporalConfidence = studentFaceDetected ? 0.95 : (genericPersonDetected ? 0.40 : 0.0);

    this.lastEvidence = {
      genericPersonDetected,
      studentFaceDetected,
      faceMatchConfidence,
      faceDetectionConfidence,
      poseConfidence,
      temporalConfidence,
      headPose,
      isReadingOrWritingPaper,
      timestamp: now,
    };

    return this.lastEvidence;
  }

  /**
   * Estimate rough 3D head pitch, yaw, roll from 478 face landmarks
   */
  private estimateHeadPose(landmarks: Array<{ x: number; y: number; z?: number }>): HeadPose {
    const eyeLeft = landmarks[33];
    const eyeRight = landmarks[263];
    const noseTip = landmarks[1];
    const chin = landmarks[152];

    if (!eyeLeft || !eyeRight || !noseTip || !chin) {
      return { pitch: 0, yaw: 0, roll: 0 };
    }

    // Roll: Angle of eye line
    const dyEyes = eyeRight.y - eyeLeft.y;
    const dxEyes = eyeRight.x - eyeLeft.x;
    const roll = Math.atan2(dyEyes, dxEyes) * (180 / Math.PI);

    // Yaw: Asymmetry of nose tip between inner eye corners
    const midEyeX = (landmarks[133].x + landmarks[362].x) / 2;
    const eyeSpan = Math.abs(eyeRight.x - eyeLeft.x);
    const yaw = eyeSpan > 0 ? ((noseTip.x - midEyeX) / eyeSpan) * 90 : 0;

    // Pitch: Vertical position of nose relative to eye-chin distance
    const faceHeight = Math.abs(chin.y - (eyeLeft.y + eyeRight.y) / 2);
    const noseRelativeY = faceHeight > 0 ? (noseTip.y - (eyeLeft.y + eyeRight.y) / 2) / faceHeight : 0.5;
    // Standard frontal face noseRelativeY is ~0.45; looking down shifts nose down toward chin (ratio increases)
    const pitch = (0.45 - noseRelativeY) * 90;

    return {
      pitch: Math.round(pitch),
      yaw: Math.round(yaw),
      roll: Math.round(roll),
    };
  }

  public getLastEvidence(): StudentPresenceEvidence {
    return this.lastEvidence;
  }
}
