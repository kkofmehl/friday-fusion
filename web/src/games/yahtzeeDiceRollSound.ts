export const YAHTZEE_DICE_SOUND_STORAGE_KEY = "fridayFusion.yahtzeeDiceSound";

export function readStoredYahtzeeDiceSoundEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    return window.localStorage.getItem(YAHTZEE_DICE_SOUND_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function makeNoiseBuffer(context: AudioContext, durationSec: number): AudioBuffer {
  const frames = Math.max(1, Math.floor(context.sampleRate * durationSec));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** Layered short taps (dice hitting table / each other) instead of one long “smack”. */
export function playYahtzeeDiceRollSound(context: AudioContext): void {
  try {
    const t0 = context.currentTime;
    const tapCount = 14;
    const master = context.createGain();
    master.gain.setValueAtTime(0.32, t0);
    master.connect(context.destination);

    for (let k = 0; k < tapCount; k += 1) {
      const jitter = (Math.random() - 0.5) * 0.012;
      const start = t0 + k * 0.026 + jitter;
      const dur = 0.018 + Math.random() * 0.022;
      const centerHz = 380 + Math.random() * 1600;
      const buf = makeNoiseBuffer(context, dur);
      const src = context.createBufferSource();
      src.buffer = buf;
      const bp = context.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = centerHz;
      bp.Q.value = 1.1 + Math.random() * 2.5;
      const hp = context.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 180;
      hp.Q.value = 0.6;
      const g = context.createGain();
      const peak = 0.045 + Math.random() * 0.035;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(peak, start + dur * 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      src.connect(bp);
      bp.connect(hp);
      hp.connect(g);
      g.connect(master);
      src.start(start);
      src.stop(start + dur + 0.002);
    }

    const settle = t0 + 0.32 + Math.random() * 0.04;
    const settleDur = 0.05;
    const settleBuf = makeNoiseBuffer(context, settleDur);
    const settleSrc = context.createBufferSource();
    settleSrc.buffer = settleBuf;
    const settleBp = context.createBiquadFilter();
    settleBp.type = "bandpass";
    settleBp.frequency.value = 220 + Math.random() * 120;
    settleBp.Q.value = 0.45;
    const settleG = context.createGain();
    settleG.gain.setValueAtTime(0.0001, settle);
    settleG.gain.linearRampToValueAtTime(0.06, settle + 0.012);
    settleG.gain.exponentialRampToValueAtTime(0.0001, settle + settleDur);
    settleSrc.connect(settleBp);
    settleBp.connect(settleG);
    settleG.connect(master);
    settleSrc.start(settle);
    settleSrc.stop(settle + settleDur + 0.01);

    const stopAt = t0 + 0.55;
    master.gain.setValueAtTime(0.32, t0);
    master.gain.setValueAtTime(0.32, stopAt - 0.08);
    master.gain.linearRampToValueAtTime(0.0001, stopAt);
  } catch {
    // optional
  }
}
