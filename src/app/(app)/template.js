"use client";

import { motion } from "motion/react";

/**
 * Unlike layout.js, a template remounts on every navigation — which is exactly
 * what a per-page enter animation needs. The sidebar (in layout.js) stays put;
 * only this wrapper re-triggers.
 */
export default function AppTemplate({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
