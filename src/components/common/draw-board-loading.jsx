"use client";

import { motion } from "motion/react";
import { Dices } from "lucide-react";

/**
 * Loading state for the draws route. A generic table skeleton undersells the
 * one page in the app with an actual wheel on it — this mirrors that identity
 * instead: a ring of slices spinning around a center hub, same brand hues the
 * real wheel uses.
 */
const SLICES = 8;

export function DrawBoardLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24">
      <div className="relative size-48">
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 2.4, ease: "linear", repeat: Infinity }}
        >
          {Array.from({ length: SLICES }).map((_, i) => {
            const hue = Math.round((360 / SLICES) * i);
            const angle = (360 / SLICES) * i;
            return (
              <span
                key={i}
                className="absolute top-1/2 left-1/2 h-1/2 w-1.5 origin-top -translate-x-1/2 rounded-full"
                style={{
                  transform: `rotate(${angle}deg)`,
                  background: `oklch(0.68 0.16 ${hue})`,
                }}
              />
            );
          })}
        </motion.div>

        <div className="glass absolute inset-[30%] flex items-center justify-center rounded-full">
          <motion.div
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Dices className="text-primary size-7" aria-hidden="true" />
          </motion.div>
        </div>
      </div>

      <div className="space-y-1 text-center">
        <p className="text-sm font-medium">Preparing the draw board…</p>
        <p className="text-muted-foreground text-xs">Loading committees and cycle status</p>
      </div>
    </div>
  );
}
