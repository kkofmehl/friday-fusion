import { afterEach, describe, expect, it } from "vitest";
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  applyAccent,
  readAccent,
  setAccent,
  writeAccent
} from "./accentTheme";

describe("accentTheme", () => {
  afterEach(() => {
    window.localStorage.removeItem(ACCENT_STORAGE_KEY);
    delete document.documentElement.dataset.accent;
  });

  it("defaults to orange when storage is missing", () => {
    expect(readAccent()).toBe(DEFAULT_ACCENT);
  });

  it("falls back to orange for invalid storage", () => {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, "neon");
    expect(readAccent()).toBe(DEFAULT_ACCENT);
  });

  it("round-trips a valid accent", () => {
    writeAccent("cyan");
    expect(readAccent()).toBe("cyan");
  });

  it("applyAccent sets dataset for non-orange accents", () => {
    applyAccent("purple");
    expect(document.documentElement.dataset.accent).toBe("purple");
  });

  it("applyAccent clears dataset for orange so :root defaults apply", () => {
    document.documentElement.dataset.accent = "blue";
    applyAccent("orange");
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });

  it("setAccent persists and applies", () => {
    setAccent("yellow");
    expect(window.localStorage.getItem(ACCENT_STORAGE_KEY)).toBe("yellow");
    expect(document.documentElement.dataset.accent).toBe("yellow");
  });
});
