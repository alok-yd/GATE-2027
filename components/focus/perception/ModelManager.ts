import {
  FilesetResolver,
  FaceLandmarker,
  PoseLandmarker,
  HandLandmarker,
  ObjectDetector,
} from '@mediapipe/tasks-vision';
import { DetectorType, ModelHealthState } from '../types';

/**
 * ModelManager
 * 
 * Lazy-loads MediaPipe vision models with WebGL/WebGPU acceleration and WASM fallback.
 * Guarantees detector independence: failure in hand/object detection does not crash face/presence.
 */
export class ModelManager {
  private static instance: ModelManager;

  private wasmResolver: any = null;
  private faceLandmarker: FaceLandmarker | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private objectDetector: ObjectDetector | null = null;

  private isInitializing: boolean = false;
  private activeDelegate: 'GPU' | 'CPU' = 'GPU';

  public static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  /**
   * Lazily initialize models on demand
   */
  public async initializeAllModels(preferGpu: boolean = true): Promise<{
    faceReady: boolean;
    poseReady: boolean;
    handsReady: boolean;
    objectReady: boolean;
  }> {
    if (this.isInitializing) {
      return this.getReadiness();
    }
    this.isInitializing = true;
    this.activeDelegate = preferGpu ? 'GPU' : 'CPU';

    try {
      if (!this.wasmResolver) {
        this.wasmResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
      }

      // Initialize detectors with independent try/catches so one failure doesn't block others
      await Promise.all([
        this.initFaceDetector(),
        this.initPoseDetector(),
        this.initHandDetector(),
        this.initObjectDetector(),
      ]);

      this.isInitializing = false;
      return this.getReadiness();
    } catch (err) {
      this.isInitializing = false;
      console.warn('ModelManager resolver initialization error:', err);
      return this.getReadiness();
    }
  }

  private async initFaceDetector(): Promise<void> {
    if (this.faceLandmarker) return;
    try {
      this.faceLandmarker = await FaceLandmarker.createFromOptions(this.wasmResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: this.activeDelegate,
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 2, // Track up to 2 faces to detect another person entering
      });
    } catch (gpuErr) {
      console.warn('FaceLandmarker GPU init failed, falling back to CPU:', gpuErr);
      try {
        this.faceLandmarker = await FaceLandmarker.createFromOptions(this.wasmResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU',
          },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: 'VIDEO',
          numFaces: 2,
        });
      } catch (cpuErr) {
        console.error('FaceLandmarker CPU init failed:', cpuErr);
      }
    }
  }

  private async initPoseDetector(): Promise<void> {
    if (this.poseLandmarker) return;
    try {
      this.poseLandmarker = await PoseLandmarker.createFromOptions(this.wasmResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: this.activeDelegate,
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    } catch (gpuErr) {
      console.warn('PoseLandmarker GPU init failed, trying CPU:', gpuErr);
      try {
        this.poseLandmarker = await PoseLandmarker.createFromOptions(this.wasmResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
      } catch (cpuErr) {
        console.warn('PoseLandmarker disabled due to error:', cpuErr);
      }
    }
  }

  private async initHandDetector(): Promise<void> {
    if (this.handLandmarker) return;
    try {
      this.handLandmarker = await HandLandmarker.createFromOptions(this.wasmResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: this.activeDelegate,
        },
        runningMode: 'VIDEO',
        numHands: 2,
      });
    } catch (gpuErr) {
      console.warn('HandLandmarker GPU init failed, trying CPU:', gpuErr);
      try {
        this.handLandmarker = await HandLandmarker.createFromOptions(this.wasmResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });
      } catch (cpuErr) {
        console.warn('HandLandmarker disabled due to error:', cpuErr);
      }
    }
  }

  private async initObjectDetector(): Promise<void> {
    if (this.objectDetector) return;
    try {
      this.objectDetector = await ObjectDetector.createFromOptions(this.wasmResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.task',
          delegate: this.activeDelegate,
        },
        scoreThreshold: 0.35,
        runningMode: 'VIDEO',
        categoryAllowlist: ['cell phone', 'mobile phone', 'person'],
      });
    } catch (gpuErr) {
      console.warn('ObjectDetector GPU init failed, trying CPU:', gpuErr);
      try {
        this.objectDetector = await ObjectDetector.createFromOptions(this.wasmResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.task',
            delegate: 'CPU',
          },
          scoreThreshold: 0.35,
          runningMode: 'VIDEO',
          categoryAllowlist: ['cell phone', 'mobile phone', 'person'],
        });
      } catch (cpuErr) {
        console.warn('ObjectDetector disabled due to error:', cpuErr);
      }
    }
  }

  public getFaceLandmarker(): FaceLandmarker | null {
    return this.faceLandmarker;
  }

  public getPoseLandmarker(): PoseLandmarker | null {
    return this.poseLandmarker;
  }

  public getHandLandmarker(): HandLandmarker | null {
    return this.handLandmarker;
  }

  public getObjectDetector(): ObjectDetector | null {
    return this.objectDetector;
  }

  public getActiveDelegate(): 'GPU' | 'CPU' {
    return this.activeDelegate;
  }

  public getReadiness(): {
    faceReady: boolean;
    poseReady: boolean;
    handsReady: boolean;
    objectReady: boolean;
  } {
    return {
      faceReady: Boolean(this.faceLandmarker),
      poseReady: Boolean(this.poseLandmarker),
      handsReady: Boolean(this.handLandmarker),
      objectReady: Boolean(this.objectDetector),
    };
  }

  public cleanup(): void {
    try {
      this.faceLandmarker?.close();
      this.poseLandmarker?.close();
      this.handLandmarker?.close();
      this.objectDetector?.close();
    } catch (e) {
      console.warn('Error during model cleanup:', e);
    }
    this.faceLandmarker = null;
    this.poseLandmarker = null;
    this.handLandmarker = null;
    this.objectDetector = null;
    this.wasmResolver = null;
  }
}

export const modelManager = ModelManager.getInstance();
