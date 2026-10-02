import { afterEach, describe, expect, it, vi } from "vitest";
import { animateNumber, prefersReducedMotion } from "./animate";

describe("animateNumber", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("steps from the old value to the new value", () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const cancel = animateNumber((value) => seen.push(value), 10, 12, 20);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(20);
    expect(seen).toEqual([11]);
    vi.advanceTimersByTime(20);
    expect(seen).toEqual([11, 12]);
    cancel();
  });

  it("jumps to the final value when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(prefersReducedMotion()).toBe(true);
    const seen: number[] = [];
    animateNumber((value) => seen.push(value), 10, 12);
    expect(seen).toEqual([12]);
  });
});
