/** Short beep + vibration for scan confirmations. Call unlockAudio() from a user gesture first (iOS). */

let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    ctx = null;
  }
}

export function beep(frequency = 880, durationMs = 90) {
  navigator.vibrate?.(60);
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000);
}
