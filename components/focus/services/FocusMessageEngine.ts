import {
  FocusMessage,
  MessageCategory,
  MessagePriority,
  MessageFrequency,
  HighLevelVerificationState,
  FocusMode
} from '../types';
import { StorageService, getTodayDateString } from './storage';
import { focusSessionController, FocusSessionState } from './FocusSessionController';

export interface CoachContext {
  state: HighLevelVerificationState;
  mode: FocusMode | string;
  subject: string;
  topic: string;
  studyMedium: string;
  isThinking?: boolean;
  efficiency?: number;
  sessionStartTime?: number;
}

// Full Static Message Pool (Prompt Sections 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 24, 25, 26, 27, 28, 29, 48)
export const FOCUS_MESSAGES: FocusMessage[] = [
  // CORE MESSAGES (Prompt 3, 24, 48)
  { id: 'core_1', text: 'ONE TASK. FULL FOCUS.', category: 'CORE', priority: 'LOW' },
  { id: 'core_2', text: 'DO THE WORK. IGNORE THE NOISE.', category: 'CORE', priority: 'LOW' },
  { id: 'core_3', text: 'NO DISTRACTION. JUST EXECUTION.', category: 'CORE', priority: 'LOW' },
  { id: 'core_4', text: 'FOCUS NOW. RESULTS LATER.', category: 'CORE', priority: 'LOW' },
  { id: 'core_5', text: "DON'T THINK ABOUT THE RANK. EARN IT.", category: 'CORE', priority: 'LOW' },
  { id: 'core_6', text: 'PYQs. REVISION. TESTS. IMPROVEMENT. REPEAT.', category: 'CORE', priority: 'LOW' },
  { id: 'core_7', text: 'EVERY FOCUSED MINUTE COUNTS.', category: 'CORE', priority: 'LOW' },
  { id: 'core_8', text: 'PROTECT THIS SESSION.', category: 'CORE', priority: 'LOW' },
  { id: 'core_9', text: 'COME BACK TO THE TASK.', category: 'CORE', priority: 'LOW' },
  { id: 'core_10', text: 'DISCIPLINE OVER MOOD.', category: 'CORE', priority: 'LOW' },
  { id: 'core_11', text: 'START. NO OVERTHINKING.', category: 'CORE', priority: 'LOW' },
  { id: 'core_12', text: 'KEEP GOING.', category: 'CORE', priority: 'LOW' },
  { id: 'core_13', text: 'ONE MORE QUESTION.', category: 'CORE', priority: 'LOW' },
  { id: 'core_14', text: 'STAY WITH THE PROBLEM.', category: 'CORE', priority: 'LOW' },
  { id: 'core_15', text: 'UNDERSTAND. PRACTICE. IMPROVE.', category: 'CORE', priority: 'LOW' },
  { id: 'core_16', text: 'GATE 2027. ONE SESSION AT A TIME.', category: 'CORE', priority: 'LOW' },
  { id: 'core_17', text: "BUILD THE RANK THROUGH TODAY'S WORK.", category: 'CORE', priority: 'LOW' },
  { id: 'core_18', text: "DON'T CHASE THE RANK. BUILD THE PREPARATION.", category: 'CORE', priority: 'LOW' },
  { id: 'core_19', text: 'YOUR JOB IS THE NEXT QUESTION.', category: 'CORE', priority: 'LOW' },
  { id: 'core_20', text: 'MASTER THE CONCEPT. SOLVE THE PYQ. MOVE FORWARD.', category: 'CORE', priority: 'LOW' },

  // DISTRACTION (Prompt 4, 19, 48)
  { id: 'dist_1', text: 'DISTRACTION DETECTED. RETURN TO THE TASK.', category: 'DISTRACTION', priority: 'HIGH' },
  { id: 'dist_2', text: 'YOUR GOAL IS STILL THE SAME. FOCUS AGAIN.', category: 'DISTRACTION', priority: 'HIGH' },
  { id: 'dist_3', text: 'COME BACK. THE SESSION IS STILL ON.', category: 'DISTRACTION', priority: 'HIGH' },
  { id: 'dist_4', text: 'ONE TASK. NOTHING ELSE.', category: 'DISTRACTION', priority: 'HIGH' },
  { id: 'dist_5', text: 'RESET YOUR ATTENTION.', category: 'DISTRACTION', priority: 'HIGH' },
  { id: 'dist_6', text: "DON'T BREAK THE MOMENTUM.", category: 'DISTRACTION', priority: 'HIGH' },
  { id: 'dist_7', text: 'BACK TO THE QUESTION.', category: 'DISTRACTION', priority: 'HIGH' },

  // PHONE (Prompt 5, 20, 48) - Highest Priority
  { id: 'phone_1', text: 'PHONE USE DETECTED. RETURN TO YOUR TASK.', category: 'PHONE', priority: 'CRITICAL' },
  { id: 'phone_2', text: 'PUT THE PHONE DOWN. PROTECT THIS SESSION.', category: 'PHONE', priority: 'CRITICAL' },
  { id: 'phone_3', text: 'PUT THE PHONE DOWN. GET BACK TO WORK.', category: 'PHONE', priority: 'CRITICAL' },

  // AWAY (Prompt 6, 21, 48)
  { id: 'away_1', text: 'SESSION PAUSED. RETURN TO THE DESK.', category: 'AWAY', priority: 'HIGH' },
  { id: 'away_2', text: "YOU'RE AWAY. COME BACK WHEN YOU'RE READY TO WORK.", category: 'AWAY', priority: 'HIGH' },
  { id: 'away_3', text: "RETURN WHEN YOU'RE READY TO CONTINUE.", category: 'AWAY', priority: 'HIGH' },

  // RETURN & RECOVERY (Prompt 6, 7, 20, 21, 48)
  { id: 'ret_1', text: "WELCOME BACK. LET'S CONTINUE.", category: 'RETURN', priority: 'HIGH' },
  { id: 'ret_2', text: 'BACK TO WORK. ONE TASK AT A TIME.', category: 'RETURN', priority: 'HIGH' },
  { id: 'ret_3', text: 'BACK TO FOCUS.', category: 'RETURN', priority: 'HIGH' },
  { id: 'ret_4', text: 'RESET. CONTINUE.', category: 'RETURN', priority: 'HIGH' },
  { id: 'ret_5', text: 'NO NEED TO BE PERFECT. JUST CONTINUE.', category: 'RETURN', priority: 'HIGH' },
  { id: 'ret_6', text: 'THE SESSION IS STILL YOURS.', category: 'RETURN', priority: 'HIGH' },
  { id: 'ret_7', text: 'ONE MORE FOCUSED BLOCK.', category: 'RETURN', priority: 'HIGH' },
  { id: 'ret_8', text: 'PHONE AWAY. BACK TO WORK.', category: 'RETURN', priority: 'HIGH' },

  // GATE PYQ MODE (Prompt 8, 41, 48)
  { id: 'pyq_1', text: 'TRY BEFORE YOU SEE THE SOLUTION.', category: 'PYQ', priority: 'MEDIUM' },
  { id: 'pyq_2', text: 'THINK. THEN SOLVE.', category: 'PYQ', priority: 'MEDIUM' },
  { id: 'pyq_3', text: 'ONE PYQ AT A TIME.', category: 'PYQ', priority: 'MEDIUM' },
  { id: 'pyq_4', text: 'UNDERSTAND THE MISTAKE.', category: 'PYQ', priority: 'MEDIUM' },
  { id: 'pyq_5', text: 'DIFFICULT? GOOD. THINK DEEPER.', category: 'PYQ', priority: 'MEDIUM' },
  { id: 'pyq_6', text: 'ACCURACY FIRST. SPEED WILL FOLLOW.', category: 'PYQ', priority: 'MEDIUM' },
  { id: 'pyq_7', text: "DON'T GIVE UP TOO EARLY.", category: 'PYQ', priority: 'MEDIUM' },
  { id: 'pyq_8', text: 'THE SOLUTION IS THE LAST STEP. THINK FIRST.', category: 'PYQ', priority: 'MEDIUM' },
  { id: 'pyq_9', text: 'STAY WITH THE PROBLEM.', category: 'PYQ', priority: 'MEDIUM' },

  // REVISION MODE (Prompt 9, 48)
  { id: 'rev_1', text: 'RECALL BEFORE YOU READ.', category: 'REVISION', priority: 'MEDIUM' },
  { id: 'rev_2', text: "UNDERSTAND, DON'T JUST RECOGNIZE.", category: 'REVISION', priority: 'MEDIUM' },
  { id: 'rev_3', text: 'REVISE THE WEAK AREAS.', category: 'REVISION', priority: 'MEDIUM' },
  { id: 'rev_4', text: 'MAKE THE CONCEPT RETRIEVABLE.', category: 'REVISION', priority: 'MEDIUM' },
  { id: 'rev_5', text: 'SHORT NOTES. ACTIVE RECALL. REPEAT.', category: 'REVISION', priority: 'MEDIUM' },
  { id: 'rev_6', text: 'REVISION TURNS KNOWLEDGE INTO RETENTION.', category: 'REVISION', priority: 'MEDIUM' },

  // TEST / MOCK MODE (Prompt 10, 48)
  { id: 'test_1', text: 'STAY CALM. SOLVE WHAT YOU KNOW.', category: 'TEST', priority: 'MEDIUM' },
  { id: 'test_2', text: 'ACCURACY > IMPULSE.', category: 'TEST', priority: 'MEDIUM' },
  { id: 'test_3', text: 'READ CAREFULLY.', category: 'TEST', priority: 'MEDIUM' },
  { id: 'test_4', text: 'MANAGE TIME. PROTECT MARKS.', category: 'TEST', priority: 'MEDIUM' },
  { id: 'test_5', text: "DON'T LET ONE QUESTION CONTROL THE TEST.", category: 'TEST', priority: 'MEDIUM' },
  { id: 'test_6', text: 'SKIP. RETURN. SOLVE SMART.', category: 'TEST', priority: 'MEDIUM' },
  { id: 'test_7', text: "TEST YOURSELF. DON'T PROVE YOURSELF.", category: 'TEST', priority: 'MEDIUM' },

  // THINKING STATE SUPPORT (Prompt 11, 48)
  { id: 'think_1', text: 'TAKE YOUR TIME. THINK.', category: 'THINKING', priority: 'MEDIUM' },
  { id: 'think_2', text: 'STAY WITH THE PROBLEM.', category: 'THINKING', priority: 'MEDIUM' },
  { id: 'think_3', text: "DIFFICULT DOESN'T MEAN IMPOSSIBLE.", category: 'THINKING', priority: 'MEDIUM' },
  { id: 'think_4', text: 'THINK DEEPLY.', category: 'THINKING', priority: 'MEDIUM' },
  { id: 'think_5', text: 'TRY ANOTHER APPROACH.', category: 'THINKING', priority: 'MEDIUM' },
  { id: 'think_6', text: "YOU DON'T NEED THE ANSWER IMMEDIATELY.", category: 'THINKING', priority: 'MEDIUM' },

  // SESSION START (Prompt 12, 48)
  { id: 'start_1', text: 'START. NO OVERTHINKING.', category: 'SESSION_START', priority: 'HIGH' },
  { id: 'start_2', text: 'ONE TASK. FULL FOCUS.', category: 'SESSION_START', priority: 'HIGH' },
  { id: 'start_3', text: 'THIS SESSION MATTERS. BEGIN.', category: 'SESSION_START', priority: 'HIGH' },

  // FIRST SESSION OF THE DAY (Prompt 28)
  { id: 'first_1', text: 'MAKE THIS SESSION COUNT.', category: 'FIRST_OF_DAY', priority: 'HIGH' },
  { id: 'first_2', text: 'START THE DAY WITH ONE STRONG BLOCK.', category: 'FIRST_OF_DAY', priority: 'HIGH' },

  // SESSION END (Prompt 27, 48)
  { id: 'end_1', text: 'SESSION COMPLETE. REVIEW THE SESSION.', category: 'SESSION_END', priority: 'HIGH' },
  { id: 'end_2', text: 'GOOD WORK. PROTECT THE MOMENTUM.', category: 'SESSION_END', priority: 'HIGH' },
  { id: 'end_3', text: 'STRONG SESSION. KEEP THE STANDARD.', category: 'SESSION_END', priority: 'HIGH' },
  { id: 'end_4', text: 'SESSION COMPLETE. LEARN FROM IT.', category: 'SESSION_END', priority: 'HIGH' },
  { id: 'end_5', text: 'SESSION DONE. KEEP IMPROVING.', category: 'SESSION_END', priority: 'HIGH' }
];

const PRIORITY_RANKS: Record<MessagePriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

export class FocusMessageEngine {
  private currentMessage: FocusMessage | null = null;
  private lastMessageId: string | null = null;
  private lastMessageTime: number = 0;
  private recentMessageIds: string[] = [];
  private lastEventTime: number = 0;
  private activeEventCategory: MessageCategory | null = null;

  private rotationTimerId: any = null;
  private transientTimerId: any = null;
  private subscribers: Set<(message: FocusMessage | null) => void> = new Set();
  private previousHighLevelState: HighLevelVerificationState = 'ACTIVE';
  private previousSessionActive: boolean = false;
  private hasSeenFirstSessionToday: boolean = false;
  private lastCheckedDay: string = '';

  constructor() {
    this.initSessionControllerListener();
    this.checkFirstSessionToday();
  }

  private checkFirstSessionToday(): void {
    const today = getTodayDateString();
    if (this.lastCheckedDay !== today) {
      this.lastCheckedDay = today;
      try {
        const sessions = StorageService.getSessions();
        const todaySessions = sessions.filter(s => {
          const d = new Date(s.startTime).toISOString().slice(0, 10);
          return d === today;
        });
        this.hasSeenFirstSessionToday = todaySessions.length > 0;
      } catch {
        this.hasSeenFirstSessionToday = false;
      }
    }
  }

  public subscribe(cb: (message: FocusMessage | null) => void): () => void {
    this.subscribers.add(cb);
    cb(this.currentMessage);
    return () => this.subscribers.delete(cb);
  }

  private notify(): void {
    this.subscribers.forEach(cb => cb(this.currentMessage));
  }

  public getCurrentMessage(): FocusMessage | null {
    return this.currentMessage;
  }

  /**
   * Listen to FocusSessionController events strictly as an observer (Presentation layer only).
   */
  private initSessionControllerListener(): void {
    focusSessionController.subscribe((sessionState: FocusSessionState) => {
      this.handleSessionStateChange(sessionState);
    });
  }

  public handleSessionStateChange(state: FocusSessionState): void {
    const settings = StorageService.getSettings();

    // If all motivation messages are disabled by user, clear and return
    if (!settings.motivationalMessagesEnabled) {
      if (this.currentMessage !== null) {
        this.currentMessage = null;
        this.notify();
      }
      return;
    }

    const wasActive = this.previousSessionActive;
    this.previousSessionActive = state.isActive;

    const currentState = state.gate.highLevelState;
    const oldState = this.previousHighLevelState;
    this.previousHighLevelState = currentState;

    // Detect session start transition (Prompt Section 12, 46 Test 1)
    if (!wasActive && state.isActive) {
      this.handleSessionStarted({
        state: currentState,
        mode: state.mode,
        subject: state.subject,
        topic: state.topic,
        studyMedium: state.medium,
        sessionStartTime: state.sessionStartTime
      });
      return;
    }

    // Detect session completion transition (Prompt Section 27)
    if (wasActive && !state.isActive) {
      const elapsedSec = Math.round(state.totalSessionMs / 1000);
      const focusedSec = Math.round(state.accumulatedFocusedMs / 1000);
      const efficiency = elapsedSec > 0 ? Math.min(100, Math.round((focusedSec / elapsedSec) * 100)) : 100;
      this.handleSessionCompleted(efficiency, {
        state: currentState,
        mode: state.mode,
        subject: state.subject,
        topic: state.topic,
        studyMedium: state.medium
      });
      return;
    }

    if (!state.isActive) {
      // Idle
      if (this.rotationTimerId) {
        clearInterval(this.rotationTimerId);
        this.rotationTimerId = null;
      }
      return;
    }

    // Start background rotation timer if not active
    if (!this.rotationTimerId) {
      this.startRotationTimer();
    }

    if (!settings.eventMessagesEnabled) {
      return;
    }

    // Event Trigger: DEVICE_IN_USE
    if (currentState === 'DEVICE_IN_USE') {
      this.triggerEventMessage('PHONE', {
        state: currentState,
        mode: state.mode,
        subject: state.subject,
        topic: state.topic,
        studyMedium: state.medium
      });
      return;
    }

    // Event Trigger: AWAY
    if (currentState === 'AWAY') {
      this.triggerEventMessage('AWAY', {
        state: currentState,
        mode: state.mode,
        subject: state.subject,
        topic: state.topic,
        studyMedium: state.medium
      });
      return;
    }

    // Event Trigger: RETURN / RECOVERY
    if (currentState === 'ACTIVE' && (oldState === 'AWAY' || oldState === 'DEVICE_IN_USE' || oldState === 'MANUAL_PAUSE')) {
      const isFromPhone = oldState === 'DEVICE_IN_USE';
      this.triggerRecoveryMessage(isFromPhone, {
        state: currentState,
        mode: state.mode,
        subject: state.subject,
        topic: state.topic,
        studyMedium: state.medium
      });
      return;
    }
  }

  /**
   * Called when a session begins. Shows start message or first session of day message.
   */
  public handleSessionStarted(context: CoachContext): void {
    const settings = StorageService.getSettings();
    if (!settings.motivationalMessagesEnabled) return;

    this.checkFirstSessionToday();
    const isFirstToday = !this.hasSeenFirstSessionToday;
    this.hasSeenFirstSessionToday = true;

    const category: MessageCategory = isFirstToday ? 'FIRST_OF_DAY' : 'SESSION_START';
    const msg = this.selectFromCategory(category, context);

    if (msg) {
      this.applyMessage(msg);
      // After ~4 seconds, reduce prominence and schedule normal mode rotation (Prompt Section 12)
      if (this.transientTimerId) clearTimeout(this.transientTimerId);
      this.transientTimerId = setTimeout(() => {
        this.rotatePeriodicMessage(context);
      }, 4000);
    }

    this.startRotationTimer();
  }

  /**
   * Called when a session finishes.
   */
  public handleSessionCompleted(efficiency: number, context: CoachContext): void {
    const settings = StorageService.getSettings();
    if (!settings.motivationalMessagesEnabled) return;

    let targetId = 'end_1';
    if (efficiency >= 85) {
      targetId = 'end_3'; // "STRONG SESSION. KEEP THE STANDARD."
    } else if (efficiency < 60) {
      targetId = 'end_4'; // "SESSION COMPLETE. LEARN FROM IT."
    } else {
      targetId = 'end_2'; // "GOOD WORK. PROTECT THE MOMENTUM."
    }

    const msg = FOCUS_MESSAGES.find(m => m.id === targetId) || this.selectFromCategory('SESSION_END', context);
    if (msg) {
      this.applyMessage(msg);
    }
    if (this.rotationTimerId) {
      clearInterval(this.rotationTimerId);
      this.rotationTimerId = null;
    }
  }

  /**
   * Event Message Trigger with strict Priority Preemption & Anti-Spam Cooldown
   */
  public triggerEventMessage(category: MessageCategory, context: CoachContext): boolean {
    const settings = StorageService.getSettings();
    if (!settings.motivationalMessagesEnabled || !settings.eventMessagesEnabled) return false;

    // Thinking state protection (Prompt Section 11 & Section 46 Test 9)
    if (context.isThinking || context.state === 'ACTIVE' && category === 'DISTRACTION' && context.isThinking) {
      this.triggerThinkingSupport(context);
      return true;
    }

    const now = Date.now();
    const cooldownMs = this.getEventCooldownMs(settings.messageFrequency);

    const targetCandidate = this.selectFromCategory(category, context);
    if (!targetCandidate) return false;

    const currentPriority = this.currentMessage ? PRIORITY_RANKS[this.currentMessage.priority] : 0;
    const candidatePriority = PRIORITY_RANKS[targetCandidate.priority];

    // Priority Check: A higher priority event can always preempt a lower one
    const canPreempt = candidatePriority > currentPriority;

    if (!canPreempt) {
      // If same category or same/lower priority, enforce cooldown to prevent spam (Prompt Section 14, 16)
      if (this.activeEventCategory === category && now - this.lastEventTime < cooldownMs) {
        return false;
      }
      if (now - this.lastMessageTime < cooldownMs) {
        return false;
      }
    }

    this.activeEventCategory = category;
    this.lastEventTime = now;
    this.applyMessage(targetCandidate);
    return true;
  }

  /**
   * Trigger recovery message after phone, away, or distraction
   */
  public triggerRecoveryMessage(isFromPhone: boolean, context: CoachContext): void {
    const settings = StorageService.getSettings();
    if (!settings.motivationalMessagesEnabled || !settings.eventMessagesEnabled) return;

    let candidate: FocusMessage | null = null;
    if (isFromPhone) {
      candidate = FOCUS_MESSAGES.find(m => m.id === 'ret_8') || null; // "PHONE AWAY. BACK TO WORK."
    }

    if (!candidate) {
      candidate = this.selectFromCategory('RETURN', context);
    }

    if (candidate) {
      this.activeEventCategory = 'RETURN';
      this.lastEventTime = Date.now();
      this.applyMessage(candidate);

      // Auto-schedule normal rotation after 5s
      if (this.transientTimerId) clearTimeout(this.transientTimerId);
      this.transientTimerId = setTimeout(() => {
        this.rotatePeriodicMessage(context);
      }, 5000);
    }
  }

  /**
   * Thinking Support Message (Section 11)
   */
  public triggerThinkingSupport(context: CoachContext): void {
    const msg = this.selectFromCategory('THINKING', context);
    if (msg) {
      this.applyMessage(msg);
    }
  }

  /**
   * Normal periodic background rotation (Prompt Section 13: 5–15 mins)
   */
  public rotatePeriodicMessage(context?: CoachContext): void {
    const settings = StorageService.getSettings();
    if (!settings.motivationalMessagesEnabled) return;

    // Do not overwrite active critical/high alerts during pause
    if (this.currentMessage && (this.currentMessage.priority === 'CRITICAL' || this.currentMessage.priority === 'HIGH')) {
      const highLevel = focusSessionController.getState().gate.highLevelState;
      if (highLevel === 'DEVICE_IN_USE' || highLevel === 'AWAY') {
        return;
      }
    }

    const effectiveContext = context || this.buildCurrentContext();
    const mode = effectiveContext.mode?.toLowerCase() || '';

    let chosenCategory: MessageCategory = 'CORE';
    if (mode.includes('pyq')) {
      chosenCategory = 'PYQ';
    } else if (mode.includes('revision')) {
      chosenCategory = 'REVISION';
    } else if (mode.includes('test') || mode.includes('mock')) {
      chosenCategory = 'TEST';
    }

    const msg = this.selectFromCategory(chosenCategory, effectiveContext);
    if (msg) {
      this.applyMessage(msg);
    }
  }

  private buildCurrentContext(): CoachContext {
    const session = focusSessionController.getState();
    return {
      state: session.gate.highLevelState,
      mode: session.mode,
      subject: session.subject,
      topic: session.topic,
      studyMedium: session.medium
    };
  }

  private startRotationTimer(): void {
    if (this.rotationTimerId) clearInterval(this.rotationTimerId);

    const settings = StorageService.getSettings();
    const intervalMs = this.getRotationIntervalMs(settings.messageFrequency);

    this.rotationTimerId = setInterval(() => {
      this.rotatePeriodicMessage();
    }, intervalMs);
  }

  /**
   * Select a non-duplicate message from the specified category
   */
  public selectFromCategory(category: MessageCategory, _context?: CoachContext): FocusMessage | null {
    let pool = FOCUS_MESSAGES.filter(m => m.category === category);
    if (pool.length === 0) {
      pool = FOCUS_MESSAGES.filter(m => m.category === 'CORE');
    }
    if (pool.length === 0) return null;

    // Deduplication rule 1: Exclude the exact last displayed message (Section 32, Section 46 Test 11)
    let candidates = pool.filter(m => m.id !== this.lastMessageId);

    // Deduplication rule 2: Exclude recently shown messages
    const freshCandidates = candidates.filter(m => !this.recentMessageIds.includes(m.id));
    if (freshCandidates.length > 0) {
      candidates = freshCandidates;
    }

    if (candidates.length === 0) {
      candidates = pool.filter(m => m.id !== this.lastMessageId);
      if (candidates.length === 0) {
        candidates = pool;
      }
    }

    // Pick pseudorandomly from available candidates
    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index];
  }

  private applyMessage(msg: FocusMessage): void {
    this.currentMessage = msg;
    this.lastMessageId = msg.id;
    this.lastMessageTime = Date.now();

    this.recentMessageIds.push(msg.id);
    if (this.recentMessageIds.length > 10) {
      this.recentMessageIds.shift();
    }

    this.notify();
  }

  private getRotationIntervalMs(freq: MessageFrequency): number {
    switch (freq) {
      case 'LOW':
        return 15 * 60 * 1000; // 15 mins
      case 'HIGH':
        return 3 * 60 * 1000; // 3 mins
      case 'NORMAL':
      default:
        return 7 * 60 * 1000; // 7 mins
    }
  }

  private getEventCooldownMs(freq: MessageFrequency): number {
    switch (freq) {
      case 'LOW':
        return 60 * 1000; // 60s
      case 'HIGH':
        return 15 * 1000; // 15s
      case 'NORMAL':
      default:
        return 30 * 1000; // 30s
    }
  }

  public resetHistory(): void {
    this.currentMessage = null;
    this.lastMessageId = null;
    this.lastMessageTime = 0;
    this.recentMessageIds = [];
    this.lastEventTime = 0;
    this.activeEventCategory = null;
    if (this.transientTimerId) clearTimeout(this.transientTimerId);
    if (this.rotationTimerId) clearInterval(this.rotationTimerId);
    this.notify();
  }
}

export const focusMessageEngine = new FocusMessageEngine();
