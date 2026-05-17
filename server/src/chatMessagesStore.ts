import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { SessionChatMessage } from "../../shared/contracts";

const CHAT_SUBDIR = "chat";
const CHAT_FILENAME = "messages.json";
const MAX_MESSAGES_PER_SESSION = 200;

const chatSessionDir = (dataDirectory: string, sessionId: string): string =>
  path.join(dataDirectory, "uploads", CHAT_SUBDIR, sessionId);

const chatMessagesPath = (dataDirectory: string, sessionId: string): string =>
  path.join(chatSessionDir(dataDirectory, sessionId), CHAT_FILENAME);

const readMessagesUnchecked = async (dataDirectory: string, sessionId: string): Promise<SessionChatMessage[]> => {
  try {
    const raw = await readFile(chatMessagesPath(dataDirectory, sessionId), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SessionChatMessage[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

export const readSessionChatMessages = async (dataDirectory: string, sessionId: string): Promise<SessionChatMessage[]> =>
  readMessagesUnchecked(dataDirectory, sessionId);

export const appendSessionChatMessage = async (
  dataDirectory: string,
  sessionId: string,
  message: SessionChatMessage
): Promise<void> => {
  const current = await readMessagesUnchecked(dataDirectory, sessionId);
  current.push(message);
  const trimmed = current.slice(-MAX_MESSAGES_PER_SESSION);
  await mkdir(chatSessionDir(dataDirectory, sessionId), { recursive: true });
  await writeFile(chatMessagesPath(dataDirectory, sessionId), JSON.stringify(trimmed), "utf8");
};

export const purgeSessionChatMessages = async (dataDirectory: string, sessionId: string): Promise<void> => {
  await rm(chatSessionDir(dataDirectory, sessionId), { recursive: true, force: true });
};
