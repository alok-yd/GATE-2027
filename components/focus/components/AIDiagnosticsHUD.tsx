import React, { useState, useEffect } from 'react';
import { FocusEngineOutput } from '../services/focusEngine';
import { TimerTickData } from '../services/timerEngine';
import { DeviceCapabilityDetector } from '../services/ml/DeviceCapabilityDetector';
import { modelManager } from '../services/ml/ModelManager';
import { frameScheduler } from '../services/ml/FrameScheduler';
import { focusSessionController, FocusSessionState } from '../services/FocusSessionController';
import { ModelStatusMap, AIRuntimeProvider } from '../types';
import {
  Cpu,
  Zap,
  Activity,
  UserCheck,
  UserX,
  Smartphone,
  BookOpen,
  Monitor,
  Eye,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  History
} from 'lucide-react';

interface AIDiagnosticsHUDProps {
  engineOutput: FocusEngineOutput;
  tickData: TimerTickData;
}

export const AIDiagnosticsHUD: React.FC<AIDiagnosticsHUDProps> = ({
  engineOutput,
  tickData
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatusMap>(() => modelManager.getStatus());
  const [aiRuntime, setAiRuntime] = useState<AIRuntimeProvider>('WASM');
  const [fps, setFps] = useState<number>(12);
  const [avgLatency, setAvgLatency] = useState<number>(0);
  const [droppedFrames, setDroppedFrames] = useState<number>(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [sessionState, setSessionState] = useState<FocusSessionState>(() => focusSessionController.getState());
  const [lastUpdateAgoMs, setLastUpdateAgoMs] = useState<number>(0);

  useEffect(() => {
    DeviceCapabilityDetector.detect().then(caps => {
      setAiRuntime(caps.selectedProvider);
    });

    const unsubModel = modelManager.subscribe(setModelStatus);
    const unsubSession = focusSessionController.subscribe((s) => {
      setSessionState(s);
    });

    const interval = setInterval(() => {
      const metrics = frameScheduler.getMetrics();
      setFps(metrics.fps || 12);
      setDroppedFrames(metrics.droppedFrames);
      setAvgLatency(metrics.avgLatencyMs);
      setLastUpdateAgoMs(Date.now() - focusSessionController.getState().lastVisionUpdateAt);
    }, 500);

    return () => {
      unsubModel();
      unsubSession();
      clearInterval(interval);
    };
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    await modelManager.retry();
    setIsRetrying(false);
  };

  const gate = sessionState.gate;
  const isAnyModelDegradedOrFailed = Object.values(modelStatus).some(s => s === 'failed' || s === 'degraded');

  const camHealth = !gate.monitoringHealthy 
    ? 'FAILED'
    : (engineOutput.visionQualityScore !== undefined && engineOutput.visionQualityScore < 0.35 ? 'DEGRADED' : 'HEALTHY');

  const studentPresent = gate.studentPresent;
  const presenceConfidencePct = Math.round(sessionState.presenceConfidence * 100);

  const deviceStatus = sessionState.deviceStatus;
  const deviceInUse = gate.deviceInUse;
  const deviceConfidencePct = Math.round((engineOutput.confidenceVector?.phoneConfidence ?? (deviceStatus !== 'NOT_DETECTED' ? 0.8 : 0)) * 100);
  const handInteractionPct = Math.round((sessionState.deviceInteractionEvidence?.handOverlap ?? 0) * 100);

  const timerGateOpen = gate.verifiedTimerAllowed;
  const blockReason = gate.blockReason;

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl text-zinc-300">
      {/* Collapsible Bar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3.5 px-4 bg-zinc-900 hover:bg-zinc-850 transition-colors text-left cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg border ${
            aiRuntime === 'WebGPU' 
              ? 'bg-purple-500/20 border-purple-500/30 text-purple-400' 
              : 'bg-teal-500/20 border-teal-500/30 text-teal-400'
          }`}>
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">AI Presence & Diagnostics HUD</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                timerGateOpen
                  ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400 font-bold'
                  : 'bg-rose-950/60 border-rose-800/80 text-rose-400 font-bold'
              }`}>
                TIMER GATE: {timerGateOpen ? 'OPEN (RUNNING)' : `BLOCKED (${blockReason})`}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                studentPresent ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
              }`}>
                Student: {studentPresent ? 'PRESENT' : 'AWAY'}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                gate.studentFaceVerified ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
              }`}>
                Face: {gate.studentFaceVerified ? 'VERIFIED' : 'NOT VERIFIED'}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                gate.genericPersonDetected ? 'bg-sky-950/40 border-sky-800/60 text-sky-300' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
              }`}>
                Generic Person: {gate.genericPersonDetected ? 'YES' : 'NO'}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                deviceInUse ? 'bg-rose-950/60 border-rose-800/80 text-rose-300' : 'bg-zinc-800 border-zinc-700 text-zinc-300'
              }`}>
                Device: {deviceInUse ? 'IN USE' : 'CLEAR'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              High-Level: <strong className="text-zinc-200">{gate.highLevelState}</strong> • Presence State: <strong className="text-zinc-200 font-mono">{gate.presenceState || (studentPresent ? 'STUDENT_PRESENT' : 'STUDENT_AWAY')}</strong> • Inference: <span className="font-mono text-zinc-300">{fps} FPS</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAnyModelDegradedOrFailed && (
            <span className="text-[11px] text-amber-400 flex items-center gap-1 bg-amber-950/50 px-2 py-1 rounded-md border border-amber-800/60">
              <AlertTriangle className="w-3 h-3" /> Model Degraded
            </span>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </div>
      </button>

      {/* Expanded Diagnostics Content */}
      {isOpen && (
        <div className="p-4 border-t border-zinc-800/80 space-y-4 text-xs font-sans animate-in fade-in duration-200">
          {/* Section 43: Authoritative Diagnostics Telemetry Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {/* Student Presence */}
            <div className="bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Student</span>
              <div className="flex items-center gap-1.5 mt-1">
                {studentPresent ? <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> : <UserX className="w-3.5 h-3.5 text-amber-400" />}
                <span className={`font-mono font-bold text-xs ${studentPresent ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {studentPresent ? 'PRESENT' : 'ABSENT'}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">Conf: {presenceConfidencePct}%</span>
            </div>

            {/* Student Face Verified */}
            <div className="bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Student Face</span>
              <div className="flex items-center gap-1.5 mt-1">
                {gate.studentFaceVerified ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-zinc-500" />}
                <span className={`font-mono font-bold text-xs ${gate.studentFaceVerified ? 'text-emerald-400' : 'text-zinc-400'}`}>
                  {gate.studentFaceVerified ? 'VERIFIED' : 'UNVERIFIED'}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">{gate.studentFaceVerified ? 'Match OK' : 'No match'}</span>
            </div>

            {/* Generic Person */}
            <div className="bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Person In Frame</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`font-mono font-bold text-xs ${gate.genericPersonDetected ? 'text-sky-400' : 'text-zinc-500'}`}>
                  {gate.genericPersonDetected ? 'DETECTED' : 'NONE'}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">Body / Face</span>
            </div>

            {/* Device Status */}
            <div className="bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Device Status</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Smartphone className={`w-3.5 h-3.5 ${deviceStatus === 'DEVICE_IN_USE' ? 'text-rose-400' : deviceStatus === 'DEVICE_PRESENT' ? 'text-teal-400' : 'text-zinc-500'}`} />
                <span className={`font-mono font-bold text-xs ${deviceStatus === 'DEVICE_IN_USE' ? 'text-rose-400' : deviceStatus === 'DEVICE_PRESENT' ? 'text-teal-400' : 'text-zinc-400'}`}>
                  {deviceStatus === 'NOT_DETECTED' ? 'CLEAR' : deviceStatus === 'DEVICE_PRESENT' ? 'DESK' : 'IN USE'}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">Conf: {deviceConfidencePct}%</span>
            </div>

            {/* Camera Health */}
            <div className="bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Camera Health</span>
              <div className="flex items-center gap-1.5 mt-1">
                {camHealth === 'HEALTHY' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                <span className={`font-mono font-bold text-xs ${camHealth === 'HEALTHY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {camHealth}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">Age: {lastUpdateAgoMs}ms</span>
            </div>

            {/* Evidence Age */}
            <div className="bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Evidence Freshness</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span className={`font-mono font-bold text-xs ${lastUpdateAgoMs < 2500 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {lastUpdateAgoMs < 2500 ? 'FRESH' : 'EXPIRED'}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">{lastUpdateAgoMs}ms / 2500ms</span>
            </div>

            {/* Timer Gate Decision */}
            <div className="bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Timer Gate</span>
              <div className="flex items-center gap-1.5 mt-1">
                {timerGateOpen ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> : <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />}
                <span className={`font-mono font-bold text-xs ${timerGateOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {timerGateOpen ? 'OPEN' : 'BLOCKED'}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">Reason: {blockReason}</span>
            </div>

            {/* Inference Performance */}
            <div className="bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Inference</span>
              <div className="flex items-center gap-1.5 mt-1 font-mono text-zinc-200 text-xs font-bold">
                <span>{fps} FPS</span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">{avgLatency}ms / {aiRuntime}</span>
            </div>
          </div>

          {/* Section 44: State Transition Logs */}
          <div className="border-t border-zinc-800/80 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-indigo-400" />
                State Transition Log (Section 44)
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                {sessionState.stateTransitions.length} events recorded
              </span>
            </div>
            <div className="bg-zinc-950/80 rounded-xl border border-zinc-800 p-2 max-h-36 overflow-y-auto space-y-1 font-mono text-[11px]">
              {sessionState.stateTransitions.length === 0 ? (
                <div className="text-zinc-500 py-2 text-center text-xs">No transitions recorded yet. Session is stable.</div>
              ) : (
                sessionState.stateTransitions.map((tr) => (
                  <div key={tr.id} className="flex items-center justify-between text-zinc-400 bg-zinc-900/60 p-1.5 rounded border border-zinc-800/50">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 text-[10px]">[{new Date(tr.timestamp).toLocaleTimeString()}]</span>
                      <span className="font-semibold text-zinc-300">{tr.fromState}</span>
                      <span className="text-zinc-500">&rarr;</span>
                      <span className={`font-bold ${
                        tr.toState === 'ACTIVE' ? 'text-emerald-400' :
                        tr.toState === 'AWAY' ? 'text-amber-400' :
                        tr.toState === 'DEVICE_IN_USE' ? 'text-rose-400' : 'text-zinc-300'
                      }`}>{tr.toState}</span>
                    </div>
                    <span className="text-zinc-500 text-[10px] truncate max-w-sm">{tr.reason}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Model Readiness & Provider Status */}
          <div className="border-t border-zinc-800/80 pt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-zinc-400">Models:</span>
              <span className="text-zinc-300">Face: <strong className="text-emerald-400">{modelStatus.face}</strong></span>
              <span className="text-zinc-300">Pose: <strong className="text-emerald-400">{modelStatus.pose}</strong></span>
              <span className="text-zinc-300">Hands: <strong className="text-emerald-400">{modelStatus.hands}</strong></span>
              <span className="text-zinc-300">Object: <strong className="text-emerald-400">{modelStatus.object}</strong></span>
            </div>

            {isAnyModelDegradedOrFailed && (
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex items-center gap-1.5 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>Retry Model Download</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

