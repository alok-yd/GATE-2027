import { VisionData } from '../types';
import { findSkinFaceRegions } from './skinFaceDetector';

export type VisionCallback = (data: VisionData) => void;
export type CameraFailureCallback = (reason: string) => void;

interface NativeFaceDetectorLike {
  detect(source: CanvasImageSource): Promise<unknown[]>;
}

interface MediaPipeDetection {
  categories?: Array<{ score?: number }>;
  score?: number;
}

interface MediaPipeDetectionResult {
  detections?: MediaPipeDetection[];
}

interface MediaPipeFaceDetectorLike {
  detectForVideo(source: CanvasImageSource, timestampMs: number): MediaPipeDetectionResult;
  close?: () => void;
}

interface MediaPipeVisionModule {
  FilesetResolver: {
    forVisionTasks(wasmRoot: string): Promise<unknown>;
  };
  FaceDetector: {
    createFromOptions(
      vision: unknown,
      options: {
        baseOptions: { modelAssetPath: string; delegate: 'CPU' };
        runningMode: 'VIDEO';
        minDetectionConfidence: number;
        minSuppressionThreshold: number;
      }
    ): Promise<MediaPipeFaceDetectorLike>;
  };
}

const MEDIAPIPE_VERSION = '1.2.2';
const MEDIAPIPE_MODULE_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const MEDIAPIPE_WASM_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MEDIAPIPE_FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let mediaPipeModulePromise: Promise<MediaPipeVisionModule> | null = null;

/**
 * Local webcam face-presence detector.
 *
 * It returns only PRESENT/ABSENT camera observations. No gaze, head pose,
 * posture, hands, desk activity, speaking, phone, sleep, browser-tab or
 * application-activity analysis is performed. Frames stay in this browser.
 */
export class VisionEngine {
  private videoElement: HTMLVideoElement | null = null;
  private readonly canvasElement: HTMLCanvasElement;
  private readonly canvasCtx: CanvasRenderingContext2D | null;
  private stream: MediaStream | null = null;
  private analysisIntervalId: number | null = null;
  private isRunning = false;
  private isAnalyzing = false;
  private lifecycleId = 0;
  private lastFrameTimestamp = 0;
  private consecutiveBlankFrames = 0;
  private cameraFailureNotified = false;
  private faceDetector: NativeFaceDetectorLike | null = null;
  private mediaPipeFaceDetector: MediaPipeFaceDetectorLike | null = null;
  private lastMediaPipeTimestamp = 0;

  private callbacks = new Set<VisionCallback>();
  private failureCallbacks = new Set<CameraFailureCallback>();

  constructor() {
    this.canvasElement = document.createElement('canvas');
    this.canvasElement.width = 160;
    this.canvasElement.height = 120;
    this.canvasCtx = this.canvasElement.getContext('2d', { willReadFrequently: true });
  }

  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'videoinput');
    } catch {
      return [];
    }
  }

  async start(
    deviceId?: string,
    requestedFps = 4
  ): Promise<{ success: boolean; error?: string }> {
    const liveTrack = this.stream?.getVideoTracks().some(
      (track) => track.readyState === 'live'
    ) ?? false;

    if (
      this.isRunning &&
      liveTrack &&
      !this.cameraFailureNotified &&
      Date.now() - this.lastFrameTimestamp <= 4000
    ) {
      return { success: true };
    }

    const startId = ++this.lifecycleId;
    this.releaseCaptureResources();
    this.cameraFailureNotified = false;
    this.consecutiveBlankFrames = 0;

    if (!navigator.mediaDevices?.getUserMedia) {
      const error = 'Webcam access is not supported in this browser. The timer will remain paused.';
      this.handleCameraFailure(error, startId);
      return { success: false, error };
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: deviceId
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 5, max: 10 },
            }
          : {
              facingMode: 'user',
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 5, max: 10 },
            },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (startId !== this.lifecycleId) {
        stream.getTracks().forEach((track) => track.stop());
        return { success: false, error: 'Camera connection attempt was cancelled.' };
      }

      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') {
        stream.getTracks().forEach((item) => item.stop());
        throw new Error('The webcam did not provide a live video stream.');
      }

      this.stream = stream;
      track.onended = () => {
        if (startId === this.lifecycleId) {
          this.handleCameraFailure('The webcam disconnected. The timer is paused.', startId);
        }
      };

      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.setAttribute('muted', '');
        this.videoElement.muted = true;
        this.videoElement.autoplay = true;
      }

      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      // A user may stop the session while the camera permission prompt or
      // video.play() is pending. Do not revive the old stream afterward.
      if (startId !== this.lifecycleId) {
        stream.getTracks().forEach((item) => {
          item.onended = null;
          item.stop();
        });
        return { success: false, error: 'Camera connection attempt was cancelled.' };
      }

      // Initialise a proper on-device ML face detector before starting the
      // timer gate. The previous skin-colour-only fallback was too sensitive
      // to lighting, skin tone, camera white balance and image compression.
      // MediaPipe analyses webcam frames on-device; the model/WASM are
      // downloaded separately. The library may send usage/performance
      // telemetry, but webcam frames are not sent to a server.
      const mediaPipeDetector = await this.createMediaPipeFaceDetector();
      if (startId !== this.lifecycleId) {
        mediaPipeDetector?.close?.();
        stream.getTracks().forEach((item) => {
          item.onended = null;
          item.stop();
        });
        return { success: false, error: 'Camera connection attempt was cancelled.' };
      }

      this.mediaPipeFaceDetector = mediaPipeDetector;
      this.faceDetector = mediaPipeDetector ? null : this.createNativeFaceDetector();
      this.lastMediaPipeTimestamp = 0;
      this.isRunning = true;
      this.cameraFailureNotified = false;
      if (mediaPipeDetector) {
        console.info('[AI Focus] MediaPipe local face detector is ready.');
      } else if (this.faceDetector) {
        console.warn('[AI Focus] Using native browser face detection fallback.');
      } else {
        console.warn('[AI Focus] ML face detector unavailable; using lightweight local fallback.');
      }
      this.startFrameLoop(requestedFps);

      return { success: true };
    } catch (cause) {
      if (startId !== this.lifecycleId) {
        return { success: false, error: 'Camera connection attempt was cancelled.' };
      }

      const message =
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access and retry; the timer is paused.'
          : cause instanceof Error
            ? `${cause.message} The timer is paused until the webcam reconnects.`
            : 'Could not access the webcam. The timer is paused.';
      this.handleCameraFailure(message, startId);
      return { success: false, error: message };
    }
  }

  private async createMediaPipeFaceDetector(): Promise<MediaPipeFaceDetectorLike | null> {
    try {
      if (!mediaPipeModulePromise) {
        // Use a Vite-ignored runtime ESM import so the large vision bundle
        // is lazy-loaded only when a user starts an AI Focus session. This
        // avoids eval/new Function and is friendlier to strict CSP settings.
        mediaPipeModulePromise = import(/* @vite-ignore */ MEDIAPIPE_MODULE_URL) as Promise<MediaPipeVisionModule>;
      }

      const mediaPipe = await this.withTimeout(
        mediaPipeModulePromise,
        15000,
        'MediaPipe vision library'
      );
      const visionFileset = await this.withTimeout(
        mediaPipe.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL),
        15000,
        'MediaPipe WebAssembly runtime'
      );

      return await this.withTimeout(
        mediaPipe.FaceDetector.createFromOptions(visionFileset, {
          baseOptions: {
            modelAssetPath: MEDIAPIPE_FACE_MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.45,
          minSuppressionThreshold: 0.3,
        }),
        20000,
        'MediaPipe face model'
      );
    } catch (error) {
      // Clear a failed or timed-out module promise so a later camera retry can
      // attempt to load the model again instead of reusing a rejected promise.
      mediaPipeModulePromise = null;
      console.warn(
        '[AI Focus] MediaPipe could not be initialised. Falling back to another local detector.',
        error
      );
      return null;
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)),
        timeoutMs
      );
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  private createNativeFaceDetector(): NativeFaceDetectorLike | null {
    try {
      const DetectorConstructor = (window as Window & {
        FaceDetector?: new (options?: { maxDetectedFaces?: number; fastMode?: boolean }) => NativeFaceDetectorLike;
      }).FaceDetector;

      if (!DetectorConstructor) return null;
      return new DetectorConstructor({ maxDetectedFaces: 1, fastMode: true });
    } catch {
      return null;
    }
  }

  private startFrameLoop(requestedFps: number): void {
    if (this.analysisIntervalId !== null) {
      window.clearInterval(this.analysisIntervalId);
    }

    // Do not listen to document visibility or browser-tab changes. The camera
    // stream continues to determine presence when the student watches lectures
    // in another tab. The freshness check fails closed if frames truly stop.
    const fps = Math.min(5, Math.max(1, Number.isFinite(requestedFps) ? requestedFps : 4));
    const intervalMs = Math.round(1000 / fps);

    this.analysisIntervalId = window.setInterval(() => {
      if (!this.isRunning || this.isAnalyzing) return;
      void this.analyzeCurrentFrame();
    }, intervalMs);
  }

  private detectWithSkinRegions(): boolean {
    if (!this.canvasCtx) return false;

    const frame = this.canvasCtx.getImageData(
      0,
      0,
      this.canvasElement.width,
      this.canvasElement.height
    );
    const sampleWidth = Math.ceil(this.canvasElement.width / 2);
    const sampleHeight = Math.ceil(this.canvasElement.height / 2);
    const skinMask = new Uint8Array(sampleWidth * sampleHeight);

    for (let y = 0; y < this.canvasElement.height; y += 2) {
      for (let x = 0; x < this.canvasElement.width; x += 2) {
        const index = (y * this.canvasElement.width + x) * 4;
        const red = frame.data[index];
        const green = frame.data[index + 1];
        const blue = frame.data[index + 2];

        // Lightweight local fallback for browsers without native FaceDetector.
        const cb = 128 - 0.168736 * red - 0.331264 * green + 0.5 * blue;
        const cr = 128 + 0.5 * red - 0.418688 * green - 0.081312 * blue;
        const isSkinLike = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;

        if (isSkinLike) {
          skinMask[Math.floor(y / 2) * sampleWidth + Math.floor(x / 2)] = 1;
        }
      }
    }

    return findSkinFaceRegions(skinMask, sampleWidth, sampleHeight, 2).length > 0;
  }

  private async detectPerson(): Promise<boolean> {
    if (!this.videoElement || !this.canvasCtx) {
      throw new Error('The webcam frame is unavailable.');
    }

    this.canvasCtx.drawImage(
      this.videoElement,
      0,
      0,
      this.canvasElement.width,
      this.canvasElement.height
    );

    // A sustained blank frame indicates camera failure, not a valid absence
    // observation. It therefore pauses the timer as UNVERIFIED.
    const pixels = this.canvasCtx.getImageData(
      0,
      0,
      this.canvasElement.width,
      this.canvasElement.height
    ).data;
    let luminanceTotal = 0;
    let sampledPixels = 0;

    for (let index = 0; index < pixels.length; index += 16) {
      luminanceTotal +=
        0.299 * pixels[index] +
        0.587 * pixels[index + 1] +
        0.114 * pixels[index + 2];
      sampledPixels += 1;
    }

    const averageLuminance = sampledPixels ? luminanceTotal / sampledPixels : 0;
    if (averageLuminance < 4) {
      this.consecutiveBlankFrames += 1;
      if (this.consecutiveBlankFrames >= 12) {
        throw new Error('The camera is covered or producing blank black frames.');
      }
    } else {
      this.consecutiveBlankFrames = 0;
    }

    if (this.mediaPipeFaceDetector) {
      try {
        // MediaPipe VIDEO timestamps must be monotonic even if a browser
        // briefly reports the same performance clock value for two frames.
        const timestamp = Math.max(performance.now(), this.lastMediaPipeTimestamp + 1);
        this.lastMediaPipeTimestamp = timestamp;
        const result = this.mediaPipeFaceDetector.detectForVideo(this.videoElement, timestamp);
        const detections = Array.isArray(result?.detections) ? result.detections : [];
        return detections.some((detection) => {
          const categoryScore = Array.isArray(detection.categories)
            ? Math.max(0, ...detection.categories.map((category) => Number(category.score) || 0))
            : 0;
          const score = Math.max(categoryScore, Number(detection.score) || 0);
          return score >= 0.45;
        });
      } catch (error) {
        console.warn('[AI Focus] MediaPipe frame detection failed; switching to local fallback.', error);
        this.mediaPipeFaceDetector.close?.();
        this.mediaPipeFaceDetector = null;
        this.faceDetector = this.createNativeFaceDetector();
      }
    }

    if (this.faceDetector) {
      try {
        const faces = await this.faceDetector.detect(this.videoElement);
        return faces.length > 0;
      } catch {
        // Native FaceDetector is experimental in some Chromium builds.
        // Fall back to the bundled local face-region detector.
        this.faceDetector = null;
      }
    }

    return this.detectWithSkinRegions();
  }

  private async analyzeCurrentFrame(): Promise<void> {
    if (
      !this.isRunning ||
      this.isAnalyzing ||
      !this.videoElement ||
      this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      this.videoElement.videoWidth <= 0 ||
      this.videoElement.videoHeight <= 0
    ) {
      return;
    }

    const analysisId = this.lifecycleId;
    this.isAnalyzing = true;

    try {
      const personPresent = await this.detectPerson();
      if (!this.isRunning || analysisId !== this.lifecycleId) return;

      const now = Date.now();
      this.lastFrameTimestamp = now;

      const payload: VisionData = {
        facePresent: personPresent,
        cameraHealthy: true,
        timestamp: now,
      };

      this.callbacks.forEach((callback) => {
        try {
          callback(payload);
        } catch (error) {
          console.error('[AI Focus] Presence callback failed:', error);
        }
      });
    } catch (error) {
      if (this.isRunning && analysisId === this.lifecycleId) {
        this.handleCameraFailure(
          error instanceof Error
            ? `Webcam frame analysis failed: ${error.message}. The timer is paused.`
            : 'Webcam frame analysis failed. The timer is paused.',
          analysisId
        );
      }
    } finally {
      this.isAnalyzing = false;
    }
  }

  private createUnavailableFrame(): VisionData {
    return {
      facePresent: false,
      cameraHealthy: false,
      timestamp: Date.now(),
    };
  }

  private handleCameraFailure(reason: string, sourceLifecycleId: number): void {
    if (
      this.cameraFailureNotified ||
      sourceLifecycleId !== this.lifecycleId
    ) {
      return;
    }

    this.cameraFailureNotified = true;
    this.lifecycleId += 1;
    this.releaseCaptureResources();

    const unavailable = this.createUnavailableFrame();
    this.callbacks.forEach((callback) => {
      try {
        callback(unavailable);
      } catch (error) {
        console.error('[AI Focus] Camera-failure frame callback failed:', error);
      }
    });

    this.failureCallbacks.forEach((callback) => {
      try {
        callback(reason);
      } catch (error) {
        console.error('[AI Focus] Camera-failure listener failed:', error);
      }
    });
  }

  private releaseCaptureResources(): void {
    this.isRunning = false;
    this.lastFrameTimestamp = 0;
    this.consecutiveBlankFrames = 0;

    if (this.analysisIntervalId !== null) {
      window.clearInterval(this.analysisIntervalId);
      this.analysisIntervalId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
    }

    this.faceDetector = null;
    this.mediaPipeFaceDetector?.close?.();
    this.mediaPipeFaceDetector = null;
    this.lastMediaPipeTimestamp = 0;
  }

  stop(): void {
    this.lifecycleId += 1;
    this.releaseCaptureResources();
    this.cameraFailureNotified = false;
  }

  attachPreview(videoTag: HTMLVideoElement): void {
    if (!this.stream) return;
    videoTag.srcObject = this.stream;
    videoTag.play().catch(() => {});
  }

  detachPreview(videoTag: HTMLVideoElement): void {
    videoTag.pause();
    videoTag.srcObject = null;
  }

  subscribe(callback: VisionCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  subscribeFailure(callback: CameraFailureCallback): () => void {
    this.failureCallbacks.add(callback);
    return () => this.failureCallbacks.delete(callback);
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  isActive(): boolean {
    return this.isRunning && Boolean(
      this.stream?.getVideoTracks().some((track) => track.readyState === 'live')
    );
  }
}

export const visionEngine = new VisionEngine();
