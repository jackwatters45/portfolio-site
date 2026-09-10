import { describe, expect, it } from "vitest";

import { parseXPostOEmbed } from "../../src/server/x-post-preview-parser";

const source = "https://x.com/sheherenow_/status/2082226100764369045";
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe("X oEmbed snapshot parser", () => {
  it("extracts only bounded, sanitized snapshot fields", () => {
    expect(
      parseXPostOEmbed(
        encode({
          provider_name: "X",
          url: source,
          author_name: "  Jem   is looking for a job ",
          author_url: "https://x.com/sheherenow_",
          html: `<blockquote class="twitter-tweet"><p>oh my god &amp; cooking <script>alert(1)</script></p>&mdash; jem <a href="${source}?ref=x">July 28, 2026</a></blockquote>`,
        }),
        source,
      ),
    ).toEqual({
      src: source,
      authorName: "Jem is looking for a job",
      authorHandle: "sheherenow_",
      text: "oh my god & cooking",
      date: "2026-07-28",
    });
  });

  it("ignores malformed author profile metadata", () => {
    for (const authorUrl of [42, "https://example.com/imposter"]) {
      const preview = parseXPostOEmbed(
        encode({
          provider_name: "X",
          url: source,
          author_url: authorUrl,
          html: "<blockquote><p>Post text</p></blockquote>",
        }),
        source,
      );
      expect(preview?.authorHandle).toBe("sheherenow_");
    }
  });

  it("omits impossible and pre-X dates", () => {
    for (const date of ["February 29, 2025", "July 28, 2005"]) {
      const preview = parseXPostOEmbed(
        encode({
          provider_name: "X",
          url: source,
          html: `<blockquote><p>Post text</p><a href="${source}">${date}</a></blockquote>`,
        }),
        source,
      );
      expect(preview?.date).toBeUndefined();
    }
  });

  it("decodes bounded numeric entities and omits out-of-range entities", () => {
    expect(
      parseXPostOEmbed(
        encode({
          provider_name: "X",
          url: source,
          html: "<blockquote><p>Decimal &#65; hex &#x1f600; invalid &#x110000;</p></blockquote>",
        }),
        source,
      ),
    ).toEqual({
      src: source,
      authorHandle: "sheherenow_",
      text: "Decimal A hex 😀 invalid",
    });
  });

  it("rejects a mismatched provider, post id, malformed JSON, or oversized HTML", () => {
    expect(
      parseXPostOEmbed(encode({ provider_name: "Other", url: source, html: "" }), source),
    ).toBeNull();
    expect(
      parseXPostOEmbed(
        encode({
          provider_name: "X",
          url: "https://x.com/user/status/123",
          html: "<blockquote></blockquote>",
        }),
        source,
      ),
    ).toBeNull();
    expect(parseXPostOEmbed(new TextEncoder().encode("not json"), source)).toBeNull();
    expect(
      parseXPostOEmbed(
        encode({ provider_name: "X", url: source, html: "x".repeat(32_001) }),
        source,
      ),
    ).toBeNull();
  });
});
