import React from 'react';

export type JarvisOrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface JarvisOrbProps {
  state: JarvisOrbState;
  inputLevel?: number;
  reducedMotion?: boolean;
}

const particlePositions = [
  { x: '12%', y: '26%', delay: '0s' },
  { x: '82%', y: '18%', delay: '-1.4s' },
  { x: '91%', y: '56%', delay: '-2.2s' },
  { x: '70%', y: '88%', delay: '-0.8s' },
  { x: '24%', y: '84%', delay: '-2.9s' },
  { x: '5%', y: '60%', delay: '-1.8s' },
  { x: '42%', y: '4%', delay: '-1.1s' },
  { x: '52%', y: '96%', delay: '-2.5s' },
  { x: '95%', y: '38%', delay: '-0.5s' },
  { x: '4%', y: '42%', delay: '-3.1s' },
  { x: '78%', y: '5%', delay: '-1.9s' },
  { x: '30%', y: '96%', delay: '-2.7s' },
];

const JarvisOrb: React.FC<JarvisOrbProps> = ({
  state,
  inputLevel = 0,
  reducedMotion = false,
}) => {
  const level = Math.max(0, Math.min(1, inputLevel));
  const orbScale = 1 + level * 0.075;
  const glowOpacity = 0.58 + level * 0.38;

  return (
    <div
      className={`jarvis-orb-shell ${reducedMotion ? 'jarvis-orb-reduced-motion' : ''}`}
      data-state={state}
      role="img"
      aria-label={`J.A.R.V.I.S. animated energy orb, ${state} state`}
      style={{
        '--jarvis-mic-scale': orbScale,
        '--jarvis-glow-opacity': glowOpacity,
      } as React.CSSProperties}
    >
      <div className="jarvis-orb-aura" />
      <div className="jarvis-orb-halo jarvis-orb-halo-outer" />
      <div className="jarvis-orb-halo jarvis-orb-halo-inner" />

      <div className="jarvis-orb-ring jarvis-orb-ring-one">
        <span />
      </div>
      <div className="jarvis-orb-ring jarvis-orb-ring-two">
        <span />
      </div>
      <div className="jarvis-orb-ring jarvis-orb-ring-three">
        <span />
      </div>

      <div className="jarvis-orb-particles" aria-hidden="true">
        {particlePositions.map((particle, index) => (
          <i
            key={index}
            className={`jarvis-orb-particle jarvis-orb-particle-${index + 1}`}
            style={{
              left: particle.x,
              top: particle.y,
              animationDelay: particle.delay,
            }}
          />
        ))}
      </div>

      <div className="jarvis-orb-waves" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <svg className="jarvis-orb-sphere" viewBox="0 0 320 320" aria-hidden="true">
        <defs>
          <radialGradient id="jarvisSphereFill" cx="34%" cy="24%" r="80%">
            <stop offset="0%" stopColor="#ecfeff" stopOpacity="0.98" />
            <stop offset="16%" stopColor="#67e8f9" stopOpacity="0.96" />
            <stop offset="43%" stopColor="#2563eb" stopOpacity="0.94" />
            <stop offset="76%" stopColor="#312e81" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#080d2c" />
          </radialGradient>
          <radialGradient id="jarvisCoreFill" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="22%" stopColor="#a5f3fc" />
            <stop offset="48%" stopColor="#38bdf8" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="jarvisRim" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="38%" stopColor="#67e8f9" stopOpacity="0.75" />
            <stop offset="75%" stopColor="#818cf8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.9" />
          </linearGradient>
          <filter id="jarvisGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="jarvisSphereClip">
            <circle cx="160" cy="160" r="117" />
          </clipPath>
        </defs>

        <circle cx="160" cy="160" r="126" fill="#1d4ed8" opacity="0.13" filter="url(#jarvisGlow)" />
        <circle cx="160" cy="160" r="118" fill="url(#jarvisSphereFill)" stroke="url(#jarvisRim)" strokeWidth="2.2" />
        <g clipPath="url(#jarvisSphereClip)">
          <ellipse cx="112" cy="81" rx="68" ry="35" fill="#ffffff" opacity="0.18" transform="rotate(-26 112 81)" />
          <ellipse cx="210" cy="237" rx="78" ry="34" fill="#7c3aed" opacity="0.2" transform="rotate(-30 210 237)" />
          <path d="M34 166 C92 91 155 82 222 112 C273 136 291 194 259 242" fill="none" stroke="#cffafe" strokeOpacity="0.45" strokeWidth="1.5" />
          <path d="M53 215 C102 253 163 262 221 233 C264 211 284 175 267 139" fill="none" stroke="#a5b4fc" strokeOpacity="0.4" strokeWidth="2" />
          <path d="M80 51 C121 105 198 111 246 77" fill="none" stroke="#ffffff" strokeOpacity="0.23" strokeWidth="1.2" />
          <circle cx="160" cy="158" r="72" fill="url(#jarvisCoreFill)" filter="url(#jarvisGlow)" />
          <circle cx="160" cy="158" r="34" fill="#cffafe" opacity="0.2" />
          <path d="M160 74 C176 112 202 130 245 143 C205 157 177 184 160 241 C143 184 115 157 75 143 C118 130 144 112 160 74Z" fill="#e0f2fe" opacity="0.15" />
          <path d="M60 158 C96 142 115 120 128 92 M260 160 C224 176 205 198 192 226" fill="none" stroke="#ecfeff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
          <circle cx="119" cy="118" r="4" fill="#ffffff" opacity="0.8" />
          <circle cx="214" cy="188" r="3" fill="#a5f3fc" opacity="0.9" />
          <circle cx="177" cy="91" r="2.5" fill="#ffffff" opacity="0.8" />
        </g>
        <circle cx="160" cy="160" r="117" fill="none" stroke="#eff6ff" strokeOpacity="0.42" strokeWidth="1" />
        <path d="M84 83 A108 108 0 0 1 206 48" fill="none" stroke="#ffffff" strokeOpacity="0.72" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M235 245 A108 108 0 0 1 117 271" fill="none" stroke="#67e8f9" strokeOpacity="0.65" strokeWidth="2" strokeLinecap="round" />
      </svg>

      <div className="jarvis-orb-specular" />
      <div className="jarvis-orb-core-glint" />
    </div>
  );
};

export default JarvisOrb;
