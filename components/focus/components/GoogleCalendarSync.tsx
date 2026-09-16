import React, { useState, useEffect } from 'react';
import { GoogleCalendarEvent, FocusSession } from '../types';
import { GoogleCalendarService } from '../services/calendar';
import {
  Calendar,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  LogIn,
  LogOut,
  ExternalLink,
  BookOpen,
  CalendarDays,
  AlertTriangle,
  ShieldCheck,
  HelpCircle
} from 'lucide-react';
import { formatTimeHoursMins } from '../services/storage';

interface GoogleCalendarSyncProps {
  todaySessions: FocusSession[];
  onRefresh: () => void;
}

export const GoogleCalendarSync: React.FC<GoogleCalendarSyncProps> = ({ todaySessions, onRefresh }) => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isConfigError, setIsConfigError] = useState(false);
  const [showOAuth403Help, setShowOAuth403Help] = useState(false);

  // Schedule Study Block form state
  const [scheduleSubject, setScheduleSubject] = useState('Algorithms');
  const [scheduleTopic, setScheduleTopic] = useState('Graph Algorithms & Dijkstra');
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleTime, setScheduleTime] = useState('14:00');
  const [scheduleDurationMinutes, setScheduleDurationMinutes] = useState(120);

  // Check auth state on mount
  useEffect(() => {
    const unsub = GoogleCalendarService.onAuthStateChanged((user) => {
      if (user) {
        setIsSignedIn(true);
        setCurrentUser(user);
        loadUpcomingEvents();
      } else {
        setIsSignedIn(false);
        setCurrentUser(null);
        setEvents([]);
      }
    });

    return () => unsub();
  }, []);

  const handleSignIn = async () => {
    setIsLoading(true);
    setStatusMsg(null);
    setIsConfigError(false);
    const result = await GoogleCalendarService.signInWithGoogle();
    setIsLoading(false);

    if (result.success) {
      setIsSignedIn(true);
      setCurrentUser(result.user);
      setShowOAuth403Help(false);
      setStatusMsg({ type: 'success', text: `Connected Google Calendar as ${result.user?.email}` });
      await loadUpcomingEvents();
    } else {
      setStatusMsg({ type: 'error', text: result.error || 'Sign in failed' });
      if (result.isConfigError) {
        setIsConfigError(true);
      } else {
        setShowOAuth403Help(true);
      }
    }
  };

  const handleSignOut = async () => {
    await GoogleCalendarService.signOut();
    setIsSignedIn(false);
    setCurrentUser(null);
    setEvents([]);
    setStatusMsg({ type: 'info', text: 'Disconnected from Google Calendar' });
  };

  const loadUpcomingEvents = async () => {
    setIsLoading(true);
    const list = await GoogleCalendarService.fetchUpcomingEvents(10);
    setEvents(list);
    setIsLoading(false);
  };

  // Sync today's completed focus sessions
  const handleSyncAllToday = async () => {
    if (!isSignedIn) {
      setStatusMsg({ type: 'error', text: 'Please connect Google Calendar first' });
      return;
    }

    setIsLoading(true);
    let syncedCount = 0;

    for (const session of todaySessions) {
      if (!session.syncedToCalendar) {
        const res = await GoogleCalendarService.syncSessionToCalendar(session);
        if (res.success) {
          session.syncedToCalendar = true;
          syncedCount++;
        }
      }
    }

    setIsLoading(false);
    setStatusMsg({
      type: 'success',
      text: syncedCount > 0 ? `Successfully synced ${syncedCount} verified focus sessions to your Google Calendar!` : 'All sessions are already synced.'
    });
    await loadUpcomingEvents();
    onRefresh();
  };

  // Schedule a future block
  const handleScheduleBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignedIn) {
      setStatusMsg({ type: 'error', text: 'Please sign in first' });
      return;
    }

    setIsLoading(true);
    const startDateTime = new Date(`${scheduleDate}T${scheduleTime}:00`);
    const endDateTime = new Date(startDateTime.getTime() + scheduleDurationMinutes * 60 * 1000);

    const result = await GoogleCalendarService.createStudyBlockEvent(
      scheduleSubject,
      scheduleTopic,
      startDateTime.toISOString(),
      endDateTime.toISOString(),
      'Deep Focus'
    );

    setIsLoading(false);
    if (result.success) {
      setStatusMsg({ type: 'success', text: `Scheduled ${scheduleSubject} block on Google Calendar!` });
      await loadUpcomingEvents();
    } else {
      setStatusMsg({ type: 'error', text: result.error || 'Failed to create calendar event' });
    }
  };

  return (
    <div className="flex-1 p-4 lg:p-6 overflow-y-auto space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            <span>Google Calendar Synchronization</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Automatically record verified study blocks and schedule deep focus sessions directly to your calendar
          </p>
        </div>

        <div>
          {isSignedIn ? (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-zinc-200">{currentUser?.displayName || 'Google Account'}</div>
                <div className="text-[11px] text-zinc-500">{currentUser?.email}</div>
              </div>
              <button
                onClick={handleSignOut}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:items-end gap-1.5">
              <button
                onClick={handleSignIn}
                disabled={isLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>Connect Google Calendar</span>
              </button>
              <button
                type="button"
                onClick={() => setShowOAuth403Help(prev => !prev)}
                className="text-[11px] text-zinc-400 hover:text-indigo-400 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3 h-3" />
                <span>Seeing Error 403 / Access blocked?</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Status banner */}
      {statusMsg && (
        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
          statusMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
          statusMsg.type === 'error' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' :
          'bg-zinc-800 border-zinc-700 text-zinc-300'
        }`}>
          {statusMsg.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Configuration Error Guide Box */}
      {isConfigError && (
        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 mt-0.5 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-200">
                1-Click Step Required: Enable Google Sign-In in Firebase Console
              </h4>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                Firebase reported <code className="px-1.5 py-0.5 rounded bg-amber-950/60 font-mono text-[11px] text-amber-300">auth/configuration-not-found</code>. This error happens because Google Sign-In has not been turned on yet in your Firebase Project (<span className="font-semibold text-white">gate-2027-a8850</span>).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 space-y-2">
              <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 inline-flex items-center justify-center text-[11px] font-bold">1</span>
                Enable Google Auth in Firebase
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                In Firebase Console, click <strong>"Get started"</strong> under Authentication. Then under <strong>Sign-in method</strong>, select <strong>Google</strong>, toggle <strong>Enable</strong>, select your support email, and click <strong>Save</strong>.
              </p>
              <a
                href="https://console.firebase.google.com/u/1/project/gate-2027-a8850/authentication/providers"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-medium transition-colors"
              >
                <span>Open Firebase Auth Console</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 space-y-2">
              <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 inline-flex items-center justify-center text-[11px] font-bold">2</span>
                Enable Google Calendar API
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Enable Google Calendar API on this project so your verified study sessions can sync with your Google Calendar schedule.
              </p>
              <a
                href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=gate-2027-a8850"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
              >
                <span>Open Google Calendar API</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={handleSignIn}
              disabled={isLoading}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-amber-600/20"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Retry Connecting Google Calendar</span>
            </button>
          </div>
        </div>
      )}

      {/* OAuth 403 / Test User Fix Box */}
      {(showOAuth403Help || (!isSignedIn && statusMsg?.type === 'error' && !isConfigError)) && (
        <div className="p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 space-y-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 mt-0.5 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-indigo-200">
                  Fix for "Access blocked (Error 403: access_denied)"
                </h4>
                <p className="text-xs text-indigo-300/80 leading-relaxed">
                  Google blocks sign-in when an app in <em>Testing mode</em> requests sensitive calendar permissions. Simply add your Google account (<span className="font-semibold text-white">alokyadav1422003@gmail.com</span>) to <strong>Test users</strong> in Google Cloud Console.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowOAuth403Help(false)}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded cursor-pointer"
            >
              &times; Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 space-y-2">
              <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 inline-flex items-center justify-center text-[11px] font-bold">1</span>
                Add Test User (Takes ~10 seconds)
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Open OAuth Consent Screen &rarr; Scroll down to <strong>Test users</strong> &rarr; Click <strong>+ ADD USERS</strong> &rarr; Enter <strong>alokyadav1422003@gmail.com</strong> &rarr; Click <strong>Save</strong>.
              </p>
              <a
                href="https://console.cloud.google.com/apis/credentials/consent?project=gate-2027-a8850"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-lg text-xs font-medium transition-colors"
              >
                <span>Open Google OAuth Consent Screen</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 space-y-2">
              <div className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 inline-flex items-center justify-center text-[11px] font-bold">2</span>
                Approve &amp; Sync Calendar
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Click <strong>Try Connecting Now</strong> below. When Google shows <em>"Google hasn't verified this app"</em>, click <strong>Advanced &rarr; Go to gate-2027-a8850 (unsafe)</strong>, check Calendar permissions, and click <strong>Continue</strong>.
              </p>
              <button
                onClick={handleSignIn}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Try Connecting Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Columns: Sync verified sessions & Schedule block */}
        <div className="lg:col-span-7 space-y-6">
          {/* Quick sync today's sessions */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-emerald-400" />
                  <span>Sync Today's Verified Focus</span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Write completed focus sessions into Google Calendar with verified minute tallies
                </p>
              </div>

              <button
                onClick={handleSyncAllToday}
                disabled={!isSignedIn || isLoading || todaySessions.length === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Sync All ({todaySessions.length})</span>
              </button>
            </div>

            {/* List of today's sessions and sync status */}
            <div className="space-y-2 pt-2">
              {todaySessions.length === 0 ? (
                <div className="text-center py-6 text-xs text-zinc-500">
                  No sessions recorded today yet. Start a focus session to record verified study hours.
                </div>
              ) : (
                todaySessions.map((s) => (
                  <div key={s.id} className="p-3 bg-zinc-950/70 border border-zinc-800 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-zinc-200">{s.subject}: {s.topic}</div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Verified: <strong className="text-emerald-400">{formatTimeHoursMins(s.focusedSeconds)}</strong>
                      </div>
                    </div>
                    {s.syncedToCalendar ? (
                      <span className="text-emerald-400 text-[11px] font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Synced</span>
                      </span>
                    ) : (
                      <span className="text-zinc-500 text-[11px]">Unsynced</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Schedule Future Study Block Form */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-400" />
              <span>Schedule Study Block on Google Calendar</span>
            </h3>

            <form onSubmit={handleScheduleBlock} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Subject</label>
                  <input
                    type="text"
                    value={scheduleSubject}
                    onChange={(e) => setScheduleSubject(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Topic</label>
                  <input
                    type="text"
                    value={scheduleTopic}
                    onChange={(e) => setScheduleTopic(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Date</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Start Time</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Duration (Minutes)</label>
                  <select
                    value={scheduleDurationMinutes}
                    onChange={(e) => setScheduleDurationMinutes(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value={45}>45 Minutes</option>
                    <option value={60}>1 Hour</option>
                    <option value={90}>1.5 Hours</option>
                    <option value={120}>2 Hours</option>
                    <option value={180}>3 Hours</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={!isSignedIn || isLoading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Create Event on Google Calendar
              </button>
            </form>
          </div>
        </div>

        {/* Right 5 Columns: Upcoming Scheduled Calendar Events */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>Upcoming Calendar Events</span>
            </h3>
            {isSignedIn && (
              <button
                onClick={loadUpcomingEvents}
                className="text-zinc-500 hover:text-zinc-300 p-1"
                title="Refresh calendar"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          <div className="space-y-2.5">
            {!isSignedIn ? (
              <div className="text-center py-10 space-y-3 text-zinc-500">
                <Calendar className="w-10 h-10 mx-auto text-zinc-700" />
                <p className="text-xs font-medium text-zinc-400">Google Calendar Not Connected</p>
                <p className="text-[11px] text-zinc-600 max-w-xs mx-auto">
                  Connect your Google account above to view your scheduled study sprints and upcoming exams.
                </p>
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-10 text-xs text-zinc-500">
                No upcoming events found on your Google Calendar.
              </div>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-1 text-xs">
                  <div className="font-semibold text-zinc-100">{ev.summary}</div>
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-indigo-400" />
                    <span>
                      {new Date(ev.start.dateTime || ev.start.date || '').toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  {ev.description && (
                    <div className="text-[11px] text-zinc-500 line-clamp-2">{ev.description}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
