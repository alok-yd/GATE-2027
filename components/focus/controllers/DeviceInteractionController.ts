import { DeviceInteractionEvidence, DeviceInteractionState } from '../types';
import { FocusConfig } from '../storage/FocusConfig';

export interface DeviceTransitionEvent {
  from: DeviceInteractionState;
  to: DeviceInteractionState;
  timestamp: number;
  reason: string;
  confidence: number;
}

type DeviceTransitionListener = (event: DeviceTransitionEvent) => void;

/**
 * DeviceInteractionController
 * 
 * Temporal state machine distinguishing a phone merely lying on the desk
 * from a phone actively held or operated. Requires temporal confirmation before pausing.
 */
export class DeviceInteractionController {
  private currentState: DeviceInteractionState = 'NO_DEVICE_USE';
  private candidateStartedAt: number = 0;
  private recoveryStartedAt: number = 0;
  private currentConfidence: number = 0;
  private listeners: Set<DeviceTransitionListener> = new Set();

  public update(evidence: DeviceInteractionEvidence, now: number = Date.now()): DeviceInteractionState {
    // Crucial rule: Device is in use ONLY if phone is detected AND hand interaction or proximity is high
    const isInteracting = evidence.deviceDetected && (
      evidence.handInteractionConfidence >= 0.35 ||
      evidence.proximityConfidence >= 0.30
    );

    this.currentConfidence = isInteracting
      ? Math.max(evidence.handInteractionConfidence, evidence.proximityConfidence)
      : 0;

    switch (this.currentState) {
      case 'NO_DEVICE_USE': {
        if (isInteracting) {
          this.candidateStartedAt = now;
          this.transitionTo('DEVICE_CANDIDATE', now, 'Potential phone interaction detected', this.currentConfidence);
        }
        break;
      }

      case 'DEVICE_CANDIDATE': {
        if (!isInteracting) {
          // False alarm or momentary glance
          this.candidateStartedAt = 0;
          this.transitionTo('NO_DEVICE_USE', now, 'Momentary phone interaction cleared', 0);
        } else {
          const duration = now - this.candidateStartedAt;
          if (this.candidateStartedAt > 0 && duration >= FocusConfig.DEVICE_USE_CONFIRM_MS) {
            this.transitionTo('DEVICE_IN_USE', now, `Phone use confirmed (${Math.round(duration / 1000)}s persistence)`, this.currentConfidence);
          }
        }
        break;
      }

      case 'DEVICE_CONFIRMED':
      case 'DEVICE_IN_USE': {
        if (!isInteracting) {
          this.recoveryStartedAt = now;
          this.transitionTo('DEVICE_RECOVERY', now, 'Phone put down, recovery period active', 0);
        }
        break;
      }

      case 'DEVICE_RECOVERY': {
        if (isInteracting) {
          // Phone picked back up
          this.recoveryStartedAt = 0;
          this.transitionTo('DEVICE_IN_USE', now, 'Phone interaction resumed during recovery', this.currentConfidence);
        } else {
          const recoveryDuration = now - this.recoveryStartedAt;
          if (this.recoveryStartedAt > 0 && recoveryDuration >= FocusConfig.DEVICE_RECOVERY_MS) {
            this.recoveryStartedAt = 0;
            this.transitionTo('NO_DEVICE_USE', now, 'Phone interaction cleared after recovery period', 0);
          }
        }
        break;
      }
    }

    return this.currentState;
  }

  private transitionTo(
    to: DeviceInteractionState,
    timestamp: number,
    reason: string,
    confidence: number
  ): void {
    if (this.currentState === to) return;
    const from = this.currentState;
    this.currentState = to;

    const event: DeviceTransitionEvent = {
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
        console.error('Device transition listener error:', err);
      }
    });
  }

  public isDeviceInUse(): boolean {
    return this.currentState === 'DEVICE_IN_USE' || this.currentState === 'DEVICE_CONFIRMED';
  }

  public getState(): DeviceInteractionState {
    return this.currentState;
  }

  public getConfidence(): number {
    return this.currentConfidence;
  }

  public reset(): void {
    this.currentState = 'NO_DEVICE_USE';
    this.candidateStartedAt = 0;
    this.recoveryStartedAt = 0;
    this.currentConfidence = 0;
  }

  public onTransition(listener: DeviceTransitionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
