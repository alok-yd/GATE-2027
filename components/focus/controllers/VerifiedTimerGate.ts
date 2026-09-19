import { TimerGateInputs, TimerGateState, PauseReason } from '../types';

/**
 * VerifiedTimerGate
 * 
 * Central, single authoritative evaluator for verified study time.
 * NO secondary detector, focus score, or UI component may override this gate.
 * 
 * Verified study timer runs ONLY when:
 *   studentPresent === true
 *   AND deviceInUse === false
 *   AND monitoringHealthy === true
 *   AND manualPause === false
 */
export class VerifiedTimerGate {
  /**
   * Authoritative deterministic check
   */
  public static shouldTimerRun(inputs: TimerGateInputs): boolean {
    if (inputs.manualPause) return false;
    if (!inputs.monitoringHealthy) return false;
    if (inputs.studentPresent !== true) return false;
    if (inputs.deviceInUse === true) return false;
    return true;
  }

  /**
   * Determine primary explainable reason when the gate is closed
   */
  public static getPauseReason(inputs: TimerGateInputs): PauseReason | null {
    if (inputs.manualPause) return 'MANUAL_PAUSE';
    if (!inputs.monitoringHealthy) return 'MONITORING_UNAVAILABLE';
    if (inputs.studentPresent !== true) return 'STUDENT_AWAY';
    if (inputs.deviceInUse === true) return 'DEVICE_IN_USE';
    return null;
  }

  /**
   * Evaluates complete gate state with timestamp
   */
  public static evaluate(inputs: TimerGateInputs): TimerGateState {
    const isOpen = this.shouldTimerRun(inputs);
    const pauseReason = isOpen ? null : this.getPauseReason(inputs);

    return {
      isOpen,
      pauseReason,
      studentPresent: inputs.studentPresent,
      deviceInUse: inputs.deviceInUse,
      monitoringHealthy: inputs.monitoringHealthy,
      manualPause: inputs.manualPause,
      lastEvaluatedAt: Date.now(),
    };
  }
}
