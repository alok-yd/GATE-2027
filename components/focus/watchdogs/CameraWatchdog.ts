import { CameraHealth, CameraHealthState } from '../types';
import { FocusConfig } from '../storage/FocusConfig';

export class CameraWatchdog {
  private lastCheckedAt: number = Date.now();

  /**
   * Inspects current camera health snapshot and flags stalls or freezes
   */
  public evaluate(health: CameraHealth, now: number = Date.now()): {
    isHealthy: boolean;
    state: CameraHealthState;
    message?: string;
  } {
    this.lastCheckedAt = now;

    if (!health.streamActive || !health.videoReady) {
      return {
        isHealthy: false,
        state: health.state === 'RECOVERING' ? 'RECOVERING' : 'INITIALIZING',
        message: 'Camera stream not initialized or active',
      };
    }

    if (health.freezeDetected) {
      return {
        isHealthy: false,
        state: 'DEGRADED',
        message: 'Video feed frozen (no pixel change detected)',
      };
    }

    const frameAgeMs = now - health.lastFrameAt;
    if (health.lastFrameAt > 0 && frameAgeMs > FocusConfig.MAX_FRAME_AGE_MS) {
      return {
        isHealthy: false,
        state: 'DEGRADED',
        message: `Camera stalled: no frame received for ${Math.round(frameAgeMs / 1000)}s`,
      };
    }

    if (health.errorCount >= FocusConfig.MAX_CAMERA_RECOVERY_ATTEMPTS) {
      return {
        isHealthy: false,
        state: 'FAILED',
        message: 'Camera exceeded maximum recovery attempts',
      };
    }

    return {
      isHealthy: true,
      state: 'HEALTHY',
    };
  }

  public getLastCheckedAt(): number {
    return this.lastCheckedAt;
  }
}
