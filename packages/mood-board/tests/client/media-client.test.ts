import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadMedia, MediaClientError, uploadMedia } from "../../src/client/media-client";
import { mediaUrl, publicMediaUrl } from "../../src/client/media-url";
import { MediaIdSchema } from "../../src/lib/media";
import { PublicIdSchema } from "../../src/lib/public-api";

const mediaId = MediaIdSchema.make("0123456789abcdef0123456789abcdef");
const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], { type: "image/jpeg" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("managed media client", () => {
  it("posts raw same-origin bytes and validates the receipt", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(jpeg);
      expect(init?.credentials).toBe("same-origin");
      expect(new Headers(init?.headers).get("content-type")).toBe("image/jpeg");
      return Response.json(
        {
          mediaId,
          kind: "image",
          mimeType: "image/jpeg",
          byteLength: jpeg.size,
          url: `/api/owner/media/${mediaId}`,
        },
        { status: 201 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadMedia(jpeg, "image")).resolves.toMatchObject({ mediaId });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/owner/media?kind=image",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mediaUrl(mediaId)).toBe(`/api/owner/media/${mediaId}`);
  });

  it("uses authenticated private reads and publication-scoped public URLs", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe("same-origin");
      return new Response(jpeg, { headers: { "content-type": "image/jpeg" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(downloadMedia(mediaId, "image")).resolves.toMatchObject({
      byteLength: jpeg.size,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/owner/media/${mediaId}`,
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(publicMediaUrl(PublicIdSchema.make("a".repeat(32)), mediaId)).toBe(
      `/api/public/boards/${"a".repeat(32)}/media/${mediaId}`,
    );
  });

  it("explains that local uploads require a live server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("connection refused");
      }),
    );
    await expect(uploadMedia(jpeg, "image")).rejects.toEqual(
      expect.objectContaining({
        name: "MediaClientError",
        message: expect.stringMatching(/live mood-board server/i),
      }),
    );
  });

  it.each([
    [429, /upload allowance/i],
    [507, /storage is full/i],
  ])("explains media guardrail status %i", async (status, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status })),
    );
    await expect(uploadMedia(jpeg, "image")).rejects.toEqual(
      expect.objectContaining({
        status,
        message: expect.stringMatching(message),
      }),
    );
  });

  it("rejects unsupported local media without issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      uploadMedia(new Blob(["svg"], { type: "image/svg+xml" }), "image"),
    ).rejects.toBeInstanceOf(MediaClientError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
