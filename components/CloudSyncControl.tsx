import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudCheck,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  signInForCloudSync,
  signOutFromCloudSync,
  subscribeCloudSync,
  syncCloudDataNow,
  type CloudSyncState,
} from '../services/CloudSyncService';

const initialState: CloudSyncState = {
  user: null,
  status: 'local',
  authReady: false,
  lastSyncedAt: null,
  pendingWrites: 0,
  message: 'Your records are stored on this device. Connect Google to enable cloud sync.',
};

const statusText: Record<CloudSyncState['status'], string> = {
  local: 'Local-only storage',
  connecting: 'Connecting…',
  syncing: 'Syncing changes…',
  synced: 'Cloud sync active',
  offline: 'Offline • saved locally',
  error: 'Sync needs attention',
};

const statusClass: Record<CloudSyncState['status'], string> = {
  local: 'text-slate-400',
  connecting: 'text-indigo-300',
  syncing: 'text-indigo-300',
  synced: 'text-emerald-300',
  offline: 'text-amber-300',
  error: 'text-rose-300',
};

const CloudSyncControl: React.FC = () => {
  const [state, setState] = useState<CloudSyncState>(initialState);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => subscribeCloudSync(setState), []);

  const handleConnect = async () => {
    setBusy(true);
    setActionError('');
    try {
      await signInForCloudSync();
      setModalOpen(false);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Google sign-in was not completed. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSyncNow = async () => {
    setBusy(true);
    setActionError('');
    try {
      await syncCloudDataNow();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Cloud sync failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setActionError('');
    try {
      await signOutFromCloudSync();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not disconnect cloud sync.');
    } finally {
      setBusy(false);
    }
  };

  const statusIcon = state.status === 'synced'
    ? <CloudCheck className="h-4 w-4 text-emerald-300" />
    : state.status === 'connecting' || state.status === 'syncing'
      ? <LoaderCircle className="h-4 w-4 animate-spin text-indigo-300" />
      : state.status === 'error'
        ? <AlertCircle className="h-4 w-4 text-rose-300" />
        : <Cloud className="h-4 w-4 text-slate-300" />;

  return (
    <>
      <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-3">
        <div className="flex items-center gap-2">
          {statusIcon}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-100">Cloud Sync</p>
            <p className={`mt-0.5 truncate text-[10px] font-medium ${statusClass[state.status]}`}>
              {statusText[state.status]}
            </p>
          </div>
          {state.status === 'synced' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />}
        </div>

        {state.user ? (
          <>
            <p className="mt-2 truncate text-[10px] text-slate-400" title={state.user.email || undefined}>
              {state.user.email || 'Google account connected'}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={busy || state.status === 'connecting'}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2 py-1.5 text-[10px] font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
                Sync now
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={busy}
                title="Disconnect cloud sync"
                aria-label="Disconnect cloud sync"
                className="rounded-lg border border-slate-600 px-2 py-1.5 text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
              >
                <LogOut className="h-3 w-3" />
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setActionError('');
              setModalOpen(true);
            }}
            className="mt-2 w-full rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-2 py-1.5 text-[10px] font-bold text-indigo-200 transition hover:bg-indigo-500/25"
          >
            Connect Google account
          </button>
        )}

        {(state.status === 'error' || actionError) && (
          <p className="mt-2 break-words text-[10px] leading-relaxed text-rose-300">
            {actionError || state.message}
          </p>
        )}
      </div>

      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setModalOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cloud-sync-title"
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 text-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-300/30 bg-indigo-500/15">
                  <Cloud className="h-6 w-6 text-indigo-200" />
                </div>
                <div>
                  <h2 id="cloud-sync-title" className="text-lg font-bold">Enable ACHIEVER Cloud Sync</h2>
                  <p className="mt-0.5 text-xs text-slate-400">Firebase Authentication + Cloud Firestore</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={busy}
                aria-label="Close cloud sync dialog"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-relaxed text-slate-300">
              <p>
                Sign in with Google to migrate your existing browser records and keep supported
                ACHIEVER sections synchronized across your devices.
              </p>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
                  <ShieldCheck className="h-4 w-4" /> Private per-account storage
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Your tracker records are stored under your Firebase user ID. Gemini/API keys and
                  the live focus timer control state stay on this device and are not uploaded.
                </p>
              </div>
              <p className="text-xs text-slate-400">
                Local storage remains available. If the network is unavailable, changes stay on
                this device and sync when the connection returns.
              </p>
            </div>

            {actionError && (
              <p role="alert" className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-200">
                {actionError}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={busy}
                className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={handleConnect}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Continue with Google
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </>
  );
};

export default CloudSyncControl;
