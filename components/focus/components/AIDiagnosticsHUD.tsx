import React, { useState, useEffect } from 'react';
import { FocusEngineOutput } from '../services/focusEngine';
import { TimerTickData } from '../services/timerEngine';
import { DeviceCapabilityDetector } from '../services/ml/DeviceCapabilityDetector';
import { modelManager } from '../services/ml/ModelManager';
import { frameScheduler } from '../services/ml/FrameScheduler';
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
  RefreshCw
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

  useEffect(() => {
    // Detect runtime
    DeviceCapabilityDetector.detect().then(caps => {
      setAiRuntime(caps.selectedProvider);
    });

    const unsubModel = modelManager.subscribe(setModelStatus);

    const interval = setInterval(() => {
      const metrics = frameScheduler.getMetrics();
      setFps(metrics.fps || 12);
      setDroppedFrames(metrics.droppedFrames);
      setAvgLatency(metrics.avgLatencyMs);
    }, 1000);

    return () => {
      unsubModel();
      clearInterval(interval);
    };
  }, []);

  const handleRetry = async () => {
    setIsRetrying(true);
    await modelManager.retry();
    setIsRetrying(false);
  };

  const isAnyModelDegradedOrFailed = Object.values(modelStatus).some(s => s === 'failed' || s === 'degraded');

  const camHealth = engineOutput.visionQualityScore !== undefined && engineOutput.visionQualityScore >= 0.25
    ? 'HEALTHY'
    : (engineOutput.visionQualityScore !== undefined && engineOutput.visionQualityScore > 0 ? 'DEGRADED' : 'FAILED');

  const personDetected = engineOutput.facePresent;
  const personConf = Math.round((engineOutput.signalBreakdown?.faceScore ?? 80));

  const faceConf = Math.round((engineOutput.signalBreakdown?.faceScore ?? 85)) / 100;
  const poseConf = Math.round((engineOutput.signalBreakdown?.headPoseScore ?? 85)) / 100;
  const handsConf = Math.round((engineOutput.signalBreakdown?.activityScore ?? 80)) / 100;

  const phoneConf = Math.round((engineOutput.confidenceVector?.phoneConfidence ?? 0) * 100) / 100;
  const phoneUseConf = Math.round((engineOutput.confidenceVector?.pPhone ?? phoneConf) * 100) / 100;

  const paperConf = Math.round((engineOutput.confidenceVector?.paperStudyConfidence ?? 0) * 100) / 100;
  const screenConf = Math.round((engineOutput.confidenceVector?.screenStudyConfidence ?? 0) * 100) / 100;
  const thinkingConf = Math.round((engineOutput.confidenceVector?.thinkingConfidence ?? 0) * 100) / 100;

  const focusConf = Math.round((engineOutput.confidenceVector?.overallFocusConfidence ?? (engineOutput.score / 100)) * 100) / 100;
  const isVerified = tickData.isVerifiedFocus;
  const isTimerRunning = tickData.state !== 'IDLE' && tickData.state !== 'PAUSED' && isVerified;

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
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">AI Perception & Diagnostics HUD</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                aiRuntime === 'WebGPU'
                  ? 'bg-purple-950/60 border-purple-800/80 text-purple-300'
                  : 'bg-teal-950/60 border-teal-800/80 text-teal-300'
              }`}>
                AI Runtime: {aiRuntime}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                isVerified ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400' : 'bg-rose-950/60 border-rose-800/80 text-rose-400'
              }`}>
                Verified: {isVerified ? 'YES' : 'NO'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              State: <strong className="text-zinc-200">{engineOutput.state}</strong> • Focus Confidence: <strong className="text-emerald-400 font-mono">{focusConf}</strong> • Inference: <span className="font-mono text-zinc-300">{fps} FPS</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAnyModelDegradedOrFailed && (
            <span className="text-[11px] text-amber-400 flex items-center gap-1 bg-amber-950/50 px-2 py-1 rounded-md border border-amber-800/60">
              <AlertTriangle className="w-3 h-3" /> Degraded
            </span>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </div>
      </button>

      {/* Expanded Diagnostics Content */}
      {isOpen && (
        <div className="p-4 border-t border-zinc-800/80 space-y-4 text-xs font-sans animate-in fade-in duration-200">
          {/* Top Status Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Camera Health</span>
              <div className="flex items-center gap-1.5 mt-1">
                {camHealth === 'HEALTHY' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                <span className={`font-mono font-bold text-xs ${camHealth === 'HEALTHY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {camHealth}
                </span>
              </div>
            </div>

            <div className="bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Person Presence</span>
              <div className="flex items-center gap-1.5 mt-1">
                {personDetected ? <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> : <UserX className="w-3.5 h-3.5 text-rose-400" />}
                <span className={`font-mono font-bold text-xs ${personDetected ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {personDetected ? 'DETECTED' : 'ABSENT'}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">({personConf}%)</span>
              </div>
            </div>

            <div className="bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Verification Gate</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`font-mono font-bold text-xs ${isVerified ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isVerified ? 'PASS — COUNTING' : 'HALTED / PAUSED'}
                </span>
              </div>
            </div>

            <div className="bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Inference Performance</span>
              <div className="font-mono text-zinc-200 mt-1 text-xs">
                <span>{fps} FPS</span> • <span>{avgLatency} ms</span>
                {droppedFrames > 0 && <span className="text-[10px] text-amber-400 block">Dropped: {droppedFrames}</span>}
              </div>
            </div>
          </div>

          {/* Model Confidence Vectors */}
          <div>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block mb-2">
              Perception Signals & Evidence Vector
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
              <div className="bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                <span className="text-zinc-400">Face</span>
                <span className="text-teal-400 font-bold">{faceConf}</span>
              </div>
              <div className="bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                <span className="text-zinc-400">Pose</span>
                <span className="text-indigo-400 font-bold">{poseConf}</span>
              </div>
              <div className="bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                <span className="text-zinc-400">Hands</span>
                <span className="text-sky-400 font-bold">{handsConf}</span>
              </div>
              <div className="bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                <span className="text-zinc-400">Focus Conf</span>
                <span className="text-emerald-400 font-bold">{focusConf}</span>
              </div>
              <div className="bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                <span className="text-zinc-400">Paper Study</span>
                <span className="text-amber-400 font-bold">{paperConf}</span>
              </div>
              <div className="bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                <span className="text-zinc-400">Screen Study</span>
                <span className="text-cyan-400 font-bold">{screenConf}</span>
              </div>
              <div className="bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                <span className="text-zinc-400">Thinking</span>
                <span className="text-purple-400 font-bold">{thinkingConf}</span>
              </div>
              <div className="bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between">
                <span className="text-zinc-400">Phone Signal</span>
                <span className={`${phoneConf > 0.45 ? 'text-rose-400' : 'text-zinc-400'} font-bold`}>{phoneConf}</span>
              </div>
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
