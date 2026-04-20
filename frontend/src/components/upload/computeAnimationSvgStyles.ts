import {
  FLOW_PARTICLE_OFFSET_END,
  FLOW_PARTICLE_OFFSET_START,
} from '@/lib/animation/flowPulseTokens';

export function buildComputeAnimationStyles(uid: string) {
  return `
    @keyframes ca-particle-${uid} {
      0%   { stroke-dashoffset: ${FLOW_PARTICLE_OFFSET_START}; }
      100% { stroke-dashoffset: ${FLOW_PARTICLE_OFFSET_END}; }
    }

    @keyframes ca-rotate-cube-${uid} {
      0%   { transform: rotateX(-20deg) rotateY(0deg); }
      100% { transform: rotateX(-20deg) rotateY(360deg); }
    }

    .ca-cube-wrapper-${uid} {
      perspective: 1000px;
      width: 100px;
      height: 100px;
      transform-style: preserve-3d;
      transition: transform 0.5s ease;
    }

    .ca-cube-${uid} {
      width: 100%;
      height: 100%;
      position: relative;
      transform-style: preserve-3d;
      animation: ca-rotate-cube-${uid} 12s infinite linear;
    }

    .ca-face-${uid} {
      position: absolute;
      width: 100px;
      height: 100px;
      background: hsl(var(--muted-foreground) / 0.05);
      border: 1px solid hsl(var(--muted-foreground) / 0.2);
      box-shadow: inset 0 0 20px hsl(var(--muted-foreground) / 0.1);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
    }

    .ca-face-${uid}.front  { transform: rotateY(0deg) translateZ(50px); }
    .ca-face-${uid}.back   { transform: rotateY(180deg) translateZ(50px); }
    .ca-face-${uid}.left   { transform: rotateY(-90deg) translateZ(50px); }
    .ca-face-${uid}.right  { transform: rotateY(90deg) translateZ(50px); }
    .ca-face-${uid}.top    { transform: rotateX(90deg) translateZ(50px); }
    .ca-face-${uid}.bottom { transform: rotateX(-90deg) translateZ(50px); }

    .ca-core-${uid} {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 48px;
      height: 48px;
      transform: translate(-50%, -50%) scale(1);
      transform-style: preserve-3d;
      transition: opacity 0.4s ease, transform 0.4s ease;
    }

    .ca-core-${uid}.settled {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.2);
    }

    .ca-nucleus-${uid} {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 14px;
      height: 14px;
      background: radial-gradient(
        circle at 30% 30%,
        hsl(var(--background) / 0.95) 0%,
        hsl(var(--background) / 0.4) 18%,
        currentColor 55%,
        hsl(var(--foreground) / 0.35) 100%
      );
      border-radius: 50%;
      transform: translate(-50%, -50%);
      box-shadow:
        0 0 12px currentColor,
        inset 2px 2px 3px hsl(var(--background) / 0.55),
        inset -2px -2px 4px hsl(var(--foreground) / 0.22);
    }

    .ca-orbit-${uid} {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 1.5px solid currentColor;
      opacity: 0.35;
      border-radius: 50%;
      transform-style: preserve-3d;
    }

    @keyframes ca-precess-1-${uid} {
      0% { transform: rotateX(65deg) rotateY(0deg) rotateZ(0deg); }
      100% { transform: rotateX(65deg) rotateY(0deg) rotateZ(360deg); }
    }

    @keyframes ca-precess-2-${uid} {
      0% { transform: rotateX(65deg) rotateY(60deg) rotateZ(0deg); }
      100% { transform: rotateX(65deg) rotateY(60deg) rotateZ(-360deg); }
    }

    @keyframes ca-precess-3-${uid} {
      0% { transform: rotateX(65deg) rotateY(120deg) rotateZ(0deg); }
      100% { transform: rotateX(65deg) rotateY(120deg) rotateZ(360deg); }
    }

    .ca-orbit-1-${uid} { animation: ca-precess-1-${uid} 6.4s linear infinite; }
    .ca-orbit-2-${uid} { animation: ca-precess-2-${uid} 7.2s linear infinite; }
    .ca-orbit-3-${uid} { animation: ca-precess-3-${uid} 8s linear infinite; }

    .ca-electron-container-${uid} {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      transform-style: preserve-3d;
    }

    .ca-spin-1-${uid} { animation: ca-spin-z-${uid} 1.25s linear infinite; }
    .ca-spin-2-${uid} { animation: ca-spin-z-${uid} 1.5s linear infinite; }
    .ca-spin-3-${uid} { animation: ca-spin-z-${uid} 1.75s linear infinite; }

    @keyframes ca-spin-z-${uid} {
      0%   { transform: rotateZ(0deg); }
      100% { transform: rotateZ(360deg); }
    }

    .ca-electron-${uid} {
      position: absolute;
      top: -3px;
      left: 50%;
      width: 6px;
      height: 6px;
      background: currentColor;
      border-radius: 50%;
      transform: translateX(-50%);
      box-shadow: 0 0 8px currentColor;
    }

    .ca-electron-secondary-${uid} {
      top: calc(100% - 3px);
      opacity: 0.9;
      box-shadow: 0 0 6px currentColor;
    }

    .ca-edge-pulse-${uid} {
      animation: ca-cube-edge-${uid} 4s linear infinite;
    }

    @keyframes ca-cube-edge-${uid} {
      0%   { stroke-dashoffset: 400; }
      100% { stroke-dashoffset: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .ca-anim-${uid} * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `;
}
