import { describe, expect, it } from "vitest";

import { normalizeXPostSource, parseXPostInput, parseXPostUrl } from "../../src/lib/x-post";

const source = "https://x.com/sheherenow_/status/2082226100764369045";
const postEmbed = `<blockquote class="twitter-tweet"><p>Cooking</p>&mdash; Jem <a href="${source}?ref_src=twsrc%5Etfw">July 28, 2026</a></blockquote> <script async src="https://platform.x.com/widgets.js" charset="utf-8"></script>`;
const mediaEmbed = postEmbed.replace(
  'class="twitter-tweet"',
  'class="twitter-tweet" data-media-max-width="560"',
);
const legacyVideoEmbed = postEmbed.replace('class="twitter-tweet"', 'class="twitter-video"');

describe("X post sources", () => {
  it("canonicalizes ordinary X and legacy Twitter status URLs", () => {
    for (const value of [
      `${source}?s=20#fragment`,
      "https://www.x.com/sheherenow_/statuses/2082226100764369045/",
      "https://twitter.com/sheherenow_/status/2082226100764369045?ref_src=test",
      "https://mobile.twitter.com/sheherenow_/status/2082226100764369045",
      "https://m.x.com/SheHereNow_/status/2082226100764369045/video/1",
    ])
      expect(normalizeXPostSource(value)).toBe(source);
    expect(parseXPostUrl(source)).toMatchObject({
      src: source,
      postId: "2082226100764369045",
      handle: "sheherenow_",
    });
  });

  it("infers full-post and media-only official embed snippets", () => {
    expect(parseXPostInput(postEmbed)).toMatchObject({
      src: source,
      display: "post",
      fromEmbedCode: true,
    });
    expect(parseXPostInput(mediaEmbed)).toMatchObject({
      src: source,
      display: "media",
      fromEmbedCode: true,
    });
    expect(parseXPostInput(legacyVideoEmbed)).toMatchObject({
      src: source,
      display: "media",
      fromEmbedCode: true,
    });
    expect(parseXPostInput(source)).toMatchObject({ display: "post", fromEmbedCode: false });
  });

  it("rejects invalid hosts, ids, credentials, and unrelated or malicious markup", () => {
    for (const value of [
      "http://x.com/user/status/123",
      "https://x.com.evil.example/user/status/123",
      "https://user:pass@x.com/user/status/123",
      "https://x.com/user/status/not-a-number",
      "https://x.com/this_handle_is_far_too_long/status/123",
      `<div><a href="${source}">post</a></div>`,
      `<blockquote class="other"><a href="${source}">post</a></blockquote>`,
      `<blockquote class="twitter-tweet"><a href="${source}">post</a></blockquote><script src="https://evil.example/a.js"></script>`,
      `<blockquote class="twitter-tweet" data-media-max-width="bad"><a href="${source}">post</a></blockquote>`,
    ])
      expect(parseXPostInput(value)).toBeNull();
  });
});
