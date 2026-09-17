import { describe, expect, it } from "vitest";

import { CONTENT_SECURITY_POLICY, withSecurityHeaders } from "../../src/server/security-headers";

describe("security headers", () => {
  it("allows only explicit Spotify, YouTube-frame, and X widget origins", () => {
    expect(CONTENT_SECURITY_POLICY).toContain(
      "script-src 'self' https://open.spotify.com https://embed-cdn.spotifycdn.com",
    );
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*youtube/);
    expect(CONTENT_SECURITY_POLICY).toContain(
      "frame-src https://open.spotify.com https://www.youtube-nocookie.com",
    );
    expect(CONTENT_SECURITY_POLICY).toContain("https://platform.x.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://platform.twitter.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://syndication.x.com");
    expect(CONTENT_SECURITY_POLICY).toContain("https://cdn.syndication.twimg.com");
    expect(CONTENT_SECURITY_POLICY).not.toContain("*.x.com");
    expect(CONTENT_SECURITY_POLICY).not.toContain("*.twitter.com");
    expect(CONTENT_SECURITY_POLICY).toContain("media-src 'self' https:");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/media-src[^;]*data:/);
  });

  it("adds headers without consuming a streamed response body", async () => {
    const secured = withSecurityHeaders(
      new Response("hello", {
        headers: { "X-Existing": "kept" },
      }),
    );
    expect(secured.headers.get("content-security-policy")).toBe(CONTENT_SECURITY_POLICY);
    expect(secured.headers.get("x-existing")).toBe("kept");
    expect(await secured.text()).toBe("hello");
  });
});
