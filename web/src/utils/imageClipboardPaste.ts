import type { ClipboardEvent } from "react";

const ALLOWED_PASTE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** First allowed image file from a paste event, or null. */
export function imageFileFromClipboard(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items?.length) {
    return null;
  }
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || item.kind !== "file") {
      continue;
    }
    if (!item.type || !ALLOWED_PASTE_IMAGE_TYPES.has(item.type)) {
      continue;
    }
    const file = item.getAsFile();
    if (file) {
      return file;
    }
  }
  return null;
}
