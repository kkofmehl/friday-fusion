import { existsSync } from "node:fs";
import { rm, unlink } from "node:fs/promises";
import path from "node:path";

const profileUploadDirectory = (dataDirectory: string, username: string): string =>
  path.join(dataDirectory, "uploads", "profiles", username);

export const profileUploadDir = (dataDirectory: string, username: string): string =>
  profileUploadDirectory(dataDirectory, username);

export const resolveProfileStoredFile = (dataDirectory: string, username: string, fileId: string): string | null => {
  if (!fileId || fileId !== path.basename(fileId) || fileId.includes("..")) {
    return null;
  }
  const candidate = path.join(profileUploadDirectory(dataDirectory, username), fileId);
  return existsSync(candidate) ? candidate : null;
};

export const deleteProfileStoredFile = async (
  dataDirectory: string,
  username: string,
  fileId: string
): Promise<void> => {
  const filePath = resolveProfileStoredFile(dataDirectory, username, fileId);
  if (!filePath) {
    return;
  }
  try {
    await unlink(filePath);
  } catch {
    // ignore
  }
};

export const purgeAllProfileUploads = async (dataDirectory: string, username: string): Promise<void> => {
  try {
    await rm(profileUploadDirectory(dataDirectory, username), { recursive: true, force: true });
  } catch {
    // ignore
  }
};
