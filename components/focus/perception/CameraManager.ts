import { CameraHealth, CameraHealthState } from '../types';
import { FocusConfig } from '../storage/FocusConfig';

type CameraHealthListener = (health: CameraHealth) => void;

/**
 * CameraManager
 * 
 * Manages webcam acquisition, video element binding, track monitoring,
 * freeze detection via lightweight pixel sampling, and bounded self-recovery.
 * Exists independently of React render lifecycles.
 */
export class CameraManager {
  private static instance: CameraManager;

  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private selectedDeviceId: string = '';
  private healthState: CameraHealthState = 'INITIALIZING';
  private lastFrameAt: number = 0;
  private frameCount: number = 0;
  private freezeDetected: boolean = false;
  private errorCount: number = 0;
  private recoveryCount: number = 0;
  private recoveryTimeoutId: any = null;
  private isAcquiring: boolean = false;

  // Lightweight freeze detection canvas
  private samplingCanvas: HTMLCanvasElement | null = null;
  private samplingCtx: CanvasRenderingContext2D | null = null;
  private lastSampledPixels: Uint8ClampedArray | null = null;
  private freezeCheckCounter: number = 0;

  private listeners: Set<CameraHealthListener> = new Set();

  public static getInstance(): CameraManager {
    if (!CameraManager.instance) {
      CameraManager.instance = new CameraManager();
    }
    return CameraManager.instance;
  }

  constructor() {
    if (typeof document !== 'undefined') {
      this.samplingCanvas = document.createElement('canvas');
      this.samplingCanvas.width = 16;
      this.samplingCanvas.height = 16;
      this.samplingCtx = this.samplingCanvas.getContext('2d', { willReadFrequently: true });
    }
  }

  public async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === 'videoinput');
    } catch (e) {
      console.warn('Failed to enumerate cameras:', e);
      return [];
    }
  }

  public async startStream(deviceId?: string): Promise<boolean> {
    if (this.isAcquiring) return false;
    this.isAcquiring = true;
    if (deviceId) this.selectedDeviceId = deviceId;

    this.healthState = 'INITIALIZING';
    this.notifyHealth();

    try {
      if (this.stream) {
        this.stopStreamTracks();
      }

      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: this.selectedDeviceId ? { exact: this.selectedDeviceId } : undefined,
          width: { ideal: FocusConfig.CAMERA_DEFAULT_WIDTH },
          height: { ideal: FocusConfig.CAMERA_DEFAULT_HEIGHT },
          frameRate: { ideal: 30, min: 15 },
        },
        audio: false,
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.wireTrackListeners(this.stream);

      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play().catch(() => {});
      }

      this.healthState = 'HEALTHY';
      this.lastFrameAt = Date.now();
      this.errorCount = 0;
      this.freezeDetected = false;
      this.isAcquiring = false;
      this.notifyHealth();
      return true;
    } catch (err: unknown) {
      this.isAcquiring = false;
      this.errorCount++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Camera acquisition error:', msg);

      this.healthState = this.errorCount >= FocusConfig.MAX_CAMERA_RECOVERY_ATTEMPTS
        ? 'FAILED'
        : 'RECOVERING';
      this.notifyHealth(msg);

      if (this.healthState === 'RECOVERING') {
        this.scheduleRecovery();
      }
      return false;
    }
  }

  public attachVideoElement(video: HTMLVideoElement): void {
    this.videoElement = video;
    if (this.stream && video.srcObject !== this.stream) {
      video.srcObject = this.stream;
      video.play().catch(() => {});
    }
  }

  public detachVideoElement(): void {
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * Called by the frame scheduler whenever a new video frame is processed.
   * Performs frame counting and lightweight 16x16 pixel variance freeze detection.
   */
  public recordFrameReceived(): void {
    const now = Date.now();
    this.lastFrameAt = now;
    this.frameCount++;

    this.freezeCheckCounter++;
    if (this.freezeCheckCounter >= FocusConfig.FREEZE_CHECK_INTERVAL_FRAMES) {
      this.freezeCheckCounter = 0;
      this.checkPixelVariance();
    }
  }

  private checkPixelVariance(): void {
    if (!this.videoElement || !this.samplingCtx || this.videoElement.readyState < 2) return;

    try {
      this.samplingCtx.drawImage(this.videoElement, 0, 0, 16, 16);
      const imgData = this.samplingCtx.getImageData(0, 0, 16, 16).data;

      if (this.lastSampledPixels) {
        let diff = 0;
        // Sample every 4th pixel for speed
        for (let i = 0; i < imgData.length; i += 16) {
          diff += Math.abs(imgData[i] - this.lastSampledPixels[i]);
        }
        // If variance is 0 over check interval while stream is running, video might be frozen
        if (diff < FocusConfig.FREEZE_VARIATION_THRESHOLD) {
          this.freezeDetected = true;
          this.healthState = 'DEGRADED';
          this.notifyHealth('Video stream appears frozen');
        } else if (this.freezeDetected) {
          this.freezeDetected = false;
          this.healthState = 'HEALTHY';
          this.notifyHealth();
        }
      }

      this.lastSampledPixels = new Uint8ClampedArray(imgData);
    } catch {
      // Ignored for cross-origin or transient canvas issues
    }
  }

  private wireTrackListeners(stream: MediaStream): void {
    const tracks = stream.getVideoTracks();
    tracks.forEach((track) => {
      track.onended = () => {
        console.warn('Camera video track ended unexpectedly');
        this.healthState = 'RECOVERING';
        this.notifyHealth('Camera track ended');
        this.scheduleRecovery();
      };
      track.onmute = () => {
        this.healthState = 'DEGRADED';
        this.notifyHealth('Camera track muted by system');
      };
      track.onunmute = () => {
        this.healthState = 'HEALTHY';
        this.lastFrameAt = Date.now();
        this.notifyHealth();
      };
    });
  }

  private scheduleRecovery(): void {
    if (this.recoveryTimeoutId !== null) return;
    if (this.recoveryCount >= FocusConfig.MAX_CAMERA_RECOVERY_ATTEMPTS) {
      this.healthState = 'FAILED';
      this.notifyHealth('Max camera recovery attempts exceeded');
      return;
    }

    const backoffMs = FocusConfig.CAMERA_RECOVERY_BACKOFF_MS[
      Math.min(this.recoveryCount, FocusConfig.CAMERA_RECOVERY_BACKOFF_MS.length - 1)
    ];

    this.recoveryCount++;
    console.log(`Scheduling camera recovery attempt ${this.recoveryCount} in ${backoffMs}ms`);

    this.recoveryTimeoutId = setTimeout(async () => {
      this.recoveryTimeoutId = null;
      await this.startStream(this.selectedDeviceId);
    }, backoffMs);
  }

  public stopStream(): void {
    if (this.recoveryTimeoutId !== null) {
      clearTimeout(this.recoveryTimeoutId);
      this.recoveryTimeoutId = null;
    }
    this.stopStreamTracks();
    this.stream = null;
    this.healthState = 'INITIALIZING';
    this.recoveryCount = 0;
    this.errorCount = 0;
    this.freezeDetected = false;
    this.lastFrameAt = 0;
    this.notifyHealth();
  }

  private stopStreamTracks(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
        track.onended = null;
        track.onmute = null;
        track.onunmute = null;
      });
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  public getHealth(): CameraHealth {
    const now = Date.now();
    const track = this.stream?.getVideoTracks()[0];
    const isTrackLive = track ? track.readyState === 'live' : false;

    return {
      state: this.healthState,
      streamActive: Boolean(this.stream?.active && isTrackLive),
      trackState: track ? track.readyState : 'none',
      videoReady: Boolean(this.videoElement && this.videoElement.readyState >= 2),
      lastFrameAt: this.lastFrameAt,
      frameCount: this.frameCount,
      frameFreshnessMs: this.lastFrameAt > 0 ? Math.max(0, now - this.lastFrameAt) : 0,
      brightnessQuality: 1.0,
      freezeDetected: this.freezeDetected,
      errorCount: this.errorCount,
      recoveryCount: this.recoveryCount,
    };
  }

  public subscribeHealth(listener: CameraHealthListener): () => void {
    this.listeners.add(listener);
    listener(this.getHealth());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyHealth(errorMessage?: string): void {
    const health = { ...this.getHealth(), errorMessage };
    this.listeners.forEach((l) => {
      try {
        l(health);
      } catch (err) {
        console.error('Camera health listener error:', err);
      }
    });
  }
}

export const cameraManager = CameraManager.getInstance();
