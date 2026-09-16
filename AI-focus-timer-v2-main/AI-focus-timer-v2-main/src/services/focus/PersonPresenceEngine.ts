import { PersonPresenceState, VisionData } from '../../types';
import { SignalValidationReport } from './SignalValidator';

export interface PersonPresenceResult {
  state: PersonPresenceState;
  confidence: number; // 0.0 to 1.0
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
    now: number = Date.now()
  ): PersonPresenceResult {
    const rawFacePresent = vision.facePresent;
    const bodyPostureStable = vision.bodyPostureStable ?? false;
    const deskMotion = (vision.deskActivityScore ?? 0) > 0.04 || vision.handActivity;
    const isPosePlausible = validation.headPose.isTrustworthy && Math.abs(vision.headPitch) <= 45;
    
    // 1. Evaluate instant sensory evidence
    const faceEvidence = rawFacePresent && validation.facePresence.confidence >= 0.50;
    const bodyEvidence = bodyPostureStable || isPosePlausible;
    const deskEvidence = deskMotion;

    // Check historical evidence (within last 10 seconds)
    const instantPresence = faceEvidence || (bodyEvidence && (deskEvidence || isPosePlausible));
    this.presenceHistory.push(instantPresence);
    if (this.presenceHistory.length > 20) this.presenceHistory.shift();

    const recentPresenceCount = this.presenceHistory.filter(Boolean).length;
    const recentFramesEvidence = recentPresenceCount >= Math.min(3, this.presenceHistory.length);

    if (instantPresence) {
      this.lastConfirmedPresenceTimestamp = now;
    }
    const secondsSinceConfirmed = Math.floor((now - this.lastConfirmedPresenceTimestamp) / 1000);

    // 2. Classify 4-State Person Presence
    let state: PersonPresenceState;
    let confidence: number;
    let explanation: string;

    if (faceEvidence && bodyEvidence) {
      // Definitive presence
      state = 'PERSON_PRESENT';
      confidence = 0.98;
      explanation = 'Subject confirmed present at study desk (face & body detected).';
    } else if (!faceEvidence && bodyEvidence && (deskEvidence || recentFramesEvidence || secondsSinceConfirmed < 8)) {
      // Sensor discrepancy: Face dropped (likely looking down or lighting shadow), but body/desk shows presence
      state = 'PERSON_PROBABLY_PRESENT';
      confidence = 0.88;
      explanation = 'Subject probably present: head tilted down into notes or momentary face shadow; desk posture stable.';
    } else if (validation.visionQuality.value < 0.35 && secondsSinceConfirmed < 12) {
      // Poor vision quality / severe underexposure
      state = 'VISION_UNCERTAIN';
      confidence = 0.60;
      explanation = 'Vision quality degraded by lighting; presence inferred from recent posture history.';
    } else if (secondsSinceConfirmed >= 8 && !bodyEvidence && !deskEvidence) {
      // True absence confirmed
      state = 'PERSON_ABSENT';
      confidence = 0.96;
      explanation = `No subject detected at workstation for ${secondsSinceConfirmed}s.`;
    } else {
      // Ambiguous transition window
      state = 'PERSON_PROBABLY_PRESENT';
      confidence = 0.70;
      explanation = 'Subject present within desk boundary; validating continuous posture.';
    }

    const isPersonPresent = state === 'PERSON_PRESENT' || state === 'PERSON_PROBABLY_PRESENT';

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
