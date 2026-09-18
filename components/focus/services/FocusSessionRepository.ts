import { FocusSession, FocusSessionLifecycleState } from '../types';
import { FOCUS_BACKUP_KEY_V1, FOCUS_STORAGE_VERSION, FOCUS_STORAGE_VERSION_KEY } from '../constants';

const STORAGE_KEYS = {
  SESSIONS: 'gate_focus_sessions',
  ACTIVE_SESSION: 'gate_focus_active_session',
  LEGACY_SESSIONS: 'ai_focus_timer_sessions_v1',
  LEGACY_ACTIVE: 'ai_focus_timer_active_session_v1',
};

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage;
    }
  } catch {}
  return null;
}

export class FocusSessionRepository {
  private activeSession: FocusSession | null = null;
  private isFinalizing: boolean = false;
  private finalizedSessionIds: Set<string> = new Set();
  private migrationExecuted: boolean = false;

  constructor() {
    this.migrateIfNeeded();
    this.restoreActiveSession();
  }

  // --------------------------------------------------------------------------
  // Logging & Debug Diagnostics (Prompt Section 41, 42, 52)
  // --------------------------------------------------------------------------
  private log(action: string, detail?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[FocusSessionRepository ${timestamp}] ${action}`, detail || '');
  }

  // --------------------------------------------------------------------------
  // 1. Session Creation (Idempotent, One Session, One ID)
  // --------------------------------------------------------------------------
  createSession(params: {
    subject: string;
    topic: string;
    targetSeconds: number;
    mode: any;
    goal: string;
    studyMedium?: any;
    sessionId?: string;
  }): FocusSession {
    // If an active session is already active, reconnect to it (Section 4, 29)
    if (this.activeSession && (this.activeSession.status === 'ACTIVE' || this.activeSession.status === 'PAUSED')) {
      this.log('SESSION_ATTACHED (Already Active)', {
        sessionId: this.activeSession.sessionId,
        subject: this.activeSession.subject,
        topic: this.activeSession.topic
      });
      return this.activeSession;
    }

    const now = Date.now();
    const sessionId = params.sessionId ||
      ((typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `foc_${now}_${Math.random().toString(36).slice(2, 9)}`);

    const newSession: FocusSession = {
      id: sessionId,
      sessionId,
      subject: params.subject,
      topic: params.topic,
      goal: params.goal || '',
      mode: params.mode || 'Deep Focus',
      studyMedium: params.studyMedium || 'Screen Study',
      startTime: now,
      endTime: now,
      targetSeconds: params.targetSeconds,
      focusedSeconds: 0,
      screenFocusedSeconds: 0,
      paperFocusedSeconds: 0,
      mixedFocusedSeconds: 0,
      thinkingSeconds: 0,
      warningSeconds: 0,
      uncertainSeconds: 0,
      distractedSeconds: 0,
      phoneDistractedSeconds: 0,
      conversationSeconds: 0,
      possibleSleepSeconds: 0,
      awaySeconds: 0,
      breakSeconds: 0,
      unverifiedSeconds: 0,
      pausedSeconds: 0,
      elapsedSeconds: 0,
      averageFocusScore: 90,
      peakFocusScore: 100,
      distractionCount: 0,
      status: 'ACTIVE',
      finalized: false,
      createdAt: now,
      updatedAt: now,
      segments: [],
      transitionLogs: [],
      activityEvents: []
    };

    this.activeSession = newSession;
    this.saveActiveSessionToDisk(newSession);

    this.log('SESSION_CREATED', {
      sessionId,
      subject: newSession.subject,
      topic: newSession.topic,
      startTime: newSession.startTime
    });

    return newSession;
  }

  getActiveSession(): FocusSession | null {
    if (this.activeSession && !this.activeSession.finalized) {
      return this.activeSession;
    }
    return this.restoreActiveSession();
  }

  updateActiveSession(patch: Partial<FocusSession>): FocusSession | null {
    if (!this.activeSession) return null;
    this.activeSession = {
      ...this.activeSession,
      ...patch,
      updatedAt: Date.now()
    };
    this.saveActiveSessionToDisk(this.activeSession);
    return this.activeSession;
  }

  // --------------------------------------------------------------------------
  // 2. Idempotent Finalization (Section 6, 7, 8, 9, 10)
  // --------------------------------------------------------------------------
  finalizeSession(sessionId: string, finalMetrics?: Partial<FocusSession>): FocusSession | null {
    if (!sessionId) return null;

    // Check if already finalized or finalizing to prevent double execution
    if (this.finalizedSessionIds.has(sessionId)) {
      this.log('DUPLICATE FINALIZE IGNORED (Already Finalized in Cache)', { sessionId });
      return this.getSessionById(sessionId) || this.activeSession;
    }

    if (this.isFinalizing) {
      this.log('DUPLICATE FINALIZE IGNORED (Currently Finalizing)', { sessionId });
      return this.activeSession;
    }

    this.isFinalizing = true;
    this.log('SESSION_FINALIZING', { sessionId });

    try {
      const existing = this.getSessionById(sessionId) || this.activeSession;
      if (existing && existing.finalized) {
        this.finalizedSessionIds.add(sessionId);
        this.log('DUPLICATE FINALIZE IGNORED (Already Finalized in Storage)', { sessionId });
        return existing;
      }

      const now = Date.now();
      const base: FocusSession = existing || {
        id: sessionId,
        sessionId,
        subject: finalMetrics?.subject || 'Focus Study',
        topic: finalMetrics?.topic || 'General Revision',
        goal: finalMetrics?.goal || '',
        mode: finalMetrics?.mode || 'Deep Focus',
        studyMedium: finalMetrics?.studyMedium || 'Screen Study',
        startTime: now,
        endTime: now,
        targetSeconds: finalMetrics?.targetSeconds || 7200,
        focusedSeconds: 0,
        screenFocusedSeconds: 0,
        paperFocusedSeconds: 0,
        warningSeconds: 0,
        distractedSeconds: 0,
        awaySeconds: 0,
        breakSeconds: 0,
        elapsedSeconds: 0,
        averageFocusScore: 85,
        peakFocusScore: 100,
        distractionCount: 0,
        status: 'COMPLETED'
      };

      const focusedSec = finalMetrics?.focusedSeconds ?? base.focusedSeconds;
      const targetSec = finalMetrics?.targetSeconds ?? base.targetSeconds;
      const defaultStatus: FocusSessionLifecycleState =
        focusedSec >= targetSec && targetSec > 0 ? 'COMPLETED' : 'STOPPED';

      const completedSession: FocusSession = {
        ...base,
        ...(finalMetrics || {}),
        id: sessionId,
        sessionId,
        endTime: finalMetrics?.endTime || now,
        status: (finalMetrics?.status as FocusSessionLifecycleState) || defaultStatus,
        finalized: true,
        updatedAt: now
      };

      // Persist as upsert and reconcile daily targets
      this.upsertSession(completedSession, true);

      this.finalizedSessionIds.add(sessionId);
      this.clearActiveSessionDisk();
      this.activeSession = null;

      this.log('SESSION_FINALIZED', {
        sessionId,
        focusedSeconds: completedSession.focusedSeconds,
        status: completedSession.status
      });

      return completedSession;
    } finally {
      this.isFinalizing = false;
    }
  }

  // --------------------------------------------------------------------------
  // 3. Storage Layer & Idempotent Upsert (Section 16, 17, 18)
  // --------------------------------------------------------------------------
  upsertSession(session: FocusSession, isNewlyFinalized: boolean = false): FocusSession[] {
    const storage = getStorage();
    if (!storage) return [session];

    const currentSessions = this.listSessions();
    const sessionId = session.sessionId || session.id;

    // Look for exact ID match OR twin legacy record match (start time within 5s, same subject & topic)
    let matchedIndex = currentSessions.findIndex(
      s => (s.sessionId && s.sessionId === sessionId) || s.id === sessionId
    );

    if (matchedIndex === -1) {
      // Secondary check: twin record from parallel save bug
      matchedIndex = currentSessions.findIndex(s => {
        if (s.subject !== session.subject || s.topic !== session.topic) return false;
        if (s.targetSeconds !== session.targetSeconds) return false;
        const timeDiff = Math.abs(s.startTime - session.startTime);
        return timeDiff < 5000; // within 5 seconds
      });
    }

    const enhancedSession: FocusSession = {
      ...session,
      id: sessionId,
      sessionId,
      finalized: session.finalized ?? true,
      updatedAt: Date.now()
    };

    if (matchedIndex >= 0) {
      this.log('FOCUS_SESSION_WRITE (UPDATE)', {
        sessionId,
        matchedIndex,
        subject: enhancedSession.subject
      });
      // Merge records, preserving any richer details from either side
      const existing = currentSessions[matchedIndex];
      currentSessions[matchedIndex] = {
        ...existing,
        ...enhancedSession,
        segments: enhancedSession.segments?.length ? enhancedSession.segments : existing.segments,
        transitionLogs: enhancedSession.transitionLogs?.length ? enhancedSession.transitionLogs : existing.transitionLogs,
        activityEvents: enhancedSession.activityEvents?.length ? enhancedSession.activityEvents : existing.activityEvents
      };
    } else {
      this.log('FOCUS_SESSION_WRITE (INSERT)', {
        sessionId,
        subject: enhancedSession.subject
      });
      currentSessions.unshift(enhancedSession);
    }

    const normalized = this.normalizeSessions(currentSessions);
    try {
      storage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(normalized));
      storage.setItem(STORAGE_KEYS.LEGACY_SESSIONS, JSON.stringify(normalized));
    } catch (e) {
      console.error('Failed to write sessions to localStorage', e);
    }

    // Reconcile daily targets safely without double-adding
    if (isNewlyFinalized) {
      this.reconcileDailyTargetHours(enhancedSession.startTime);
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new Event('storage'));
      } catch {}
    }

    return normalized;
  }

  // --------------------------------------------------------------------------
  // 4. Normalization & Deduplication (Section 19, 20, 21, 23, 25)
  // --------------------------------------------------------------------------
  deduplicateFocusSessions(sessions: FocusSession[]): FocusSession[] {
    if (!Array.isArray(sessions) || sessions.length === 0) return [];

    const seenIds = new Set<string>();
    const seenFingerprints = new Map<string, FocusSession>();
    const result: FocusSession[] = [];

    for (const s of sessions) {
      const id = s.sessionId || s.id;
      if (!id) continue;

      // 1. Primary Deduplication: sessionId / id
      if (seenIds.has(id)) {
        this.log('SESSION_DEDUPED (Primary ID Match)', { id });
        continue;
      }

      // 2. Secondary Deduplication: twin records from dual-engine bug
      // Fingerprint: subject + topic + targetSeconds + quantized start timestamp (within 5 seconds)
      const quantizedStart = Math.round(s.startTime / 5000);
      const fingerprint = `${s.subject}__${s.topic}__${s.targetSeconds}__${quantizedStart}`;

      if (seenFingerprints.has(fingerprint)) {
        const prev = seenFingerprints.get(fingerprint)!;
        this.log('SESSION_DEDUPED (Twin Record Match)', {
          keptId: prev.sessionId || prev.id,
          droppedId: id,
          fingerprint
        });
        // Merge richer telemetry into previous record if current has more data
        if ((s.segments && s.segments.length > (prev.segments?.length || 0)) ||
            (s.screenFocusedSeconds && !prev.screenFocusedSeconds)) {
          Object.assign(prev, {
            ...s,
            id: prev.id,
            sessionId: prev.sessionId
          });
        }
        continue;
      }

      seenIds.add(id);
      seenFingerprints.set(fingerprint, s);
      result.push({
        ...s,
        id,
        sessionId: id
      });
    }

    return result;
  }

  normalizeSessions(sessions: FocusSession[]): FocusSession[] {
    return this.deduplicateFocusSessions(sessions);
  }

  listSessions(): FocusSession[] {
    this.migrateIfNeeded();
    const storage = getStorage();
    if (!storage) return [];

    try {
      const raw = storage.getItem(STORAGE_KEYS.SESSIONS) || storage.getItem(STORAGE_KEYS.LEGACY_SESSIONS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return this.normalizeSessions(parsed);
    } catch {
      return [];
    }
  }

  getSessionById(sessionId: string): FocusSession | null {
    const list = this.listSessions();
    return list.find(s => s.sessionId === sessionId || s.id === sessionId) || null;
  }

  getUniqueSessionsForDay(dateStr: string): FocusSession[] {
    return this.listSessions().filter(s => {
      const sessionDate = new Date(s.startTime).toISOString().slice(0, 10);
      return sessionDate === dateStr;
    });
  }

  // --------------------------------------------------------------------------
  // 5. Daily Target Hours Reconciliation (Prevents 2x study hours corruption)
  // --------------------------------------------------------------------------
  reconcileDailyTargetHours(timestampOrDate: number | string): void {
    const storage = getStorage();
    if (!storage) return;

    const dateStr = typeof timestampOrDate === 'string'
      ? timestampOrDate
      : new Date(timestampOrDate).toISOString().slice(0, 10);

    const daySessions = this.getUniqueSessionsForDay(dateStr);
    const totalFocusedSeconds = daySessions.reduce((acc, s) => acc + (s.focusedSeconds || 0), 0);
    const trueHoursStudied = Math.round((totalFocusedSeconds / 3600) * 10) / 10;

    const dailyKey = `gate_daily_target_${dateStr}`;
    try {
      const raw = storage.getItem(dailyKey);
      const data = raw ? JSON.parse(raw) : { date: dateStr, targetHours: 8, hoursStudied: 0 };
      data.hoursStudied = trueHoursStudied;
      storage.setItem(dailyKey, JSON.stringify(data));
      this.log('RECONCILED DAILY TARGET HOURS', { date: dateStr, hoursStudied: trueHoursStudied });
    } catch (err) {
      console.warn('Could not reconcile gate_daily_target:', err);
    }
  }

  private isMigrating: boolean = false;

  // --------------------------------------------------------------------------
  // 6. Safe One-Time Legacy Migration (Section 22, 45, 46)
  // --------------------------------------------------------------------------
  migrateIfNeeded(): void {
    if (this.migrationExecuted || this.isMigrating) return;
    const storage = getStorage();
    if (!storage) return;

    try {
      const currentVersion = storage.getItem(FOCUS_STORAGE_VERSION_KEY);
      if (currentVersion === String(FOCUS_STORAGE_VERSION)) {
        this.migrationExecuted = true;
        return;
      }

      this.isMigrating = true;
      this.log('STARTING ONE-TIME LEGACY SESSION MIGRATION V2');

      const raw = storage.getItem(STORAGE_KEYS.SESSIONS) || storage.getItem(STORAGE_KEYS.LEGACY_SESSIONS);
      if (raw) {
        // Step 1: Create backup of original data (only if not already backed up)
        const existingBackup = storage.getItem(FOCUS_BACKUP_KEY_V1);
        if (!existingBackup) {
          storage.setItem(FOCUS_BACKUP_KEY_V1, raw);
          this.log('BACKUP CREATED', { key: FOCUS_BACKUP_KEY_V1 });
        }

        // Step 2: Parse and deduplicate
        const parsed: FocusSession[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const originalCount = parsed.length;
          const cleaned = this.deduplicateFocusSessions(parsed);
          const deduplicatedCount = originalCount - cleaned.length;

          storage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(cleaned));
          storage.setItem(STORAGE_KEYS.LEGACY_SESSIONS, JSON.stringify(cleaned));

          // Step 3: Record version BEFORE reconciliation so re-entrant calls see version 2
          storage.setItem(FOCUS_STORAGE_VERSION_KEY, String(FOCUS_STORAGE_VERSION));
          this.migrationExecuted = true;

          // Step 4: Reconcile daily targets for affected dates
          const affectedDates = new Set(
            cleaned.map(s => new Date(s.startTime).toISOString().slice(0, 10))
          );
          affectedDates.forEach(date => this.reconcileDailyTargetHours(date));

          this.log('MIGRATION COMPLETED', {
            originalCount,
            cleanedCount: cleaned.length,
            duplicatesRemoved: deduplicatedCount
          });
        }
      }

      storage.setItem(FOCUS_STORAGE_VERSION_KEY, String(FOCUS_STORAGE_VERSION));
      this.migrationExecuted = true;
    } catch (err) {
      console.error('Focus session migration failed:', err);
    } finally {
      this.isMigrating = false;
    }
  }

  migrateFocusSessionsV2(): void {
    this.migrationExecuted = false;
    this.migrateIfNeeded();
  }

  // --------------------------------------------------------------------------
  // Active Session Disk Storage Helpers
  // --------------------------------------------------------------------------
  private saveActiveSessionToDisk(session: FocusSession): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      const json = JSON.stringify(session);
      storage.setItem(STORAGE_KEYS.ACTIVE_SESSION, json);
      storage.setItem(STORAGE_KEYS.LEGACY_ACTIVE, json);
    } catch {}
  }

  private restoreActiveSession(): FocusSession | null {
    const storage = getStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(STORAGE_KEYS.ACTIVE_SESSION) || storage.getItem(STORAGE_KEYS.LEGACY_ACTIVE);
      if (!raw) return null;
      const parsed: FocusSession = JSON.parse(raw);
      if (parsed && !parsed.finalized && (parsed.status === 'ACTIVE' || parsed.status === 'PAUSED')) {
        this.activeSession = parsed;
        return parsed;
      }
    } catch {}
    return null;
  }

  private clearActiveSessionDisk(): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
      storage.removeItem(STORAGE_KEYS.LEGACY_ACTIVE);
    } catch {}
  }

  // Development assertions
  assertUniqueSessionIds(): boolean {
    const sessions = this.listSessions();
    const ids = new Set<string>();
    for (const s of sessions) {
      if (ids.has(s.sessionId)) {
        console.error('DATA INTEGRITY ASSERTION FAILED: DUPLICATE FOCUS SESSION DETECTED', s.sessionId);
        return false;
      }
      ids.add(s.sessionId);
    }
    return true;
  }
}

export const focusSessionRepository = new FocusSessionRepository();
