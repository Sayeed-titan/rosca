/**
 * Winner celebration: confetti, fireworks and a short chime.
 *
 * Kept out of the component so the wheel stays about the draw, and so all of the
 * "is this browser going to let us" handling lives in one place.
 */
import confetti from "canvas-confetti";

/** Users who asked for less motion get none of this. */
function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function celebrate() {
  if (reducedMotion()) return;

  const colors = ["#10b981", "#14b8a6", "#22d3ee", "#f59e0b", "#f43f5e"];

  // Opening burst.
  confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 }, colors });

  // Fireworks from the sides, for a couple of seconds.
  const end = Date.now() + 2200;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

/**
 * A short celebratory arpeggio, synthesised rather than shipped as an audio file —
 * no asset to download, and it can't 404.
 *
 * Browsers block audio until the user has interacted with the page; since this only
 * ever fires after they click "Draw", that condition is already met. It still fails
 * silently if the browser refuses — a missing chime must never break the draw.
 */
export function playCelebrationSound() {
  if (reducedMotion()) return;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    // C major arpeggio, rising.
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.value = freq;

      const start = ctx.currentTime + i * 0.11;
      // Quick attack, gentle decay — a soft chime, not a beep.
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });

    // Release the audio context once it's done; leaking one per draw would
    // eventually exhaust the browser's limit.
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    // No sound is fine. A failed chime must never interrupt a draw.
  }
}
