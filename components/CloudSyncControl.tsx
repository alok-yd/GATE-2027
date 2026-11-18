import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Cloud, CloudCheck, LoaderCircle, LogOut, RefreshCw } from 'lucide-react';
import { signOutFromCloudSync, subscribeCloudSync, syncCloudDataNow, type CloudSyncState } from '../services/CloudSyncService';

const initialState: CloudSyncState = {
  user: null, status: 'connecting', authReady: false, lastSyncedAt: null, pendingWrites: 0,
  message: 'Preparing your authenticated cloud space…',
};

const statusText: Record<CloudSyncState['status'], string> = {
  local: 'Waiting for account', connecting: 'Connecting…', syncing: 'Syncing changes…',
  synced: 'Cloud sync active', offline: 'Offline • saved locally', error: 'Sync needs attention',
};
const statusClass: Record<CloudSyncState['status'], string> = {
  local: 'text-slate-400', connecting: 'text-indigo-300', syncing: 'text-indigo-300',
  synced: 'text-emerald-300', offline: 'text-amber-300', error: 'text-rose-300',
};

const CloudSyncControl: React.FC = () => {
  const [state, setState] = useState<CloudSyncState>(initialState);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  useEffect(() => subscribeCloudSync(setState), []);

  const handleSyncNow = async () => {
    setBusy(true); setActionError('');
    try { await syncCloudDataNow(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Cloud sync failed.'); }
    finally { setBusy(false); }
  };

  const handleLogout = async () => {
    setBusy(true); setActionError('');
    try { await signOutFromCloudSync(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Could not sign out.'); }
    finally { setBusy(false); }
  };

  const statusIcon = state.status === 'synced'
    ? <CloudCheck className="h-4 w-4 text-emerald-300" />
    : state.status === 'connecting' || state.status === 'syncing'
      ? <LoaderCircle className="h-4 w-4 animate-spin text-indigo-300" />
      : state.status === 'error'
        ? <AlertCircle className="h-4 w-4 text-rose-300" />
        : <Cloud className="h-4 w-4 text-slate-300" />;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-3">
      <div className="flex items-center gap-2">
        {statusIcon}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-100">Cloud Sync</p>
          <p className={'mt-0.5 truncate text-[10px] font-medium ' + statusClass[state.status]}>{statusText[state.status]}</p>
        </div>
        {state.status === 'synced' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />}
      </div>
      {state.user ? (
        <>
          <p className="mt-2 truncate text-[10px] text-slate-400" title={state.user.email || state.user.phoneNumber || undefined}>
            {state.user.email || state.user.phoneNumber || 'Authenticated ACHIEVER account'}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={handleSyncNow} disabled={busy || state.status === 'connecting'} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2 py-1.5 text-[10px] font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
              <RefreshCw className={'h-3 w-3 ' + (busy ? 'animate-spin' : '')} /> Sync now
            </button>
            <button type="button" onClick={handleLogout} disabled={busy} title="Log out of ACHIEVER" aria-label="Log out of ACHIEVER" className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2 py-1.5 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-700 disabled:opacity-50">
              <LogOut className="h-3 w-3" /> Log out
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-[10px] leading-4 text-slate-400">{state.authReady ? 'No authenticated account is active.' : 'Checking your Firebase account…'}</p>
      )}
      {(state.status === 'error' || actionError) && <p role="alert" className="mt-2 break-words text-[10px] leading-relaxed text-rose-300">{actionError || state.message}</p>}
    </div>
  );
};

export default CloudSyncControl;