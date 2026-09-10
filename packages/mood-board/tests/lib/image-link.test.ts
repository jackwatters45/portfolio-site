import { describe, expect, it } from "vitest";

import { MAX_IMAGE_LINK_CHARACTERS, normalizeImageLink } from "../../src/lib/image-link";

describe("image links", () => {
  it("normalizes absolute HTTP and HTTPS destinations", () => {
    expect(normalizeImageLink("https://shop.example/chair?finish=oak#details")).toBe(
      "https://shop.example/chair?finish=oak#details",
    );
    expect(normalizeImageLink("  HTTP://EXAMPLE.COM  ")).toBe("http://example.com/");
  });

  it("rejects unsafe, relative, credential-bearing, and malformed destinations", () => {
    expect(normalizeImageLink("javascript:alert(1)")).toBeNull();
    expect(normalizeImageLink("data:text/html,hello")).toBeNull();
    expect(normalizeImageLink("/products/chair")).toBeNull();
    expect(normalizeImageLink("https://user:secret@example.com/chair")).toBeNull();
    expect(normalizeImageLink("http:example.com")).toBeNull();
    expect(normalizeImageLink("http:/example.com")).toBeNull();
    expect(normalizeImageLink("http:///example.com")).toBeNull();
    expect(normalizeImageLink("https:\\example.com")).toBeNull();
    expect(normalizeImageLink("https://")).toBeNull();
  });

  it("enforces the portable link size limit", () => {
    expect(
      normalizeImageLink(`https://example.com/${"a".repeat(MAX_IMAGE_LINK_CHARACTERS)}`),
    ).toBeNull();
  });
});
