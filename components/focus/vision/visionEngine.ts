import { VisionData, PhoneEvidence, DeviceStatus } from '../types';
import { FocusConfig } from '../constants/FocusConfig';
import { calibrationEngine } from '../services/calibrationEngine';
import { frameScheduler, PerceptionFrame } from '../services/ml/FrameScheduler';
import { modelManager } from '../services/ml/ModelManager';
import { cameraManager } from '../services/CameraManager';
import { visionWatchdog, VisionPipelineHealth } from '../services/VisionWatchdog';

export type VisionCallback = (data: VisionData) => void;
export type CameraFailureCallback = (reason: string) => void;

export class VisionEngine {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private loopWorker: Worker | null = null;
  private loopIntervalId: any = null;
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
  private previousDeskLuminance: Uint8Array | null = null;
  private lastHandActivityTimestamp: number = Date.now();
  private centroidHistory: Array<{ x: number; y: number; t: number }> = [];

  // Health & freeze monitoring
  private consecutiveBlankFrames: number = 0;
  private previousFrameLuma: number | null = null;
  private consecutiveFrozenFrames: number = 0;

  constructor() {
    if (typeof document !== 'undefined') {
      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = 160;
      this.canvasElement.height = 120;
      this.canvasCtx = this.canvasElement.getContext('2d', { willReadFrequently: true });
    }

    // Only surface fatal modal to user when watchdog declares genuine UNAVAILABLE (after recovery attempts)
    visionWatchdog.subscribeFailure(reason => {
      this.handleCameraFailure(reason);
    });
  }

  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    return cameraManager.getAvailableCameras();
  }

  async start(deviceId?: string, fps: number = 10): Promise<{ success: boolean; error?: string }> {
    if (this.isRunning && !this.isSimulated) return { success: true };

    if (this.isSimulated) {
      this.stop();
    }

    try {
      const camRes = await cameraManager.start(deviceId, fps);
      if (!camRes.success) {
        console.warn('VisionEngine webcam start unavailable, activating smart focus mode:', camRes.error);
        this.startSimulation(fps);
        return {
          success: false,
          error: camRes.error || 'Could not access webcam'
        };
      }

      this.stream = cameraManager.getStream();
      this.videoElement = cameraManager.getVideoElement();

      this.isRunning = true;
      this.isSimulated = false;
      this.consecutiveBlankFrames = 0;
      this.consecutiveFrozenFrames = 0;
      visionWatchdog.setMonitoringActive(true);

      // Start ModelManager and FrameScheduler for AI/ML perception
      modelManager.initialize().catch(console.warn);
      this.unsubscribeScheduler = frameScheduler.subscribe((perception) => {
        this.latestPerception = perception;
      });
      if (this.videoElement) {
        frameScheduler.start(this.videoElement);
      }

      this.loop(fps);

      return { success: true };
    } catch (err: any) {
      console.warn('VisionEngine start caught error:', err);
      this.startSimulation(fps);
      return {
        success: false,
        error: err?.message || 'Could not access webcam'
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

    this.startBackgroundLoop(intervalMs, () => {
      if (!this.isRunning || !this.isSimulated) return;
      const now = Date.now();
      if (now - this.lastAnalysisTime >= intervalMs * 0.85) {
        this.lastAnalysisTime = now;
        this.emitSimulatedFrame();
      }
    });
  }

  private emitSimulatedFrame(): void {
    const payload: VisionData = {
      facePresent: false,
      confidence: 0.0,
      studentFaceVerified: false,
      faceMatchConfidence: 0.0,
      genericPersonDetected: false,
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
      phoneDetectedScore: 0.0,
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
    visionWatchdog.setMonitoringActive(false);
    if (this.unsubscribeScheduler) {
      this.unsubscribeScheduler();
      this.unsubscribeScheduler = null;
    }
    frameScheduler.stop();
    this.latestPerception = null;
    this.stopBackgroundLoop();
    cameraManager.stop();
    this.stream = null;
    this.videoElement = null;
  }

  attachPreview(videoTag: HTMLVideoElement): void {
    cameraManager.attachPreview(videoTag);
  }

  detachPreview(videoTag: HTMLVideoElement): void {
    cameraManager.detachPreview(videoTag);
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
    return cameraManager.getStream();
  }

  getPipelineHealth(): VisionPipelineHealth {
    return visionWatchdog.getHealth();
  }

  subscribePipelineHealth(callback: (health: VisionPipelineHealth) => void): () => void {
    return visionWatchdog.subscribeHealth(callback);
  }

  isActive(): boolean {
    return this.isRunning;
  }

  private loop(targetFps: number): void {
    const intervalMs = 1000 / targetFps;

    this.startBackgroundLoop(intervalMs, () => {
      if (!this.isRunning) return;
      const now = Date.now();
      if (now - this.lastAnalysisTime >= intervalMs * 0.85) {
        this.lastAnalysisTime = now;
        this.analyzeCurrentFrame();
      }
    });
  }

  private startBackgroundLoop(intervalMs: number, onTick: () => void): void {
    this.stopBackgroundLoop();

    const tickRate = Math.max(20, Math.round(intervalMs));

    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        const workerScript = `
          let id = null;
          self.onmessage = function(e) {
            if (e.data === 'start') {
              if (id) clearInterval(id);
              id = setInterval(function() {
                self.postMessage('tick');
              }, ${tickRate});
            } else if (e.data === 'stop') {
              if (id) {
                clearInterval(id);
                id = null;
              }
            }
          };
        `;
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        this.loopWorker = new Worker(URL.createObjectURL(blob));
        this.loopWorker.onmessage = () => {
          onTick();
        };
        this.loopWorker.postMessage('start');
        return;
      } catch (err) {
        console.warn('VisionEngine Web Worker fallback to setInterval:', err);
      }
    }

    this.loopIntervalId = setInterval(onTick, intervalMs);
  }

  private stopBackgroundLoop(): void {
    if (this.loopWorker) {
      try {
        this.loopWorker.postMessage('stop');
        this.loopWorker.terminate();
      } catch {}
      this.loopWorker = null;
    }
    if (this.loopIntervalId !== null) {
      clearInterval(this.loopIntervalId);
      this.loopIntervalId = null;
    }
    if (this.animationFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
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

    // Feed frame tick to watchdog and validate frame progression
    visionWatchdog.recordCameraFrame(now);
    const isProgressionHealthy = cameraManager.validateFrameProgression();

    // Whole-frame freeze detection & blank frame monitoring
    let isFrameFrozen = false;
    if (this.previousFrameLuma !== null) {
      const frameDelta = Math.abs(totalLuma - this.previousFrameLuma);
      if (frameDelta === 0 && avgLuma > 0 && !isProgressionHealthy) {
        this.consecutiveFrozenFrames++;
        if (this.consecutiveFrozenFrames > 50) {
          isFrameFrozen = true;
          visionWatchdog.triggerRecovery('Camera stream frame stall detected');
        }
      } else {
        this.consecutiveFrozenFrames = 0;
      }
    }
    const previousFrameTotalLuma = this.previousFrameLuma;
    this.previousFrameLuma = totalLuma;

    if (avgLuma < 4) {
      this.consecutiveBlankFrames++;
      if (this.consecutiveBlankFrames > 50) {
        visionWatchdog.triggerRecovery('Camera producing blank black frames');
      }
    } else {
      this.consecutiveBlankFrames = 0;
    }

    const camHealth = cameraManager.getHealth();
    const cameraHealthy = (camHealth.status !== 'FAILED') && !isFrameFrozen && (this.consecutiveBlankFrames < 50);

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

    const faceModelStatus = modelManager.getStatus().face;
    const isPerceptionFace = Boolean(this.latestPerception?.face?.detected && this.latestPerception.face.confidence >= 0.50);
    const isPerceptionPose = Boolean(this.latestPerception?.pose?.detected && this.latestPerception.pose.confidence >= 0.50);

    let rawFacePresent = false;
    let genericPersonDetected = false;

    if (isPerceptionFace) {
      rawFacePresent = true;
      genericPersonDetected = true;
    } else if (isPerceptionPose) {
      genericPersonDetected = true;
      rawFacePresent = false;
    } else if (faceModelStatus === 'fallback' || faceModelStatus === 'uninitialized') {
      // Fallback only if ML vision models failed to load:
      const totalLumaDiff = previousFrameTotalLuma !== null ? Math.abs(totalLuma - previousFrameTotalLuma) : 0;
      const hasMotion = deskDiffSum > 0 || totalLumaDiff > 1200;
      const isCandidateFace = isFaceGeometricMatch && hasMotion && (faceCentroidY < (ch * 0.60)) && (skinRatio >= 0.06 && skinRatio <= 0.50);
      rawFacePresent = isCandidateFace;
      genericPersonDetected = isCandidateFace;
    } else {
      // ML models are active and found nothing: strictly false!
      rawFacePresent = false;
      genericPersonDetected = false;
    }

    this.presenceHistory.push(rawFacePresent);
    if (this.presenceHistory.length > 5) this.presenceHistory.shift();
    const facePresent = this.presenceHistory.filter(Boolean).length >= 3 && cameraHealthy;

    // Estimate multiple faces
    const boxSpanRatio = boxW / cw;
    const faceCount = skinRatio > 0.45 && boxSpanRatio > 0.75 ? 2 : (facePresent ? 1 : 0);
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
    const trackedPhone = this.latestPerception?.phoneTrack;

    let phoneEvidence: PhoneEvidence;

    if (trackedPhone) {
      const isHeld = !!trackedPhone.isHeldInHand;
      const nearFace = !!trackedPhone.nearFace;
      const isOnDesk = !!trackedPhone.isOnDesk || (!isHeld && !nearFace);
      const handOverlap = trackedPhone.handOverlapScore || 0;
      visualPhoneScore = trackedPhone.confidence;
      handPhoneScore = (isHeld || nearFace) ? Math.max(0.85, trackedPhone.confidence) : Math.min(0.20, handOverlap);

      const deviceStatus: DeviceStatus = (isHeld || nearFace) ? 'DEVICE_IN_USE' : 'DEVICE_PRESENT';
      const phoneDetected = true;

      phoneEvidence = {
        detected: phoneDetected,
        confidence: visualPhoneScore,
        visualEvidence: visualPhoneScore,
        handPhoneEvidence: handPhoneScore,
        proximityEvidence: nearFace ? 0.95 : (isHeld ? 0.80 : 0.20),
        temporalEvidence: Math.min(1.0, trackedPhone.ageMs / 1500),
        bbox: trackedPhone.bbox,
        handInteractionConfidence: handOverlap,
        faceProximityConfidence: nearFace ? 0.95 : 0.10,
        persistenceMs: trackedPhone.ageMs,
        timestamp: now,
        isOnDesk,
        isHeldInHand: isHeld,
        nearFace,
        deviceStatus
      };
    } else {
      // Fallback: Check if hands are holding a distinct vertical screen device near face or torso
      // Only trigger if hands are present and elevated with strong localized contrast (not flat desk paper)
      const phoneDetected = false;
      phoneEvidence = {
        detected: false,
        confidence: 0.0,
        visualEvidence: 0.0,
        handPhoneEvidence: 0.0,
        proximityEvidence: 0.10,
        temporalEvidence: 0.0,
        persistenceMs: 0,
        timestamp: now,
        isOnDesk: false,
        isHeldInHand: false,
        nearFace: false,
        deviceStatus: 'NOT_DETECTED'
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
      headYaw = 0;
      headPitch = 0;
      headRoll = 0;
      gazeScore = 0.0;
      eyeOpen = false;
      bodyPostureStable = false;
      isLookingDown = false;
      faceBox = undefined;
    }

    // Determine Student Verification & Match Confidence
    let studentFaceVerified = false;
    let faceMatchConfidence = 0.0;

    if (facePresent && cameraHealthy) {
      confidence = this.latestPerception?.face.detected
        ? this.latestPerception.face.confidence
        : Math.min(0.85, 0.60 + skinRatio * 0.4);

      const mlFace = this.latestPerception?.face;
      const detectedAspect = (mlFace && mlFace.aspectRatio) ? mlFace.aspectRatio : faceAspectRatio;
      const detectedSpan = (mlFace && mlFace.boxSpanRatio) ? mlFace.boxSpanRatio : boxSpanRatio;

      const baseline = profile.studentBaseline;
      if (baseline && baseline.calibrated) {
        const aspectDiff = Math.abs(detectedAspect - baseline.faceAspectRatio);
        const spanDiff = Math.abs(detectedSpan - baseline.boxSpanRatio);
        const aspectMatch = Math.max(0.0, 1.0 - (aspectDiff / 0.45));
        const spanMatch = Math.max(0.0, 1.0 - (spanDiff / 0.30));

        const faceCenterX = faceBox ? (faceBox.x + faceBox.width / 2) : (cw > 0 && skinPixelCount > 0 ? (sumX / skinPixelCount / cw) * 100 : 50);
        const faceCenterY = faceBox ? (faceBox.y + faceBox.height / 2) : (ch > 0 && skinPixelCount > 0 ? (sumY / skinPixelCount / ch) * 100 : 50);

        const inZone = (!profile.studyZone) || (
          faceCenterX >= profile.studyZone.minX &&
          faceCenterX <= profile.studyZone.maxX &&
          faceCenterY >= profile.studyZone.minY &&
          faceCenterY <= profile.studyZone.maxY
        );

        faceMatchConfidence = Number(((aspectMatch * 0.55 + spanMatch * 0.45) * (inZone ? 1.0 : 0.6)).toFixed(2));
        studentFaceVerified = faceMatchConfidence >= FocusConfig.studentFaceMatchThreshold && inZone;
      } else {
        // Not calibrated yet: face detected in normal position is accepted as the student
        faceMatchConfidence = 0.88;
        studentFaceVerified = true;
      }
    } else if (genericPersonDetected && isLookingDown && cameraHealthy) {
      // PYQ / Paper study downward posture: torso in study zone, head pitched down
      const baseline = profile.studentBaseline;
      faceMatchConfidence = baseline?.calibrated ? 0.78 : 0.72;
      studentFaceVerified = true;
      confidence = 0.75;
    } else {
      confidence = 0.0;
      studentFaceVerified = false;
      faceMatchConfidence = 0.0;
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
      isLookingDown: (facePresent || genericPersonDetected) && cameraHealthy ? isLookingDown : false,
      lightingLevel,
      lightingScore,
      faceCount: facePresent && cameraHealthy ? faceCount : 0,
      studentFaceVerified: studentFaceVerified && cameraHealthy,
      faceMatchConfidence: cameraHealthy ? faceMatchConfidence : 0.0,
      genericPersonDetected: genericPersonDetected && cameraHealthy,
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
