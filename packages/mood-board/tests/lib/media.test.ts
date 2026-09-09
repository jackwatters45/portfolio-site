import { describe, expect, it } from "vitest";

import {
  hasValidMediaMagic,
  MediaByteLengthSchema,
  normalizeMediaMimeType,
  parseMediaRange,
} from "../../src/lib/media";

describe("managed media validation", () => {
  it("matches allowlisted MIME types to file signatures", () => {
    expect(
      hasValidMediaMagic(
        "image",
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe(true);
    expect(
      hasValidMediaMagic("audio", "audio/mpeg", new TextEncoder().encode("ID3\u0004\u0000")),
    ).toBe(true);
    expect(hasValidMediaMagic("image", "image/png", new TextEncoder().encode("<script>"))).toBe(
      false,
    );
    expect(normalizeMediaMimeType("image", "image/svg+xml")).toBeNull();
    expect(normalizeMediaMimeType("audio", "audio/mpeg; charset=binary")).toBe("audio/mpeg");
  });

  it("parses single byte ranges and rejects invalid or multiple ranges", () => {
    const size = MediaByteLengthSchema.make(100);
    expect(parseMediaRange(undefined, size)).toEqual({ start: 0, end: 99 });
    expect(parseMediaRange("bytes=10-19", size)).toEqual({ start: 10, end: 19 });
    expect(parseMediaRange("bytes=90-", size)).toEqual({ start: 90, end: 99 });
    expect(parseMediaRange("bytes=-10", size)).toEqual({ start: 90, end: 99 });
    expect(parseMediaRange("bytes=90-150", size)).toEqual({ start: 90, end: 99 });
    expect(parseMediaRange("bytes=100-101", size)).toBeNull();
    expect(parseMediaRange("bytes=0-1,4-5", size)).toBeNull();
  });
});
