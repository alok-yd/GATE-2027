import { VisionData } from '../types';
import { findSkinFaceRegions } from './skinFaceDetector';

export type VisionCallback = (data: VisionData) => void;
export type CameraFailureCallback = (reason: string) => void;

interface NativeFaceDetectorLike {
  detect(source: CanvasImageSource): Promise<unknown[]>;
}

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
              width: { ideal: 320 },
              height: { ideal: 240 },
              frameRate: { ideal: 5, max: 10 },
            }
          : {
              facingMode: 'user',
              width: { ideal: 320 },
              height: { ideal: 240 },
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

      this.faceDetector = this.createNativeFaceDetector();
      this.isRunning = true;
      this.cameraFailureNotified = false;
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
        confidence: personPresent ? 1 : 0,
        personPresenceState: personPresent ? 'PERSON_PRESENT' : 'PERSON_ABSENT',
        headYaw: 0,
        headPitch: 0,
        headRoll: 0,
        eyeOpen: true,
        gazeScore: 0,
        handActivity: false,
        bodyPostureStable: false,
        deskActivityScore: 0,
        isLookingDown: false,
        lightingLevel: 'normal',
        lightingScore: 1,
        visionQualityScore: 1,
        cameraHealthy: true,
        isSimulated: false,
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
      confidence: 0,
      personPresenceState: 'VISION_UNCERTAIN',
      headYaw: 0,
      headPitch: 0,
      headRoll: 0,
      eyeOpen: false,
      gazeScore: 0,
      handActivity: false,
      bodyPostureStable: false,
      deskActivityScore: 0,
      isLookingDown: false,
      lightingLevel: 'dark',
      lightingScore: 0,
      visionQualityScore: 0,
      cameraHealthy: false,
      isSimulated: false,
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
