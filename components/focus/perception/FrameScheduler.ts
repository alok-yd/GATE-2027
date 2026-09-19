import { FocusConfig } from '../storage/FocusConfig';
import { CameraManager } from './CameraManager';
import { ModelManager } from './ModelManager';
import { StudentPresenceEngine } from './StudentPresenceEngine';
import { DeviceDetectorEngine } from './DeviceDetectorEngine';
import { VisionWatchdog } from '../watchdogs/VisionWatchdog';
import { DetectorType, StudentPresenceEvidence, DeviceInteractionEvidence } from '../types';

export interface FrameSchedulerCallback {
  onPresenceUpdate: (evidence: StudentPresenceEvidence) => void;
  onDeviceUpdate: (evidence: DeviceInteractionEvidence) => void;
  onFpsUpdate: (fps: number, latencyMs: number) => void;
}

/**
 * FrameScheduler
 * 
 * Decoupled adaptive inference scheduler with per-detector backpressure.
 * Runs smoothly in foreground (rAF) and continues in background via interval ticker.
 */
export class FrameScheduler {
  private cameraManager: CameraManager;
  private modelManager: ModelManager;
  private presenceEngine: StudentPresenceEngine;
  private deviceEngine: DeviceDetectorEngine;
  private visionWatchdog: VisionWatchdog;

  private isRunning: boolean = false;
  private rafId: number | null = null;
  private backgroundIntervalId: any = null;

  // Last execution timestamps per detector
  private lastRunAt: Record<DetectorType, number> = {
    face: 0,
    pose: 0,
    hands: 0,
    object: 0,
  };

  // Backpressure flags
  private inFlight: Record<DetectorType, boolean> = {
    face: false,
    pose: false,
    hands: false,
    object: false,
  };

  // Cached results for temporal fusion
  private lastFaceResult: any = null;
  private lastPoseResult: any = null;
  private lastHandResult: any = null;
  private lastObjectResult: any = null;

  // Performance telemetry
  private frameCounter: number = 0;
  private lastFpsSampleAt: number = Date.now();
  private currentFps: number = 0;
  private averageLatencyMs: number = 0;

  private callbacks: FrameSchedulerCallback | null = null;

  constructor(
    cameraManager: CameraManager,
    modelManager: ModelManager,
    presenceEngine: StudentPresenceEngine,
    deviceEngine: DeviceDetectorEngine,
    visionWatchdog: VisionWatchdog
  ) {
    this.cameraManager = cameraManager;
    this.modelManager = modelManager;
    this.presenceEngine = presenceEngine;
    this.deviceEngine = deviceEngine;
    this.visionWatchdog = visionWatchdog;
  }

  public setCallbacks(callbacks: FrameSchedulerCallback): void {
    this.callbacks = callbacks;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFpsSampleAt = Date.now();
    this.frameCounter = 0;

    this.scheduleNextLoop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.backgroundIntervalId !== null) {
      clearInterval(this.backgroundIntervalId);
      this.backgroundIntervalId = null;
    }
  }

  private scheduleNextLoop(): void {
    if (!this.isRunning) return;

    // Use requestAnimationFrame when visible; backgroundInterval acts as safety net
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.rafId = requestAnimationFrame(() => {
        this.processCycle();
        this.scheduleNextLoop();
      });
    } else {
      // Document hidden / minimized: run on bounded timer tick (~50ms)
      if (this.backgroundIntervalId === null) {
        this.backgroundIntervalId = setInterval(() => {
          if (!this.isRunning) {
            if (this.backgroundIntervalId !== null) clearInterval(this.backgroundIntervalId);
            return;
          }
          if (document.visibilityState === 'visible') {
            if (this.backgroundIntervalId !== null) {
              clearInterval(this.backgroundIntervalId);
              this.backgroundIntervalId = null;
            }
            this.scheduleNextLoop();
            return;
          }
          this.processCycle();
        }, 50);
      }
    }
  }

  private async processCycle(): Promise<void> {
    const video = this.cameraManager.getVideoElement();
    if (!video || video.readyState < 2 || video.paused || video.ended) {
      return;
    }

    const now = Date.now();
    this.cameraManager.recordFrameReceived();
    this.frameCounter++;

    // Telemetry sampling every 1s
    if (now - this.lastFpsSampleAt >= 1000) {
      this.currentFps = Math.round((this.frameCounter * 1000) / (now - this.lastFpsSampleAt));
      this.frameCounter = 0;
      this.lastFpsSampleAt = now;
      this.callbacks?.onFpsUpdate(this.currentFps, this.averageLatencyMs);
    }

    const startTime = performance.now();

    // 1. Face Landmarker (target ~12 FPS, 83ms)
    const faceInterval = 1000 / FocusConfig.FPS_TARGET_FACE;
    if (!this.inFlight.face && now - this.lastRunAt.face >= faceInterval) {
      const faceModel = this.modelManager.getFaceLandmarker();
      if (faceModel) {
        this.inFlight.face = true;
        this.lastRunAt.face = now;
        try {
          const t0 = performance.now();
          this.lastFaceResult = faceModel.detectForVideo(video, now);
          const dur = Math.round(performance.now() - t0);
          this.visionWatchdog.recordInference('face', dur, now);
        } catch (e) {
          this.visionWatchdog.recordError('face', String(e), now);
        } finally {
          this.inFlight.face = false;
        }
      }
    }

    // 2. Pose Landmarker (target ~10 FPS, 100ms)
    const poseInterval = 1000 / FocusConfig.FPS_TARGET_POSE;
    if (!this.inFlight.pose && now - this.lastRunAt.pose >= poseInterval) {
      const poseModel = this.modelManager.getPoseLandmarker();
      if (poseModel) {
        this.inFlight.pose = true;
        this.lastRunAt.pose = now;
        try {
          const t0 = performance.now();
          this.lastPoseResult = poseModel.detectForVideo(video, now);
          const dur = Math.round(performance.now() - t0);
          this.visionWatchdog.recordInference('pose', dur, now);
        } catch (e) {
          this.visionWatchdog.recordError('pose', String(e), now);
        } finally {
          this.inFlight.pose = false;
        }
      }
    }

    // 3. Hand Landmarker (target ~10 FPS, 100ms)
    const handInterval = 1000 / FocusConfig.FPS_TARGET_HANDS;
    if (!this.inFlight.hands && now - this.lastRunAt.hands >= handInterval) {
      const handModel = this.modelManager.getHandLandmarker();
      if (handModel) {
        this.inFlight.hands = true;
        this.lastRunAt.hands = now;
        try {
          const t0 = performance.now();
          this.lastHandResult = handModel.detectForVideo(video, now);
          const dur = Math.round(performance.now() - t0);
          this.visionWatchdog.recordInference('hands', dur, now);
        } catch (e) {
          this.visionWatchdog.recordError('hands', String(e), now);
        } finally {
          this.inFlight.hands = false;
        }
      }
    }

    // 4. Object Detector (target ~8 FPS, 125ms)
    const objInterval = 1000 / FocusConfig.FPS_TARGET_OBJECT;
    if (!this.inFlight.object && now - this.lastRunAt.object >= objInterval) {
      const objModel = this.modelManager.getObjectDetector();
      if (objModel) {
        this.inFlight.object = true;
        this.lastRunAt.object = now;
        try {
          const t0 = performance.now();
          this.lastObjectResult = objModel.detectForVideo(video, now);
          const dur = Math.round(performance.now() - t0);
          this.visionWatchdog.recordInference('object', dur, now);
        } catch (e) {
          this.visionWatchdog.recordError('object', String(e), now);
        } finally {
          this.inFlight.object = false;
        }
      }
    }

    // Evaluate fused presence and device evidence
    const presenceEvidence = this.presenceEngine.evaluate(
      this.lastFaceResult,
      this.lastPoseResult,
      this.lastObjectResult,
      now
    );
    this.callbacks?.onPresenceUpdate(presenceEvidence);

    const deviceEvidence = this.deviceEngine.evaluate(
      this.lastObjectResult,
      this.lastHandResult,
      this.lastFaceResult,
      now
    );
    this.callbacks?.onDeviceUpdate(deviceEvidence);

    const totalDur = Math.round(performance.now() - startTime);
    this.averageLatencyMs = Math.round(this.averageLatencyMs * 0.8 + totalDur * 0.2);
  }

  public getTelemetry(): { fps: number; averageLatencyMs: number } {
    return {
      fps: this.currentFps,
      averageLatencyMs: this.averageLatencyMs,
    };
  }
}
