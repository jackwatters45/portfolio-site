import { describe, expect, it } from "vitest";

import { WebsiteUrlSchema } from "../../src/lib/website-preview";
import { parseWebsitePreview } from "../../src/server/website-preview-parser";

const websiteUrl = (value: string) => WebsiteUrlSchema.make(value);

describe("website preview parser", () => {
  it("reads Open Graph metadata regardless of attribute order", () => {
    const preview = parseWebsitePreview(
      `
      <html><head>
        <meta content="Studio &amp; Field" property="og:site_name">
        <meta property='og:title' content='A collected room'>
        <meta content="https://cdn.example.com/cover.jpg?width=640&amp;height=640" property="og:image:secure_url">
        <meta name="description" content="Light, stone, &quot;quiet&quot; objects.">
      </head></html>
    `,
      websiteUrl("https://example.com/story"),
    );
    expect(preview).toEqual({
      url: "https://example.com/story",
      imageUrl: "https://cdn.example.com/cover.jpg?width=640&height=640",
      preferredLayout: "card",
      title: "A collected room",
      description: 'Light, stone, "quiet" objects.',
      siteLabel: "Studio & Field",
    });
  });

  it("decodes bounded numeric entities and preserves out-of-range entities", () => {
    const preview = parseWebsitePreview(
      "<title>Decimal &#65; hex &#x1f600; invalid &#x110000;</title>",
      websiteUrl("https://example.com/"),
    );
    expect(preview.title).toBe("Decimal A hex 😀 invalid &#x110000;");
  });

  it("uses safe title/domain fallbacks and ignores private preview images", () => {
    expect(
      parseWebsitePreview(
        `
      <title>  Notes&nbsp;from   home </title>
      <meta property="og:image" content="https://127.0.0.1/private.jpg">
    `,
        websiteUrl("https://www.example.com/notes"),
      ),
    ).toEqual({
      url: "https://www.example.com/notes",
      preferredLayout: "card",
      title: "Notes from home",
      siteLabel: "example.com",
    });
  });

  it("prefers linked images for Instagram posts and reels", () => {
    expect(
      parseWebsitePreview(
        '<meta property="og:image" content="https://cdn.example.com/reel-cover.jpg">',
        websiteUrl("https://www.instagram.com/reel/ABC123/"),
      ).preferredLayout,
    ).toBe("image");
    expect(
      parseWebsitePreview(
        '<meta property="og:image" content="https://cdn.example.com/profile.jpg">',
        websiteUrl("https://www.instagram.com/studio/"),
      ).preferredLayout,
    ).toBe("card");
  });

  it("truncates untrusted text and strips nested markup", () => {
    const preview = parseWebsitePreview(
      `<meta property="og:title" content="${"x".repeat(200)}">`,
      websiteUrl("https://example.com/"),
    );
    expect(preview.title).toHaveLength(120);
    expect(preview.title).not.toContain("<");
  });
});
