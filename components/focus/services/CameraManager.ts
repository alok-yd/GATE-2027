export interface CameraHealthState {
  status: 'HEALTHY' | 'DEGRADED' | 'RECOVERING' | 'FAILED';
  streamActive: boolean;
  trackReady: boolean;
  videoReady: boolean;
  lastFrameAt: number;
  frameAgeMs: number;
  frameCount: number;
  recoveryAttempts: number;
  videoWidth: number;
  videoHeight: number;
  lastError?: string;
}

export type CameraHealthCallback = (health: CameraHealthState) => void;

export class CameraManager {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private initializationPromise: Promise<{ success: boolean; error?: string }> | null = null;
  private previewElements: Set<HTMLVideoElement> = new Set();
  private healthCallbacks: Set<CameraHealthCallback> = new Set();

  private lastFrameTimestamp: number = 0;
  private lastVideoCurrentTime: number = -1;
  private frameCounter: number = 0;
  private consecutiveStallCount: number = 0;
  private recoveryAttemptsCount: number = 0;
  private isRecovering: boolean = false;
  private currentDeviceId?: string;
  private currentFps: number = 10;
  private generationId: number = 0;

  private healthState: CameraHealthState = {
    status: 'FAILED',
    streamActive: false,
    trackReady: false,
    videoReady: false,
    lastFrameAt: 0,
    frameAgeMs: 0,
    frameCount: 0,
    recoveryAttempts: 0,
    videoWidth: 0,
    videoHeight: 0
  };

  constructor() {
    this.initVideoElement();
  }

  private initVideoElement(): void {
    if (typeof document !== 'undefined') {
      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.setAttribute('muted', '');
        this.videoElement.muted = true;
        this.videoElement.autoplay = true;
      }
    }
  }

  getGenerationId(): number {
    return this.generationId;
  }

  getHealth(): CameraHealthState {
    const now = Date.now();
    const frameAgeMs = this.healthState.lastFrameAt > 0 ? (now - this.healthState.lastFrameAt) : 0;
    return {
      ...this.healthState,
      frameAgeMs
    };
  }

  subscribeHealth(callback: CameraHealthCallback): () => void {
    this.healthCallbacks.add(callback);
    callback(this.getHealth());
    return () => this.healthCallbacks.delete(callback);
  }

  private updateHealth(partial: Partial<CameraHealthState>): void {
    this.healthState = {
      ...this.healthState,
      ...partial
    };
    const current = this.getHealth();
    this.healthCallbacks.forEach(cb => cb(current));
  }

  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
        return [];
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    } catch (e: any) {
      console.warn('CameraManager: Could not enumerate devices:', e?.message || e);
      return [];
    }
  }

  async start(deviceId?: string, fps: number = 10): Promise<{ success: boolean; error?: string }> {
    // If stream is already active and healthy, reuse existing stream (Requirement 52, 76)
    if (this.stream && this.isStreamLive() && (!deviceId || deviceId === this.currentDeviceId)) {
      this.ensureVideoPlaying();
      return { success: true };
    }

    // Mutex guard against double initialization (Requirement 52, 53)
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.currentDeviceId = deviceId;
    this.currentFps = fps;
    this.generationId++;

    this.initializationPromise = this.acquireStream(deviceId, fps)
      .finally(() => {
        this.initializationPromise = null;
      });

    return this.initializationPromise;
  }

  private async acquireStream(deviceId?: string, _fps: number = 10): Promise<{ success: boolean; error?: string }> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.updateHealth({
        status: 'FAILED',
        streamActive: false,
        trackReady: false,
        videoReady: false,
        lastError: 'Webcam not supported in this environment'
      });
      return { success: false, error: 'Webcam not supported' };
    }

    try {
      // Clean up previous stream before replacement (Requirement 16, 76)
      this.cleanupStreamTracks();

      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.stream = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No video track returned by camera driver');
      }

      // Attach track lifecycle event listeners (Requirement 4)
      videoTrack.onended = () => {
        console.warn('CameraManager: Video track ended or disconnected by operating system');
        this.updateHealth({
          status: 'RECOVERING',
          trackReady: false,
          lastError: 'Camera disconnected by operating system'
        });
        this.attemptAutoRecovery();
      };

      videoTrack.onmute = () => {
        console.warn('CameraManager: Video track temporarily muted');
        this.updateHealth({
          status: 'DEGRADED',
          trackReady: false,
          lastError: 'Camera track temporarily muted'
        });
      };

      videoTrack.onunmute = () => {
        console.log('CameraManager: Video track unmuted — restored to live');
        this.updateHealth({
          status: 'HEALTHY',
          trackReady: true,
          lastError: undefined
        });
      };

      this.initVideoElement();
      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        try {
          await this.videoElement.play();
        } catch (playErr) {
          console.warn('CameraManager: Autoplay kick caught:', playErr);
        }
      }

      // Attach to any preview elements currently registered
      this.rebindPreviews();

      this.lastFrameTimestamp = Date.now();
      this.consecutiveStallCount = 0;
      this.recoveryAttemptsCount = 0;
      this.isRecovering = false;

      this.updateHealth({
        status: 'HEALTHY',
        streamActive: true,
        trackReady: true,
        videoReady: Boolean(this.videoElement && this.videoElement.readyState >= 2),
        lastFrameAt: Date.now(),
        videoWidth: this.videoElement?.videoWidth || 640,
        videoHeight: this.videoElement?.videoHeight || 480,
        lastError: undefined
      });

      return { success: true };
    } catch (err: any) {
      const errorMsg = err?.name === 'NotAllowedError'
        ? 'Permission denied'
        : (err?.message || 'Camera acquisition failed');

      console.warn('CameraManager: Stream acquisition failed:', errorMsg);

      this.updateHealth({
        status: 'FAILED',
        streamActive: false,
        trackReady: false,
        videoReady: false,
        lastError: errorMsg
      });

      return { success: false, error: errorMsg };
    }
  }

  private isStreamLive(): boolean {
    if (!this.stream) return false;
    const track = this.stream.getVideoTracks()[0];
    return Boolean(track && track.readyState === 'live');
  }

  private ensureVideoPlaying(): void {
    if (this.videoElement && this.videoElement.paused && this.isStreamLive()) {
      this.videoElement.play().catch(() => {});
    }
  }

  private cleanupStreamTracks(): void {
    if (this.stream) {
      try {
        this.stream.getTracks().forEach(t => {
          t.onended = null;
          t.onmute = null;
          t.onunmute = null;
          t.stop();
        });
      } catch (e) {
        console.warn('CameraManager: Error stopping old tracks:', e);
      }
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  /**
   * Validates whether the video element is genuinely decoding new, fresh frames.
   * Eliminates false freeze reports while accurately catching frozen video feeds.
   */
  validateFrameProgression(): boolean {
    if (!this.videoElement || !this.stream || !this.isStreamLive()) {
      return false;
    }

    if (this.videoElement.readyState < 2) {
      this.ensureVideoPlaying();
      return false;
    }

    const currentVideoTime = this.videoElement.currentTime;
    const now = Date.now();

    // Check if video currentTime has advanced
    if (currentVideoTime !== this.lastVideoCurrentTime) {
      this.lastVideoCurrentTime = currentVideoTime;
      this.lastFrameTimestamp = now;
      this.frameCounter++;
      this.consecutiveStallCount = 0;

      if (this.healthState.status !== 'HEALTHY') {
        this.updateHealth({
          status: 'HEALTHY',
          videoReady: true,
          trackReady: true,
          streamActive: true,
          lastFrameAt: now,
          frameCount: this.frameCounter,
          videoWidth: this.videoElement.videoWidth || 640,
          videoHeight: this.videoElement.videoHeight || 480
        });
      }
      return true;
    }

    // Video currentTime did not advance this tick
    this.consecutiveStallCount++;

    // Allow up to 15 ticks of frame pause (1.5s at 10 FPS) before kicking playback
    if (this.consecutiveStallCount > 5) {
      this.ensureVideoPlaying();
    }

    if (this.consecutiveStallCount > 15 && this.healthState.status === 'HEALTHY') {
      this.updateHealth({
        status: 'DEGRADED',
        videoReady: false,
        lastError: 'Video element currentTime is static'
      });
    }

    return (now - this.lastFrameTimestamp) < 2500;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  attachPreview(videoTag: HTMLVideoElement): void {
    if (!videoTag) return;
    this.previewElements.add(videoTag);
    if (this.stream) {
      videoTag.srcObject = this.stream;
      videoTag.play().catch(() => {});
    }
  }

  detachPreview(videoTag: HTMLVideoElement): void {
    if (!videoTag) return;
    this.previewElements.delete(videoTag);
    if (videoTag.srcObject) {
      videoTag.srcObject = null;
    }
  }

  private rebindPreviews(): void {
    if (!this.stream) return;
    this.previewElements.forEach(preview => {
      try {
        preview.srcObject = this.stream;
        preview.play().catch(() => {});
      } catch (err) {
        console.warn('CameraManager: Error rebinding preview element:', err);
      }
    });
  }

  async recover(): Promise<{ success: boolean; error?: string }> {
    if (this.isRecovering) return { success: false, error: 'Recovery already in progress' };
    this.isRecovering = true;
    this.recoveryAttemptsCount++;
    this.updateHealth({
      status: 'RECOVERING',
      recoveryAttempts: this.recoveryAttemptsCount
    });

    console.log(`CameraManager: Attempting stream recovery (Attempt ${this.recoveryAttemptsCount})...`);

    try {
      // Step 1: Soft recovery — restart video playback
      if (this.isStreamLive() && this.videoElement) {
        try {
          await this.videoElement.play();
          if (this.videoElement.readyState >= 2) {
            this.isRecovering = false;
            this.recoveryAttemptsCount = 0;
            this.updateHealth({ status: 'HEALTHY', videoReady: true });
            return { success: true };
          }
        } catch {}
      }

      // Step 2: Hard recovery — reacquire media stream with new generation token
      this.cleanupStreamTracks();
      const res = await this.acquireStream(this.currentDeviceId, this.currentFps);
      this.isRecovering = false;

      if (res.success) {
        this.recoveryAttemptsCount = 0;
        return { success: true };
      }
      return res;
    } catch (e: any) {
      this.isRecovering = false;
      return { success: false, error: e?.message || 'Camera recovery failed' };
    }
  }

  private attemptAutoRecovery(): void {
    if (this.recoveryAttemptsCount >= 3) {
      this.updateHealth({ status: 'FAILED', lastError: 'Exceeded max recovery attempts' });
      return;
    }
    // Exponential backoff: 500ms, 1500ms, 3000ms
    const delay = [500, 1500, 3000][this.recoveryAttemptsCount] || 2000;
    setTimeout(() => {
      this.recover().catch(console.warn);
    }, delay);
  }

  stop(): void {
    this.generationId++;
    this.cleanupStreamTracks();
    this.previewElements.forEach(preview => {
      try {
        preview.srcObject = null;
      } catch {}
    });
    this.consecutiveStallCount = 0;
    this.recoveryAttemptsCount = 0;
    this.isRecovering = false;

    this.updateHealth({
      status: 'FAILED',
      streamActive: false,
      trackReady: false,
      videoReady: false,
      lastError: undefined
    });
  }
}

export const cameraManager = new CameraManager();
