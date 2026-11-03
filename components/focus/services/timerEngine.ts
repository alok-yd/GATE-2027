import { FocusEngine, FocusEngineOutput, focusEngine } from './focusEngine';
import {
  FocusMode,
  FocusSession,
  FocusState,
  FocusTimelineEvent,
  isFocusedState,
  StudyMedium,
} from '../types';
import { StorageService } from './storage';
import { soundFx } from './audio';

export interface TimerTickData {
  state: FocusState;
  elapsedSeconds: number;
  focusedSeconds: number;
  screenFocusedSeconds: number;
  paperFocusedSeconds: number;
  mixedFocusedSeconds: number;
  thinkingSeconds: number;
  uncertainSeconds: number;
  unverifiedSeconds: number;
  pausedSeconds: number;
  remainingTargetSeconds: number;
  distractedSeconds: number;
  phoneSeconds: number;
  conversationSeconds: number;
  sleepSeconds: number;
  awaySeconds: number;
  breakSeconds: number;
  efficiency: number;
  currentScore: number;
  averageScore: number;
  peakScore: number;
  distractionCount: number;
  targetSeconds: number;
  activeSubject: string;
  activeTopic: string;
  activeGoal: string;
  activeMode: FocusMode;
  activeMedium: StudyMedium;
  isCompleted: boolean;
  stateExplanation?: string;
  telemetry?: FocusEngineOutput['telemetry'];
}

export type TimerTickCallback = (data: TimerTickData) => void;

/**
 * Session time is credited exclusively while FocusEngine reports a webcam-
 * detected person as present. AWAY, UNVERIFIED and PAUSED time never reduces
 * the countdown. A single interval owns all timer updates.
 */
export class TimerEngine {
  private focusEngine: FocusEngine;
  private intervalId: number | null = null;
  private callbacks = new Set<TimerTickCallback>();

  private activeSessionId: string | null = null;
  private subject = 'Algorithms';
  private topic = 'Dynamic Programming';
  private goal = 'Study session';
  private mode: FocusMode = 'Deep Focus';
  private medium: StudyMedium = 'Screen Study';
  private targetSeconds = 7200;
  private sessionStartTime = 0;

  private accumulatedFocusedMs = 0;
  private accumulatedScreenFocusedMs = 0;
  private accumulatedPaperFocusedMs = 0;
  private accumulatedMixedFocusedMs = 0;
  private accumulatedUnverifiedMs = 0;
  private accumulatedPausedMs = 0;
  private accumulatedAwayMs = 0;
  private accumulatedBreakMs = 0;
  private lastTickTimestamp = 0;

  private previousState: FocusState = 'IDLE';
  private currentStateExplanation = '';
  private timelineBuffer: FocusTimelineEvent[] = [];
  private lastTimelineLog = 0;
  private targetReachedNotified = false;

  constructor(engine: FocusEngine) {
    this.focusEngine = engine;
    this.medium = engine.getStudyMedium();
    this.focusEngine.subscribe(this.handleFocusEngineOutput);
  }

  subscribe(callback: TimerTickCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  setStudyMedium(medium: StudyMedium): void {
    this.medium = medium;
    this.focusEngine.setStudyMedium(medium);
    this.emitCurrentTick();
  }

  getStudyMedium(): StudyMedium {
    return this.medium;
  }

  startSession(
    subject: string,
    topic: string,
    targetSeconds: number,
    mode: FocusMode = 'Deep Focus',
    goal = '',
    medium?: StudyMedium
  ): void {
    if (this.activeSessionId) this.stopSession();

    const now = Date.now();
    this.activeSessionId = `sess_${now}`;
    this.subject = subject;
    this.topic = topic;
    this.goal = goal || 'Study session';
    this.mode = mode;
    if (medium) this.medium = medium;
    this.focusEngine.setStudyMedium(this.medium);

    this.targetSeconds = Math.max(1, Math.floor(targetSeconds));
    this.sessionStartTime = now;
    this.lastTickTimestamp = now;

    this.accumulatedFocusedMs = 0;
    this.accumulatedScreenFocusedMs = 0;
    this.accumulatedPaperFocusedMs = 0;
    this.accumulatedMixedFocusedMs = 0;
    this.accumulatedUnverifiedMs = 0;
    this.accumulatedPausedMs = 0;
    this.accumulatedAwayMs = 0;
    this.accumulatedBreakMs = 0;
    this.timelineBuffer = [];
    this.lastTimelineLog = now;
    this.targetReachedNotified = false;
    this.currentStateExplanation = 'Waiting for webcam presence. The countdown is paused.';

    // Establish a paused baseline before activating presence detection.
    // The engine immediately changes to PRESENT only after stable camera frames.
    this.previousState = 'UNVERIFIED';
    this.focusEngine.beginSession();
    this.previousState = this.focusEngine.getState();

    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.intervalId = window.setInterval(this.tick, 250);
    this.emitCurrentTick();
  }

  pauseSession(): void {
    if (!this.activeSessionId) return;
    this.focusEngine.setState('PAUSED', 'User paused session');
    this.emitCurrentTick();
  }

  resumeSession(): void {
    if (!this.activeSessionId) return;
    // FocusEngine re-checks the current webcam presence before allowing time.
    this.focusEngine.setState('FOCUSED_SCREEN', 'User resumed session');
    this.emitCurrentTick();
  }

  continueWithoutVerification(): void {
    if (!this.activeSessionId) return;
    this.focusEngine.setState('UNVERIFIED', 'User continued without camera verification');
    this.emitCurrentTick();
  }

  startBreak(_durationMinutes = 5): void {
    if (!this.activeSessionId) return;
    this.focusEngine.setState('BREAK', 'User started a break');
    this.emitCurrentTick();
  }

  endBreak(): void {
    if (!this.activeSessionId) return;
    soundFx.playBreakEnd();
    this.resumeSession();
  }

  stopSession(): FocusSession | null {
    if (!this.activeSessionId) return null;
    // finishSession accrues the final partial interval before determining status.
    return this.finishSession(false);
  }

  private finishSession(completed: boolean): FocusSession | null {
    if (!this.activeSessionId) return null;

    const endTime = Date.now();
    this.accrueElapsedTo(endTime, this.previousState);

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const focusedSeconds = Math.floor(this.accumulatedFocusedMs / 1000);
    const screenFocusedSeconds = Math.floor(this.accumulatedScreenFocusedMs / 1000);
    const paperFocusedSeconds = Math.floor(this.accumulatedPaperFocusedMs / 1000);
    const mixedFocusedSeconds = Math.floor(this.accumulatedMixedFocusedMs / 1000);
    const elapsedSeconds = Math.max(0, Math.floor((endTime - this.sessionStartTime) / 1000));
    const isCompleted = completed || focusedSeconds >= this.targetSeconds;

    const session: FocusSession = {
      id: this.activeSessionId,
      subject: this.subject,
      topic: this.topic,
      goal: this.goal,
      mode: this.mode,
      studyMedium: this.medium,
      startTime: this.sessionStartTime,
      endTime,
      targetSeconds: this.targetSeconds,
      focusedSeconds,
      screenFocusedSeconds,
      paperFocusedSeconds,
      mixedFocusedSeconds,
      thinkingSeconds: 0,
      uncertainSeconds: 0,
      unverifiedSeconds: Math.floor(this.accumulatedUnverifiedMs / 1000),
      pausedSeconds: Math.floor(this.accumulatedPausedMs / 1000),
      warningSeconds: 0,
      distractedSeconds: 0,
      phoneDistractedSeconds: 0,
      conversationSeconds: 0,
      possibleSleepSeconds: 0,
      awaySeconds: Math.floor(this.accumulatedAwayMs / 1000),
      breakSeconds: Math.floor(this.accumulatedBreakMs / 1000),
      elapsedSeconds,
      averageFocusScore: focusedSeconds > 0 ? 100 : 0,
      peakFocusScore: focusedSeconds > 0 ? 100 : 0,
      distractionCount: 0,
      status: isCompleted ? 'COMPLETED' : 'STOPPED',
      transitionLogs: this.focusEngine.getTransitionLogs(),
      activityEvents: [],
    };

    StorageService.saveSession(session);
    if (this.timelineBuffer.length > 0) {
      StorageService.saveTimelineEvents(this.timelineBuffer);
    }

    this.activeSessionId = null;
    this.previousState = isCompleted ? 'COMPLETED' : 'IDLE';
    this.focusEngine.endSession(isCompleted);
    this.emitCurrentTick();

    return session;
  }

  private handleFocusEngineOutput = (output: FocusEngineOutput): void => {
    if (!this.activeSessionId) return;

    // Close the old state interval before applying the new presence state.
    const now = Date.now();
    const previous = this.previousState;
    const isLosingCameraWhilePresent =
      output.state === 'UNVERIFIED' && isFocusedState(previous);
    const accrualEnd = isLosingCameraWhilePresent
      ? Math.max(
          this.lastTickTimestamp,
          Math.min(now, output.cameraAccrualCutoffTimestamp)
        )
      : now;
    this.accrueElapsedTo(accrualEnd, previous);
    const next = output.state;
    this.currentStateExplanation = output.stateExplanation;

    if (next !== previous) {
      if (
        isFocusedState(next) &&
        (previous === 'AWAY' || previous === 'UNVERIFIED' || previous === 'PAUSED')
      ) {
        soundFx.playFocusRestored();
      } else if (
        isFocusedState(previous) &&
        (next === 'AWAY' || next === 'UNVERIFIED' || next === 'PAUSED')
      ) {
        soundFx.playAutoPaused();
      }
    }

    this.previousState = next;
    this.emitCurrentTick();
  };

  private accrueElapsedTo(now: number, state: FocusState): void {
    if (!this.activeSessionId || this.lastTickTimestamp <= 0) return;

    const deltaMs = Math.max(0, now - this.lastTickTimestamp);
    this.lastTickTimestamp = now;
    if (deltaMs === 0) return;

    if (isFocusedState(state)) {
      this.accumulatedFocusedMs += deltaMs;
      if (state === 'FOCUSED_PAPER') {
        this.accumulatedPaperFocusedMs += deltaMs;
      } else if (state === 'FOCUSED_MIXED') {
        this.accumulatedMixedFocusedMs += deltaMs;
      } else {
        this.accumulatedScreenFocusedMs += deltaMs;
      }
      return;
    }

    switch (state) {
      case 'UNVERIFIED':
        this.accumulatedUnverifiedMs += deltaMs;
        break;
      case 'PAUSED':
        this.accumulatedPausedMs += deltaMs;
        break;
      case 'AWAY':
        this.accumulatedAwayMs += deltaMs;
        break;
      case 'BREAK':
        this.accumulatedBreakMs += deltaMs;
        break;
      default:
        // IDLE, COMPLETED, and all non-presence states earn no study time.
        break;
    }
  }

  private tick = (): void => {
    if (!this.activeSessionId) return;

    // Re-check camera freshness even if browser background throttling delays frames.
    this.focusEngine.refresh();
    const now = Date.now();
    this.accrueElapsedTo(now, this.previousState);

    const focusedSeconds = Math.floor(this.accumulatedFocusedMs / 1000);
    if (
      focusedSeconds >= this.targetSeconds &&
      this.targetSeconds > 0 &&
      !this.targetReachedNotified
    ) {
      this.targetReachedNotified = true;
      soundFx.playTargetReached();
      this.finishSession(true);
      return;
    }

    if (now - this.lastTimelineLog >= 5000) {
      this.lastTimelineLog = now;
      const output = this.focusEngine.getCurrentOutput();
      this.timelineBuffer.push({
        id: `tl_${now}`,
        sessionId: this.activeSessionId,
        timestamp: now,
        state: this.focusEngine.getState(),
        focusScore: output.facePresent ? 100 : 0,
        facePresent: output.facePresent,
        headYaw: 0,
        headPitch: 0,
        eyeOpen: output.facePresent,
        activeApp: 'Study Environment',
        handActivity: false,
        activity: output.facePresent ? 'SCREEN_READING' : 'AWAY',
      });
    }

    this.emitCurrentTick();
  };

  private emitCurrentTick(): void {
    const focusedSeconds = Math.floor(this.accumulatedFocusedMs / 1000);
    const screenFocusedSeconds = Math.floor(this.accumulatedScreenFocusedMs / 1000);
    const paperFocusedSeconds = Math.floor(this.accumulatedPaperFocusedMs / 1000);
    const mixedFocusedSeconds = Math.floor(this.accumulatedMixedFocusedMs / 1000);
    const unverifiedSeconds = Math.floor(this.accumulatedUnverifiedMs / 1000);
    const pausedSeconds = Math.floor(this.accumulatedPausedMs / 1000);
    const awaySeconds = Math.floor(this.accumulatedAwayMs / 1000);
    const breakSeconds = Math.floor(this.accumulatedBreakMs / 1000);

    const now = Date.now();
    const elapsedSeconds = this.sessionStartTime > 0
      ? Math.max(0, Math.floor((now - this.sessionStartTime) / 1000))
      : 0;
    const remainingTargetSeconds = Math.max(0, this.targetSeconds - focusedSeconds);
    const nonBreakElapsed = Math.max(1, elapsedSeconds - breakSeconds);
    const efficiency = Math.min(
      100,
      Math.max(0, Math.round((focusedSeconds / nonBreakElapsed) * 100))
    );

    const output = this.focusEngine.getCurrentOutput();
    const isCompleted =
      focusedSeconds >= this.targetSeconds ||
      output.state === 'COMPLETED';

    const payload: TimerTickData = {
      state: output.state,
      elapsedSeconds,
      focusedSeconds,
      screenFocusedSeconds,
      paperFocusedSeconds,
      mixedFocusedSeconds,
      thinkingSeconds: 0,
      uncertainSeconds: 0,
      unverifiedSeconds,
      pausedSeconds,
      remainingTargetSeconds,
      distractedSeconds: 0,
      phoneSeconds: 0,
      conversationSeconds: 0,
      sleepSeconds: 0,
      awaySeconds,
      breakSeconds,
      efficiency,
      currentScore: output.facePresent ? 100 : 0,
      averageScore: focusedSeconds > 0 ? 100 : 0,
      peakScore: focusedSeconds > 0 ? 100 : 0,
      distractionCount: 0,
      targetSeconds: this.targetSeconds,
      activeSubject: this.subject,
      activeTopic: this.topic,
      activeGoal: this.goal,
      activeMode: this.mode,
      activeMedium: this.medium,
      isCompleted,
      stateExplanation: this.currentStateExplanation || output.stateExplanation,
      telemetry: output.telemetry,
    };

    this.callbacks.forEach((callback) => callback(payload));
  }
}

export const timerEngine = new TimerEngine(focusEngine);
