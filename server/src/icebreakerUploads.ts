import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";

export const icebreakerQuestionUploadDir = (
  dataDir: string,
  sessionId: string,
  questionIndex: number
): string => path.join(dataDir, "uploads", "icebreaker", sessionId, String(questionIndex));

export const purgeIcebreakerQuestionUploads = async (
  dataDir: string,
  sessionId: string,
  questionIndex: number
): Promise<void> => {
  try {
    await rm(icebreakerQuestionUploadDir(dataDir, sessionId, questionIndex), { recursive: true, force: true });
  } catch {
    // ignore missing dir
  }
};

export const purgeAllIcebreakerSessionUploads = async (dataDir: string, sessionId: string): Promise<void> => {
  try {
    await rm(path.join(dataDir, "uploads", "icebreaker", sessionId), { recursive: true, force: true });
  } catch {
    // ignore
  }
};

/** Resolves a stored filename (single path segment) under this session's upload tree. */
export const resolveIcebreakerStoredFile = async (
  dataDir: string,
  sessionId: string,
  fileId: string
): Promise<string | null> => {
  if (!fileId || fileId !== path.basename(fileId) || fileId.includes("..")) {
    return null;
  }
  const root = path.join(dataDir, "uploads", "icebreaker", sessionId);
  if (!existsSync(root)) {
    return null;
  }
  const dirs = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const ent of dirs) {
    if (!ent.isDirectory()) {
      continue;
    }
    const candidate = path.join(root, ent.name, fileId);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};
