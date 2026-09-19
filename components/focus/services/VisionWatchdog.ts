import { CameraHealthState, cameraManager } from './CameraManager';
import { FocusConfig } from '../constants/FocusConfig';

export type PipelineHealthStatus = 'VERIFIED' | 'DEGRADED' | 'RECOVERING' | 'UNAVAILABLE';

export interface VisionPipelineHealth {
  status: PipelineHealthStatus;
  cameraHealth: CameraHealthState;
  inferenceHealthy: boolean;
  workerHealthy: boolean;
  evidenceFresh: boolean;
  lastFrameAt: number;
  lastInferenceAt: number;
  lastPresenceUpdateAt: number;
  lastDeviceUpdateAt: number;
  recoveryGraceRemainingMs: number;
  recoveryAttempts: number;
  criticalDetectorHealthy: boolean;
  statusExplanation: string;
}

export type PipelineHealthSubscriber = (health: VisionPipelineHealth) => void;
export type WatchdogFailureCallback = (reason: string) => void;

export class VisionWatchdog {
  private lastCameraFrameAt: number = 0;
  private lastInferenceAt: number = 0;
  private lastPresenceUpdateAt: number = 0;
  private lastDeviceUpdateAt: number = 0;
  private lastWorkerTickAt: number = 0;

  private status: PipelineHealthStatus = 'VERIFIED';
  private recoveryGraceStart: number = 0;
  private recoveryGraceDurationMs: number = 3500; // 3.5s bounded grace period
  private isRecoveryActive: boolean = false;
  private recoveryAttempts: number = 0;
  private isMonitoringActive: boolean = false;

  private subscribers: Set<PipelineHealthSubscriber> = new Set();
  private failureCallbacks: Set<WatchdogFailureCallback> = new Set();
  private watchdogIntervalId: any = null;

  constructor() {
    this.startWatchdog();
  }

  private startWatchdog(): void {
    if (this.watchdogIntervalId) clearInterval(this.watchdogIntervalId);
    this.watchdogIntervalId = setInterval(() => {
      this.evaluateHealth();
    }, 500);
  }

  setMonitoringActive(active: boolean): void {
    this.isMonitoringActive = active;
    if (!active) {
      this.isRecoveryActive = false;
      this.recoveryAttempts = 0;
      this.status = 'VERIFIED';
    } else {
      const now = Date.now();
      this.lastCameraFrameAt = now;
      this.lastInferenceAt = now;
      this.lastWorkerTickAt = now;
      this.lastPresenceUpdateAt = now;
      this.lastDeviceUpdateAt = now;
    }
    this.notify();
  }

  recordCameraFrame(timestamp: number = Date.now()): void {
    this.lastCameraFrameAt = timestamp;
    if (this.status === 'RECOVERING' || this.status === 'UNAVAILABLE') {
      this.handleRecoverySuccess('Camera frame decoding restored');
    }
  }

  recordInference(timestamp: number = Date.now()): void {
    this.lastInferenceAt = timestamp;
    if (this.status === 'RECOVERING') {
      this.handleRecoverySuccess('ML inference pipeline restored');
    }
  }

  recordWorkerTick(timestamp: number = Date.now()): void {
    this.lastWorkerTickAt = timestamp;
  }

  recordPresenceUpdate(timestamp: number = Date.now()): void {
    this.lastPresenceUpdateAt = timestamp;
  }

  recordDeviceUpdate(timestamp: number = Date.now()): void {
    this.lastDeviceUpdateAt = timestamp;
  }

  getHealth(): VisionPipelineHealth {
    const now = Date.now();
    const cameraHealth = cameraManager.getHealth();
    const frameAgeMs = this.lastCameraFrameAt > 0 ? (now - this.lastCameraFrameAt) : 9999;
    const inferenceAgeMs = this.lastInferenceAt > 0 ? (now - this.lastInferenceAt) : 9999;
    const workerAgeMs = this.lastWorkerTickAt > 0 ? (now - this.lastWorkerTickAt) : 9999;

    const inferenceHealthy = inferenceAgeMs < 3000;
    const workerHealthy = workerAgeMs < 1000;
    const evidenceFresh = frameAgeMs < FocusConfig.maxPresenceEvidenceAgeMs && inferenceHealthy;
    const criticalDetectorHealthy = inferenceHealthy;

    let recoveryGraceRemainingMs = 0;
    if (this.isRecoveryActive && this.recoveryGraceStart > 0) {
      const elapsed = now - this.recoveryGraceStart;
      recoveryGraceRemainingMs = Math.max(0, this.recoveryGraceDurationMs - elapsed);
    }

    let statusExplanation = 'AI monitoring healthy and real-time';
    if (this.status === 'RECOVERING') {
      statusExplanation = `AI perception recovering (Attempt ${this.recoveryAttempts}/3)...`;
    } else if (this.status === 'UNAVAILABLE') {
      statusExplanation = cameraHealth.lastError || 'Camera or AI perception unavailable after recovery attempts';
    } else if (this.status === 'DEGRADED') {
      statusExplanation = 'AI perception operating with degraded secondary signals';
    }

    return {
      status: this.status,
      cameraHealth,
      inferenceHealthy,
      workerHealthy,
      evidenceFresh,
      lastFrameAt: this.lastCameraFrameAt,
      lastInferenceAt: this.lastInferenceAt,
      lastPresenceUpdateAt: this.lastPresenceUpdateAt,
      lastDeviceUpdateAt: this.lastDeviceUpdateAt,
      recoveryGraceRemainingMs,
      recoveryAttempts: this.recoveryAttempts,
      criticalDetectorHealthy,
      statusExplanation
    };
  }

  subscribeHealth(callback: PipelineHealthSubscriber): () => void {
    this.subscribers.add(callback);
    callback(this.getHealth());
    return () => this.subscribers.delete(callback);
  }

  subscribeFailure(callback: WatchdogFailureCallback): () => void {
    this.failureCallbacks.add(callback);
    return () => this.failureCallbacks.delete(callback);
  }

  private notify(): void {
    const health = this.getHealth();
    this.subscribers.forEach(cb => cb(health));
  }

  triggerRecovery(reason: string): void {
    if (!this.isMonitoringActive) return;
    if (this.status === 'UNAVAILABLE') return;

    const now = Date.now();
    if (!this.isRecoveryActive) {
      this.isRecoveryActive = true;
      this.recoveryGraceStart = now;
      this.recoveryAttempts = 1;
      this.status = 'RECOVERING';
      console.log(`VisionWatchdog: Recovery triggered: ${reason} (Grace: ${this.recoveryGraceDurationMs}ms)`);
    } else {
      this.recoveryAttempts++;
    }

    this.notify();
  }

  private handleRecoverySuccess(reason: string): void {
    if (this.isRecoveryActive || this.status === 'RECOVERING' || this.status === 'UNAVAILABLE') {
      console.log(`VisionWatchdog: Recovery succeeded: ${reason}`);
      this.isRecoveryActive = false;
      this.recoveryAttempts = 0;
      this.recoveryGraceStart = 0;
      this.status = 'VERIFIED';
      this.notify();
    }
  }

  private evaluateHealth(): void {
    if (!this.isMonitoringActive) return;

    const now = Date.now();
    const frameAgeMs = this.lastCameraFrameAt > 0 ? (now - this.lastCameraFrameAt) : 9999;
    const inferenceAgeMs = this.lastInferenceAt > 0 ? (now - this.lastInferenceAt) : 9999;
    const cameraHealth = cameraManager.getHealth();

    // Check if camera or inference stalled
    const isCameraStalled = frameAgeMs > 2000 || cameraHealth.status === 'FAILED' || cameraHealth.status === 'DEGRADED';
    const isInferenceStalled = inferenceAgeMs > 3000;

    if ((isCameraStalled || isInferenceStalled) && this.status !== 'UNAVAILABLE') {
      if (!this.isRecoveryActive) {
        this.triggerRecovery(isCameraStalled ? 'Camera frame stall detected' : 'Inference loop stall detected');
      } else {
        const graceElapsed = now - this.recoveryGraceStart;
        if (graceElapsed > this.recoveryGraceDurationMs && this.recoveryAttempts >= 3) {
          // Grace period expired and retries exhausted -> Declare UNAVAILABLE (Requirement 30, 33)
          this.status = 'UNAVAILABLE';
          this.isRecoveryActive = false;
          const failureReason = cameraHealth.lastError || 'Camera stream or AI perception unavailable after auto-recovery';
          console.warn(`VisionWatchdog: Declaring UNAVAILABLE. Reason: ${failureReason}`);
          this.failureCallbacks.forEach(cb => cb(failureReason));
          this.notify();
        }
      }
    } else if (!isCameraStalled && !isInferenceStalled && this.status === 'RECOVERING') {
      this.handleRecoverySuccess('Telemetry heartbeats normalized');
    }
  }

  /**
   * Safe timer gate query:
   * Returns whether the timer should hold its state during bounded recovery grace.
   */
  isWithinRecoveryGrace(): boolean {
    if (!this.isRecoveryActive) return false;
    const now = Date.now();
    return (now - this.recoveryGraceStart) < this.recoveryGraceDurationMs;
  }
}

export const visionWatchdog = new VisionWatchdog();
