import React, { useState } from 'react';
import { simulationEngine } from '../simulation/SimulationEngine';

export const SimulationControlPanel: React.FC = () => {
  const [sim, setSim] = useState(() => simulationEngine.getState());

  const update = (patch: Partial<ReturnType<typeof simulationEngine.getState>>) => {
    if (patch.enabled !== undefined) simulationEngine.setEnabled(patch.enabled);
    if (patch.simulatedStudentPresent !== undefined) simulationEngine.setSimulatedStudentPresent(patch.simulatedStudentPresent);
    if (patch.simulatedDeviceInUse !== undefined) simulationEngine.setSimulatedDeviceInUse(patch.simulatedDeviceInUse);
    if (patch.simulatedCameraFailure !== undefined) simulationEngine.setSimulatedCameraFailure(patch.simulatedCameraFailure);
    if (patch.simulatedStaleFrame !== undefined) simulationEngine.setSimulatedStaleFrame(patch.simulatedStaleFrame);
    setSim(simulationEngine.getState());
  };

  return (
    <div className="bg-amber-950/20 border border-amber-500/40 rounded-xl p-4 text-xs font-mono text-amber-200 shadow-lg space-y-3">
      <div className="flex items-center justify-between border-b border-amber-500/30 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-bold text-amber-300">DEVELOPER SIMULATION HARNESS</span>
        </div>
        <button
          onClick={() => update({ enabled: !sim.enabled })}
          className={`px-3 py-1 rounded text-[11px] font-bold transition ${
            sim.enabled
              ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          {sim.enabled ? 'SIMULATION ACTIVE' : 'ENABLE SIMULATION'}
        </button>
      </div>

      {sim.enabled && (
        <div className="space-y-2 pt-1">
          <div className="text-[10px] text-amber-400/80">
            Note: Simulated signals override real hardware detection for testing. Never stored in official logs.
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => update({ simulatedStudentPresent: !sim.simulatedStudentPresent })}
              className={`p-2 rounded border text-left transition ${
                sim.simulatedStudentPresent
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
              }`}
            >
              <div className="text-[9px] text-slate-400 uppercase">Student Presence</div>
              <div className="font-bold text-xs mt-0.5">
                {sim.simulatedStudentPresent ? 'FORCE PRESENT' : 'FORCE AWAY'}
              </div>
            </button>

            <button
              onClick={() => update({ simulatedDeviceInUse: !sim.simulatedDeviceInUse })}
              className={`p-2 rounded border text-left transition ${
                sim.simulatedDeviceInUse
                  ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                  : 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
              }`}
            >
              <div className="text-[9px] text-slate-400 uppercase">Device State</div>
              <div className="font-bold text-xs mt-0.5">
                {sim.simulatedDeviceInUse ? 'PHONE IN HAND' : 'PHONE CLEARED'}
              </div>
            </button>

            <button
              onClick={() => update({ simulatedCameraFailure: !sim.simulatedCameraFailure })}
              className={`p-2 rounded border text-left transition ${
                sim.simulatedCameraFailure
                  ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
            >
              <div className="text-[9px] text-slate-400 uppercase">Camera Failure</div>
              <div className="font-bold text-xs mt-0.5">
                {sim.simulatedCameraFailure ? 'CAMERA FAILED' : 'CAM HEALTHY'}
              </div>
            </button>

            <button
              onClick={() => update({ simulatedStaleFrame: !sim.simulatedStaleFrame })}
              className={`p-2 rounded border text-left transition ${
                sim.simulatedStaleFrame
                  ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
            >
              <div className="text-[9px] text-slate-400 uppercase">Freeze / Stale</div>
              <div className="font-bold text-xs mt-0.5">
                {sim.simulatedStaleFrame ? 'FRAME STALLED' : 'FRAME NORMAL'}
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
