import { existsSync } from "node:fs";
import { rm, unlink } from "node:fs/promises";
import path from "node:path";

export const captionThisSessionUploadDir = (dataDir: string, sessionId: string): string =>
  path.join(dataDir, "uploads", "caption-this", sessionId);

export const purgeAllCaptionThisSessionUploads = async (dataDir: string, sessionId: string): Promise<void> => {
  try {
    await rm(captionThisSessionUploadDir(dataDir, sessionId), { recursive: true, force: true });
  } catch {
    // ignore
  }
};

/** Resolves a stored filename (single path segment) under this session's caption-this folder. */
export const resolveCaptionThisStoredFile = (dataDir: string, sessionId: string, fileId: string): string | null => {
  if (!fileId || fileId !== path.basename(fileId) || fileId.includes("..")) {
    return null;
  }
  const candidate = path.join(captionThisSessionUploadDir(dataDir, sessionId), fileId);
  return existsSync(candidate) ? candidate : null;
};

export const deleteCaptionThisStoredFile = async (
  dataDir: string,
  sessionId: string,
  fileId: string
): Promise<void> => {
  const abs = resolveCaptionThisStoredFile(dataDir, sessionId, fileId);
  if (!abs) {
    return;
  }
  try {
    await unlink(abs);
  } catch {
    // ignore
  }
};
