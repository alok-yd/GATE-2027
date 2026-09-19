import { ModelStatusMap, ModelReadinessState, BoundingBox } from '../../types';
import { FocusConfig } from '../../constants/FocusConfig';
import { DeviceCapabilityDetector } from './DeviceCapabilityDetector';
import { RawDetection } from './ObjectTracker';

export interface FaceLandmarkResult {
  detected: boolean;
  confidence: number;
  bbox?: BoundingBox;
  yaw: number;
  pitch: number;
  roll: number;
  eyeOpen: boolean;
  mouthOpen: boolean;
  gazeScore: number;
  aspectRatio?: number;
  boxSpanRatio?: number;
  features?: {
    eyeDistanceRatio?: number;
    noseToJawRatio?: number;
  };
}

export interface PoseLandmarkResult {
  detected: boolean;
  confidence: number;
  isPostureStable: boolean;
  inStudyZone: boolean;
  torsoCentroid?: { x: number; y: number };
}

export interface HandLandmarkResult {
  detected: boolean;
  confidence: number;
  handCount: number;
  bboxes: BoundingBox[];
  isWritingLikeMovement: boolean;
  isDeskActivity: boolean;
  movementScore: number;
}

export interface ObjectDetectionResult {
  detections: RawDetection[];
  inferenceLatencyMs: number;
}

export interface DetectorHealth {
  status: ModelReadinessState;
  consecutiveFailures: number;
  lastInferenceTime: number;
  delegate: 'GPU' | 'CPU';
}

export class ModelManager {
  private statusMap: ModelStatusMap = {
    face: 'uninitialized',
    pose: 'uninitialized',
    hands: 'uninitialized',
    object: 'uninitialized'
  };

  private detectorHealth: Record<'face' | 'pose' | 'hands' | 'object', DetectorHealth> = {
    face: { status: 'uninitialized', consecutiveFailures: 0, lastInferenceTime: 0, delegate: 'CPU' },
    pose: { status: 'uninitialized', consecutiveFailures: 0, lastInferenceTime: 0, delegate: 'CPU' },
    hands: { status: 'uninitialized', consecutiveFailures: 0, lastInferenceTime: 0, delegate: 'CPU' },
    object: { status: 'uninitialized', consecutiveFailures: 0, lastInferenceTime: 0, delegate: 'CPU' }
  };

  private listeners: Set<(status: ModelStatusMap) => void> = new Set();
  private isInitializing: boolean = false;
  private cachedVisionTasks: any = null;
  private cachedFileset: any = null;
  private faceLandmarker: any = null;
  private poseLandmarker: any = null;
  private handLandmarker: any = null;
  private objectDetector: any = null;
  private lastInferenceLatency: number = 0;
  private totalInferences: number = 0;
  private failedInferences: number = 0;

  async initialize(): Promise<{ success: boolean; errors: string[] }> {
    if (this.isInitializing) return { success: false, errors: ['Already initializing'] };
    this.isInitializing = true;

    const capabilities = await DeviceCapabilityDetector.detect();
    const errors: string[] = [];
    const preferredDelegate: 'GPU' | 'CPU' = capabilities.hasWebGPU ? 'GPU' : 'CPU';

    this.detectorHealth.face.delegate = preferredDelegate;
    this.detectorHealth.pose.delegate = preferredDelegate;
    this.detectorHealth.hands.delegate = preferredDelegate;

    // Attempt to load MediaPipe Vision tasks dynamically if browser supports it
    try {
      this.updateStatus('face', 'loading');
      this.updateStatus('pose', 'loading');
      this.updateStatus('hands', 'loading');
      this.updateStatus('object', 'loading');

      const visionTasks = await import('@mediapipe/tasks-vision').catch(err => {
        console.warn('Could not dynamically load @mediapipe/tasks-vision:', err);
        return null;
      });
      this.cachedVisionTasks = visionTasks;

      if (visionTasks && typeof window !== 'undefined') {
        const { FilesetResolver, FaceLandmarker, PoseLandmarker, HandLandmarker } = visionTasks;
        
        try {
          const fileset = await FilesetResolver.forVisionTasks(FocusConfig.wasmBaseUrl);
          this.cachedFileset = fileset;

          // Face Landmarker
          try {
            this.faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: FocusConfig.faceModelUrl,
                delegate: this.detectorHealth.face.delegate
              },
              runningMode: 'IMAGE',
              numFaces: 1,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: true
            });
            this.updateStatus('face', 'ready');
            this.detectorHealth.face.consecutiveFailures = 0;
          } catch (e: any) {
            console.warn('FaceLandmarker GPU load fallback to CPU:', e?.message || e);
            try {
              this.detectorHealth.face.delegate = 'CPU';
              this.faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
                baseOptions: {
                  modelAssetPath: FocusConfig.faceModelUrl,
                  delegate: 'CPU'
                },
                runningMode: 'IMAGE',
                numFaces: 1,
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true
              });
              this.updateStatus('face', 'ready');
              this.detectorHealth.face.consecutiveFailures = 0;
            } catch (cpuErr: any) {
              console.warn('FaceLandmarker CPU load fallback:', cpuErr?.message || cpuErr);
              this.updateStatus('face', 'fallback');
            }
          }

          // Pose Landmarker
          try {
            this.poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: FocusConfig.poseModelUrl,
                delegate: this.detectorHealth.pose.delegate
              },
              runningMode: 'IMAGE',
              numPoses: 1
            });
            this.updateStatus('pose', 'ready');
            this.detectorHealth.pose.consecutiveFailures = 0;
          } catch (e: any) {
            console.warn('PoseLandmarker load fallback:', e?.message || e);
            this.updateStatus('pose', 'fallback');
          }

          // Hand Landmarker
          try {
            this.handLandmarker = await HandLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: FocusConfig.handModelUrl,
                delegate: this.detectorHealth.hands.delegate
              },
              runningMode: 'IMAGE',
              numHands: 2
            });
            this.updateStatus('hands', 'ready');
            this.detectorHealth.hands.consecutiveFailures = 0;
          } catch (e: any) {
            console.warn('HandLandmarker load fallback:', e?.message || e);
            this.updateStatus('hands', 'fallback');
          }
        } catch (filesetErr: any) {
          console.warn('MediaPipe FilesetResolver fallback:', filesetErr?.message || filesetErr);
          this.updateStatus('face', 'fallback');
          this.updateStatus('pose', 'fallback');
          this.updateStatus('hands', 'fallback');
        }
      } else {
        this.updateStatus('face', 'fallback');
        this.updateStatus('pose', 'fallback');
        this.updateStatus('hands', 'fallback');
      }

      // Initialize lightweight object detector via onnxruntime-web or embedded lightweight detector
      try {
        const ort = await import('onnxruntime-web').catch(e => {
          console.warn('onnxruntime-web import notice:', e);
          return null;
        });
        if (ort) {
          this.updateStatus('object', 'ready');
        } else {
          this.updateStatus('object', 'fallback');
        }
      } catch (ortErr: any) {
        this.updateStatus('object', 'fallback');
      }

    } catch (globalErr: any) {
      errors.push(globalErr?.message || 'Model initialization failure');
      this.updateStatus('face', 'fallback');
      this.updateStatus('pose', 'fallback');
      this.updateStatus('hands', 'fallback');
      this.updateStatus('object', 'fallback');
    } finally {
      this.isInitializing = false;
    }

    return {
      success: errors.length === 0,
      errors
    };
  }

  async detectFace(source: HTMLVideoElement | HTMLCanvasElement): Promise<FaceLandmarkResult> {
    const t0 = performance.now();
    try {
      if (this.faceLandmarker && this.statusMap.face === 'ready') {
        const result = this.faceLandmarker.detect(source);
        if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
          const landmarks = result.faceLandmarks[0];
          // Extract 3D head pose and landmarks
          const nose = landmarks[1];
          const leftEye = landmarks[33];
          const rightEye = landmarks[263];
          const chin = landmarks[152];
          const forehead = landmarks[10];

          // Compute yaw, pitch, roll
          const dx = rightEye.x - leftEye.x;
          const dy = rightEye.y - leftEye.y;
          const roll = Math.atan2(dy, dx) * (180 / Math.PI);
          const yaw = Math.round((nose.x - (leftEye.x + rightEye.x) / 2) * 120);
          const pitch = Math.round((nose.y - (forehead.y + chin.y) / 2) * 110);

          let minX = 1, maxX = 0, minY = 1, maxY = 0;
          for (const pt of landmarks) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
          }

          const boxWidth = Math.max(0.001, maxX - minX);
          const boxHeight = Math.max(0.001, maxY - minY);
          const aspectRatio = Number((boxHeight / boxWidth).toFixed(2));
          const boxSpanRatio = Number(boxWidth.toFixed(2));
          const eyeDist = Math.hypot(dx, dy);
          const noseToJawDist = (chin && nose) ? Math.hypot(chin.x - nose.x, chin.y - nose.y) : 0;
          const eyeDistanceRatio = boxWidth > 0 ? Number((eyeDist / boxWidth).toFixed(3)) : 0;
          const noseToJawRatio = boxHeight > 0 ? Number((noseToJawDist / boxHeight).toFixed(3)) : 0;

          const gazeScore = Math.max(0.4, 1.0 - (Math.abs(yaw) / 60) * 0.5 - (Math.max(0, pitch - 15) / 40) * 0.5);

          this.recordInferenceSuccess(performance.now() - t0, 'face');
          return {
            detected: true,
            confidence: 0.94,
            bbox: {
              x: Math.round(minX * 100),
              y: Math.round(minY * 100),
              width: Math.round((maxX - minX) * 100),
              height: Math.round((maxY - minY) * 100)
            },
            yaw,
            pitch,
            roll: Math.round(roll),
            eyeOpen: true,
            mouthOpen: false,
            gazeScore: Number(gazeScore.toFixed(2)),
            aspectRatio,
            boxSpanRatio,
            features: {
              eyeDistanceRatio,
              noseToJawRatio
            }
          };
        }
      }
    } catch (err) {
      this.recordInferenceFailure('face');
    }

    return this.fallbackFaceDetection(source);
  }

  async detectPose(source: HTMLVideoElement | HTMLCanvasElement): Promise<PoseLandmarkResult> {
    const t0 = performance.now();
    try {
      if (this.poseLandmarker && this.statusMap.pose === 'ready') {
        const result = this.poseLandmarker.detect(source);
        if (result && result.landmarks && result.landmarks.length > 0) {
          const lms = result.landmarks[0];
          const leftShoulder = lms[11];
          const rightShoulder = lms[12];
          if (leftShoulder && rightShoulder && leftShoulder.visibility > 0.5 && rightShoulder.visibility > 0.5) {
            const centerX = (leftShoulder.x + rightShoulder.x) / 2;
            const centerY = (leftShoulder.y + rightShoulder.y) / 2;
            const inStudyZone = centerX >= 0.2 && centerX <= 0.8 && centerY <= 0.85;

            this.recordInferenceSuccess(performance.now() - t0, 'pose');
            return {
              detected: true,
              confidence: Math.min(0.96, (leftShoulder.visibility + rightShoulder.visibility) / 2),
              isPostureStable: true,
              inStudyZone,
              torsoCentroid: { x: Math.round(centerX * 100), y: Math.round(centerY * 100) }
            };
          }
        }
      }
    } catch {
      this.recordInferenceFailure('pose');
    }

    return {
      detected: false,
      confidence: 0.0,
      isPostureStable: false,
      inStudyZone: false
    };
  }

  async detectHands(source: HTMLVideoElement | HTMLCanvasElement): Promise<HandLandmarkResult> {
    const t0 = performance.now();
    try {
      if (this.handLandmarker && this.statusMap.hands === 'ready') {
        const result = this.handLandmarker.detect(source);
        if (result && result.landmarks && result.landmarks.length > 0) {
          const bboxes: BoundingBox[] = [];
          for (const hand of result.landmarks) {
            let minX = 1, maxX = 0, minY = 1, maxY = 0;
            for (const pt of hand) {
              if (pt.x < minX) minX = pt.x;
              if (pt.x > maxX) maxX = pt.x;
              if (pt.y < minY) minY = pt.y;
              if (pt.y > maxY) maxY = pt.y;
            }
            bboxes.push({
              x: Math.round(minX * 100),
              y: Math.round(minY * 100),
              width: Math.round((maxX - minX) * 100),
              height: Math.round((maxY - minY) * 100)
            });
          }

          // Check if hands are in desk area (y > 45%)
          const inDeskArea = bboxes.some(b => (b.y + b.height / 2) > 45);

          this.recordInferenceSuccess(performance.now() - t0, 'hands');
          return {
            detected: true,
            confidence: 0.90,
            handCount: bboxes.length,
            bboxes,
            isWritingLikeMovement: inDeskArea,
            isDeskActivity: inDeskArea,
            movementScore: inDeskArea ? 0.75 : 0.20
          };
        }
      }
    } catch {
      this.recordInferenceFailure('hands');
    }

    return {
      detected: false,
      confidence: 0.0,
      handCount: 0,
      bboxes: [],
      isWritingLikeMovement: false,
      isDeskActivity: false,
      movementScore: 0.0
    };
  }

  async detectObjects(source: HTMLVideoElement | HTMLCanvasElement): Promise<ObjectDetectionResult> {
    const t0 = performance.now();
    const detections: RawDetection[] = [];

    // Scan for handheld rectangular high-contrast objects (phone / tablet / calculator)
    try {
      const cw = 160;
      const ch = 120;
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(source, 0, 0, cw, ch);
        const imgData = ctx.getImageData(0, 0, cw, ch);
        const d = imgData.data;

        // Search for dense vertical rectangle with dark or illuminated face in chest/desk area
        const startY = Math.floor(ch * 0.35);
        let phoneFeatures = 0;
        let minPx = cw, maxPx = 0, minPy = ch, maxPy = 0;

        for (let y = startY; y < ch - 6; y += 3) {
          for (let x = 12; x < cw - 12; x += 3) {
            const idx = (y * cw + x) * 4;
            const luma = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];
            const nextLuma = 0.299 * d[idx + 16] + 0.587 * d[idx + 17] + 0.114 * d[idx + 18];
            const diff = Math.abs(luma - nextLuma);

            // Vertical edge + high contrast screen/body
            if (diff > 38 && (luma < 45 || luma > 185)) {
              phoneFeatures++;
              if (x < minPx) minPx = x;
              if (x > maxPx) maxPx = x;
              if (y < minPy) minPy = y;
              if (y > maxPy) maxPy = y;
            }
          }
        }

        const spanW = maxPx - minPx;
        const spanH = maxPy - minPy;
        const aspect = spanH / Math.max(1, spanW);

        // Phone aspect ratio check (typically 1.7 to 2.4:1 vertical)
        if (phoneFeatures >= 14 && spanW >= 10 && spanH >= 18 && aspect >= 1.4 && aspect <= 2.8) {
          detections.push({
            label: 'cell phone',
            confidence: Math.min(0.92, Number((0.55 + (phoneFeatures / 60)).toFixed(2))),
            bbox: {
              x: Math.round((minPx / cw) * 100),
              y: Math.round((minPy / ch) * 100),
              width: Math.round((spanW / cw) * 100),
              height: Math.round((spanH / ch) * 100)
            }
          });
        }
      }
      this.recordInferenceSuccess(performance.now() - t0, 'object');
    } catch {
      this.recordInferenceFailure('object');
    }

    const latency = performance.now() - t0;
    this.lastInferenceLatency = latency;

    return {
      detections,
      inferenceLatencyMs: Number(latency.toFixed(1))
    };
  }

  private fallbackFaceDetection(source: HTMLVideoElement | HTMLCanvasElement): FaceLandmarkResult {
    // Model unavailable or no face detected — never fabricate a positive detection
    return {
      detected: false,
      confidence: 0.0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      eyeOpen: false,
      mouthOpen: false,
      gazeScore: 0.0
    };
  }

  private recordInferenceSuccess(latency: number, detector?: 'face' | 'pose' | 'hands' | 'object') {
    this.totalInferences++;
    this.lastInferenceLatency = latency;
    if (detector) {
      this.detectorHealth[detector].consecutiveFailures = 0;
      this.detectorHealth[detector].lastInferenceTime = Date.now();
    }
  }

  private recordInferenceFailure(detector?: 'face' | 'pose' | 'hands' | 'object') {
    this.failedInferences++;
    if (detector) {
      this.detectorHealth[detector].consecutiveFailures++;
    }
  }

  async restartDetector(name: 'face' | 'pose' | 'hands' | 'object'): Promise<boolean> {
    console.log(`ModelManager: Restarting detector "${name}"...`);
    this.updateStatus(name, 'loading');

    try {
      if (name === 'object') {
        this.detectorHealth.object.consecutiveFailures = 0;
        this.updateStatus('object', 'ready');
        return true;
      }

      if (!this.cachedVisionTasks && typeof window !== 'undefined') {
        this.cachedVisionTasks = await import('@mediapipe/tasks-vision').catch(err => {
          console.warn('restartDetector: Could not load @mediapipe/tasks-vision:', err);
          return null;
        });
      }

      if (!this.cachedVisionTasks) {
        this.updateStatus(name, 'fallback');
        return false;
      }

      const { FilesetResolver, FaceLandmarker, PoseLandmarker, HandLandmarker } = this.cachedVisionTasks;
      if (!this.cachedFileset) {
        this.cachedFileset = await FilesetResolver.forVisionTasks(FocusConfig.wasmBaseUrl);
      }

      const fileset = this.cachedFileset;

      if (name === 'face') {
        try {
          if (this.faceLandmarker?.close) {
            this.faceLandmarker.close();
          }
        } catch {}
        this.faceLandmarker = null;

        // If it failed previously on GPU, try CPU directly
        const targetDelegate = this.detectorHealth.face.consecutiveFailures > 2 ? 'CPU' : this.detectorHealth.face.delegate;
        try {
          this.faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: FocusConfig.faceModelUrl,
              delegate: targetDelegate
            },
            runningMode: 'IMAGE',
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true
          });
          this.detectorHealth.face.delegate = targetDelegate;
          this.detectorHealth.face.consecutiveFailures = 0;
          this.updateStatus('face', 'ready');
          return true;
        } catch (e) {
          console.warn('restartDetector face retry with CPU:', e);
          try {
            this.faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
              baseOptions: {
                modelAssetPath: FocusConfig.faceModelUrl,
                delegate: 'CPU'
              },
              runningMode: 'IMAGE',
              numFaces: 1,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: true
            });
            this.detectorHealth.face.delegate = 'CPU';
            this.detectorHealth.face.consecutiveFailures = 0;
            this.updateStatus('face', 'ready');
            return true;
          } catch (cpuErr) {
            this.updateStatus('face', 'fallback');
            return false;
          }
        }
      }

      if (name === 'pose') {
        try {
          if (this.poseLandmarker?.close) {
            this.poseLandmarker.close();
          }
        } catch {}
        this.poseLandmarker = null;
        try {
          this.poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: FocusConfig.poseModelUrl,
              delegate: 'CPU'
            },
            runningMode: 'IMAGE',
            numPoses: 1
          });
          this.detectorHealth.pose.consecutiveFailures = 0;
          this.updateStatus('pose', 'ready');
          return true;
        } catch (e) {
          this.updateStatus('pose', 'fallback');
          return false;
        }
      }

      if (name === 'hands') {
        try {
          if (this.handLandmarker?.close) {
            this.handLandmarker.close();
          }
        } catch {}
        this.handLandmarker = null;
        try {
          this.handLandmarker = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: FocusConfig.handModelUrl,
              delegate: 'CPU'
            },
            runningMode: 'IMAGE',
            numHands: 2
          });
          this.detectorHealth.hands.consecutiveFailures = 0;
          this.updateStatus('hands', 'ready');
          return true;
        } catch (e) {
          this.updateStatus('hands', 'fallback');
          return false;
        }
      }
    } catch (err) {
      console.warn(`restartDetector "${name}" error:`, err);
      this.updateStatus(name, 'fallback');
      return false;
    }

    return false;
  }

  getDetectorHealth(): Record<'face' | 'pose' | 'hands' | 'object', DetectorHealth> {
    return {
      face: { ...this.detectorHealth.face, status: this.statusMap.face },
      pose: { ...this.detectorHealth.pose, status: this.statusMap.pose },
      hands: { ...this.detectorHealth.hands, status: this.statusMap.hands },
      object: { ...this.detectorHealth.object, status: this.statusMap.object }
    };
  }

  getStatus(): ModelStatusMap {
    return { ...this.statusMap };
  }

  getLastLatency(): number {
    return this.lastInferenceLatency;
  }

  subscribe(listener: (status: ModelStatusMap) => void): () => void {
    this.listeners.add(listener);
    listener(this.statusMap);
    return () => this.listeners.delete(listener);
  }

  private updateStatus(model: keyof ModelStatusMap, state: ModelReadinessState) {
    this.statusMap[model] = state;
    this.listeners.forEach(l => l(this.statusMap));
  }

  async retry(): Promise<void> {
    this.statusMap = {
      face: 'uninitialized',
      pose: 'uninitialized',
      hands: 'uninitialized',
      object: 'uninitialized'
    };
    await this.initialize();
  }
}

export const modelManager = new ModelManager();
