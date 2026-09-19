import {
  FocusSession,
  StudyMode,
  TimerGateState,
  CameraHealth,
  StudentPresenceState,
  DeviceInteractionState,
  FocusEvent,
  FocusEventType,
  PauseReason,
  StudentPresenceEvidence,
  DeviceInteractionEvidence,
} from '../types';
import { cameraManager, CameraManager } from '../perception/CameraManager';
import { modelManager, ModelManager } from '../perception/ModelManager';
import { StudentPresenceEngine } from '../perception/StudentPresenceEngine';
import { DeviceDetectorEngine } from '../perception/DeviceDetectorEngine';
import { FrameScheduler } from '../perception/FrameScheduler';
import { StudentPresenceController, PresenceTransitionEvent } from './StudentPresenceController';
import { DeviceInteractionController, DeviceTransitionEvent } from './DeviceInteractionController';
import { VerifiedTimerGate } from './VerifiedTimerGate';
import { TimestampTimerEngine, TimerTickData } from '../timer/TimestampTimerEngine';
import { CameraWatchdog } from '../watchdogs/CameraWatchdog';
import { VisionWatchdog } from '../watchdogs/VisionWatchdog';
import { focusSessionRepository, FocusSessionRepository } from '../storage/FocusSessionRepository';
import { simulationEngine, SimulationEngine } from '../simulation/SimulationEngine';

export interface FocusControllerState {
  session: FocusSession | null;
  isActive: boolean;
  gate: TimerGateState;
  timer: TimerTickData;
  cameraHealth: CameraHealth;
  presenceState: StudentPresenceState;
  presenceConfidence: number;
  deviceState: DeviceInteractionState;
  deviceConfidence: number;
  fps: number;
  latencyMs: number;
  recentEvents: FocusEvent[];
  monitoringHealthy: boolean;
}

type ControllerStateListener = (state: FocusControllerState) => void;

/**
 * FocusSessionController
 * 
 * Master singleton coordinator for the entire AI Focus subsystem.
 * Coordinates camera, vision inference, temporal state machines, verified timer gate,
 * and Electron IPC. Survives React component unmounting and route transitions.
 */
export class FocusSessionController {
  private static instance: FocusSessionController;

  private cameraManager: CameraManager;
  private modelManager: ModelManager;
  private presenceEngine: StudentPresenceEngine;
  private deviceEngine: DeviceDetectorEngine;
  private frameScheduler: FrameScheduler;
  private presenceController: StudentPresenceController;
  private deviceController: DeviceInteractionController;
  private timerEngine: TimestampTimerEngine;
  private cameraWatchdog: CameraWatchdog;
  private visionWatchdog: VisionWatchdog;
  private repository: FocusSessionRepository;
  private simulation: SimulationEngine;

  private activeSession: FocusSession | null = null;
  private manualPause: boolean = false;
  private recentEvents: FocusEvent[] = [];
  private listeners: Set<ControllerStateListener> = new Set();
  private watchdogIntervalId: any = null;

  private currentFps: number = 0;
  private currentLatencyMs: number = 0;

  public static getInstance(): FocusSessionController {
    if (!FocusSessionController.instance) {
      FocusSessionController.instance = new FocusSessionController();
    }
    return FocusSessionController.instance;
  }

  constructor() {
    this.cameraManager = cameraManager;
    this.modelManager = modelManager;
    this.presenceEngine = new StudentPresenceEngine();
    this.deviceEngine = new DeviceDetectorEngine();
    this.visionWatchdog = new VisionWatchdog();
    this.cameraWatchdog = new CameraWatchdog();
    this.presenceController = new StudentPresenceController();
    this.deviceController = new DeviceInteractionController();
    this.timerEngine = new TimestampTimerEngine();
    this.repository = focusSessionRepository;
    this.simulation = simulationEngine;

    this.frameScheduler = new FrameScheduler(
      this.cameraManager,
      this.modelManager,
      this.presenceEngine,
      this.deviceEngine,
      this.visionWatchdog
    );

    this.setupSchedulerCallbacks();
    this.setupTransitionListeners();
    this.setupTimerSubscription();
    this.setupElectronIPC();
    this.restoreActiveSessionIfAny();
  }

  private setupSchedulerCallbacks(): void {
    this.frameScheduler.setCallbacks({
      onPresenceUpdate: (evidence: StudentPresenceEvidence) => {
        const adjusted = this.simulation.overridePresence(evidence);
        this.presenceController.update(adjusted);
        this.reevaluateGate();
      },
      onDeviceUpdate: (evidence: DeviceInteractionEvidence) => {
        const adjusted = this.simulation.overrideDevice(evidence);
        this.deviceController.update(adjusted);
        this.reevaluateGate();
      },
      onFpsUpdate: (fps: number, latencyMs: number) => {
        this.currentFps = fps;
        this.currentLatencyMs = latencyMs;
        this.notifyState();
      },
    });
  }

  private setupTransitionListeners(): void {
    this.presenceController.onTransition((e: PresenceTransitionEvent) => {
      this.recordEvent(
        e.to === 'PRESENT' ? 'STUDENT_PRESENT' : 'STUDENT_AWAY',
        e.reason,
        e.confidence
      );
    });

    this.deviceController.onTransition((e: DeviceTransitionEvent) => {
      let eventType: FocusEventType = 'DEVICE_DETECTED';
      if (e.to === 'DEVICE_IN_USE') eventType = 'DEVICE_IN_USE';
      else if (e.to === 'NO_DEVICE_USE') eventType = 'DEVICE_CLEARED';
      this.recordEvent(eventType, e.reason, e.confidence);
    });
  }

  private setupTimerSubscription(): void {
    this.timerEngine.subscribe((tickData) => {
      if (this.activeSession) {
        this.activeSession.totalSessionMs = tickData.totalSessionMs;
        this.activeSession.verifiedFocusMs = tickData.verifiedFocusMs;
        this.activeSession.awayMs = tickData.awayMs;
        this.activeSession.deviceUseMs = tickData.deviceUseMs;
        this.activeSession.manualPauseMs = tickData.manualPauseMs;
        this.activeSession.monitoringErrorMs = tickData.monitoringErrorMs;
        this.activeSession.segments = tickData.segments;
        this.activeSession.focusScore = this.calculateFocusScore(this.activeSession);
        this.activeSession.efficiencyPercentage = tickData.totalSessionMs > 0
          ? Math.round((tickData.verifiedFocusMs / tickData.totalSessionMs) * 100)
          : 100;
        
        // Auto-save progress periodically
        this.repository.saveActiveSession(this.activeSession);
      }
      this.notifyState();
      this.sendElectronUpdate();
    });
  }

  private setupElectronIPC(): void {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.onToggleFocus) {
      (window as any).electronAPI.onToggleFocus((action: string) => {
        console.log('Received Electron tray focus action:', action);
        if (action === 'pause') this.pauseSession('MANUAL_PAUSE');
        else if (action === 'resume') this.resumeSession();
        else if (action === 'stop') this.stopSession();
      });
    }
  }

  private sendElectronUpdate(): void {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.updateFocusStatus) {
      const gate = this.getGateState();
      let highLevelState = 'IDLE';
      if (this.activeSession && this.activeSession.state === 'ACTIVE') {
        if (gate.isOpen) highLevelState = 'ACTIVE';
        else if (gate.pauseReason === 'STUDENT_AWAY') highLevelState = 'AWAY';
        else if (gate.pauseReason === 'DEVICE_IN_USE') highLevelState = 'DEVICE_IN_USE';
        else highLevelState = 'PAUSED';
      }

      (window as any).electronAPI.updateFocusStatus({
        isActive: Boolean(this.activeSession && this.activeSession.state === 'ACTIVE'),
        highLevelState,
        verifiedFocusMs: this.activeSession?.verifiedFocusMs || 0,
      });
    }
  }

  private restoreActiveSessionIfAny(): void {
    const existing = this.repository.getActiveSession();
    if (existing && existing.state === 'ACTIVE') {
      this.activeSession = existing;
      this.manualPause = false;
      this.recentEvents = existing.events.slice(-20);
      const gate = this.getGateState();
      this.timerEngine.restoreFromState(
        existing.startedAt || Date.now(),
        existing.segments,
        gate
      );
    }
  }

  public async startSession(
    subject: string = 'GATE General Study',
    topic: string = 'Core PYQ Mastery',
    studyMode: StudyMode = 'mixed',
    targetDurationMinutes: number = 50
  ): Promise<FocusSession> {
    if (this.activeSession && this.activeSession.state === 'ACTIVE') {
      return this.activeSession;
    }

    // 1. Create or resume session in repository
    this.activeSession = this.repository.createSession(
      subject,
      topic,
      studyMode,
      targetDurationMinutes
    );
    this.activeSession.startedAt = Date.now();
    this.activeSession.state = 'ACTIVE';
    this.manualPause = false;
    this.recentEvents = [];

    // 2. Start Camera & Models
    await this.cameraManager.startStream();
    await this.modelManager.initializeAllModels(true);

    // 3. Start FrameScheduler & Timer
    this.frameScheduler.start();
    this.timerEngine.start(this.activeSession.startedAt);

    // 4. Start Periodic Watchdog
    this.startWatchdogLoop();

    this.recordEvent('SESSION_START', `Focus session started for ${subject} — ${topic}`);
    this.reevaluateGate();
    return this.activeSession;
  }

  public pauseSession(reason: PauseReason = 'MANUAL_PAUSE'): void {
    this.manualPause = true;
    if (this.activeSession) {
      this.activeSession.pauseReason = reason;
    }
    this.recordEvent('TIMER_PAUSED', `Session paused manually (${reason})`);
    this.reevaluateGate();
  }

  public resumeSession(): void {
    this.manualPause = false;
    if (this.activeSession) {
      this.activeSession.pauseReason = undefined;
    }
    this.recordEvent('TIMER_RESUMED', 'Session resumed manually');
    this.reevaluateGate();
  }

  public stopSession(): FocusSession | null {
    if (!this.activeSession) return null;

    this.recordEvent('SESSION_STOP', 'Focus session completed');
    this.frameScheduler.stop();
    this.stopWatchdogLoop();

    const finalTimer = this.timerEngine.stop();
    this.activeSession.endedAt = Date.now();
    this.activeSession.state = 'COMPLETED';
    this.activeSession.totalSessionMs = finalTimer.totalSessionMs;
    this.activeSession.verifiedFocusMs = finalTimer.verifiedFocusMs;
    this.activeSession.awayMs = finalTimer.awayMs;
    this.activeSession.deviceUseMs = finalTimer.deviceUseMs;
    this.activeSession.manualPauseMs = finalTimer.manualPauseMs;
    this.activeSession.monitoringErrorMs = finalTimer.monitoringErrorMs;
    this.activeSession.segments = finalTimer.segments;
    this.activeSession.events = [...this.recentEvents];
    this.activeSession.focusScore = this.calculateFocusScore(this.activeSession);
    this.activeSession.efficiencyPercentage = finalTimer.totalSessionMs > 0
      ? Math.round((finalTimer.verifiedFocusMs / finalTimer.totalSessionMs) * 100)
      : 100;

    // Idempotent save to completed history
    this.repository.saveCompletedSession(this.activeSession);
    const completedSession = { ...this.activeSession };
    this.activeSession = null;
    this.manualPause = false;

    this.cameraManager.stopStream();
    this.sendElectronUpdate();
    this.notifyState();
    return completedSession;
  }

  private reevaluateGate(): void {
    const rawCameraHealth = this.cameraManager.getHealth();
    const cameraHealth = this.simulation.overrideCameraHealth(rawCameraHealth);
    const cameraCheck = this.cameraWatchdog.evaluate(cameraHealth);
    const visionCheck = this.visionWatchdog.evaluate();

    const monitoringHealthy = cameraCheck.isHealthy && visionCheck.isHealthy;
    const studentPresent = this.presenceController.isStudentPresent();
    const deviceInUse = this.deviceController.isDeviceInUse();

    const gate = VerifiedTimerGate.evaluate({
      studentPresent,
      deviceInUse,
      monitoringHealthy,
      manualPause: this.manualPause,
    });

    this.timerEngine.updateGate(gate);
    this.notifyState();
  }

  private startWatchdogLoop(): void {
    this.stopWatchdogLoop();
    this.watchdogIntervalId = setInterval(() => {
      this.reevaluateGate();
    }, 1000);
  }

  private stopWatchdogLoop(): void {
    if (this.watchdogIntervalId !== null) {
      clearInterval(this.watchdogIntervalId);
      this.watchdogIntervalId = null;
    }
  }

  private recordEvent(type: FocusEventType, description: string, confidence?: number): void {
    const event: FocusEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      type,
      description,
      confidence,
    };
    this.recentEvents.push(event);
    if (this.recentEvents.length > 50) {
      this.recentEvents.shift();
    }
    if (this.activeSession) {
      this.activeSession.events = [...this.recentEvents];
    }
    this.notifyState();
  }

  private calculateFocusScore(session: FocusSession): number {
    if (session.totalSessionMs <= 0) return 100;
    const verifiedRatio = session.verifiedFocusMs / session.totalSessionMs;
    const deviceInterruptionPenalty = (session.deviceUseMs / session.totalSessionMs) * 40;
    const awayPenalty = (session.awayMs / session.totalSessionMs) * 30;
    const raw = Math.round(verifiedRatio * 100 - deviceInterruptionPenalty - awayPenalty);
    return Math.max(0, Math.min(100, raw));
  }

  public getGateState(): TimerGateState {
    const rawCameraHealth = this.cameraManager.getHealth();
    const cameraHealth = this.simulation.overrideCameraHealth(rawCameraHealth);
    const cameraCheck = this.cameraWatchdog.evaluate(cameraHealth);
    const visionCheck = this.visionWatchdog.evaluate();

    return VerifiedTimerGate.evaluate({
      studentPresent: this.presenceController.isStudentPresent(),
      deviceInUse: this.deviceController.isDeviceInUse(),
      monitoringHealthy: cameraCheck.isHealthy && visionCheck.isHealthy,
      manualPause: this.manualPause,
    });
  }

  public getState(): FocusControllerState {
    const rawCameraHealth = this.cameraManager.getHealth();
    const cameraHealth = this.simulation.overrideCameraHealth(rawCameraHealth);
    const cameraCheck = this.cameraWatchdog.evaluate(cameraHealth);
    const visionCheck = this.visionWatchdog.evaluate();
    const monitoringHealthy = cameraCheck.isHealthy && visionCheck.isHealthy;

    return {
      session: this.activeSession,
      isActive: Boolean(this.activeSession && this.activeSession.state === 'ACTIVE'),
      gate: this.getGateState(),
      timer: this.timerEngine.getSnapshot(),
      cameraHealth,
      presenceState: this.presenceController.getState(),
      presenceConfidence: this.presenceController.getConfidence(),
      deviceState: this.deviceController.getState(),
      deviceConfidence: this.deviceController.getConfidence(),
      fps: this.currentFps,
      latencyMs: this.currentLatencyMs,
      recentEvents: this.recentEvents,
      monitoringHealthy,
    };
  }

  public subscribe(listener: ControllerStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyState(): void {
    const state = this.getState();
    this.listeners.forEach((l) => {
      try {
        l(state);
      } catch (err) {
        console.error('FocusController state listener error:', err);
      }
    });
  }
}

export const focusSessionController = FocusSessionController.getInstance();
