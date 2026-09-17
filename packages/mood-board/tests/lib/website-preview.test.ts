import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  isBlockedWebsiteAddress,
  isBlockedWebsiteHostname,
  normalizeWebsiteImageUrl,
  normalizeWebsiteUrl,
  WebsitePreviewSchema,
} from "../../src/lib/website-preview";

describe("website preview contracts", () => {
  it("normalizes safe public HTTPS URLs", () => {
    expect(normalizeWebsiteUrl(" https://Example.com:443/story#section ")).toBe(
      "https://example.com/story",
    );
    expect(normalizeWebsiteImageUrl("/cover.jpg", "https://example.com/story")).toBe(
      "https://example.com/cover.jpg",
    );
  });

  it("rejects credentials, insecure URLs, private hosts, and nonstandard ports", () => {
    for (const value of [
      "http://example.com",
      "https://user:pass@example.com",
      "https://localhost/story",
      "https://127.0.0.1/story",
      "https://[::1]/story",
      "https://[100::1]/story",
      "https://10.2.3.4/story",
      "https://example.com:8443/story",
    ])
      expect(normalizeWebsiteUrl(value)).toBeNull();
  });

  it("recognizes private and reserved DNS results", () => {
    expect(isBlockedWebsiteAddress("169.254.10.2")).toBe(true);
    expect(isBlockedWebsiteAddress("::ffff:192.168.1.2")).toBe(true);
    expect(isBlockedWebsiteAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedWebsiteAddress("64:ff9b::7f00:1")).toBe(true);
    expect(isBlockedWebsiteAddress("100::1")).toBe(true);
    expect(isBlockedWebsiteAddress("2001:2::1")).toBe(true);
    expect(isBlockedWebsiteAddress("2001:100::1")).toBe(true);
    expect(isBlockedWebsiteAddress("2001:20::1")).toBe(true);
    expect(isBlockedWebsiteAddress("2001:10000::1")).toBe(true);
    expect(isBlockedWebsiteAddress("2001:not-hex::1")).toBe(true);
    expect(isBlockedWebsiteAddress("3fff::1")).toBe(true);
    expect(isBlockedWebsiteAddress("5f00::1")).toBe(true);
    expect(isBlockedWebsiteAddress("4000::1")).toBe(true);
    expect(isBlockedWebsiteAddress("fd12::1")).toBe(true);
    expect(isBlockedWebsiteAddress("2606:4700:4700::1111")).toBe(false);
    expect(isBlockedWebsiteAddress("2001:4860:4860::8888")).toBe(false);
    expect(isBlockedWebsiteHostname("printer.local")).toBe(true);
    expect(isBlockedWebsiteHostname("example.com")).toBe(false);
  });

  it("decodes bounded normalized preview snapshots", () => {
    expect(
      Schema.decodeUnknownSync(WebsitePreviewSchema)({
        url: "https://example.com/story",
        imageUrl: "https://cdn.example.com/cover.jpg",
        preferredLayout: "card",
        title: "A quiet room",
        description: "Materials, light, and collected objects.",
        siteLabel: "example.com",
      }),
    ).toMatchObject({ title: "A quiet room" });
    expect(
      Schema.decodeUnknownSync(WebsitePreviewSchema)({
        url: "https://example.com/legacy",
        title: "Legacy server",
        siteLabel: "example.com",
      }).preferredLayout,
    ).toBeUndefined();
    expect(() =>
      Schema.decodeUnknownSync(WebsitePreviewSchema)({
        url: "https://localhost/story",
        title: "No",
        siteLabel: "localhost",
      }),
    ).toThrow();
  });
});
