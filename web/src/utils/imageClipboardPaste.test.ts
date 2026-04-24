import { describe, expect, it } from "vitest";
import type { ClipboardEvent } from "react";
import { imageFileFromClipboard } from "./imageClipboardPaste";

function mockPaste(items: Array<{ kind: string; type: string; file: File | null }>): ClipboardEvent {
  const list = items.map((entry) => ({
    kind: entry.kind,
    type: entry.type,
    getAsFile: () => entry.file
  }));
  return {
    clipboardData: {
      items: list as unknown as DataTransferItemList
    }
  } as ClipboardEvent;
}

describe("imageFileFromClipboard", () => {
  it("returns the first allowed image file", () => {
    const png = new File([new Uint8Array([1, 2])], "clip.png", { type: "image/png" });
    const event = mockPaste([{ kind: "file", type: "image/png", file: png }]);
    expect(imageFileFromClipboard(event)).toBe(png);
  });

  it("skips non-file and disallowed types", () => {
    const png = new File([], "x.png", { type: "image/png" });
    const event = mockPaste([
      { kind: "string", type: "text/plain", file: null },
      { kind: "file", type: "application/pdf", file: new File([], "a.pdf", { type: "application/pdf" }) },
      { kind: "file", type: "image/png", file: png }
    ]);
    expect(imageFileFromClipboard(event)).toBe(png);
  });

  it("returns null when there is no image", () => {
    expect(imageFileFromClipboard(mockPaste([]))).toBeNull();
    expect(
      imageFileFromClipboard(
        mockPaste([{ kind: "file", type: "text/plain", file: new File([], "t.txt", { type: "text/plain" }) }])
      )
    ).toBeNull();
  });
});
