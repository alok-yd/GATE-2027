import React from 'react';
import { FocusControllerState } from '../controllers/FocusSessionController';

interface Props {
  state: FocusControllerState;
}

export const DiagnosticsHUD: React.FC<Props> = ({ state }) => {
  const {
    cameraHealth,
    presenceState,
    presenceConfidence,
    deviceState,
    deviceConfidence,
    fps,
    latencyMs,
    gate,
    recentEvents,
  } = state;

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-300 shadow-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <span className="font-bold text-slate-200 tracking-wider text-xs flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
          AI FOCUS DIAGNOSTICS HUD
        </span>
        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-indigo-300">
          GATE 2027 REAL-TIME CORE
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Camera Health */}
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase">Camera Status</div>
          <div className={`font-bold mt-1 text-sm ${
            cameraHealth.state === 'HEALTHY' ? 'text-emerald-400' :
            cameraHealth.state === 'RECOVERING' ? 'text-amber-400' : 'text-rose-400'
          }`}>
            {cameraHealth.state}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Lag: {cameraHealth.frameFreshnessMs}ms | Frm: {cameraHealth.frameCount}
          </div>
        </div>

        {/* Student Presence */}
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase">Student Presence</div>
          <div className={`font-bold mt-1 text-sm ${
            presenceState === 'PRESENT' ? 'text-emerald-400' :
            presenceState === 'VERIFYING' ? 'text-amber-400' : 'text-rose-400'
          }`}>
            {presenceState}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Confidence: {Math.round(presenceConfidence * 100)}%
          </div>
        </div>

        {/* Device Interaction */}
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase">Device State</div>
          <div className={`font-bold mt-1 text-sm ${
            deviceState === 'NO_DEVICE_USE' ? 'text-emerald-400' :
            deviceState === 'DEVICE_CANDIDATE' ? 'text-amber-400' : 'text-rose-400'
          }`}>
            {deviceState === 'NO_DEVICE_USE' ? 'NOT IN USE' : deviceState}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Confidence: {Math.round(deviceConfidence * 100)}%
          </div>
        </div>

        {/* Verified Timer Gate */}
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
          <div className="text-[10px] text-slate-500 uppercase">Timer Gate</div>
          <div className={`font-bold mt-1 text-sm ${
            gate.isOpen ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {gate.isOpen ? 'OPEN (RUNNING)' : 'GATE PAUSED'}
          </div>
          <div className="text-[10px] text-amber-400/90 truncate mt-1">
            {gate.pauseReason ? `Reason: ${gate.pauseReason}` : 'Fully Verified'}
          </div>
        </div>
      </div>

      {/* Inference & System Metrics */}
      <div className="grid grid-cols-3 gap-3 text-[11px] bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60">
        <div>
          <span className="text-slate-500">Inference Rate:</span>{' '}
          <span className="text-slate-200 font-bold">{fps} FPS</span>
        </div>
        <div>
          <span className="text-slate-500">Avg Latency:</span>{' '}
          <span className="text-slate-200 font-bold">{latencyMs} ms</span>
        </div>
        <div>
          <span className="text-slate-500">Monitoring:</span>{' '}
          <span className={state.monitoringHealthy ? 'text-emerald-400' : 'text-rose-400'}>
            {state.monitoringHealthy ? 'HEALTHY' : 'UNAVAILABLE'}
          </span>
        </div>
      </div>

      {/* Real-Time Event Log */}
      <div>
        <div className="text-[10px] text-slate-400 font-bold uppercase mb-1.5 flex items-center justify-between">
          <span>Recent Transition Events</span>
          <span className="text-slate-500 text-[9px]">{recentEvents.length} recorded</span>
        </div>
        <div className="max-h-28 overflow-y-auto space-y-1 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
          {recentEvents.length === 0 ? (
            <div className="text-slate-500 text-center py-2 text-[10px]">No transition events logged yet</div>
          ) : (
            recentEvents.slice(-6).reverse().map((evt) => (
              <div key={evt.id} className="flex items-center justify-between text-[10px] py-0.5 border-b border-slate-900/60 last:border-0">
                <span className="text-slate-400">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
                <span className={`font-semibold ${
                  evt.type.includes('PRESENT') || evt.type.includes('RESUMED') || evt.type.includes('CLEARED')
                    ? 'text-emerald-400'
                    : evt.type.includes('AWAY') || evt.type.includes('DEVICE') || evt.type.includes('PAUSED')
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}>
                  {evt.type}
                </span>
                <span className="text-slate-300 truncate max-w-[200px]" title={evt.description}>
                  {evt.description}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
