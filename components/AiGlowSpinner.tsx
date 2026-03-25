"use client";

import { useId } from "react";

type AiGlowSpinnerProps = {
  size?: number;
};

export function AiGlowSpinner({ size = 96 }: AiGlowSpinnerProps) {
  const gradientId = `aiGlow-${useId().replace(/:/g, "")}`;

  return (
    <div className="ai-glow-spinner" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde047" stopOpacity="0.15" />
            <stop offset="40%" stopColor="#facc15" stopOpacity="0.55" />
            <stop offset="70%" stopColor="#f59e0b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fde047" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        <circle className="ai-spin-track" cx="60" cy="60" r="46" />
        <circle className="ai-spin-pulse" cx="60" cy="60" r="46" stroke={`url(#${gradientId})`} />
      </svg>

      <style jsx>{`
        .ai-glow-spinner {
          display: grid;
          place-items: center;
        }

        svg {
          width: 100%;
          height: 100%;
        }

        .ai-spin-track {
          fill: none;
          stroke: rgba(15, 23, 42, 0.08);
          stroke-width: 6;
          stroke-linecap: round;
        }

        :global(.dark) .ai-spin-track {
          stroke: rgba(255, 255, 255, 0.08);
        }

        .ai-spin-pulse {
          fill: none;
          stroke-width: 6;
          stroke-linecap: round;
          stroke-dasharray: 290;
          stroke-dashoffset: 220;
          filter: drop-shadow(0 0 10px rgba(248, 231, 28, 0.55));
          animation: ai-spin 1.4s linear infinite, ai-breathe 2.6s ease-in-out infinite;
          transform-origin: center;
        }

        @keyframes ai-spin {
          to {
            stroke-dashoffset: -70;
            transform: rotate(360deg);
          }
        }

        @keyframes ai-breathe {
          0%,
          100% {
            stroke-width: 5.6;
            filter: drop-shadow(0 0 8px rgba(248, 231, 28, 0.35));
          }
          50% {
            stroke-width: 7.2;
            filter: drop-shadow(0 0 18px rgba(248, 231, 28, 0.85));
          }
        }
      `}</style>
    </div>
  );
}
