import { SimulationState, StudentPresenceEvidence, DeviceInteractionEvidence, CameraHealth } from '../types';

/**
 * SimulationEngine
 * 
 * Provides an isolated testing environment for developers to test
 * presence, absence, phone use, and camera stalls without real hardware triggers.
 * Must never pollute real user study records.
 */
export class SimulationEngine {
  private static instance: SimulationEngine;

  private state: SimulationState = {
    enabled: false,
    simulatedStudentPresent: true,
    simulatedDeviceInUse: false,
    simulatedCameraFailure: false,
    simulatedStaleFrame: false,
  };

  public static getInstance(): SimulationEngine {
    if (!SimulationEngine.instance) {
      SimulationEngine.instance = new SimulationEngine();
    }
    return SimulationEngine.instance;
  }

  public isEnabled(): boolean {
    return this.state.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.state.enabled = enabled;
  }

  public getState(): SimulationState {
    return { ...this.state };
  }

  public setSimulatedStudentPresent(present: boolean): void {
    this.state.simulatedStudentPresent = present;
  }

  public setSimulatedDeviceInUse(inUse: boolean): void {
    this.state.simulatedDeviceInUse = inUse;
  }

  public setSimulatedCameraFailure(failure: boolean): void {
    this.state.simulatedCameraFailure = failure;
  }

  public setSimulatedStaleFrame(stale: boolean): void {
    this.state.simulatedStaleFrame = stale;
  }

  public overridePresence(real: StudentPresenceEvidence, now: number = Date.now()): StudentPresenceEvidence {
    if (!this.state.enabled) return real;
    return {
      ...real,
      studentFaceDetected: this.state.simulatedStudentPresent,
      faceMatchConfidence: this.state.simulatedStudentPresent ? 0.95 : 0.20,
      faceDetectionConfidence: this.state.simulatedStudentPresent ? 0.95 : 0.0,
      timestamp: now,
    };
  }

  public overrideDevice(real: DeviceInteractionEvidence, now: number = Date.now()): DeviceInteractionEvidence {
    if (!this.state.enabled) return real;
    return {
      ...real,
      deviceDetected: this.state.simulatedDeviceInUse,
      handInteractionConfidence: this.state.simulatedDeviceInUse ? 0.95 : 0.0,
      proximityConfidence: this.state.simulatedDeviceInUse ? 0.85 : 0.0,
      timestamp: now,
    };
  }

  public overrideCameraHealth(real: CameraHealth): CameraHealth {
    if (!this.state.enabled) return real;
    if (this.state.simulatedCameraFailure) {
      return {
        ...real,
        state: 'FAILED',
        streamActive: false,
        videoReady: false,
        errorMessage: 'Simulated camera failure',
      };
    }
    if (this.state.simulatedStaleFrame) {
      return {
        ...real,
        lastFrameAt: Date.now() - 5000,
        frameFreshnessMs: 5000,
        state: 'DEGRADED',
      };
    }
    return real;
  }
}

export const simulationEngine = SimulationEngine.getInstance();
