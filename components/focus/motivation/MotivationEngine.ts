/**
 * MotivationEngine
 * 
 * Generates clean, non-distracting execution messages.
 * Invariant: Messages only reflect state; they NEVER control or alter the timer gate.
 */
export class MotivationEngine {
  public static readonly PERMANENT_HERO = "FOCUS ON TODAY'S EXECUTION.";

  private static readonly ROTATING_QUOTES = [
    'ONE TASK. FULL FOCUS.',
    'DO THE WORK. IGNORE THE NOISE.',
    'PYQs. REVISION. TESTS. IMPROVEMENT. REPEAT.',
    'PROTECT THIS SESSION.',
    'DISCIPLINE OVER MOOD.',
    'ACCURACY BEFORE SPEED.',
    'CONSISTENCY BEATS TALENT.',
  ];

  public static getRotatingMessage(index: number): string {
    return this.ROTATING_QUOTES[Math.abs(index) % this.ROTATING_QUOTES.length];
  }

  public static getContextualMessage(
    isStudentPresent: boolean,
    isDeviceInUse: boolean,
    isManualPause: boolean
  ): string {
    if (isManualPause) {
      return 'SESSION PAUSED. RESUME WHEN READY.';
    }
    if (isDeviceInUse) {
      return 'PUT THE PHONE DOWN. PROTECT THIS SESSION.';
    }
    if (!isStudentPresent) {
      return 'STEP AWAY IF NEEDED. RETURN READY TO EXECUTE.';
    }
    return this.PERMANENT_HERO;
  }
}
