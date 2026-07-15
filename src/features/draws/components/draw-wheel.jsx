"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimate } from "motion/react";

/**
 * The lottery wheel.
 *
 * An important honesty point: this animation does NOT decide anything. The winner
 * is determined on the server, cryptographically, before the wheel moves — the
 * spin is choreography that lands on a result already committed to. Anything else
 * would mean the browser could influence who wins.
 *
 * That also makes replay trivial: given the stored seed and candidate list, the
 * same spin re-runs identically. Which is why "video replay" needs no video.
 */

/** Distinct hues around the wheel; stable per index so a member keeps their colour. */
function sliceColor(i, total) {
  const hue = Math.round((360 / total) * i);
  return `oklch(0.68 0.16 ${hue})`;
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

export function DrawWheel({
  candidates,
  winnerIndex,
  spinning,
  onSpinComplete,
  size = 340,
}) {
  const [scope, animate] = useAnimate();
  const [settled, setSettled] = useState(false);
  const rotationRef = useRef(0);

  const n = candidates.length;
  const sliceAngle = 360 / n;

  const slices = useMemo(
    () =>
      candidates.map((c, i) => ({
        ...c,
        color: sliceColor(i, n),
        // Mid-angle of this slice, measured clockwise from 12 o'clock.
        midAngle: i * sliceAngle + sliceAngle / 2,
      })),
    [candidates, n, sliceAngle]
  );

  useEffect(() => {
    if (!spinning || winnerIndex == null) return;

    let cancelled = false;
    setSettled(false);

    // Land the winner's slice under the pointer at 12 o'clock, after several full
    // turns. Extra whole turns are what make it feel like a draw rather than a jump.
    const target = slices[winnerIndex].midAngle;
    const fullTurns = 6 + Math.floor(Math.random() * 3); // 6–8 turns
    const finalRotation = fullTurns * 360 - target;

    // Respect prefers-reduced-motion: show the result, skip the theatre.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 0.2 : 6 + Math.random() * 2; // 6–8 seconds

    animate(
      scope.current,
      { rotate: rotationRef.current + finalRotation },
      {
        duration,
        // Long, decelerating tail — the wheel should slow the way a real one does,
        // not ease uniformly.
        ease: reduced ? "linear" : [0.12, 0.66, 0.14, 1],
      }
    ).then(() => {
      if (cancelled) return;
      rotationRef.current = (rotationRef.current + finalRotation) % 360;
      setSettled(true);
      onSpinComplete?.();
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, winnerIndex]);

  const radius = size / 2;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      {/* Pointer at 12 o'clock */}
      <div
        className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1"
        aria-hidden="true"
      >
        <div className="border-x-[10px] border-t-[18px] border-x-transparent border-t-foreground drop-shadow" />
      </div>

      <motion.div
        ref={scope}
        className="relative size-full rounded-full shadow-2xl"
        style={{ transformOrigin: "50% 50%" }}
      >
        <svg viewBox={`0 0 ${size} ${size}`} className="size-full">
          <defs>
            <filter id="wheel-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {slices.map((s, i) => {
            const start = (i * sliceAngle - 90) * (Math.PI / 180);
            const end = ((i + 1) * sliceAngle - 90) * (Math.PI / 180);
            const x1 = radius + radius * Math.cos(start);
            const y1 = radius + radius * Math.sin(start);
            const x2 = radius + radius * Math.cos(end);
            const y2 = radius + radius * Math.sin(end);
            const largeArc = sliceAngle > 180 ? 1 : 0;

            const isWinner = settled && i === winnerIndex;

            // Label position, two-thirds out from the hub.
            const labelAngle = ((i * sliceAngle + sliceAngle / 2) - 90) * (Math.PI / 180);
            const lx = radius + radius * 0.66 * Math.cos(labelAngle);
            const ly = radius + radius * 0.66 * Math.sin(labelAngle);

            return (
              <g key={s.id}>
                <path
                  d={`M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                  fill={s.color}
                  stroke="white"
                  strokeWidth="2"
                  opacity={settled && !isWinner ? 0.35 : 1}
                  filter={isWinner ? "url(#wheel-glow)" : undefined}
                  style={{ transition: "opacity 400ms ease" }}
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={n > 12 ? 10 : 13}
                  fontWeight="600"
                  transform={`rotate(${s.midAngle} ${lx} ${ly})`}
                  style={{ pointerEvents: "none", textShadow: "0 1px 2px rgba(0,0,0,.4)" }}
                >
                  {initials(s.name)}
                </text>
              </g>
            );
          })}

          {/* Hub */}
          <circle cx={radius} cy={radius} r={radius * 0.16} fill="white" />
          <circle cx={radius} cy={radius} r={radius * 0.16} fill="none" stroke="rgba(0,0,0,.1)" />
        </svg>
      </motion.div>
    </div>
  );
}
