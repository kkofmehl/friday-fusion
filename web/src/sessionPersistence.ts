export const SESSION_AUTH_STORAGE_KEY = "friday-fusion.session-auth";

export type StoredSessionAuth = {
  sessionId: string;
  participantId: string;
  displayName: string;
  joinCode: string;
};

function isStoredSessionAuth(value: unknown): value is StoredSessionAuth {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.sessionId === "string" &&
    typeof record.participantId === "string" &&
    typeof record.displayName === "string" &&
    typeof record.joinCode === "string" &&
    record.sessionId.length > 0 &&
    record.participantId.length > 0 &&
    record.displayName.length > 0 &&
    record.joinCode.length > 0
  );
}

export function readStoredSessionAuth(): StoredSessionAuth | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isStoredSessionAuth(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredSessionAuth(auth: StoredSessionAuth): void {
  window.sessionStorage.setItem(SESSION_AUTH_STORAGE_KEY, JSON.stringify(auth));
}

export function clearStoredSessionAuth(): void {
  window.sessionStorage.removeItem(SESSION_AUTH_STORAGE_KEY);
}
