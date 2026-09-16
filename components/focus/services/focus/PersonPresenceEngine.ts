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
    const isStale = (now - vision.timestamp > 2500) || (vision.isStale === true);
    const cameraHealthy = vision.cameraHealthy !== false && !isStale && validation.visionQuality.isTrustworthy;
    
    // 1. Evaluate instant sensory evidence
    // Face evidence strictly requires camera healthy, raw face present, and trustworthy signal
    const rawFacePresent = !isStale && !!vision.facePresent;
    const faceEvidence = cameraHealthy && rawFacePresent && validation.facePresence.confidence >= 0.45;
    
    // Desk evidence: physical hand motion on notebook / keyboard
    const deskMotion = !isStale && ((vision.deskActivityScore ?? 0) > 0.35 || !!vision.handActivity);
    
    // Body evidence: stable posture requires an active face / upper torso centroid
    const bodyEvidence = cameraHealthy && rawFacePresent && !!vision.bodyPostureStable;
    const deskEvidence = deskMotion;

    // Instant presence: User is visually present right now
    const instantPresence = faceEvidence || (rawFacePresent && deskEvidence);
    
    this.presenceHistory.push(instantPresence);
    if (this.presenceHistory.length > 20) this.presenceHistory.shift();

    const recentPresenceCount = this.presenceHistory.filter(Boolean).length;
    const recentFramesEvidence = recentPresenceCount >= Math.min(3, this.presenceHistory.length);

    if (instantPresence) {
      this.lastConfirmedPresenceTimestamp = now;
    }
    const secondsSinceConfirmed = (now - this.lastConfirmedPresenceTimestamp) / 1000;

    // 2. Classify 4-State Person Presence
    let state: PersonPresenceState;
    let confidence: number;
    let explanation: string;

    if (!cameraHealthy) {
      state = 'VISION_UNCERTAIN';
      confidence = 0.20;
      explanation = 'Camera unverified, blocked, or stream frozen.';
    } else if (faceEvidence && bodyEvidence) {
      // Definitive confirmed presence
      state = 'PERSON_PRESENT';
      confidence = 0.98;
      explanation = 'Subject confirmed present at study desk (face & body verified).';
    } else if (faceEvidence) {
      state = 'PERSON_PRESENT';
      confidence = 0.90;
      explanation = 'Subject detected in frame.';
    } else if (secondsSinceConfirmed < 2.5 && (deskEvidence || recentFramesEvidence)) {
      // Brief head dip / note-taking transition window (max 2.5 seconds)
      state = 'PERSON_PROBABLY_PRESENT';
      confidence = 0.65;
      explanation = `Transient posture transition: verifying presence (${secondsSinceConfirmed.toFixed(1)}s elapsed).`;
    } else {
      // Confirmed absence: empty desk or person walked away
      state = 'PERSON_ABSENT';
      confidence = 0.98;
      explanation = `No subject detected at workstation (${secondsSinceConfirmed.toFixed(1)}s since last verified presence).`;
    }

    // Single definitive presence boolean
    const isPersonPresent = state === 'PERSON_PRESENT' || (state === 'PERSON_PROBABLY_PRESENT' && secondsSinceConfirmed < 2.5);

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
