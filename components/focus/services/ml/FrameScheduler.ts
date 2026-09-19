import { FocusConfig } from '../../constants/FocusConfig';
import { modelManager, FaceLandmarkResult, PoseLandmarkResult, HandLandmarkResult, ObjectDetectionResult } from './ModelManager';
import { objectTracker } from './ObjectTracker';
import { TrackedObject } from '../../types';
import { visionWatchdog } from '../VisionWatchdog';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Inference timeout (${timeoutMs}ms) for ${operationName}`)), timeoutMs)
    )
  ]);
}

export interface PerceptionFrame {
  timestamp: number;
  face: FaceLandmarkResult;
  pose: PoseLandmarkResult;
  hands: HandLandmarkResult;
  trackedObjects: TrackedObject[];
  phoneDetected: boolean;
  phoneTrack?: TrackedObject;
  inferenceFps: number;
  avgLatencyMs: number;
  droppedFrames: number;
}

export type PerceptionCallback = (frame: PerceptionFrame) => void;

export class FrameScheduler {
  private isRunning: boolean = false;
  private currentGeneration: number = 0;
  private animationFrameId: number | null = null;
  private worker: Worker | null = null;
  private intervalId: any = null;
  private listeners: Set<PerceptionCallback> = new Set();

  // Inference state flags for backpressure
  private isFaceRunning: boolean = false;
  private isPoseRunning: boolean = false;
  private isHandsRunning: boolean = false;
  private isObjectRunning: boolean = false;

  // Last execution timestamps
  private lastFaceTime: number = 0;
  private lastPoseTime: number = 0;
  private lastHandsTime: number = 0;
  private lastObjectTime: number = 0;
  private lastDispatchTime: number = 0;

  // Latest cached results
  private latestFace: FaceLandmarkResult = {
    detected: false,
    confidence: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    eyeOpen: false,
    mouthOpen: false,
    gazeScore: 0
  };

  private latestPose: PoseLandmarkResult = {
    detected: false,
    confidence: 0,
    isPostureStable: false,
    inStudyZone: false
  };

  private latestHands: HandLandmarkResult = {
    detected: false,
    confidence: 0,
    handCount: 0,
    bboxes: [],
    isWritingLikeMovement: false,
    isDeskActivity: false,
    movementScore: 0
  };

  private latestObjects: TrackedObject[] = [];

  // Metrics
  private frameCount: number = 0;
  private droppedFrames: number = 0;
  private fpsWindowStart: number = Date.now();
  private measuredFps: number = 0;

  start(videoSource: HTMLVideoElement | HTMLCanvasElement): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentGeneration++;
    const gen = this.currentGeneration;

    this.frameCount = 0;
    this.droppedFrames = 0;
    this.fpsWindowStart = Date.now();
    this.lastDispatchTime = 0;

    const loop = () => {
      if (!this.isRunning || this.currentGeneration !== gen) return;

      const now = Date.now();
      visionWatchdog.recordWorkerTick(now);

      // Track FPS window every 1 second
      if (now - this.fpsWindowStart >= 1000) {
        this.measuredFps = this.frameCount;
        this.frameCount = 0;
        this.fpsWindowStart = now;
      }

      const faceInterval = 1000 / FocusConfig.faceFps;
      const poseInterval = 1000 / FocusConfig.poseFps;
      const handsInterval = 1000 / FocusConfig.handsFps;
      const objectInterval = 1000 / FocusConfig.objectFps;

      // 1. Face Inference (with timeout and isolated error recovery)
      if (now - this.lastFaceTime >= faceInterval) {
        if (!this.isFaceRunning) {
          this.isFaceRunning = true;
          this.lastFaceTime = now;
          withTimeout(modelManager.detectFace(videoSource), 2500, 'detectFace')
            .then(res => {
              if (this.currentGeneration !== gen || !this.isRunning) return;
              this.latestFace = res;
              this.isFaceRunning = false;
              this.frameCount++;
              visionWatchdog.recordInference(now);
            })
            .catch(err => {
              console.warn('FrameScheduler: Face inference stall/error:', err?.message || err);
              this.isFaceRunning = false;
            });
        } else {
          this.droppedFrames++;
        }
      }

      // 2. Pose Inference
      if (now - this.lastPoseTime >= poseInterval) {
        if (!this.isPoseRunning) {
          this.isPoseRunning = true;
          this.lastPoseTime = now;
          withTimeout(modelManager.detectPose(videoSource), 2500, 'detectPose')
            .then(res => {
              if (this.currentGeneration !== gen || !this.isRunning) return;
              this.latestPose = res;
              this.isPoseRunning = false;
            })
            .catch(err => {
              console.warn('FrameScheduler: Pose inference stall/error:', err?.message || err);
              this.isPoseRunning = false;
            });
        } else {
          this.droppedFrames++;
        }
      }

      // 3. Hands Inference
      if (now - this.lastHandsTime >= handsInterval) {
        if (!this.isHandsRunning) {
          this.isHandsRunning = true;
          this.lastHandsTime = now;
          withTimeout(modelManager.detectHands(videoSource), 2500, 'detectHands')
            .then(res => {
              if (this.currentGeneration !== gen || !this.isRunning) return;
              this.latestHands = res;
              this.isHandsRunning = false;
            })
            .catch(err => {
              console.warn('FrameScheduler: Hands inference stall/error:', err?.message || err);
              this.isHandsRunning = false;
            });
        } else {
          this.droppedFrames++;
        }
      }

      // 4. Object & Phone Inference
      if (now - this.lastObjectTime >= objectInterval) {
        if (!this.isObjectRunning) {
          this.isObjectRunning = true;
          this.lastObjectTime = now;
          withTimeout(modelManager.detectObjects(videoSource), 2500, 'detectObjects')
            .then((res: ObjectDetectionResult) => {
              if (this.currentGeneration !== gen || !this.isRunning) return;
              const faceCentroid = this.latestFace.bbox ? {
                x: this.latestFace.bbox.x + this.latestFace.bbox.width / 2,
                y: this.latestFace.bbox.y + this.latestFace.bbox.height / 2
              } : undefined;

              this.latestObjects = objectTracker.update(
                res.detections,
                this.latestHands.bboxes,
                faceCentroid,
                now
              );
              this.isObjectRunning = false;
            })
            .catch(err => {
              console.warn('FrameScheduler: Object inference stall/error:', err?.message || err);
              this.isObjectRunning = false;
            });
        } else {
          this.droppedFrames++;
        }
      }

      // Decoupled Perception Dispatch: emit on regular ~100ms interval (10 FPS) regardless of face speed
      if (now - this.lastDispatchTime >= 100) {
        this.lastDispatchTime = now;
        this.dispatchPerception(now);
      }

    };

    this.startBackgroundTicker(loop);
  }

  private startBackgroundTicker(step: () => void): void {
    this.stopBackgroundTicker();

    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        const workerScript = `
          let id = null;
          self.onmessage = function(e) {
            if (e.data === 'start') {
              if (id) clearInterval(id);
              id = setInterval(function() {
                self.postMessage('tick');
              }, 30);
            } else if (e.data === 'stop') {
              if (id) {
                clearInterval(id);
                id = null;
              }
            }
          };
        `;
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        this.worker.onmessage = () => {
          step();
        };
        this.worker.postMessage('start');
        return;
      } catch (err) {
        console.warn('FrameScheduler Web Worker fallback to setInterval:', err);
      }
    }

    this.intervalId = setInterval(step, 30);
  }

  private stopBackgroundTicker(): void {
    if (this.worker) {
      try {
        this.worker.postMessage('stop');
        this.worker.terminate();
      } catch {}
      this.worker = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.animationFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  stop(): void {
    this.isRunning = false;
    this.currentGeneration++;
    this.isFaceRunning = false;
    this.isPoseRunning = false;
    this.isHandsRunning = false;
    this.isObjectRunning = false;
    this.stopBackgroundTicker();
  }

  subscribe(callback: PerceptionCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private dispatchPerception(now: number): void {
    const phoneTrack = this.latestObjects.find(o => o.label === 'cell phone');
    const phoneDetected = !!phoneTrack && (phoneTrack.confidence >= FocusConfig.phoneThreshold);

    const frame: PerceptionFrame = {
      timestamp: now,
      face: this.latestFace,
      pose: this.latestPose,
      hands: this.latestHands,
      trackedObjects: this.latestObjects,
      phoneDetected,
      phoneTrack,
      inferenceFps: this.measuredFps || FocusConfig.faceFps,
      avgLatencyMs: modelManager.getLastLatency(),
      droppedFrames: this.droppedFrames
    };

    this.listeners.forEach(l => l(frame));
  }

  getMetrics() {
    return {
      fps: this.measuredFps,
      droppedFrames: this.droppedFrames,
      avgLatencyMs: modelManager.getLastLatency()
    };
  }
}

export const frameScheduler = new FrameScheduler();
