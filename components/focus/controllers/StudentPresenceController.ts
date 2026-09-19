import { StudentPresenceEvidence, StudentPresenceState } from '../types';
import { FocusConfig } from '../storage/FocusConfig';

export interface PresenceTransitionEvent {
  from: StudentPresenceState;
  to: StudentPresenceState;
  timestamp: number;
  reason: string;
  confidence: number;
}

type PresenceTransitionListener = (event: PresenceTransitionEvent) => void;

/**
 * StudentPresenceController
 * 
 * Authoritative temporal filter for student presence.
 * Protects against single-frame dropouts, blinking, looking down to write,
 * or temporary occlusion by enforcing a grace period before confirming AWAY.
 */
export class StudentPresenceController {
  private currentState: StudentPresenceState = 'UNKNOWN';
  private lossStartedAt: number = 0;
  private returnStartedAt: number = 0;
  private currentConfidence: number = 0;
  private listeners: Set<PresenceTransitionListener> = new Set();

  public update(evidence: StudentPresenceEvidence, now: number = Date.now()): StudentPresenceState {
    const isPresentCandidate = evidence.studentFaceDetected;
    this.currentConfidence = evidence.faceMatchConfidence;

    switch (this.currentState) {
      case 'UNKNOWN': {
        if (isPresentCandidate) {
          this.transitionTo('PRESENT', now, 'Student verified present', evidence.faceMatchConfidence);
        } else if (evidence.genericPersonDetected) {
          this.transitionTo('VERIFYING', now, 'Generic person detected, verifying identity', 0.5);
        } else {
          this.transitionTo('AWAY', now, 'No student detected on start', 0.0);
        }
        break;
      }

      case 'PRESENT': {
        if (!isPresentCandidate) {
          // Enter grace period
          this.lossStartedAt = now;
          this.transitionTo('VERIFYING', now, 'Presence lost, grace period active', evidence.faceMatchConfidence);
        }
        break;
      }

      case 'VERIFYING': {
        if (isPresentCandidate) {
          // Re-established presence
          this.lossStartedAt = 0;
          this.returnStartedAt = 0;
          this.transitionTo('PRESENT', now, 'Student presence re-confirmed', evidence.faceMatchConfidence);
        } else {
          // Check if grace period expired
          const duration = now - this.lossStartedAt;
          if (this.lossStartedAt > 0 && duration >= FocusConfig.PRESENCE_LOSS_GRACE_MS) {
            this.transitionTo('AWAY', now, `Absence confirmed after ${Math.round(duration / 1000)}s grace`, 0.0);
          }
        }
        break;
      }

      case 'AWAY': {
        if (isPresentCandidate) {
          if (this.returnStartedAt === 0) {
            this.returnStartedAt = now;
          }
          const returnDuration = now - this.returnStartedAt;
          if (returnDuration >= FocusConfig.PRESENCE_RETURN_CONFIRM_MS) {
            this.returnStartedAt = 0;
            this.transitionTo('PRESENT', now, 'Student returned and confirmed', evidence.faceMatchConfidence);
          }
        } else {
          this.returnStartedAt = 0;
        }
        break;
      }

      case 'RECOVERING': {
        if (isPresentCandidate) {
          this.transitionTo('PRESENT', now, 'Recovered and presence confirmed', evidence.faceMatchConfidence);
        } else {
          this.transitionTo('AWAY', now, 'Recovered with student absent', 0.0);
        }
        break;
      }
    }

    return this.currentState;
  }

  private transitionTo(
    to: StudentPresenceState,
    timestamp: number,
    reason: string,
    confidence: number
  ): void {
    if (this.currentState === to) return;
    const from = this.currentState;
    this.currentState = to;

    const event: PresenceTransitionEvent = {
      from,
      to,
      timestamp,
      reason,
      confidence,
    };

    this.listeners.forEach((l) => {
      try {
        l(event);
      } catch (err) {
        console.error('Presence transition listener error:', err);
      }
    });
  }

  public isStudentPresent(): boolean {
    // Only 'PRESENT' counts as strictly present for the timer gate
    return this.currentState === 'PRESENT';
  }

  public getState(): StudentPresenceState {
    return this.currentState;
  }

  public getConfidence(): number {
    return this.currentConfidence;
  }

  public reset(): void {
    this.currentState = 'UNKNOWN';
    this.lossStartedAt = 0;
    this.returnStartedAt = 0;
    this.currentConfidence = 0;
  }

  public onTransition(listener: PresenceTransitionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
