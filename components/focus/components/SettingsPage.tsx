import React, { useEffect, useState } from 'react';
import { UserSettings } from '../types';
import { Camera, RotateCcw, ShieldCheck, Target, Volume2, CalendarDays } from 'lucide-react';

interface SettingsPageProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
  onResetAllData: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onUpdateSettings,
  onResetAllData,
}) => {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraPermissionNote, setCameraPermissionNote] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    const loadCameras = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          if (active) setCameraPermissionNote('Camera selection is not available in this browser.');
          return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!active) return;
        setCameras(devices.filter((device) => device.kind === 'videoinput'));
      } catch {
        if (active) setCameraPermissionNote('Camera devices could not be listed. The default camera will be used.');
      }
    };
    void loadCameras();
    return () => {
      active = false;
    };
  }, []);

  const update = (partial: Partial<UserSettings>) => {
    onUpdateSettings({ ...settings, ...partial });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const resetData = () => {
    if (window.confirm('Delete all AI Focus sessions, subjects and timeline logs? This does not affect other tracker sections.')) {
      onResetAllData();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h2 className="text-xl font-bold text-white">AI Focus Settings</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Timer settings and webcam connection. Presence detection has only one rule.
          </p>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-indigo-300" />
            <h3 className="text-sm font-bold text-white">Daily study target</h3>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Only time counted while a person is detected contributes to this target.</p>
          <div className="mt-4 flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={16}
              step={1}
              value={settings.dailyTargetHours}
              onChange={(event) => update({ dailyTargetHours: Number(event.target.value) })}
              className="min-w-0 flex-1 accent-indigo-500"
            />
            <span className="w-16 text-right font-mono text-lg font-bold text-emerald-300">
              {settings.dailyTargetHours}h
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-emerald-300" />
            <h3 className="text-sm font-bold text-white">Webcam</h3>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Frames are processed locally. No webcam video is uploaded or saved.
          </p>
          <label className="mt-4 block text-xs font-semibold text-zinc-300">
            Camera device
            <select
              value={settings.selectedCameraId || ''}
              onChange={(event) => update({ selectedCameraId: event.target.value })}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            >
              <option value="">Default camera</option>
              {cameras.map((camera, index) => (
                <option key={camera.deviceId || index} value={camera.deviceId}>
                  {camera.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          {cameraPermissionNote && <p className="mt-2 text-xs text-amber-300">{cameraPermissionNote}</p>}
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-relaxed text-emerald-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong>Presence only:</strong> person detected = timer runs; no person or camera unavailable = timer pauses.</span>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-amber-300" />
            <h3 className="text-sm font-bold text-white">Notifications</h3>
          </div>
          <label className="mt-4 flex items-center justify-between gap-3 text-sm text-zinc-300">
            <span>Sound notifications</span>
            <input
              type="checkbox"
              checked={settings.soundNotifications}
              onChange={(event) => update({ soundNotifications: event.target.checked })}
              className="h-4 w-4 accent-indigo-500"
            />
          </label>
          <label className="mt-3 flex items-center justify-between gap-3 text-sm text-zinc-300">
            <span>Desktop notifications</span>
            <input
              type="checkbox"
              checked={settings.desktopNotifications}
              onChange={(event) => update({ desktopNotifications: event.target.checked })}
              className="h-4 w-4 accent-indigo-500"
            />
          </label>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-sky-300" />
            <h3 className="text-sm font-bold text-white">Calendar sync</h3>
          </div>
          <label className="mt-4 flex items-center justify-between gap-3 text-sm text-zinc-300">
            <span>Automatically sync eligible focus sessions</span>
            <input
              type="checkbox"
              checked={settings.autoSyncGoogleCalendar}
              onChange={(event) => update({ autoSyncGoogleCalendar: event.target.checked })}
              className="h-4 w-4 accent-indigo-500"
            />
          </label>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-rose-200">Reset AI Focus data</h3>
            <p className="mt-1 text-xs text-rose-200/70">Deletes AI Focus sessions, subjects, and timeline records only.</p>
          </div>
          <button
            type="button"
            onClick={resetData}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-200 hover:bg-rose-500/20"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset AI Focus
          </button>
        </section>

        <div className="min-h-5 text-right text-xs font-semibold text-emerald-300">
          {saved ? 'Settings saved' : ''}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
