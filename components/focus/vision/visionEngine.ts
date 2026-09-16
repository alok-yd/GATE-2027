import { VisionData, PhoneEvidence } from '../types';
import { calibrationEngine } from '../services/calibrationEngine';
import { frameScheduler, PerceptionFrame } from '../services/ml/FrameScheduler';
import { modelManager } from '../services/ml/ModelManager';

export type VisionCallback = (data: VisionData) => void;
export type CameraFailureCallback = (reason: string) => void;

export class VisionEngine {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private lastAnalysisTime: number = 0;
  private isRunning: boolean = false;
  private isSimulated: boolean = false;
  private callbacks: Set<VisionCallback> = new Set();
  private failureCallbacks: Set<CameraFailureCallback> = new Set();
  private latestPerception: PerceptionFrame | null = null;
  private unsubscribeScheduler: (() => void) | null = null;
  
  // Smoothing history
  private yawHistory: number[] = [];
  private pitchHistory: number[] = [];
  private presenceHistory: boolean[] = [];

  // Desk & posture tracking
  private previousDeskLuminance: Uint8Array | null = null;
  private lastHandActivityTimestamp: number = Date.now();
  private centroidHistory: Array<{ x: number; y: number; t: number }> = [];

  // Health monitoring
  private consecutiveBlankFrames: number = 0;

  constructor() {
    this.canvasElement = document.createElement('canvas');
    this.canvasElement.width = 160;
    this.canvasElement.height = 120;
    this.canvasCtx = this.canvasElement.getContext('2d', { willReadFrequently: true });
  }

  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return [];
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    } catch (e: any) {
      console.warn('Could not enumerate video devices:', e?.message || e);
      return [];
    }
  }

  async start(deviceId?: string, fps: number = 10): Promise<{ success: boolean; error?: string }> {
    if (this.isRunning && !this.isSimulated) return { success: true };

    if (this.isSimulated) {
      this.stop();
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('Webcam API unavailable in this browser environment. Using smart focus simulation.');
        this.startSimulation(fps);
        return { success: false, error: 'Webcam not supported in this browser' };
      }

      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 320 }, height: { ideal: 240 } }
          : { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Listen for stream track endings
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          this.handleCameraFailure('Camera stream ended or disconnected by operating system');
        };
      }

      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.setAttribute('muted', '');
        this.videoElement.muted = true;
      }

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      this.isRunning = true;
      this.isSimulated = false;
      this.consecutiveBlankFrames = 0;

      // Start ModelManager and FrameScheduler for AI/ML perception
      modelManager.initialize().catch(console.warn);
      this.unsubscribeScheduler = frameScheduler.subscribe((perception) => {
        this.latestPerception = perception;
      });
      frameScheduler.start(this.videoElement);

      this.loop(fps);

      return { success: true };
    } catch (err: any) {
      console.warn('VisionEngine webcam start unavailable, activating smart focus mode:', err?.name || err?.message || err);
      this.startSimulation(fps);
      return {
        success: false,
        error: err?.name === 'NotAllowedError' ? 'Permission denied' : (err?.message || 'Could not access webcam')
      };
    }
  }

  startSimulation(fps: number = 10): void {
    if (this.isRunning) {
      this.stop();
    }

    this.isRunning = true;
    this.isSimulated = true;
    const intervalMs = 1000 / fps;

    const frame = (now: number) => {
      if (!this.isRunning || !this.isSimulated) return;

      if (now - this.lastAnalysisTime >= intervalMs) {
        this.lastAnalysisTime = now;
        this.emitSimulatedFrame();
      }

      this.animationFrameId = requestAnimationFrame(frame);
    };

    this.animationFrameId = requestAnimationFrame(frame);
  }

  private emitSimulatedFrame(): void {
    const payload: VisionData = {
      facePresent: false,
      confidence: 0.0,
      headYaw: 0,
      headPitch: 0,
      headRoll: 0,
      eyeOpen: false,
      gazeScore: 0.0,
      handActivity: false,
      bodyPostureStable: false,
      deskActivityScore: 0.0,
      isLookingDown: false,
      lightingLevel: 'normal',
      lightingScore: 0.5,
      faceCount: 0,
      cameraHealthy: false,
      cameraHealthConfidence: 0.0,
      isSimulated: true,
      timestamp: Date.now()
    };

    calibrationEngine.feedSample(payload);
    this.callbacks.forEach(cb => cb(payload));
  }

  isSimulating(): boolean {
    return this.isSimulated;
  }

  stop(): void {
    this.isRunning = false;
    this.isSimulated = false;
    if (this.unsubscribeScheduler) {
      this.unsubscribeScheduler();
      this.unsubscribeScheduler = null;
    }
    frameScheduler.stop();
    this.latestPerception = null;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  attachPreview(videoTag: HTMLVideoElement): void {
    if (this.stream) {
      videoTag.srcObject = this.stream;
      videoTag.play().catch(() => {});
    }
  }

  detachPreview(videoTag: HTMLVideoElement): void {
    if (videoTag.srcObject) {
      videoTag.srcObject = null;
    }
  }

  subscribe(callback: VisionCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  subscribeFailure(callback: CameraFailureCallback): () => void {
    this.failureCallbacks.add(callback);
    return () => this.failureCallbacks.delete(callback);
  }

  private handleCameraFailure(reason: string): void {
    this.failureCallbacks.forEach(cb => cb(reason));
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  private loop(targetFps: number): void {
    const intervalMs = 1000 / targetFps;

    const frame = (now: number) => {
      if (!this.isRunning) return;

      if (now - this.lastAnalysisTime >= intervalMs) {
        this.lastAnalysisTime = now;
        this.analyzeCurrentFrame();
      }

      this.animationFrameId = requestAnimationFrame(frame);
    };

    this.animationFrameId = requestAnimationFrame(frame);
  }

  private analyzeCurrentFrame(): void {
    if (!this.videoElement || !this.canvasCtx || !this.canvasElement) return;
    if (this.videoElement.readyState < 2) return;

    const cw = this.canvasElement.width;
    const ch = this.canvasElement.height;

    this.canvasCtx.drawImage(this.videoElement, 0, 0, cw, ch);
    const imgData = this.canvasCtx.getImageData(0, 0, cw, ch);
    const data = imgData.data;

    const now = Date.now();
    const profile = calibrationEngine.getProfile();
    const deskYRatio = profile.isCalibrated ? profile.deskYRatio : 0.55;
    const deskStartY = Math.floor(ch * deskYRatio);

    // 1. Calculate lighting & luminance across sampled frame
    let totalLuma = 0;
    let skinPixelCount = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = cw;
    let maxX = 0;
    let minY = ch;
    let maxY = 0;
    let skinInDeskRegion = 0;

    const totalSampled = (cw / 2) * (ch / 2);

    for (let y = 0; y < ch; y += 2) {
      const isDeskRow = y >= deskStartY;
      for (let x = 0; x < cw; x += 2) {
        const i = (y * cw + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuma += luma;

        const isSkin =
          r > 60 && g > 40 && b > 20 &&
          r > g && r > b &&
          (r - g) > 12 &&
          Math.abs(r - g) > 15 &&
          Math.max(r, g, b) - Math.min(r, g, b) > 15;

        if (isSkin) {
          skinPixelCount++;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;

          if (isDeskRow) {
            skinInDeskRegion++;
          }
        }
      }
    }

    const avgLuma = totalLuma / totalSampled;
    const lightingScore = Math.min(1.0, Math.max(0.0, avgLuma / 255));
    const lightingLevel: 'dark' | 'low' | 'normal' | 'bright' =
      avgLuma < 25 ? 'dark' : avgLuma < 65 ? 'low' : avgLuma > 220 ? 'bright' : 'normal';

    // Whole-frame freeze detection & blank frame monitoring
    const totalLumaDiff = Math.abs(totalLuma - (this.previousDeskLuminance ? this.lastAnalysisTime : totalLuma));
    if (avgLuma < 4) {
      this.consecutiveBlankFrames++;
      if (this.consecutiveBlankFrames > 20) {
        this.handleCameraFailure('Camera is blocked, covered, or producing blank black frames');
      }
    } else {
      this.consecutiveBlankFrames = 0;
    }

    const cameraHealthy = this.consecutiveBlankFrames < 20;

    const skinRatio = skinPixelCount / totalSampled;
    const boxW = maxX - minX;
    const boxH = maxY - minY;
    const faceAspectRatio = boxH / Math.max(1, boxW);
    const faceCentroidY = skinPixelCount > 0 ? sumY / skinPixelCount : ch;

    // Face presence validation:
    // Requires real face dimensions, sensible aspect ratio, and upper-body location (not desk wood)
    const isFaceGeometricMatch = 
      boxW >= 18 && 
      boxH >= 18 && 
      boxW <= cw * 0.78 && 
      faceAspectRatio >= 0.65 && 
      faceAspectRatio <= 2.2 &&
      faceCentroidY < (ch * 0.70);

    const isPerceptionFace = this.latestPerception?.face.detected ?? false;
    const rawFacePresent = (isPerceptionFace || (skinRatio >= 0.04 && skinRatio <= 0.80 && isFaceGeometricMatch));

    this.presenceHistory.push(rawFacePresent);
    if (this.presenceHistory.length > 5) this.presenceHistory.shift();
    const facePresent = this.presenceHistory.filter(Boolean).length >= 3 && cameraHealthy;

    // Estimate multiple faces
    const boxSpanRatio = boxW / cw;
    const faceCount = skinRatio > 0.45 && boxSpanRatio > 0.75 ? 2 : (facePresent ? 1 : 0);

    // 2. Desk Motion & Hand / Writing Activity Estimation
    const deskPixelCount = Math.floor((cw / 2) * ((ch - deskStartY) / 2));
    const currentDeskLuma = new Uint8Array(deskPixelCount);
    let deskLumaIdx = 0;
    let deskDiffSum = 0;

    for (let y = deskStartY; y < ch; y += 2) {
      for (let x = 0; x < cw; x += 2) {
        const i = (y * cw + x) * 4;
        const luma = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        currentDeskLuma[deskLumaIdx] = luma;
        if (this.previousDeskLuminance && deskLumaIdx < this.previousDeskLuminance.length) {
          const diff = Math.abs(luma - this.previousDeskLuminance[deskLumaIdx]);
          if (diff > 12) {
            deskDiffSum += diff;
          }
        }
        deskLumaIdx++;
      }
    }
    this.previousDeskLuminance = currentDeskLuma;

    // Writing/hand movement threshold
    const deskMotionScore = Math.min(1.0, deskDiffSum / (deskPixelCount * 3));
    const deskSkinPresent = skinInDeskRegion > 8;
    const instantHandMotion = deskMotionScore > 0.07 || (deskSkinPresent && deskMotionScore > 0.03);

    if (instantHandMotion) {
      this.lastHandActivityTimestamp = now;
    }

    const mlHandsActive = this.latestPerception?.hands.detected && (this.latestPerception.hands.isDeskActivity || this.latestPerception.hands.isWritingLikeMovement);

    // Hand activity: If face is present, allow up to 20s thinking pause.
    // If face is ABSENT, NEVER persist hand activity — must drop immediately to instant motion!
    const handActivity = facePresent 
      ? (mlHandsActive || (now - this.lastHandActivityTimestamp) < 20000)
      : instantHandMotion;

    const deskActivityScore = instantHandMotion 
      ? Math.max(0.65, deskMotionScore) 
      : (handActivity ? 0.40 : 0.05);

    // 3. Visual Phone / Device Detection & Tracking Fusion
    let visualPhoneScore = 0.0;
    let handPhoneScore = 0.0;
    const phoneScanStartY = Math.floor(ch * 0.35);

    // Scan for high-contrast handheld vertical rectangular blocks (aspect ratio 1.7 to 2.2)
    let candidateVerticalGradients = 0;
    let darkRectangularPixels = 0;
    let brightScreenPixels = 0;

    for (let py = phoneScanStartY; py < ch - 6; py += 3) {
      for (let px = 15; px < cw - 15; px += 3) {
        const idx = (py * cw + px) * 4;
        const pluma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        const nextIdx = (py * cw + (px + 4)) * 4;
        const nextLuma = 0.299 * data[nextIdx] + 0.587 * data[nextIdx + 1] + 0.114 * data[nextIdx + 2];
        
        if (Math.abs(pluma - nextLuma) > 40) {
          candidateVerticalGradients++;
        }
        if (pluma < 45) {
          darkRectangularPixels++;
        } else if (pluma > 185) {
          brightScreenPixels++;
        }
      }
    }

    const totalPhoneSamples = ((ch - phoneScanStartY) / 3) * ((cw - 30) / 3);
    const darkRatio = darkRectangularPixels / totalPhoneSamples;
    const brightRatio = brightScreenPixels / totalPhoneSamples;
    const gradientRatio = candidateVerticalGradients / totalPhoneSamples;

    if (gradientRatio > 0.12 && (darkRatio > 0.08 || brightRatio > 0.06)) {
      visualPhoneScore = Math.min(0.95, Number((0.45 + (darkRatio + brightRatio) * 1.5 + gradientRatio * 1.2).toFixed(2)));
      if (deskSkinPresent) {
        handPhoneScore = Math.min(0.95, visualPhoneScore + 0.15);
      }
    }

    // Blend with ObjectTracker ML phone track if available
    let phoneEvidence: PhoneEvidence;
    const trackedPhone = this.latestPerception?.phoneTrack;

    if (trackedPhone) {
      const isHeld = trackedPhone.isHeldInHand || trackedPhone.nearFace;
      visualPhoneScore = Math.max(visualPhoneScore, trackedPhone.confidence);
      handPhoneScore = isHeld ? Math.max(0.85, trackedPhone.confidence) : 0.25;
      const phoneDetectedScore = isHeld ? Math.max(visualPhoneScore, handPhoneScore) : Math.min(0.35, visualPhoneScore * 0.5);
      const phoneDetected = isHeld && (phoneDetectedScore >= 0.55);

      phoneEvidence = {
        detected: phoneDetected,
        confidence: phoneDetectedScore,
        visualEvidence: visualPhoneScore,
        handPhoneEvidence: handPhoneScore,
        proximityEvidence: trackedPhone.nearFace ? 0.95 : (isHeld ? 0.75 : 0.2),
        temporalEvidence: Math.min(1.0, trackedPhone.ageMs / 1500),
        bbox: trackedPhone.bbox,
        handInteractionConfidence: trackedPhone.handOverlapScore,
        faceProximityConfidence: trackedPhone.nearFace ? 0.95 : 0.1,
        persistenceMs: trackedPhone.ageMs,
        timestamp: now
      };
    } else {
      const phoneDetectedScore = Math.max(visualPhoneScore, handPhoneScore);
      const phoneDetected = phoneDetectedScore >= 0.50;
      phoneEvidence = {
        detected: phoneDetected,
        confidence: phoneDetectedScore,
        visualEvidence: visualPhoneScore,
        handPhoneEvidence: handPhoneScore,
        proximityEvidence: (facePresent && phoneDetectedScore > 0.40) ? 0.75 : 0.20,
        temporalEvidence: 0.50,
        persistenceMs: 0,
        timestamp: now
      };
    }

    const phoneDetectedScore = phoneEvidence.confidence;

    let headYaw = 0;
    let headPitch = 0;
    let headRoll = 0;
    let eyeOpen = true;
    let gazeScore = 0.9;
    let confidence = 0.0;
    let faceBox: { x: number; y: number; width: number; height: number } | undefined;
    let isLookingDown = false;
    let bodyPostureStable = true;

    if (facePresent && skinPixelCount > 0) {
      const centerX = sumX / skinPixelCount;
      const centerY = sumY / skinPixelCount;

      // Track posture stability (variance of centroid over last 4 seconds)
      this.centroidHistory.push({ x: centerX, y: centerY, t: now });
      this.centroidHistory = this.centroidHistory.filter(c => now - c.t <= 4000);
      if (this.centroidHistory.length >= 4) {
        const meanX = this.centroidHistory.reduce((s, c) => s + c.x, 0) / this.centroidHistory.length;
        const meanY = this.centroidHistory.reduce((s, c) => s + c.y, 0) / this.centroidHistory.length;
        const variance = this.centroidHistory.reduce((s, c) => s + Math.hypot(c.x - meanX, c.y - meanY), 0) / this.centroidHistory.length;
        // Moderate variance is normal breathing/writing; severe variance (> 25px) indicates moving away/fidgeting
        bodyPostureStable = variance < 24;
      }

      // Frame center
      const frameCenterX = cw / 2;
      const frameCenterY = ch / 2;

      // Head Yaw: horizontal displacement of face centroid relative to center
      const normalizedOffsetX = (centerX - frameCenterX) / (cw / 2);
      const rawYaw = Math.round(normalizedOffsetX * 35);

      // Head Pitch: vertical displacement of face centroid
      // Negative = downward tilt towards desk / paper notes
      const normalizedOffsetY = (centerY - frameCenterY) / (ch / 2);
      const rawPitch = Math.round(normalizedOffsetY * -25);

      // Smooth yaw and pitch
      this.yawHistory.push(rawYaw);
      if (this.yawHistory.length > 4) this.yawHistory.shift();
      headYaw = Math.round(this.yawHistory.reduce((a, b) => a + b, 0) / this.yawHistory.length);

      this.pitchHistory.push(rawPitch);
      if (this.pitchHistory.length > 4) this.pitchHistory.shift();
      headPitch = Math.round(this.pitchHistory.reduce((a, b) => a + b, 0) / this.pitchHistory.length);

      // Calibrated pitch thresholds
      const baselinePaperPitch = profile.isCalibrated ? profile.baselinePaperPitch : -18;
      const paperPitchThreshold = Math.min(-8, (baselinePaperPitch + 6));

      // Downward desk tilt check: pitch < paperPitchThreshold or face centroid in lower 55% of frame
      isLookingDown = headPitch <= paperPitchThreshold || centerY > (frameCenterY + 8);

      // Eye & Gaze estimation:
      const boxW = maxX - minX;
      const boxH = maxY - minY;
      const eyeRegionY = Math.floor(minY + boxH * 0.28);
      const eyeRegionH = Math.max(4, Math.floor(boxH * 0.22));

      // Analyze contrast in the eye band
      let eyeContrast = 0;
      let eyeSamples = 0;
      for (let ey = eyeRegionY; ey < Math.min(ch, eyeRegionY + eyeRegionH); ey++) {
        for (let ex = Math.floor(minX + boxW * 0.2); ex < Math.min(cw, Math.floor(maxX - boxW * 0.2)); ex += 2) {
          const idx = (ey * cw + ex) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          eyeContrast += Math.abs(lum - 128);
          eyeSamples++;
        }
      }

      const avgContrast = eyeSamples > 0 ? eyeContrast / eyeSamples : 50;
      eyeOpen = isLookingDown ? true : avgContrast > 14;

      // Soft Gaze score:
      const yawTolerance = profile.isCalibrated ? profile.tolerances.yawTolerance : 30;
      const yawPenalty = Math.min(1.0, Math.max(0, Math.abs(headYaw) - 10) / yawTolerance);
      const pitchPenalty = headPitch > 18 ? Math.min(1.0, (headPitch - 18) / 15) : 0;
      const combinedPenalty = yawPenalty * 0.75 + pitchPenalty * 0.25;
      
      gazeScore = Math.max(0.45, Number((1.0 - combinedPenalty * 0.45).toFixed(2)));
      confidence = Math.min(0.98, Number((0.68 + skinRatio * 0.6).toFixed(2)));

      faceBox = {
        x: Math.round((minX / cw) * 100),
        y: Math.round((minY / ch) * 100),
        width: Math.round((boxW / cw) * 100),
        height: Math.round((boxH / ch) * 100)
      };

      if (this.latestPerception?.face.detected) {
        headYaw = this.latestPerception.face.yaw;
        headPitch = this.latestPerception.face.pitch;
        headRoll = this.latestPerception.face.roll;
        gazeScore = this.latestPerception.face.gazeScore;
        eyeOpen = this.latestPerception.face.eyeOpen;
        if (this.latestPerception.face.bbox) {
          faceBox = this.latestPerception.face.bbox;
        }
      }

      if (this.latestPerception?.pose.detected) {
        bodyPostureStable = this.latestPerception.pose.isPostureStable;
      }
    } else {
      confidence = 0.0;
      headYaw = 0;
      headPitch = 0;
      headRoll = 0;
      gazeScore = 0.0;
      eyeOpen = false;
      bodyPostureStable = false;
      isLookingDown = false;
      faceBox = undefined;
    }

    const payload: VisionData = {
      facePresent: facePresent && cameraHealthy,
      confidence: cameraHealthy ? confidence : 0.0,
      headYaw: facePresent && cameraHealthy ? headYaw : 0,
      headPitch: facePresent && cameraHealthy ? headPitch : 0,
      headRoll: facePresent && cameraHealthy ? headRoll : 0,
      eyeOpen: facePresent && cameraHealthy ? eyeOpen : false,
      gazeScore: facePresent && cameraHealthy ? gazeScore : 0.0,
      faceBox: facePresent && cameraHealthy ? faceBox : undefined,
      handActivity,
      bodyPostureStable: facePresent && cameraHealthy ? bodyPostureStable : false,
      deskActivityScore,
      isLookingDown: facePresent && cameraHealthy ? isLookingDown : false,
      lightingLevel,
      lightingScore,
      faceCount: facePresent && cameraHealthy ? faceCount : 0,
      cameraHealthy,
      cameraHealthConfidence: cameraHealthy ? 1.0 : 0.0,
      phoneDetectedScore,
      phoneEvidence,
      isSimulated: false,
      timestamp: now
    };

    calibrationEngine.feedSample(payload);
    this.callbacks.forEach(cb => cb(payload));
  }
}

export const visionEngine = new VisionEngine();
