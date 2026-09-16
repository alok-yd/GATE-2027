import { getCachedAccessToken, onAuthChanged, signInWithGoogle as firebaseSignIn, signOutGoogle } from './firebase';
import { FocusSession, GoogleCalendarEvent } from '../types';
import { formatTimeHoursMins } from './storage';

export class GoogleCalendarService {
  static onAuthStateChanged(cb: (user: any) => void): () => void {
    return onAuthChanged(cb);
  }

  static async signInWithGoogle(): Promise<{ success: boolean; user?: any; error?: string; errorCode?: string; isConfigError?: boolean }> {
    try {
      const res = await firebaseSignIn();
      return { success: true, user: res.user };
    } catch (e: any) {
      console.error('Google Calendar sign in error:', e);
      const code = e.code || '';
      const msg = e.message || '';
      const isConfigError = code === 'auth/configuration-not-found' || msg.includes('configuration-not-found');

      let friendlyMsg = msg || 'Failed to authenticate with Google';
      if (isConfigError) {
        friendlyMsg = 'Google Sign-In is not enabled yet in your Firebase Project (gate-2027-a8850). Please enable Google Sign-In under Firebase Console -> Authentication -> Sign-in method.';
      } else if (code === 'auth/popup-closed-by-user') {
        friendlyMsg = 'The sign-in popup was closed before finishing authentication.';
      } else if (code === 'auth/popup-blocked') {
        friendlyMsg = 'The sign-in popup was blocked by your browser. Please allow popups for localhost.';
      } else if (code === 'auth/unauthorized-domain') {
        friendlyMsg = 'Current domain is not authorized in Firebase Console (Authentication > Settings > Authorized domains).';
      }

      return {
        success: false,
        error: friendlyMsg,
        errorCode: code,
        isConfigError
      };
    }
  }

  static async signOut(): Promise<void> {
    return signOutGoogle();
  }

  static async fetchUpcomingEvents(maxResults: number = 10): Promise<GoogleCalendarEvent[]> {
    const token = getCachedAccessToken();
    if (!token) return [];

    try {
      const nowIso = new Date().toISOString();
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(nowIso)}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) return [];
      const data = await res.json();
      return data.items || [];
    } catch {
      return [];
    }
  }

  static async createStudyBlockEvent(
    subject: string,
    topic: string,
    startIso: string,
    endIso: string,
    mode: string = 'Deep Focus'
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    const token = getCachedAccessToken();
    if (!token) {
      return { success: false, error: 'Google Calendar not connected' };
    }

    const eventPayload = {
      summary: `📖 [Scheduled Study] ${subject}: ${topic}`,
      description: `Planned study block scheduled via AI Focus Timer.\nMode: ${mode}\nTarget: Deep uninterrupted concentration.`,
      colorId: '9', // Blueberry
      start: {
        dateTime: startIso,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: endIso,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };

    try {
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventPayload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Failed to create event (${res.status})`);
      }

      const created = await res.json();
      return { success: true, eventId: created.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  static async syncSessionToCalendar(session: FocusSession): Promise<{ success: boolean; eventId?: string; error?: string }> {
    const token = getCachedAccessToken();
    if (!token) {
      return { success: false, error: 'Google Calendar not connected. Please sign in with Google.' };
    }

    const startTime = new Date(session.startTime).toISOString();
    // Use actual elapsed end time or fallback
    const endTime = new Date(session.endTime || (session.startTime + session.elapsedSeconds * 1000)).toISOString();

    const effectiveElapsed = Math.max(1, (session.elapsedSeconds || (session.focusedSeconds + session.distractedSeconds + session.awaySeconds + (session.pausedSeconds || 0) + session.breakSeconds)) - session.breakSeconds);
    const efficiency = Math.min(100, Math.max(0, Math.round((session.focusedSeconds / effectiveElapsed) * 100)));

    const eventPayload = {
      summary: `🎯 [Verified Focus] ${session.subject}: ${session.topic}`,
      description: [
        `AI Focus Timer Session Report:`,
        `• Verified Focus Time: ${formatTimeHoursMins(session.focusedSeconds)}`,
        `• Target Time: ${formatTimeHoursMins(session.targetSeconds)}`,
        `• Efficiency: ${efficiency}%`,
        `• Average Focus Score: ${Math.round(session.averageFocusScore)}/100`,
        `• Distractions: ${session.distractionCount} (${formatTimeHoursMins(session.distractedSeconds)})`,
        `• Away Time: ${formatTimeHoursMins(session.awaySeconds)}`,
        `• Study Mode: ${session.mode}`,
        `• Goal: ${session.goal || 'Consistent Focus'}`
      ].join('\n'),
      colorId: '10', // Green color in Google Calendar
      start: {
        dateTime: startTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: endTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };

    try {
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventPayload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Google Calendar API error (${res.status})`);
      }

      const createdEvent = await res.json();
      return { success: true, eventId: createdEvent.id };
    } catch (err: any) {
      console.error('Failed to sync to Google Calendar:', err);
      return { success: false, error: err.message || 'Sync failed' };
    }
  }

  static async listUpcomingStudyEvents(): Promise<{ success: boolean; events?: GoogleCalendarEvent[]; error?: string }> {
    const token = getCachedAccessToken();
    if (!token) {
      return { success: false, error: 'Not authenticated with Google' };
    }

    try {
      const nowIso = new Date().toISOString();
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(nowIso)}&maxResults=10&singleEvents=true&orderBy=startTime&q=Focus`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error(`Calendar fetch failed: ${res.statusText}`);
      }

      const data = await res.json();
      return { success: true, events: data.items || [] };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to list events' };
    }
  }

  static async scheduleUpcomingStudyBlock(
    subject: string,
    topic: string,
    startDateTime: Date,
    durationMinutes: number
  ): Promise<{ success: boolean; eventId?: string; error?: string }> {
    const token = getCachedAccessToken();
    if (!token) {
      return { success: false, error: 'Not authenticated with Google' };
    }

    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);

    const eventPayload = {
      summary: `📖 [Scheduled Study] ${subject}: ${topic}`,
      description: `Planned study block scheduled via AI Focus Timer.\nDuration: ${durationMinutes} minutes.\nTarget: Deep uninterrupted focus.`,
      colorId: '9', // Blueberry / Focus Blue
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };

    try {
      const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventPayload)
      });

      if (!res.ok) {
        throw new Error(`Failed to schedule event: ${res.statusText}`);
      }

      const created = await res.json();
      return { success: true, eventId: created.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
