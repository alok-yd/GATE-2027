import React, { useEffect } from 'react';
import { AlertTriangle, AudioLines, Mic, MicOff, Power, X } from 'lucide-react';
import JarvisOrb, { type JarvisOrbState } from './JarvisOrb';

const krishnaDivineBackground = `${import.meta.env.BASE_URL}jarvis-krishna-divine-background.webp`;

export type JarvisVoiceStatus =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'unsupported'
  | 'error';

interface JarvisOverlayProps {
  open: boolean;
  status: JarvisVoiceStatus;
  sessionActive: boolean;
  inputLevel: number;
  errorMessage: string;
  reducedMotion: boolean;
  onMinimize: () => void;
  onEndConversation: () => void;
  onStartConversation: () => void;
}

const resolveOrbState = (status: JarvisVoiceStatus): JarvisOrbState => {
  if (status === 'unsupported' || status === 'error') return 'error';
  return status;
};

const statusText: Record<JarvisVoiceStatus, string> = {
  idle: 'STANDBY',
  listening: 'LISTENING...',
  thinking: 'PROCESSING...',
  speaking: 'SPEAKING...',
  unsupported: 'VOICE INPUT UNAVAILABLE',
  error: 'CONNECTION / MICROPHONE ISSUE',
};

const statusCaption: Record<JarvisVoiceStatus, string> = {
  idle: 'J.A.R.V.I.S. is standing by',
  listening: 'Speak naturally. I am listening.',
  thinking: 'Analysing your request and ACHIEVER context',
  speaking: 'Delivering your response',
  unsupported: 'This browser does not support speech recognition',
  error: 'Check microphone permission or reconnect and retry',
};

const JarvisOverlay: React.FC<JarvisOverlayProps> = ({
  open,
  status,
  sessionActive,
  inputLevel,
  errorMessage,
  reducedMotion,
  onMinimize,
  onEndConversation,
  onStartConversation,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onMinimize();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onMinimize]);

  if (!open) return null;

  const isListening = status === 'listening';
  const isCapturing = sessionActive && isListening;
  const isError = status === 'error' || status === 'unsupported';

  return (
    <div role="dialog" aria-modal="true" aria-label="J.A.R.V.I.S. voice assistant" className="jarvis-overlay fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-4 py-6 sm:px-8">
      <style>{`
        .jarvis-overlay {
          background:
            radial-gradient(ellipse at 50% 45%, rgba(30, 64, 175, .34) 0%, rgba(9, 14, 43, .78) 42%, rgba(2, 6, 23, .97) 100%),
            #020617;
          color: #e0f2fe;
          isolation: isolate;
        }
        .jarvis-overlay::before,
        .jarvis-overlay::after {
          content: "";
          position: absolute;
          pointer-events: none;
          inset: -35%;
          z-index: -1;
          background-image:
            radial-gradient(1px 1px at 12% 24%, rgba(165,243,252,.85) 50%, transparent 100%),
            radial-gradient(1.5px 1.5px at 76% 31%, rgba(196,181,253,.75) 50%, transparent 100%),
            radial-gradient(1px 1px at 40% 76%, rgba(103,232,249,.7) 50%, transparent 100%),
            radial-gradient(1px 1px at 87% 81%, rgba(255,255,255,.55) 50%, transparent 100%);
          background-size: 290px 250px, 340px 300px, 260px 320px, 380px 360px;
          opacity: .4;
          animation: jarvis-star-drift 42s linear infinite;
        }
        .jarvis-overlay::after {
          opacity: .2;
          transform: rotate(28deg) scale(1.2);
          animation-duration: 58s;
          animation-direction: reverse;
        }
        .jarvis-divine-background {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          opacity: .10;
          background-repeat: no-repeat;
          background-position: center center;
          background-size: cover;
          filter: saturate(.78) contrast(1.06) brightness(.92);
        }
        .jarvis-divine-vignette {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background:
            radial-gradient(ellipse at center, rgba(9, 14, 43, .05) 0%, rgba(2, 6, 23, .22) 100%),
            linear-gradient(90deg, rgba(2, 6, 23, .12), transparent 28%, transparent 72%, rgba(2, 6, 23, .12));
        }
        .jarvis-glass {
          background: linear-gradient(145deg, rgba(15, 23, 55, .78), rgba(8, 15, 39, .54));
          border: 1px solid rgba(125, 211, 252, .2);
          box-shadow: 0 20px 70px rgba(2, 6, 23, .45), inset 0 1px 0 rgba(255,255,255,.07);
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
        }
        .jarvis-orb-stage {
          position: relative;
          width: min(76vw, 450px);
          height: min(76vw, 450px);
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          filter: drop-shadow(0 28px 70px rgba(37,99,235,.25));
        }
        .jarvis-orb-shell {
          --jarvis-mic-scale: 1;
          --jarvis-glow-opacity: .65;
          position: relative;
          width: 78%;
          height: 78%;
          display: grid;
          place-items: center;
          transform: translateZ(0);
          animation: jarvis-orb-float 6.5s ease-in-out infinite;
          contain: layout paint;
        }
        .jarvis-orb-aura {
          position: absolute;
          inset: 2%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(34,211,238,.32), rgba(79,70,229,.12) 47%, transparent 73%);
          filter: blur(16px);
          opacity: var(--jarvis-glow-opacity);
          transform: scale(var(--jarvis-mic-scale));
          transition: opacity .2s ease, transform .18s ease;
        }
        .jarvis-orb-halo {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
        }
        .jarvis-orb-halo-outer {
          inset: -11%;
          border: 1px solid rgba(103,232,249,.19);
          box-shadow: 0 0 28px rgba(34,211,238,.12), inset 0 0 20px rgba(99,102,241,.1);
          animation: jarvis-halo-breathe 5s ease-in-out infinite;
        }
        .jarvis-orb-halo-inner {
          inset: -4%;
          border: 1px solid rgba(196,181,253,.25);
          box-shadow: 0 0 22px rgba(129,140,248,.18);
          animation: jarvis-halo-breathe 3.8s ease-in-out infinite reverse;
        }
        .jarvis-orb-ring {
          position: absolute;
          border: 1px solid rgba(103,232,249,.56);
          border-radius: 50%;
          pointer-events: none;
          box-shadow: 0 0 15px rgba(34,211,238,.18);
        }
        .jarvis-orb-ring span {
          position: absolute;
          left: 15%;
          top: 10%;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #cffafe;
          box-shadow: 0 0 8px #67e8f9, 0 0 22px #22d3ee;
        }
        .jarvis-orb-ring-one {
          inset: -13% -5%;
          transform: rotateX(68deg) rotateZ(-18deg);
          animation: jarvis-spin 18s linear infinite;
        }
        .jarvis-orb-ring-two {
          inset: -7% -16%;
          border-color: rgba(167,139,250,.58);
          transform: rotateX(70deg) rotateZ(62deg);
          animation: jarvis-spin-reverse 23s linear infinite;
        }
        .jarvis-orb-ring-three {
          inset: -19% 4%;
          border-color: rgba(56,189,248,.3);
          transform: rotateY(68deg) rotateZ(14deg);
          animation: jarvis-spin 30s linear infinite;
        }
        .jarvis-orb-sphere {
          z-index: 2;
          width: 100%;
          height: 100%;
          overflow: visible;
          filter: drop-shadow(0 0 22px rgba(56,189,248,.42));
          transform: scale(var(--jarvis-mic-scale));
          transition: transform .16s ease-out, filter .3s ease;
        }
        .jarvis-orb-specular {
          position: absolute;
          z-index: 3;
          top: 16%;
          left: 25%;
          width: 28%;
          height: 10%;
          border-radius: 50%;
          background: rgba(255,255,255,.45);
          filter: blur(12px);
          transform: rotate(-28deg);
          pointer-events: none;
        }
        .jarvis-orb-core-glint {
          position: absolute;
          z-index: 4;
          width: 18%;
          height: 18%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,.85), rgba(103,232,249,.45) 28%, transparent 72%);
          filter: blur(2px);
          animation: jarvis-core-pulse 4s ease-in-out infinite;
          pointer-events: none;
        }
        .jarvis-orb-particles {
          position: absolute;
          inset: -22%;
          pointer-events: none;
        }
        .jarvis-orb-particle {
          position: absolute;
          display: block;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #a5f3fc;
          box-shadow: 0 0 9px 2px rgba(34,211,238,.7);
          animation: jarvis-particle-drift 5.5s ease-in-out infinite;
        }
        .jarvis-orb-particle:nth-child(3n) {
          width: 3px;
          height: 3px;
          background: #c4b5fd;
          box-shadow: 0 0 9px 2px rgba(167,139,250,.65);
        }
        .jarvis-orb-particle:nth-child(4n) { width: 2px; height: 2px; opacity: .65; }
        .jarvis-orb-waves {
          position: absolute;
          inset: -4%;
          border-radius: 50%;
          pointer-events: none;
        }
        .jarvis-orb-waves span {
          position: absolute;
          inset: 0;
          border: 1px solid rgba(103,232,249,.55);
          border-radius: 50%;
          opacity: 0;
        }
        .jarvis-orb-shell[data-state="listening"] .jarvis-orb-waves span {
          animation: jarvis-wave 2.1s ease-out infinite;
        }
        .jarvis-orb-shell[data-state="listening"] .jarvis-orb-waves span:nth-child(2) { animation-delay: .7s; }
        .jarvis-orb-shell[data-state="listening"] .jarvis-orb-waves span:nth-child(3) { animation-delay: 1.4s; }
        .jarvis-orb-shell[data-state="listening"] .jarvis-orb-core-glint {
          animation-duration: 1.25s;
        }
        .jarvis-orb-shell[data-state="thinking"] .jarvis-orb-ring-one { animation-duration: 4s; }
        .jarvis-orb-shell[data-state="thinking"] .jarvis-orb-ring-two { animation-duration: 5.5s; }
        .jarvis-orb-shell[data-state="thinking"] .jarvis-orb-particle { animation-duration: 2.3s; }
        .jarvis-orb-shell[data-state="speaking"] .jarvis-orb-core-glint {
          animation-duration: .8s;
        }
        .jarvis-orb-shell[data-state="speaking"] .jarvis-orb-aura {
          opacity: .95;
          animation: jarvis-speaking-glow 1.15s ease-in-out infinite;
        }
        .jarvis-orb-shell[data-state="error"] .jarvis-orb-aura {
          background: radial-gradient(circle, rgba(251,113,133,.3), rgba(99,102,241,.12) 48%, transparent 75%);
        }
        .jarvis-orb-shell[data-state="error"] .jarvis-orb-ring { border-color: rgba(251,113,133,.4); }
        .jarvis-orb-reduced-motion,
        .jarvis-orb-reduced-motion * {
          animation: none !important;
          transition: none !important;
        }
        @keyframes jarvis-orb-float {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50% { transform: translateY(-13px) rotate(1deg); }
        }
        @keyframes jarvis-halo-breathe {
          0%, 100% { transform: scale(.98); opacity: .55; }
          50% { transform: scale(1.04); opacity: 1; }
        }
        @keyframes jarvis-spin { to { rotate: 360deg; } }
        @keyframes jarvis-spin-reverse { to { rotate: -360deg; } }
        @keyframes jarvis-particle-drift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(.75); opacity: .35; }
          50% { transform: translate3d(6px, -12px, 0) scale(1.35); opacity: 1; }
        }
        @keyframes jarvis-wave {
          0% { transform: scale(.92); opacity: .7; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes jarvis-core-pulse {
          0%, 100% { opacity: .48; transform: scale(.8); }
          50% { opacity: 1; transform: scale(1.25); }
        }
        @keyframes jarvis-speaking-glow {
          0%, 100% { transform: scale(1); opacity: .68; }
          50% { transform: scale(1.12); opacity: 1; }
        }
        @keyframes jarvis-star-drift {
          from { transform: translate3d(0,0,0); }
          to { transform: translate3d(-70px,-110px,0); }
        }
        @media (max-width: 640px) {
          .jarvis-orb-stage { width: min(88vw, 390px); height: min(88vw, 390px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .jarvis-overlay *, .jarvis-overlay::before, .jarvis-overlay::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      <div
        aria-hidden="true"
        className="jarvis-divine-background"
        style={{ backgroundImage: `url("${krishnaDivineBackground}")` }}
      />
      <div aria-hidden="true" className="jarvis-divine-vignette" />

      <div className="relative z-10 flex h-full w-full max-w-5xl flex-col">
        <header className="jarvis-glass flex items-center justify-between rounded-2xl px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.18)]">
              <AudioLines className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold tracking-[0.2em] text-white">J.A.R.V.I.S.</p>
              <p className="text-[10px] tracking-wide text-cyan-100/65">PERSONAL AI LEARNING &amp; INTELLIGENCE</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Minimize J.A.R.V.I.S. overlay"
            title="Minimize — voice session continues"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-200/40 hover:bg-cyan-300/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <main className="flex min-h-0 flex-1 flex-col items-center justify-center py-4 sm:py-7">
          <div className="mb-1 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 text-[9px] font-semibold tracking-[0.28em] text-cyan-100/65">
              <span className={`h-1.5 w-1.5 rounded-full ${isCapturing ? 'animate-pulse bg-emerald-400 shadow-[0_0_10px_#34d399]' : isError ? 'bg-rose-400' : 'bg-cyan-200/70'}`} />
              {isCapturing ? 'MICROPHONE ACTIVE' : sessionActive ? 'MICROPHONE PAUSED DURING RESPONSE' : 'MICROPHONE OFF'}
            </div>
          </div>

          <div className="jarvis-orb-stage" aria-live="off">
            <JarvisOrb state={resolveOrbState(status)} inputLevel={isListening ? inputLevel : 0} reducedMotion={reducedMotion} />
          </div>

          <div className="mt-0 text-center">
            <p className={`text-xs font-bold tracking-[0.38em] ${isError ? 'text-rose-300' : status === 'thinking' ? 'text-violet-200' : status === 'speaking' ? 'text-cyan-100' : 'text-cyan-200'}`}>
              {statusText[status]}
            </p>
            <p className="mt-2 min-h-5 text-xs text-slate-300/70">
              {errorMessage || statusCaption[status]}
            </p>
            {(isError || Boolean(errorMessage)) && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-1.5 text-[10px] text-rose-100">
                <AlertTriangle className="h-3.5 w-3.5" />
                {isError ? 'Voice service needs attention' : 'AI connection issue'}
              </div>
            )}
          </div>
        </main>

        <footer className="jarvis-glass flex flex-col items-center gap-4 rounded-2xl px-4 py-4 sm:flex-row sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full border ${isCapturing ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200' : 'border-slate-400/20 bg-white/5 text-slate-300/70'}`}>
              {isCapturing ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </span>
            <div>
              <p className="text-[11px] font-semibold text-white">
                {isCapturing
                  ? 'Microphone is listening'
                  : status === 'thinking' || status === 'speaking'
                    ? 'Microphone pauses while I respond'
                    : isError
                      ? 'Microphone or voice service needs attention'
                      : 'Voice session inactive'}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                {reducedMotion
                  ? 'Reduced motion enabled'
                  : 'Input level is analysed locally while listening'}
              </p>
            </div>
          </div>

          {sessionActive ? (
            <button
              type="button"
              onClick={onEndConversation}
              className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-full border border-rose-300/25 bg-rose-400/10 px-5 py-2.5 text-xs font-bold tracking-wide text-rose-100 transition hover:border-rose-200/50 hover:bg-rose-400/20"
            >
              <Power className="h-4 w-4" />
              End conversation
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartConversation}
              className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-full border border-cyan-200/35 bg-cyan-300/10 px-5 py-2.5 text-xs font-bold tracking-wide text-cyan-50 shadow-[0_0_25px_rgba(34,211,238,0.12)] transition hover:bg-cyan-300/20"
            >
              <Mic className="h-4 w-4" />
              {isError ? 'Retry voice connection' : 'Start conversation'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default JarvisOverlay;
