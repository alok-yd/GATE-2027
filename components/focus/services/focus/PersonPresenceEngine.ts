import {
  FocusPresenceState,
  PersonPresenceState,
  StudentPresenceDecision,
  StudentPresenceEvidence,
  VisionData
} from '../../types';
import { FocusConfig } from '../../constants/FocusConfig';
import { SignalValidationReport } from './SignalValidator';

export interface PersonPresenceResult {
  state: PersonPresenceState;
  confidence: number; // 0.0 to 1.0
  isPersonPresent: boolean;
  presenceConfidence: number; // 0.0 to 1.0 (Section 6)
  isReturnStabilizing?: boolean;
  returnStabilizationRemainingSeconds?: number;
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
  private absentSinceTimestamp: number | null = null;
  private returnStartTimestamp: number | null = null;
  private isCurrentlyAbsent: boolean = false;

  // Student-specific verification state
  private studentPresenceHistory: boolean[] = [];
  private lastConfirmedStudentTimestamp: number = 0;
  private studentAbsentSinceTimestamp: number | null = null;
  private studentReturnStartTimestamp: number | null = null;
  private isStudentAway: boolean = true; // Always start in AWAY until confirmed!

  evaluateStudentPresence(
    vision: VisionData,
    validation?: SignalValidationReport,
    now: number = Date.now()
  ): StudentPresenceDecision {
    const evidenceAgeMs = now - vision.timestamp;
    const isStale = evidenceAgeMs > FocusConfig.maxPresenceEvidenceAgeMs || vision.isStale === true;
    const isCameraHealthy = vision.cameraHealthy !== false && !isStale && (validation?.visionQuality?.isTrustworthy ?? true);

    const genericPerson = Boolean(vision.genericPersonDetected || vision.facePresent);
    const isLookingDown = Boolean(vision.isLookingDown);
    const faceMatchConf = vision.faceMatchConfidence ?? (vision.studentFaceVerified ? 0.88 : 0.0);
    const faceConfidence = vision.confidence ?? 0.0;

    // Student Face Detection Condition:
    // Requires verified student face matching calibrated baseline, OR
    // Looking down / PYQ solving posture with torso in study zone
    const studentFaceDetected = isCameraHealthy && Boolean(
      (vision.studentFaceVerified && faceMatchConf >= FocusConfig.studentFaceMatchThreshold) ||
      (genericPerson && isLookingDown && vision.bodyPostureStable !== false && (vision.inStudyZone !== false))
    );

    const evidence: StudentPresenceEvidence = {
      studentFaceDetected,
      faceMatchConfidence: faceMatchConf,
      faceDetectionConfidence: faceConfidence,
      poseConfidence: vision.bodyPostureStable ? 0.85 : 0.40,
      genericPersonDetected: genericPerson,
      temporalConfidence: 0.0,
      confidence: faceConfidence,
      timestamp: vision.timestamp,
      faceBbox: vision.faceBox,
      isLookingDown
    };

    if (!isCameraHealthy) {
      this.isStudentAway = true;
      this.studentReturnStartTimestamp = null;
      return {
        present: false,
        presenceState: isStale ? 'STUDENT_AWAY' : 'CAMERA_ERROR',
        confidence: 0.0,
        reason: isStale 
          ? `Presence evidence expired (${evidenceAgeMs}ms > ${FocusConfig.maxPresenceEvidenceAgeMs}ms limit).`
          : 'Camera stream blocked, frozen, or unavailable.',
        timestamp: now,
        evidence
      };
    }

    this.studentPresenceHistory.push(studentFaceDetected);
    if (this.studentPresenceHistory.length > 20) this.studentPresenceHistory.shift();

    const recentStudentCount = this.studentPresenceHistory.filter(Boolean).length;
    const temporalConfidence = Number((recentStudentCount / Math.max(1, this.studentPresenceHistory.length)).toFixed(2));
    evidence.temporalConfidence = temporalConfidence;

    if (studentFaceDetected) {
      this.lastConfirmedStudentTimestamp = now;
      this.studentAbsentSinceTimestamp = null;
    } else {
      if (this.studentAbsentSinceTimestamp === null) {
        this.studentAbsentSinceTimestamp = now;
      }
    }

    const absenceDurationMs = this.studentAbsentSinceTimestamp ? (now - this.studentAbsentSinceTimestamp) : 0;

    let presenceState: FocusPresenceState;
    let present = false;
    let confidence = 0.0;
    let reason = '';
    let isReturnStabilizing = false;
    let returnRemainingSec = 0;

    if (this.isStudentAway) {
      // Currently away: Must continuously verify student for returnConfirmMs (1500ms)
      if (studentFaceDetected) {
        if (this.studentReturnStartTimestamp === null) {
          this.studentReturnStartTimestamp = now;
        }
        const returnDurationMs = now - this.studentReturnStartTimestamp;
        if (returnDurationMs >= FocusConfig.returnConfirmMs) {
          // Return confirmed!
          this.isStudentAway = false;
          this.studentReturnStartTimestamp = null;
          presenceState = 'STUDENT_PRESENT';
          present = true;
          confidence = Math.max(0.92, faceMatchConf);
          reason = `Student presence verified and stabilized (${(returnDurationMs / 1000).toFixed(1)}s).`;
        } else {
          // Return stabilizing
          presenceState = 'PRESENCE_UNCERTAIN';
          present = false;
          isReturnStabilizing = true;
          returnRemainingSec = Math.max(0, Number(((FocusConfig.returnConfirmMs - returnDurationMs) / 1000).toFixed(1)));
          confidence = 0.65;
          reason = `Student detected; confirming identity and stability (${returnRemainingSec}s remaining)...`;
        }
      } else {
        // Still away
        this.studentReturnStartTimestamp = null;
        presenceState = 'STUDENT_AWAY';
        present = false;
        confidence = 0.98;
        reason = genericPerson
          ? 'Unverified person in frame (configured student is absent).'
          : `Student absent from study desk (${(absenceDurationMs / 1000).toFixed(1)}s elapsed).`;
      }
    } else {
      // Currently PRESENT
      if (studentFaceDetected) {
        presenceState = 'STUDENT_PRESENT';
        present = true;
        confidence = Math.max(0.90, faceMatchConf);
        reason = isLookingDown
          ? 'Student verified focusing on paper / PYQ problem solving.'
          : 'Student verified present at workstation.';
      } else if (absenceDurationMs <= FocusConfig.presenceLossGraceMs) {
        // Brief grace period (1200ms)
        presenceState = 'STUDENT_PRESENT';
        present = true;
        confidence = 0.70;
        reason = `Brief posture transition / blink (${(absenceDurationMs / 1000).toFixed(1)}s / ${(FocusConfig.presenceLossGraceMs / 1000).toFixed(1)}s).`;
      } else if (absenceDurationMs < FocusConfig.absenceConfirmMs) {
        // Absence confirming
        presenceState = 'PRESENCE_UNCERTAIN';
        present = false;
        confidence = 0.50;
        reason = `Student presence lost; confirming absence (${(absenceDurationMs / 1000).toFixed(1)}s elapsed)...`;
      } else {
        // Absence confirmed (> 2500ms)
        this.isStudentAway = true;
        this.studentReturnStartTimestamp = null;
        presenceState = 'STUDENT_AWAY';
        present = false;
        confidence = 0.98;
        reason = genericPerson
          ? 'Unverified person detected (configured student absent).'
          : `Student absent from study desk (${(absenceDurationMs / 1000).toFixed(1)}s elapsed).`;
      }
    }

    return {
      present,
      presenceState,
      confidence,
      reason,
      timestamp: now,
      evidence,
      isReturnStabilizing,
      returnStabilizationRemainingSeconds: returnRemainingSec
    };
  }

  evaluate(
    vision: VisionData,
    validation: SignalValidationReport,
    now: number = Date.now()
  ): PersonPresenceResult {
    const studentDecision = this.evaluateStudentPresence(vision, validation, now);

    const isStale = (now - vision.timestamp > FocusConfig.maxPresenceEvidenceAgeMs) || (vision.isStale === true);
    const cameraHealthy = vision.cameraHealthy !== false && !isStale && (validation?.visionQuality?.isTrustworthy ?? true);

    const faceEvidence = studentDecision.evidence.studentFaceDetected;
    const bodyEvidence = studentDecision.evidence.genericPersonDetected;
    const deskEvidence = !isStale && ((vision.deskActivityScore ?? 0) > 0.35 || !!vision.handActivity);
    const recentFramesEvidence = studentDecision.evidence.temporalConfidence >= 0.3;

    let state: PersonPresenceState;
    if (!cameraHealthy) {
      state = 'VISION_UNCERTAIN';
    } else if (studentDecision.presenceState === 'STUDENT_PRESENT') {
      state = 'PERSON_PRESENT';
    } else if (studentDecision.presenceState === 'PRESENCE_UNCERTAIN') {
      state = 'PERSON_PROBABLY_PRESENT';
    } else {
      state = 'PERSON_ABSENT';
    }

    return {
      state,
      confidence: studentDecision.confidence,
      presenceConfidence: studentDecision.confidence,
      isPersonPresent: studentDecision.present,
      isReturnStabilizing: studentDecision.isReturnStabilizing,
      returnStabilizationRemainingSeconds: studentDecision.returnStabilizationRemainingSeconds,
      evidence: {
        faceEvidence,
        bodyEvidence,
        recentFramesEvidence,
        deskEvidence
      },
      explanation: studentDecision.reason
    };
  }

  reset(): void {
    this.presenceHistory = [];
    this.lastConfirmedPresenceTimestamp = Date.now();
    this.absentSinceTimestamp = null;
    this.returnStartTimestamp = null;
    this.isCurrentlyAbsent = false;

    this.studentPresenceHistory = [];
    this.lastConfirmedStudentTimestamp = 0;
    this.studentAbsentSinceTimestamp = null;
    this.studentReturnStartTimestamp = null;
    this.isStudentAway = true;
  }
}

export const personPresenceEngine = new PersonPresenceEngine();
