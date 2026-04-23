"use client";

import { useId } from "react";

type AiGlowSpinnerProps = {
  size?: number;
};

export function AiGlowSpinner({ size = 96 }: AiGlowSpinnerProps) {
  useId();
  const normalizedSize = Math.max(4, size / 3);

  return (
    <div className="ai-glow-spinner" style={{ width: normalizedSize, height: normalizedSize }}>
      <svg viewBox="0 0 120 120">
        <circle className="ai-spin-track" cx="60" cy="60" r="46" />
        <circle className="ai-spin-pulse" cx="60" cy="60" r="46" />
      </svg>

      <style jsx>{`
        .ai-glow-spinner {
          display: grid;
          place-items: center;
          color: var(--tenant-primary);
        }

        svg {
          width: 100%;
          height: 100%;
        }

        .ai-spin-track {
          fill: none;
          stroke: var(--tenant-primary-muted);
          stroke-width: 6;
          stroke-linecap: round;
        }

        .ai-spin-pulse {
          fill: none;
          stroke: currentColor;
          stroke-width: 6;
          stroke-linecap: round;
          stroke-dasharray: 290;
          stroke-dashoffset: 220;
          animation: ai-spin 1.1s linear infinite;
          transform-origin: center;
        }

        @keyframes ai-spin {
          to {
            stroke-dashoffset: -70;
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
