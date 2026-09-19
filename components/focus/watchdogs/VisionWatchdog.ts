import { DetectorHealth, DetectorType, ModelHealthState } from '../types';
import { FocusConfig } from '../storage/FocusConfig';

export class VisionWatchdog {
  private detectorHealths: Map<DetectorType, DetectorHealth> = new Map();

  constructor() {
    const types: DetectorType[] = ['face', 'pose', 'hands', 'object'];
    for (const t of types) {
      this.detectorHealths.set(t, {
        detector: t,
        state: 'UNINITIALIZED',
        lastInferenceAt: 0,
        inferenceCount: 0,
        averageLatencyMs: 0,
        errorCount: 0,
      });
    }
  }

  public recordInference(
    type: DetectorType,
    latencyMs: number,
    now: number = Date.now()
  ): void {
    const existing = this.detectorHealths.get(type);
    if (!existing) return;

    const count = existing.inferenceCount + 1;
    // Exponential moving average for latency
    const avg = existing.inferenceCount === 0
      ? latencyMs
      : Math.round(existing.averageLatencyMs * 0.8 + latencyMs * 0.2);

    this.detectorHealths.set(type, {
      ...existing,
      state: 'READY',
      lastInferenceAt: now,
      inferenceCount: count,
      averageLatencyMs: avg,
    });
  }

  public recordError(
    type: DetectorType,
    errorMessage: string,
    now: number = Date.now()
  ): void {
    const existing = this.detectorHealths.get(type);
    if (!existing) return;

    const errorCount = existing.errorCount + 1;
    const state: ModelHealthState = errorCount > 3 ? 'ERROR' : 'DEGRADED';

    this.detectorHealths.set(type, {
      ...existing,
      state,
      errorCount,
      errorMessage,
      lastInferenceAt: now,
    });
  }

  public setDetectorState(type: DetectorType, state: ModelHealthState): void {
    const existing = this.detectorHealths.get(type);
    if (existing) {
      existing.state = state;
    }
  }

  /**
   * Primary vision health evaluation.
   * Face detector is vital for presence. Object and Pose add complementary signals.
   */
  public evaluate(now: number = Date.now()): {
    isHealthy: boolean;
    reason?: string;
    details: DetectorHealth[];
  } {
    const details = Array.from(this.detectorHealths.values());
    const faceHealth = this.detectorHealths.get('face');

    // If face detector hasn't produced inference within max age
    if (faceHealth && faceHealth.state === 'READY') {
      const ageMs = now - faceHealth.lastInferenceAt;
      if (faceHealth.lastInferenceAt > 0 && ageMs > FocusConfig.MAX_INFERENCE_AGE_MS) {
        return {
          isHealthy: false,
          reason: `Face detector stalled (${Math.round(ageMs / 1000)}s without inference)`,
          details,
        };
      }
    }

    if (faceHealth && faceHealth.state === 'ERROR') {
      return {
        isHealthy: false,
        reason: 'Face perception detector failed with unrecoverable error',
        details,
      };
    }

    return {
      isHealthy: true,
      details,
    };
  }

  public getHealth(type: DetectorType): DetectorHealth | undefined {
    return this.detectorHealths.get(type);
  }

  public getAllHealths(): DetectorHealth[] {
    return Array.from(this.detectorHealths.values());
  }
}
