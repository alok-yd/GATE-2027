import React, { useEffect, useState } from 'react';
import { cameraManager } from '../perception/CameraManager';
import { calibrationEngine } from '../perception/CalibrationEngine';
import { FocusConfig } from '../storage/FocusConfig';
import { FocusSettings, StudentCalibration } from '../types';

export const FocusSettingsView: React.FC = () => {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [settings, setSettings] = useState<FocusSettings>(() => {
    try {
      const raw = localStorage.getItem(FocusConfig.STORAGE_KEY_SETTINGS);
      if (raw) return JSON.parse(raw);
    } catch {}
    return FocusConfig.DEFAULT_SETTINGS;
  });

  const [calibration, setCalibration] = useState<StudentCalibration | null>(() =>
    calibrationEngine.getCalibration()
  );

  useEffect(() => {
    cameraManager.getAvailableCameras().then(setCameras);
  }, []);

  const saveSettings = (newSettings: FocusSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(FocusConfig.STORAGE_KEY_SETTINGS, JSON.stringify(newSettings));
    } catch (e) {
      console.error('Failed to save focus settings:', e);
    }
  };

  const handleClearCalibration = () => {
    if (confirm('Clear saved student facial identity baseline?')) {
      calibrationEngine.clearCalibration();
      setCalibration(null);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div>
          <h3 className="text-lg font-bold text-white">Camera & Video Feed Settings</h3>
          <p className="text-xs text-slate-400 mt-0.5">Configure hardware devices and stream resolution</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 uppercase font-semibold mb-1">Webcam Device</label>
            <select
              value={settings.selectedCameraId}
              onChange={(e) => {
                const id = e.target.value;
                saveSettings({ ...settings, selectedCameraId: id });
                cameraManager.startStream(id);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-500/50"
            >
              <option value="">Default System Camera</option>
              {cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label || `Camera ${c.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 uppercase font-semibold mb-1">Stream Resolution</label>
            <select
              value={settings.cameraResolution}
              onChange={(e) => saveSettings({ ...settings, cameraResolution: e.target.value as any })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-amber-500/50"
            >
              <option value="480p">480p (640 x 480) — Recommended for battery & performance</option>
              <option value="720p">720p (1280 x 720) — High detail</option>
              <option value="360p">360p (480 x 360) — Ultra lightweight</option>
            </select>
          </div>
        </div>
      </div>

      {/* Student Identity Baseline Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white">Student Identity Baseline</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Local landmark proportions prevent another person from counting as your presence.
          </p>
        </div>

        <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-200">
              {calibration ? 'Student Baseline Calibrated' : 'Auto-Calibration Active'}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {calibration
                ? `Saved on ${new Date(calibration.calibratedAt).toLocaleDateString()} with 8 geometric facial vectors.`
                : 'Will automatically calibrate during your first 5 seconds of frontal study.'}
            </div>
          </div>

          {calibration && (
            <button
              onClick={handleClearCalibration}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-rose-400 hover:bg-slate-700 transition"
            >
              Reset Baseline
            </button>
          )}
        </div>
      </div>

      {/* Background Monitoring & System Behavior */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div>
          <h3 className="text-lg font-bold text-white">Background Execution & Controls</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Control how the timer monitors while you switch tabs or minimize the window.
          </p>
        </div>

        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800 cursor-pointer">
            <div>
              <div className="text-sm font-semibold text-slate-200">Continuous Background Monitoring</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Keeps camera and timer running when minimized or switching to ChatGPT/VS Code in Electron.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.backgroundMonitoring}
              onChange={(e) => saveSettings({ ...settings, backgroundMonitoring: e.target.checked })}
              className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 border-slate-700 bg-slate-900"
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800 cursor-pointer">
            <div>
              <div className="text-sm font-semibold text-slate-200">Execution Motivation Messages</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Show non-distracting reminders such as "FOCUS ON TODAY'S EXECUTION" on the Live dashboard.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.motivationalMessages}
              onChange={(e) => saveSettings({ ...settings, motivationalMessages: e.target.checked })}
              className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 border-slate-700 bg-slate-900"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
