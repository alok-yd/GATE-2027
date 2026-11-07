import { FocusEngine, FocusEngineOutput, focusEngine } from './focusEngine';
import {
  FocusMode,
  FocusSession,
  FocusState,
  FocusTimelineEvent,
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
}

export type TimerTickCallback = (data: TimerTickData) => void;

/**
 * One interval owns the countdown. FOCUSED time is earned only while fresh,
 * healthy webcam frames are available and the FocusEngine confirms presence
 * or applies the selected study medium's short face-visibility grace window.
 * AWAY and UNVERIFIED time never reduce the remaining target.
 */
export class TimerEngine {
  private readonly focusEngine: FocusEngine;
  private intervalId: number | null = null;
  private callbacks = new Set<TimerTickCallback>();

  private activeSessionId: string | null = null;
  private sessionCounter = 0;
  private subject = 'Algorithms';
  private topic = 'Dynamic Programming';
  private goal = 'Study session';
  private mode: FocusMode = 'Deep Focus';
  private medium: StudyMedium = 'Screen Study';
  private targetSeconds = 7200;
  private sessionStartTime = 0;

  private focusedMs = 0;
  private screenFocusedMs = 0;
  private paperFocusedMs = 0;
  private mixedFocusedMs = 0;
  private unverifiedMs = 0;
  private awayMs = 0;
  private manualPausedMs = 0;
  private breakMs = 0;
  private lastTickTimestamp = 0;

  private previousState: FocusState = 'IDLE';
  private currentStateExplanation = '';
  private timelineBuffer: FocusTimelineEvent[] = [];
  private lastTimelineLog = 0;

  constructor(engine: FocusEngine) {
    this.focusEngine = engine;
    this.focusEngine.subscribe(this.handleFocusEngineOutput);
  }

  subscribe(callback: TimerTickCallback): () => void {
    this.callbacks.add(callback);
    // Immediately hydrate a newly mounted Focus screen with the current
    // singleton timer state (including a session continuing on another route).
    this.emitCurrentTick();
    return () => this.callbacks.delete(callback);
  }

  hasActiveSession(): boolean {
    return Boolean(this.activeSessionId);
  }

  setStudyMedium(medium: StudyMedium): void {
    if (medium === this.medium) return;
    if (this.activeSessionId) {
      // Attribute time before the selection change to the previous study mode.
      this.accrueTo(Date.now(), this.previousState);
    }
    this.medium = medium;
    this.focusEngine.setStudyMedium(medium);
    this.emitCurrentTick();
  }

  pauseSession(): void {
    if (!this.activeSessionId) return;
    this.focusEngine.pauseManually();
  }

  resumeSession(): void {
    if (!this.activeSessionId) return;
    // Resume only removes the manual override. Presence is checked again by
    // FocusEngine, so an absent student stays paused automatically.
    this.focusEngine.resumeManually();
  }

  startBreak(): void {
    if (!this.activeSessionId) return;
    this.focusEngine.startBreak();
  }

  endBreak(): void {
    if (!this.activeSessionId) return;
    this.focusEngine.endBreak();
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
    this.sessionCounter += 1;
    this.activeSessionId = `sess_${now}_${this.sessionCounter}`;
    this.subject = subject;
    this.topic = topic;
    this.goal = goal || 'Study session';
    this.mode = mode;
    this.medium = medium || 'Screen Study';
    this.focusEngine.setStudyMedium(this.medium);
    this.targetSeconds = Math.max(1, Math.floor(targetSeconds));
    this.sessionStartTime = now;
    this.lastTickTimestamp = now;

    this.focusedMs = 0;
    this.screenFocusedMs = 0;
    this.paperFocusedMs = 0;
    this.mixedFocusedMs = 0;
    this.unverifiedMs = 0;
    this.awayMs = 0;
    this.manualPausedMs = 0;
    this.breakMs = 0;
    this.timelineBuffer = [];
    this.lastTimelineLog = now;
    this.currentStateExplanation = 'Waiting for webcam presence. The countdown is paused.';
    this.previousState = 'UNVERIFIED';

    this.focusEngine.beginSession();

    // Defensive: there is exactly one interval for the active session.
    if (this.intervalId !== null) window.clearInterval(this.intervalId);
    this.intervalId = window.setInterval(this.tick, 250);
    this.emitCurrentTick();
  }

  stopSession(): FocusSession | null {
    if (!this.activeSessionId) return null;
    return this.finishSession(false);
  }

  private handleFocusEngineOutput = (output: FocusEngineOutput): void => {
    if (!this.activeSessionId) return;

    const now = Date.now();
    const previous = this.previousState;

    // If camera frames stop arriving, credit presence only through the last
    // fresh-frame deadline. This prevents a background-tab freeze or webcam
    // disconnect from adding unverified study time.
    const accrualEnd =
      output.state === 'UNVERIFIED' && previous === 'FOCUSED'
        ? Math.max(
            this.lastTickTimestamp,
            Math.min(now, output.cameraAccrualCutoffTimestamp)
          )
        : now;

    this.accrueTo(accrualEnd, previous);
    this.previousState = output.state;
    this.currentStateExplanation = output.stateExplanation;
    this.emitCurrentTick();
  };

  private accrueTo(timestamp: number, state: FocusState): void {
    if (!this.activeSessionId || this.lastTickTimestamp <= 0) return;

    const start = this.lastTickTimestamp;
    const end = Math.max(start, timestamp);
    const deltaMs = end - start;
    this.lastTickTimestamp = end;
    if (deltaMs <= 0) return;

    if (state === 'FOCUSED') {
      this.focusedMs += deltaMs;
      if (this.activeSessionId) {
        StorageService.addVerifiedStudyInterval(
          this.activeSessionId,
          start,
          end,
          this.medium
        );
      }
      if (this.medium === 'Paper / PYQ Study') {
        this.paperFocusedMs += deltaMs;
      } else if (this.medium === 'Mixed Study') {
        this.mixedFocusedMs += deltaMs;
      } else {
        this.screenFocusedMs += deltaMs;
      }
      return;
    }

    if (state === 'AWAY') {
      this.awayMs += deltaMs;
    } else if (state === 'UNVERIFIED') {
      this.unverifiedMs += deltaMs;
    } else if (state === 'PAUSED') {
      this.manualPausedMs += deltaMs;
    } else if (state === 'BREAK') {
      this.breakMs += deltaMs;
    }
    // IDLE and COMPLETED never earn time.
  }

  private tick = (): void => {
    if (!this.activeSessionId) return;

    // Refresh the camera state before crediting time. This catches a camera
    // that stopped producing frames even when no detector callback arrives.
    this.focusEngine.refresh();

    const now = Date.now();
    this.accrueTo(now, this.previousState);

    const focusedSeconds = Math.floor(this.focusedMs / 1000);
    if (focusedSeconds >= this.targetSeconds) {
      if (StorageService.getSettings().soundNotifications) {
        soundFx.playTargetReached();
      }
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
        state: output.state,
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

  private finishSession(completed: boolean): FocusSession | null {
    if (!this.activeSessionId) return null;

    // Apply one final freshness check so pressing STOP cannot credit time
    // after the webcam has already stopped providing valid presence frames.
    if (!completed) this.focusEngine.refresh();
    const endTime = Date.now();
    this.accrueTo(endTime, this.previousState);

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const sessionId = this.activeSessionId;
    const focusedSeconds = Math.floor(this.focusedMs / 1000);
    const elapsedSeconds = Math.max(0, Math.floor((endTime - this.sessionStartTime) / 1000));
    const isCompleted = completed || focusedSeconds >= this.targetSeconds;

    const session: FocusSession = {
      id: sessionId,
      subject: this.subject,
      topic: this.topic,
      goal: this.goal,
      mode: this.mode,
      studyMedium: this.medium,
      startTime: this.sessionStartTime,
      endTime,
      targetSeconds: this.targetSeconds,
      focusedSeconds,
      screenFocusedSeconds: Math.floor(this.screenFocusedMs / 1000),
      paperFocusedSeconds: Math.floor(this.paperFocusedMs / 1000),
      mixedFocusedSeconds: Math.floor(this.mixedFocusedMs / 1000),
      thinkingSeconds: 0,
      uncertainSeconds: 0,
      unverifiedSeconds: Math.floor(this.unverifiedMs / 1000),
      pausedSeconds: Math.floor(this.manualPausedMs / 1000),
      warningSeconds: 0,
      distractedSeconds: 0,
      phoneDistractedSeconds: 0,
      conversationSeconds: 0,
      possibleSleepSeconds: 0,
      awaySeconds: Math.floor(this.awayMs / 1000),
      breakSeconds: Math.floor(this.breakMs / 1000),
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

  private emitCurrentTick(): void {
    const focusedSeconds = Math.floor(this.focusedMs / 1000);
    const screenFocusedSeconds = Math.floor(this.screenFocusedMs / 1000);
    const paperFocusedSeconds = Math.floor(this.paperFocusedMs / 1000);
    const mixedFocusedSeconds = Math.floor(this.mixedFocusedMs / 1000);
    const unverifiedSeconds = Math.floor(this.unverifiedMs / 1000);
    const awaySeconds = Math.floor(this.awayMs / 1000);
    const pausedSeconds = Math.floor(this.manualPausedMs / 1000);
    const breakSeconds = Math.floor(this.breakMs / 1000);

    const now = Date.now();
    const elapsedSeconds = this.sessionStartTime > 0
      ? Math.max(0, Math.floor((now - this.sessionStartTime) / 1000))
      : 0;
    const remainingTargetSeconds = Math.max(0, this.targetSeconds - focusedSeconds);
    const efficiency = elapsedSeconds > 0
      ? Math.min(100, Math.max(0, Math.round((focusedSeconds / elapsedSeconds) * 100)))
      : 0;

    const output = this.focusEngine.getCurrentOutput();
    const isCompleted = focusedSeconds >= this.targetSeconds || output.state === 'COMPLETED';

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
    };

    this.callbacks.forEach((callback) => {
      try {
        callback(payload);
      } catch (error) {
        console.error('[AI Focus] Timer listener failed:', error);
      }
    });
  }
}

export const timerEngine = new TimerEngine(focusEngine);
