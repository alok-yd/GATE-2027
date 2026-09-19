import { FocusConfig, safeGetStorageItem, safeSetStorageItem, safeRemoveStorageItem } from './FocusConfig';
import { FocusSession, StudyMode } from '../types';

/**
 * FocusSessionRepository
 * 
 * Versioned, idempotent persistence for Focus sessions.
 * Never performs blind appends; all updates are keyed by immutable sessionId.
 */
export class FocusSessionRepository {
  private static instance: FocusSessionRepository;

  public static getInstance(): FocusSessionRepository {
    if (!FocusSessionRepository.instance) {
      FocusSessionRepository.instance = new FocusSessionRepository();
    }
    return FocusSessionRepository.instance;
  }

  public createSession(
    subject: string = 'General Revision',
    topic: string = 'PYQ Solving',
    studyMode: StudyMode = 'mixed',
    targetDurationMinutes: number = 50
  ): FocusSession {
    const id = `fcs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const session: FocusSession = {
      id,
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
      subject,
      topic,
      studyMode,
      targetDurationMinutes,
      totalSessionMs: 0,
      verifiedFocusMs: 0,
      awayMs: 0,
      deviceUseMs: 0,
      manualPauseMs: 0,
      monitoringErrorMs: 0,
      focusScore: 100,
      efficiencyPercentage: 100,
      segments: [],
      events: [],
      state: 'IDLE',
    };

    this.saveActiveSession(session);
    return session;
  }

  public getActiveSession(): FocusSession | null {
    try {
      const raw = safeGetStorageItem(FocusConfig.STORAGE_KEY_ACTIVE_SESSION);
      if (!raw) return null;
      return JSON.parse(raw) as FocusSession;
    } catch (e) {
      console.warn('Failed to parse active focus session:', e);
      return null;
    }
  }

  public saveActiveSession(session: FocusSession): void {
    try {
      safeSetStorageItem(
        FocusConfig.STORAGE_KEY_ACTIVE_SESSION,
        JSON.stringify(session)
      );
    } catch (e) {
      console.error('Failed to save active focus session:', e);
    }
  }

  public clearActiveSession(): void {
    try {
      safeRemoveStorageItem(FocusConfig.STORAGE_KEY_ACTIVE_SESSION);
    } catch (e) {
      console.warn('Failed to clear active focus session:', e);
    }
  }

  public listSessions(): FocusSession[] {
    try {
      const raw = safeGetStorageItem(FocusConfig.STORAGE_KEY_SESSIONS);
      if (!raw) return [];
      const list = JSON.parse(raw) as FocusSession[];
      // Sort newest first
      return list.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.warn('Failed to load focus sessions list:', e);
      return [];
    }
  }

  public getSession(id: string): FocusSession | null {
    const active = this.getActiveSession();
    if (active && active.id === id) return active;
    const all = this.listSessions();
    return all.find((s) => s.id === id) || null;
  }

  /**
   * Idempotent upsert into historical sessions list
   */
  public saveCompletedSession(session: FocusSession): void {
    try {
      const all = this.listSessions();
      const existingIndex = all.findIndex((s) => s.id === session.id);

      if (existingIndex >= 0) {
        all[existingIndex] = { ...session };
      } else {
        all.unshift({ ...session });
      }

      // Limit stored sessions to 100 most recent
      const trimmed = all.slice(0, 100);
      safeSetStorageItem(
        FocusConfig.STORAGE_KEY_SESSIONS,
        JSON.stringify(trimmed)
      );

      // Clear active session pointer if it matches
      const active = this.getActiveSession();
      if (active && active.id === session.id) {
        this.clearActiveSession();
      }
    } catch (e) {
      console.error('Failed to save completed focus session:', e);
    }
  }

  public deleteSession(id: string): void {
    try {
      const all = this.listSessions().filter((s) => s.id !== id);
      safeSetStorageItem(FocusConfig.STORAGE_KEY_SESSIONS, JSON.stringify(all));
      const active = this.getActiveSession();
      if (active && active.id === id) {
        this.clearActiveSession();
      }
    } catch (e) {
      console.error('Failed to delete focus session:', e);
    }
  }
}

export const focusSessionRepository = FocusSessionRepository.getInstance();
