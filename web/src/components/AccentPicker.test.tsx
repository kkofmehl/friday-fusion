import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ACCENT_STORAGE_KEY, applyAccent, writeAccent } from "../theme/accentTheme";
import { AccentPicker } from "./AccentPicker";

describe("AccentPicker", () => {
  afterEach(() => {
    window.localStorage.removeItem(ACCENT_STORAGE_KEY);
    delete document.documentElement.dataset.accent;
  });

  it("marks the stored accent as pressed", () => {
    writeAccent("purple");
    applyAccent("purple");
    render(<AccentPicker />);
    expect(screen.getByRole("button", { name: "Purple" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Orange" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("switches accent on click", () => {
    render(<AccentPicker />);
    fireEvent.click(screen.getByRole("button", { name: "Green" }));
    expect(document.documentElement.dataset.accent).toBe("green");
    expect(window.localStorage.getItem(ACCENT_STORAGE_KEY)).toBe("green");
  });
});
