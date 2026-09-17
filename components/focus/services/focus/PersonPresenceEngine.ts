import { PersonPresenceState, VisionData } from '../../types';
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

  evaluate(
    vision: VisionData,
    validation: SignalValidationReport,
    now: number = Date.now()
  ): PersonPresenceResult {
    const isStale = (now - vision.timestamp > 3000) || (vision.isStale === true);
    const cameraHealthy = vision.cameraHealthy !== false && !isStale && (validation?.visionQuality?.isTrustworthy ?? true);
    
    // 1. Evaluate instant sensory evidence (face + pose + body presence)
    const rawFacePresent = !isStale && !!vision.facePresent;
    const faceConfidence = rawFacePresent ? Math.max(0.70, vision.confidence || 0.85) : 0.0;
    const faceEvidence = cameraHealthy && rawFacePresent && faceConfidence >= 0.45;
    
    // Desk evidence: physical hand motion on notebook / keyboard
    const deskMotion = !isStale && ((vision.deskActivityScore ?? 0) > 0.35 || !!vision.handActivity);
    const bodyEvidence = cameraHealthy && (rawFacePresent || deskMotion) && (vision.bodyPostureStable !== false);
    const deskEvidence = deskMotion;

    // Instant presence detected this frame
    const instantPresence = faceEvidence || (rawFacePresent && deskEvidence);
    
    this.presenceHistory.push(instantPresence);
    if (this.presenceHistory.length > 20) this.presenceHistory.shift();

    const recentPresenceCount = this.presenceHistory.filter(Boolean).length;
    const temporalConfidence = Number((recentPresenceCount / Math.max(1, this.presenceHistory.length)).toFixed(2));
    const recentFramesEvidence = recentPresenceCount >= Math.min(3, this.presenceHistory.length);

    if (instantPresence) {
      this.lastConfirmedPresenceTimestamp = now;
      this.absentSinceTimestamp = null;
    } else {
      if (this.absentSinceTimestamp === null) {
        this.absentSinceTimestamp = now;
      }
    }

    const secondsSinceConfirmed = (now - this.lastConfirmedPresenceTimestamp) / 1000;
    const absenceDuration = this.absentSinceTimestamp ? (now - this.absentSinceTimestamp) / 1000 : 0;

    let state: PersonPresenceState;
    let confidence = 0.0;
    let explanation = '';
    let isPersonPresent = false;
    let isReturnStabilizing = false;
    let returnRemainingSec = 0;

    if (!cameraHealthy) {
      state = 'VISION_UNCERTAIN';
      confidence = 0.20;
      explanation = 'Camera stream unverified, blocked, or unavailable.';
      isPersonPresent = false;
    } else if (this.isCurrentlyAbsent) {
      // 2. Return from AWAY: Require 1.5s of continuous stable presence (Section 8)
      if (instantPresence) {
        if (this.returnStartTimestamp === null) {
          this.returnStartTimestamp = now;
        }
        const returnDuration = (now - this.returnStartTimestamp) / 1000;
        const requiredReturnSec = 1.5;

        if (returnDuration >= requiredReturnSec) {
          // Return confirmed!
          this.isCurrentlyAbsent = false;
          this.returnStartTimestamp = null;
          state = 'PERSON_PRESENT';
          confidence = 0.95;
          isPersonPresent = true;
          explanation = `Student returned to workstation (presence stabilized over ${returnDuration.toFixed(1)}s).`;
        } else {
          // Still stabilizing return
          state = 'PERSON_PROBABLY_PRESENT';
          isReturnStabilizing = true;
          returnRemainingSec = Math.max(0, Number((requiredReturnSec - returnDuration).toFixed(1)));
          confidence = 0.70;
          isPersonPresent = false; // Do not resume timer on first frame; wait for stabilization
          explanation = `Student return detected; confirming stable presence (${returnRemainingSec}s remaining)...`;
        }
      } else {
        // Still away
        this.returnStartTimestamp = null;
        state = 'PERSON_ABSENT';
        confidence = 0.98;
        isPersonPresent = false;
        explanation = `Student absent from workstation (${secondsSinceConfirmed.toFixed(1)}s elapsed).`;
      }
    } else {
      // 3. Normal Active Presence Monitoring & Absence Grace Period (Section 6 & 7)
      if (instantPresence) {
        state = 'PERSON_PRESENT';
        confidence = Math.max(faceConfidence, 0.90);
        isPersonPresent = true;
        explanation = 'Student verified present at workstation.';
      } else if (absenceDuration < 2.5) {
        // Transient head dip / posture transition grace period (< 2.5s) (Section 6)
        state = 'PERSON_PROBABLY_PRESENT';
        confidence = 0.65;
        isPersonPresent = true; // Grace period keeps timer running for brief 1-2 frame drops
        explanation = `Transient posture transition (grace period ${absenceDuration.toFixed(1)}s/2.5s).`;
      } else {
        // Confirmed absence: empty desk or student walked away
        this.isCurrentlyAbsent = true;
        this.returnStartTimestamp = null;
        state = 'PERSON_ABSENT';
        confidence = 0.98;
        isPersonPresent = false;
        explanation = `Student absent from workstation (${secondsSinceConfirmed.toFixed(1)}s since last verified presence).`;
      }
    }

    const presenceConfidence = Number(
      (confidence * 0.5 + temporalConfidence * 0.3 + (bodyEvidence ? 0.2 : 0)).toFixed(2)
    );

    return {
      state,
      confidence,
      presenceConfidence,
      isPersonPresent,
      isReturnStabilizing,
      returnStabilizationRemainingSeconds: returnRemainingSec,
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
    this.absentSinceTimestamp = null;
    this.returnStartTimestamp = null;
    this.isCurrentlyAbsent = false;
  }
}

export const personPresenceEngine = new PersonPresenceEngine();
