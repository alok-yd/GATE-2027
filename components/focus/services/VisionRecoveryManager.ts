import { cameraManager } from './CameraManager';
import { visionWatchdog } from './VisionWatchdog';
import { modelManager } from './ml/ModelManager';

export interface RecoveryLog {
  timestamp: number;
  attempt: number;
  tier: 'SOFT_KICK' | 'STREAM_REACQUIRE' | 'MODEL_RESTART' | 'ALL';
  success: boolean;
  message: string;
}

export class VisionRecoveryManager {
  private isRecovering: boolean = false;
  private attemptCount: number = 0;
  private maxAttempts: number = 3;
  private backoffDelays: number[] = [500, 1500, 3000];
  private logs: RecoveryLog[] = [];

  constructor() {
    // Listen to watchdog failure events
    visionWatchdog.subscribeHealth((health) => {
      if (health.status === 'RECOVERING' && !this.isRecovering && this.attemptCount < this.maxAttempts) {
        this.executeRecoveryStep();
      } else if (health.status === 'VERIFIED') {
        this.attemptCount = 0;
        this.isRecovering = false;
      }
    });
  }

  getLogs(): RecoveryLog[] {
    return [...this.logs];
  }

  async executeRecoveryStep(): Promise<boolean> {
    if (this.isRecovering) return false;
    this.isRecovering = true;
    this.attemptCount++;

    const delay = this.backoffDelays[this.attemptCount - 1] || 2000;
    console.log(`[VisionRecoveryManager] Executing recovery attempt ${this.attemptCount}/${this.maxAttempts} (Backoff: ${delay}ms)...`);

    await new Promise(res => setTimeout(res, delay));

    let tier: RecoveryLog['tier'] = 'SOFT_KICK';
    let success = false;
    let message = '';

    try {
      if (this.attemptCount === 1) {
        tier = 'SOFT_KICK';
        const camRes = await cameraManager.recover();
        success = camRes.success;
        message = success ? 'Camera video element playback kicked' : 'Soft video kick failed';
      } else if (this.attemptCount === 2) {
        tier = 'MODEL_RESTART';
        // Restart stalled detectors in ModelManager
        await modelManager.restartDetector('face');
        await modelManager.restartDetector('object');
        const camRes = await cameraManager.recover();
        success = camRes.success;
        message = success ? 'Detectors and camera re-initialized' : 'Detector restart completed';
      } else {
        tier = 'STREAM_REACQUIRE';
        // Full hardware stream reacquisition
        const camRes = await cameraManager.recover();
        success = camRes.success;
        message = success ? 'Camera hardware stream reacquired' : (camRes.error || 'Hardware reacquisition failed');
      }

      this.recordLog(tier, success, message);
      this.isRecovering = false;

      if (success) {
        console.log(`[VisionRecoveryManager] Recovery attempt ${this.attemptCount} SUCCEEDED.`);
        visionWatchdog.recordCameraFrame(Date.now());
        visionWatchdog.recordInference(Date.now());
      } else {
        console.warn(`[VisionRecoveryManager] Recovery attempt ${this.attemptCount} FAILED: ${message}`);
      }

      return success;
    } catch (e: any) {
      this.isRecovering = false;
      this.recordLog(tier, false, e?.message || 'Unexpected recovery exception');
      return false;
    }
  }

  private recordLog(tier: RecoveryLog['tier'], success: boolean, message: string): void {
    this.logs.unshift({
      timestamp: Date.now(),
      attempt: this.attemptCount,
      tier,
      success,
      message
    });
    if (this.logs.length > 20) this.logs.pop();
  }

  reset(): void {
    this.attemptCount = 0;
    this.isRecovering = false;
  }
}

export const visionRecoveryManager = new VisionRecoveryManager();
