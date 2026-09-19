import { FocusSegment, SegmentReason, TimerGateState } from '../types';

export interface TimerTickData {
  totalSessionMs: number;
  verifiedFocusMs: number;
  awayMs: number;
  deviceUseMs: number;
  manualPauseMs: number;
  monitoringErrorMs: number;
  currentSegment: FocusSegment | null;
  segments: FocusSegment[];
}

type TimerListener = (data: TimerTickData) => void;

/**
 * TimestampTimerEngine
 * 
 * Production-quality timestamped timer engine.
 * Never drifts or relies on naive interval counts.
 * Correctly accumulates active segments based on wall-clock time.
 */
export class TimestampTimerEngine {
  private startedAt: number | null = null;
  private segments: FocusSegment[] = [];
  private currentSegment: FocusSegment | null = null;
  private isRunning: boolean = false;
  private tickIntervalId: any = null;
  private listeners: Set<TimerListener> = new Set();

  public start(startTimeMs: number = Date.now()): void {
    if (this.isRunning) return;
    this.startedAt = startTimeMs;
    this.isRunning = true;
    this.segments = [];
    this.currentSegment = null;

    this.startTicker();
  }

  public stop(): TimerTickData {
    this.closeCurrentSegment(Date.now());
    this.stopTicker();
    this.isRunning = false;
    return this.getSnapshot();
  }

  public reset(): void {
    this.stopTicker();
    this.startedAt = null;
    this.segments = [];
    this.currentSegment = null;
    this.isRunning = false;
    this.notifyListeners();
  }

  /**
   * Update the active segment according to the authoritative gate state.
   * Called whenever the gate state transitions or on tick.
   */
  public updateGate(gate: TimerGateState, nowMs: number = Date.now()): void {
    if (!this.isRunning) return;

    let targetReason: SegmentReason;
    if (gate.isOpen) {
      targetReason = 'study_verified';
    } else {
      switch (gate.pauseReason) {
        case 'STUDENT_AWAY':
          targetReason = 'away';
          break;
        case 'DEVICE_IN_USE':
          targetReason = 'device_use';
          break;
        case 'MANUAL_PAUSE':
          targetReason = 'manual_pause';
          break;
        case 'MONITORING_UNAVAILABLE':
        default:
          targetReason = 'monitoring_error';
          break;
      }
    }

    // If current segment reason is different, close it and open a new segment
    if (!this.currentSegment || this.currentSegment.reason !== targetReason) {
      this.closeCurrentSegment(nowMs);
      this.currentSegment = {
        id: `seg_${nowMs}_${Math.random().toString(36).slice(2, 7)}`,
        startMs: nowMs,
        endMs: nowMs,
        durationMs: 0,
        reason: targetReason,
      };
    } else {
      // Update running segment duration
      this.currentSegment.endMs = nowMs;
      this.currentSegment.durationMs = Math.max(0, nowMs - this.currentSegment.startMs);
    }

    this.notifyListeners();
  }

  private closeCurrentSegment(endMs: number): void {
    if (this.currentSegment) {
      this.currentSegment.endMs = endMs;
      this.currentSegment.durationMs = Math.max(0, endMs - this.currentSegment.startMs);
      if (this.currentSegment.durationMs > 0) {
        this.segments.push({ ...this.currentSegment });
      }
      this.currentSegment = null;
    }
  }

  public getSnapshot(nowMs: number = Date.now()): TimerTickData {
    // If there's an ongoing segment, compute its current duration
    let activeSegCopy: FocusSegment | null = null;
    if (this.currentSegment) {
      activeSegCopy = {
        ...this.currentSegment,
        endMs: nowMs,
        durationMs: Math.max(0, nowMs - this.currentSegment.startMs),
      };
    }

    const allSegments = activeSegCopy ? [...this.segments, activeSegCopy] : [...this.segments];

    let verifiedFocusMs = 0;
    let awayMs = 0;
    let deviceUseMs = 0;
    let manualPauseMs = 0;
    let monitoringErrorMs = 0;

    for (const seg of allSegments) {
      switch (seg.reason) {
        case 'study_verified':
          verifiedFocusMs += seg.durationMs;
          break;
        case 'away':
          awayMs += seg.durationMs;
          break;
        case 'device_use':
          deviceUseMs += seg.durationMs;
          break;
        case 'manual_pause':
          manualPauseMs += seg.durationMs;
          break;
        case 'monitoring_error':
          monitoringErrorMs += seg.durationMs;
          break;
      }
    }

    const totalSessionMs = this.startedAt ? Math.max(0, nowMs - this.startedAt) : 0;

    return {
      totalSessionMs,
      verifiedFocusMs,
      awayMs,
      deviceUseMs,
      manualPauseMs,
      monitoringErrorMs,
      currentSegment: activeSegCopy,
      segments: this.segments,
    };
  }

  public subscribe(listener: TimerListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('TimerListener callback error:', err);
      }
    });
  }

  private startTicker(): void {
    this.stopTicker();
    // Update every 250ms for smooth UI rendering, always grounded in Date.now()
    this.tickIntervalId = setInterval(() => {
      if (this.isRunning && this.currentSegment) {
        const now = Date.now();
        this.currentSegment.endMs = now;
        this.currentSegment.durationMs = Math.max(0, now - this.currentSegment.startMs);
        this.notifyListeners();
      }
    }, 250);
  }

  private stopTicker(): void {
    if (this.tickIntervalId !== null) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
  }

  public restoreFromState(
    startedAt: number,
    segments: FocusSegment[],
    lastGate: TimerGateState
  ): void {
    this.startedAt = startedAt;
    this.segments = [...segments];
    this.isRunning = true;
    this.currentSegment = null;
    this.updateGate(lastGate, Date.now());
    this.startTicker();
  }
}
