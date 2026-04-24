import { existsSync } from "node:fs";
import { rm, unlink } from "node:fs/promises";
import path from "node:path";

export const guessTheImageSessionUploadDir = (dataDir: string, sessionId: string): string =>
  path.join(dataDir, "uploads", "guess-the-image", sessionId);

export const purgeAllGuessTheImageSessionUploads = async (dataDir: string, sessionId: string): Promise<void> => {
  try {
    await rm(guessTheImageSessionUploadDir(dataDir, sessionId), { recursive: true, force: true });
  } catch {
    // ignore
  }
};

/** Resolves a stored filename (single path segment) under this session's guess-the-image folder. */
export const resolveGuessTheImageStoredFile = (
  dataDir: string,
  sessionId: string,
  fileId: string
): string | null => {
  if (!fileId || fileId !== path.basename(fileId) || fileId.includes("..")) {
    return null;
  }
  const candidate = path.join(guessTheImageSessionUploadDir(dataDir, sessionId), fileId);
  return existsSync(candidate) ? candidate : null;
};

/** Removes one stored image file for a session (no-op if missing or invalid). */
export const deleteGuessTheImageStoredFile = async (
  dataDir: string,
  sessionId: string,
  fileId: string
): Promise<void> => {
  const abs = resolveGuessTheImageStoredFile(dataDir, sessionId, fileId);
  if (!abs) {
    return;
  }
  try {
    await unlink(abs);
  } catch {
    // ignore
  }
};
