import type { EmojiReactionBurst } from "../components/EmojiReactionsOverlay";

export const SESSION_CHAT_EMOJI_PACK = ["😀", "😂", "😎", "🔥", "👏", "💀", "🎉", "😈"] as const;

export const EMOJI_STORM_DURATION_MS = 3000;
const EMOJI_STORM_INTERVAL_MS = 80;
const EMOJI_STORM_BURST_LIFETIME_MS = 1800;

type StartEmojiStormOptions = {
  durationMs?: number;
  intervalMs?: number;
  burstLifetimeMs?: number;
};

export function startEmojiStorm(
  displayName: string,
  addBurst: (burst: EmojiReactionBurst) => void,
  removeBurst: (id: string) => void,
  options: StartEmojiStormOptions = {}
): () => void {
  const durationMs = options.durationMs ?? EMOJI_STORM_DURATION_MS;
  const intervalMs = options.intervalMs ?? EMOJI_STORM_INTERVAL_MS;
  const burstLifetimeMs = options.burstLifetimeMs ?? EMOJI_STORM_BURST_LIFETIME_MS;
  let burstCounter = 0;
  const timeouts = new Set<ReturnType<typeof setTimeout>>();

  const interval = setInterval(() => {
    const count = 2 + Math.floor(Math.random() * 4);
    for (let index = 0; index < count; index += 1) {
      const emoji = SESSION_CHAT_EMOJI_PACK[Math.floor(Math.random() * SESSION_CHAT_EMOJI_PACK.length)]!;
      const burst: EmojiReactionBurst = {
        id: `storm-${burstCounter}-${Math.random().toString(36).slice(2, 9)}`,
        emoji,
        displayName,
        lanePercent: Math.floor(5 + Math.random() * 90),
        storm: true
      };
      burstCounter += 1;
      addBurst(burst);
      const timeout = setTimeout(() => {
        timeouts.delete(timeout);
        removeBurst(burst.id);
      }, burstLifetimeMs);
      timeouts.add(timeout);
    }
  }, intervalMs);

  const stopTimer = setTimeout(() => {
    clearInterval(interval);
  }, durationMs);
  timeouts.add(stopTimer);

  return () => {
    clearInterval(interval);
    clearTimeout(stopTimer);
    timeouts.forEach((timeout) => clearTimeout(timeout));
    timeouts.clear();
  };
}
