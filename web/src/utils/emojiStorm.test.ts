import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_CHAT_EMOJI_PACK, startEmojiStorm } from "./emojiStorm";

describe("startEmojiStorm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("spawns storm bursts from the emoji pack for three seconds", () => {
    const spawned: string[] = [];
    const removed: string[] = [];
    const stop = startEmojiStorm(
      "Alice",
      (burst) => {
        spawned.push(burst.emoji);
        expect(burst.storm).toBe(true);
        expect(burst.displayName).toBe("Alice");
        expect(SESSION_CHAT_EMOJI_PACK).toContain(burst.emoji);
      },
      (id) => removed.push(id),
      { durationMs: 300, intervalMs: 100, burstLifetimeMs: 200 }
    );

    vi.advanceTimersByTime(300);
    expect(spawned.length).toBeGreaterThan(0);
    stop();
    vi.advanceTimersByTime(200);
    expect(removed.length).toBe(spawned.length);
  });
});
