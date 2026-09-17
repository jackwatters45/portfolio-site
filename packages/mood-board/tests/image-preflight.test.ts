import { describe, expect, it } from "vitest";

import {
  MAX_SOURCE_IMAGE_BYTES,
  preflightImageBytes,
  preflightImageFile,
  validateImageLimits,
} from "../src/client/media/image-preflight";

const u32 = (value: number) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
};

const ascii = (value: string) => Uint8Array.from(value, (character) => character.charCodeAt(0));

const concat = (...parts: ReadonlyArray<Uint8Array>) => {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const box = (type: string, data: Uint8Array) => concat(u32(data.length + 8), ascii(type), data);

const png = (width: number, height: number) =>
  concat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    u32(13),
    ascii("IHDR"),
    u32(width),
    u32(height),
    new Uint8Array([8, 6, 0, 0, 0]),
  );

const gif = (width: number, height: number) => {
  const bytes = concat(ascii("GIF89a"), new Uint8Array(4));
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
};

const jpeg = (width: number, height: number) =>
  concat(
    new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]),
    new Uint8Array([(height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff]),
    new Uint8Array(12),
  );

const webp = (width: number, height: number) => {
  const bytes = new Uint8Array(30);
  bytes.set(ascii("RIFF"), 0);
  bytes.set(ascii("WEBP"), 8);
  bytes.set(ascii("VP8X"), 12);
  const write24 = (offset: number, value: number) => {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >> 8) & 0xff;
    bytes[offset + 2] = (value >> 16) & 0xff;
  };
  write24(24, width - 1);
  write24(27, height - 1);
  return bytes;
};

const heic = (width: number, height: number, brand = "heic") => {
  const ftyp = box("ftyp", concat(ascii(brand), u32(0), ascii("mif1"), ascii(brand)));
  const ispe = box("ispe", concat(new Uint8Array(4), u32(width), u32(height)));
  const ipco = box("ipco", ispe);
  const iprp = box("iprp", ipco);
  const meta = box("meta", concat(new Uint8Array(4), iprp));
  return concat(ftyp, meta);
};

describe("image upload preflight", () => {
  it("reads supported dimensions from headers without raster decoding", () => {
    expect(preflightImageBytes(png(8064, 6048))).toEqual({
      format: "png",
      width: 8064,
      height: 6048,
    });
    expect(preflightImageBytes(jpeg(4000, 3000))).toEqual({
      format: "jpeg",
      width: 4000,
      height: 3000,
    });
    expect(preflightImageBytes(gif(640, 480))).toEqual({ format: "gif", width: 640, height: 480 });
    expect(preflightImageBytes(webp(1920, 1080))).toEqual({
      format: "webp",
      width: 1920,
      height: 1080,
    });
    expect(preflightImageBytes(heic(8064, 6048))).toEqual({
      format: "heic",
      width: 8064,
      height: 6048,
    });
  });

  it("accepts typical 48 MP iPhone dimensions and exact safety boundaries", () => {
    expect(
      validateImageLimits({ type: "heic", width: 8064, height: 6048 }, MAX_SOURCE_IMAGE_BYTES),
    ).toEqual({ format: "heic", width: 8064, height: 6048 });
    expect(validateImageLimits({ type: "png", width: 10_000, height: 6_400 }, 1)).toEqual({
      format: "png",
      width: 10_000,
      height: 6_400,
    });
  });

  it("rejects excessive axes, decoded pixels, aspect ratios, and bytes", () => {
    expect(() => validateImageLimits({ type: "jpeg", width: 10_001, height: 100 }, 1)).toThrow(
      /10,000 pixels/i,
    );
    expect(() => validateImageLimits({ type: "png", width: 8_001, height: 8_000 }, 1)).toThrow(
      /64 megapixels/i,
    );
    expect(() => validateImageLimits({ type: "heic", width: 8_200, height: 6_100 }, 1)).toThrow(
      /50 megapixels/i,
    );
    expect(() => validateImageLimits({ type: "webp", width: 8000, height: 999 }, 1)).toThrow(
      /wide or tall/i,
    );
    expect(() =>
      validateImageLimits({ type: "gif", width: 1, height: 1 }, MAX_SOURCE_IMAGE_BYTES + 1),
    ).toThrow(/30 MB/i);
  });

  it("uses the signature rather than trusting HEIC extensions or MIME", async () => {
    const valid = new File([heic(4032, 3024)], "IPHONE.HEIC", { type: "" });
    await expect(preflightImageFile(valid)).resolves.toEqual({
      format: "heic",
      width: 4032,
      height: 3024,
    });

    const spoofed = new File([ascii("not a heic image")], "spoof.HEIC", { type: "image/heic" });
    await expect(preflightImageFile(spoofed)).rejects.toThrow(/not a supported or valid image/i);
  });

  it("rejects valid but unsupported AVIF and truncated headers", () => {
    expect(() => preflightImageBytes(heic(1000, 1000, "avif"))).toThrow(
      /JPEG, PNG, GIF, WebP, HEIC/i,
    );
    expect(() => preflightImageBytes(new Uint8Array([0x89, 0x50, 0x4e]))).toThrow(
      /supported or valid/i,
    );
  });
});
