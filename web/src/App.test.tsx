import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "../../shared/contracts";
import { App } from "./App";
import { clearStoredSessionAuth, writeStoredSessionAuth } from "./sessionPersistence";

const buildSession = (): SessionState => ({
  sessionId: "s1",
  sessionName: "Game Night",
  joinCode: "BRIGHT-OTTER",
  participants: [{ id: "p1", displayName: "Alice", score: 0, isHost: true, isActive: true }],
  activeGame: null,
  gameState: null
});

describe("App", () => {
  afterEach(() => {
    clearStoredSessionAuth();
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
    expect(screen.getByRole("contentinfo")).toBeDefined();
    expect(screen.getByText(/© 2026 Kmofy Consulting/i)).toBeDefined();
  });

  it("rejoins a stored session after refresh", async () => {
    writeStoredSessionAuth({
      sessionId: "s1",
      participantId: "p1",
      displayName: "Alice",
      joinCode: "BRIGHT-OTTER"
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/active-sessions")) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (url.endsWith("/api/sessions/join") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            sessionId: "s1",
            participantId: "p1",
            state: buildSession()
          })
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Game Night")).toBeDefined();
    });
    expect(screen.queryByRole("heading", { name: "Friday Fusion" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/sessions/join"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ joinCode: "BRIGHT-OTTER", displayName: "Alice" })
      })
    );
  });
});
