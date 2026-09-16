import { FocusConfig } from '../../constants/FocusConfig';
import { modelManager, FaceLandmarkResult, PoseLandmarkResult, HandLandmarkResult, ObjectDetectionResult } from './ModelManager';
import { objectTracker } from './ObjectTracker';
import { TrackedObject } from '../../types';

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
  private animationFrameId: number | null = null;
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
    this.frameCount = 0;
    this.droppedFrames = 0;
    this.fpsWindowStart = Date.now();

    const loop = () => {
      if (!this.isRunning) return;

      const now = Date.now();

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

      // 1. Face Inference (with backpressure)
      if (now - this.lastFaceTime >= faceInterval) {
        if (!this.isFaceRunning) {
          this.isFaceRunning = true;
          this.lastFaceTime = now;
          modelManager.detectFace(videoSource).then(res => {
            this.latestFace = res;
            this.isFaceRunning = false;
            this.frameCount++;
            this.dispatchPerception(now);
          }).catch(() => {
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
          modelManager.detectPose(videoSource).then(res => {
            this.latestPose = res;
            this.isPoseRunning = false;
          }).catch(() => {
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
          modelManager.detectHands(videoSource).then(res => {
            this.latestHands = res;
            this.isHandsRunning = false;
          }).catch(() => {
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
          modelManager.detectObjects(videoSource).then((res: ObjectDetectionResult) => {
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
          }).catch(() => {
            this.isObjectRunning = false;
          });
        } else {
          this.droppedFrames++;
        }
      }

      if (typeof requestAnimationFrame !== 'undefined') {
        this.animationFrameId = requestAnimationFrame(loop);
      } else {
        setTimeout(loop, 40);
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      this.animationFrameId = requestAnimationFrame(loop);
    } else {
      setTimeout(loop, 40);
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
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
