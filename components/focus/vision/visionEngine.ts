import { VisionData } from '../types';
import { findSkinFaceRegions } from './skinFaceDetector';

export type VisionCallback = (data: VisionData) => void;
export type CameraFailureCallback = (reason: string) => void;

interface NativeFaceDetectorLike {
  detect(source: CanvasImageSource): Promise<unknown[]>;
}

/**
 * Local webcam presence detector.
 *
 * The only output that can start the timer is whether a face/person is visible.
 * It does not inspect gaze, head pose, posture, hands, desk motion, applications,
 * speaking, phones, sleep, or the number of people. No frames leave this browser.
 */
export class VisionEngine {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement;
  private canvasCtx: CanvasRenderingContext2D | null;
  private stream: MediaStream | null = null;
  private analysisIntervalId: number | null = null;
  private isRunning = false;
  private isAnalyzing = false;
  private lastFrameTimestamp = 0;
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

    this.releaseCaptureResources();
    this.cameraFailureNotified = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      const error = 'Webcam access is not supported in this browser. The timer will remain paused.';
      this.handleCameraFailure(error);
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

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = this.stream.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') {
        throw new Error('The webcam did not provide a live video stream.');
      }

      track.onended = () => this.handleCameraFailure('The webcam disconnected. The timer is paused.');

      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.setAttribute('muted', '');
        this.videoElement.muted = true;
        this.videoElement.autoplay = true;
      }

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      this.faceDetector = this.createNativeFaceDetector();
      this.isRunning = true;
      this.cameraFailureNotified = false;
      this.startFrameLoop(requestedFps);

      return { success: true };
    } catch (cause) {
      const message =
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access and retry; the timer is paused.'
          : cause instanceof Error
            ? `${cause.message} The timer is paused until the webcam reconnects.`
            : 'Could not access the webcam. The timer is paused.';
      this.handleCameraFailure(message);
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

    // Keep local webcam analysis alive when a lecture is playing in another tab.
    // Browsers may throttle hidden-tab timers; the FocusEngine also fails closed
    // when a fresh camera frame stops arriving.
    const fps = Math.min(5, Math.max(1, Number.isFinite(requestedFps) ? requestedFps : 4));
    const intervalMs = Math.round(1000 / fps);

    this.analysisIntervalId = window.setInterval(() => {
      if (!this.isRunning || this.isAnalyzing) return;
      void this.analyzeCurrentFrame();
    }, intervalMs);
  }

  private detectWithSkinRegions(): boolean {
    if (!this.canvasCtx) return false;
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;
    const frame = this.canvasCtx.getImageData(0, 0, width, height);
    const sampleWidth = Math.ceil(width / 2);
    const sampleHeight = Math.ceil(height / 2);
    const skinMask = new Uint8Array(sampleWidth * sampleHeight);

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const index = (y * width + x) * 4;
        const red = frame.data[index];
        const green = frame.data[index + 1];
        const blue = frame.data[index + 2];

        // Broad YCbCr skin-colour range; connected-region geometry removes
        // many isolated skin-like pixels. This fallback runs locally only.
        const cb = 128 - 0.168736 * red - 0.331264 * green + 0.5 * blue;
        const cr = 128 + 0.5 * red - 0.418688 * green - 0.081312 * blue;
        const isSkinLike =
          cb >=  77 &&
          cb <= 127 &&
          cr >= 133 &&
          cr <= 173;

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

    if (this.faceDetector) {
      try {
        const faces = await this.faceDetector.detect(this.videoElement);
        return faces.length > 0;
      } catch {
        // Some Chromium builds expose FaceDetector but do not implement it.
        // Switch to the bundled local face-region fallback for this stream.
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

    this.isAnalyzing = true;
    try {
      const personPresent = await this.detectPerson();
      if (!this.isRunning) return;
      const now = Date.now();
      this.lastFrameTimestamp = now;

      const payload: VisionData = {
        facePresent: personPresent,
        confidence: personPresent ? 0.95 : 0.05,
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
      this.handleCameraFailure(
        error instanceof Error
          ? `Webcam frame analysis failed: ${error.message}. The timer is paused.`
          : 'Webcam frame analysis failed. The timer is paused.'
      );
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

  private handleCameraFailure(reason: string): void {
    if (this.cameraFailureNotified) return;
    this.cameraFailureNotified = true;
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
    this.isAnalyzing = false;
    this.lastFrameTimestamp = 0;

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
