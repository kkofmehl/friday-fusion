import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders landing screen with create + join tabs", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      } as Response)
    );
    render(<App />);
    expect(screen.getByRole("heading", { name: "Friday Fusion" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Create session" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Join session" })).toBeDefined();
    expect(screen.getByLabelText("Your display name")).toBeDefined();
  });
});
