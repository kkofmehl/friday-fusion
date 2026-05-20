import { afterEach, describe, expect, it } from "vitest";
import {
  SESSION_AUTH_STORAGE_KEY,
  clearStoredSessionAuth,
  readStoredSessionAuth,
  writeStoredSessionAuth
} from "./sessionPersistence";

describe("sessionPersistence", () => {
  afterEach(() => {
    clearStoredSessionAuth();
  });

  it("round-trips valid session auth", () => {
    writeStoredSessionAuth({
      sessionId: "sess-1",
      participantId: "part-1",
      displayName: "Alice",
      joinCode: "BRIGHT-OTTER"
    });
    expect(readStoredSessionAuth()).toEqual({
      sessionId: "sess-1",
      participantId: "part-1",
      displayName: "Alice",
      joinCode: "BRIGHT-OTTER"
    });
  });

  it("returns null for missing or invalid storage", () => {
    expect(readStoredSessionAuth()).toBeNull();
    window.sessionStorage.setItem(SESSION_AUTH_STORAGE_KEY, "not-json");
    expect(readStoredSessionAuth()).toBeNull();
    window.sessionStorage.setItem(SESSION_AUTH_STORAGE_KEY, JSON.stringify({ sessionId: "s1" }));
    expect(readStoredSessionAuth()).toBeNull();
  });

  it("clears stored auth", () => {
    writeStoredSessionAuth({
      sessionId: "sess-1",
      participantId: "part-1",
      displayName: "Alice",
      joinCode: "BRIGHT-OTTER"
    });
    clearStoredSessionAuth();
    expect(readStoredSessionAuth()).toBeNull();
  });
});
