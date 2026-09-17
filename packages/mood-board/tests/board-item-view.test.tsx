import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BoardItem } from "../src/client/board/types";
import { AudioPlaybackCoordinator } from "../src/client/media/audio-playback";
import {
  measureRenderedXPostHeight,
  renderedXPostHeight,
  xPostVisualScale,
} from "../src/client/media/x-post-measurement";
import { AudioCard } from "../src/components/audio-card";
import { BoardItemView } from "../src/components/board-item-view";
import { XPostCard } from "../src/components/x-post-card";
import { ItemIdSchema } from "../src/lib/board-rpc";
import {
  ImageAnnotationDescriptionSchema,
  ImageAnnotationTitleSchema,
} from "../src/lib/image-annotation";
import { MediaIdSchema } from "../src/lib/media";
import {
  WebsiteDescriptionSchema,
  WebsiteImageUrlSchema,
  WebsiteSiteLabelSchema,
  WebsiteTitleSchema,
  WebsiteUrlSchema,
} from "../src/lib/website-preview";
import {
  XAuthorHandleSchema,
  XAuthorNameSchema,
  XPostDateSchema,
  XPostTextSchema,
} from "../src/lib/x-post";

const image: BoardItem = {
  id: ItemIdSchema.make("image-1"),
  kind: "image",
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  rotation: 0,
  order: 1,
  src: "https://images.example/chair.jpg",
  href: "https://shop.example/chair",
};

const renderItem = (editing: boolean, item: BoardItem = image) =>
  renderToStaticMarkup(
    <BoardItemView
      item={item}
      zoom={1}
      selected={false}
      editing={editing}
      spacePressed={false}
      entryDelay={0}
      onSelect={() => undefined}
      onMove={() => undefined}
      onResize={() => undefined}
      onEdit={() => undefined}
      onDelete={() => undefined}
      onReorder={() => undefined}
      onPresentItem={() => undefined}
      playbackCoordinator={new AudioPlaybackCoordinator()}
    />,
  );

describe("linked image rendering", () => {
  it("renders managed images from their same-origin media route", () => {
    const markup = renderItem(true, {
      ...image,
      src: undefined,
      mediaId: MediaIdSchema.make("0123456789abcdef0123456789abcdef"),
    });
    expect(markup).toContain('src="/api/owner/media/0123456789abcdef0123456789abcdef"');
    expect(markup).not.toContain("data:image");
  });

  it("never renders a navigable image while editing", () => {
    const markup = renderItem(true);
    expect(markup).toContain('role="group"');
    expect(markup).not.toContain("item-link-indicator");
    expect(markup).not.toContain("presentation-image-trigger");
    expect(markup).not.toContain('href="https://shop.example/chair"');
  });

  it("renders every image as an enlargement trigger while presenting", () => {
    const markup = renderItem(false, { ...image, href: undefined });
    expect(markup).not.toContain('role="group"');
    expect(markup).toContain('class="presentation-image-trigger presentation-item-trigger"');
    expect(markup).toContain('data-presentation-item-id="image-1"');
    expect(markup).toContain('aria-label="Enlarge image"');
    expect(markup).not.toContain('href="https://shop.example/chair"');
  });

  it("renders image annotations as a presentation popover", () => {
    const markup = renderItem(false, {
      ...image,
      annotationTitle: ImageAnnotationTitleSchema.make("Waxed field jacket"),
      annotationDescription: ImageAnnotationDescriptionSchema.make(
        "Weathered cotton with a corduroy collar.",
      ),
    });
    expect(markup).toContain("has-annotation");
    expect(markup).not.toContain("item-annotation-trigger");
    expect(markup).toContain('class="item-annotation"');
    expect(markup).toContain("Waxed field jacket");
    expect(markup).toContain("Weathered cotton with a corduroy collar.");
    expect(markup).toContain("View source");
  });
});

const website: BoardItem = {
  id: ItemIdSchema.make("website-1"),
  kind: "website",
  x: 0,
  y: 0,
  width: 540,
  height: 360,
  rotation: 0,
  order: 1,
  websiteUrl: WebsiteUrlSchema.make("https://example.com/story"),
  websiteImageUrl: WebsiteImageUrlSchema.make("https://cdn.example.com/story.jpg"),
  websiteTitle: WebsiteTitleSchema.make("A collected room"),
  websiteDescription: WebsiteDescriptionSchema.make("Light, stone, and quiet objects."),
  websiteSiteLabel: WebsiteSiteLabelSchema.make("example.com"),
};

describe("managed audio rendering", () => {
  it("makes media surfaces inert and grabbable only while editing", () => {
    const spotify: BoardItem = {
      id: ItemIdSchema.make("spotify-1"),
      kind: "spotify",
      src: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
      x: 0,
      y: 0,
      width: 520,
      height: 352,
      rotation: 0,
      order: 1,
    };
    expect(renderItem(true, spotify)).toContain("is-media-editing");
    expect(renderItem(false, spotify)).not.toContain("is-media-editing");
  });

  it("uses the media route without exposing an external source link", () => {
    const item: BoardItem = {
      id: ItemIdSchema.make("audio-1"),
      kind: "audio",
      mediaId: MediaIdSchema.make("fedcba9876543210fedcba9876543210"),
      label: "Room tone",
      x: 0,
      y: 0,
      width: 520,
      height: 220,
      rotation: 0,
      order: 1,
    };
    const markup = renderToStaticMarkup(
      <AudioCard item={item} coordinator={new AudioPlaybackCoordinator()} />,
    );
    expect(markup).toContain('src="/api/owner/media/fedcba9876543210fedcba9876543210"');
    expect(markup).toContain("Board audio");
    expect(markup).not.toContain("Open source");
  });
});

describe("X post rendering", () => {
  it("starts loading automatically while retaining a sanitized snapshot and source fallback", () => {
    const item: BoardItem = {
      id: ItemIdSchema.make("x-1"),
      kind: "x",
      src: "https://x.com/sheherenow_/status/2082226100764369045",
      xDisplay: "post",
      xTheme: "automatic",
      xHideThread: true,
      xAuthorName: XAuthorNameSchema.make("Jem"),
      xAuthorHandle: XAuthorHandleSchema.make("sheherenow_"),
      xPostText: XPostTextSchema.make("Cooking inspiration"),
      xPostDate: XPostDateSchema.make("2026-07-28"),
      x: 0,
      y: 0,
      width: 550,
      height: 620,
      rotation: 0,
      order: 1,
    };
    const markup = renderToStaticMarkup(<XPostCard item={item} editing />);
    expect(markup).toContain("is-loading");
    expect(markup).toContain("is-editing");
    expect(markup).toContain("inert");
    expect(markup).toContain("X post by Jem");
    expect(markup).not.toContain("Load all X posts");
    expect(markup).toContain("Cooking inspiration");
    expect(markup).not.toContain("Open on X");
    expect(markup).not.toContain("platform.x.com/widgets.js");
    expect(markup).not.toContain("twitter-tweet");
  });

  it("shows complete source details on whole-card hover without overlay controls", () => {
    const item: BoardItem = {
      id: ItemIdSchema.make("x-1"),
      kind: "x",
      src: "https://x.com/sheherenow_/status/2082226100764369045",
      xDisplay: "media",
      xTheme: "automatic",
      xHideThread: true,
      xAuthorName: XAuthorNameSchema.make("Jem"),
      xAuthorHandle: XAuthorHandleSchema.make("sheherenow_"),
      xPostText: XPostTextSchema.make("Cooking inspiration"),
      xPostDate: XPostDateSchema.make("2026-07-28"),
      x: 0,
      y: 0,
      width: 550,
      height: 620,
      rotation: 0,
      order: 1,
    };
    const markup = renderItem(false, item);
    expect(markup).toContain('aria-label="X post details"');
    expect(markup).toContain("Cooking inspiration");
    expect(markup).toContain("@sheherenow_");
    expect(markup).toContain("2026-07-28");
    expect(markup).toContain("Open on X");
    expect(markup).toContain('aria-label="X media reference. Press Enter to enlarge."');
    expect(markup).toContain('tabindex="0"');
    expect(markup).not.toContain("presentation-item-zoom");
    expect(markup).not.toContain("item-annotation-trigger");
  });

  it("does not accept a transient zero-size iframe as rendered", () => {
    expect(renderedXPostHeight(0, 1_332)).toBeNull();
    expect(renderedXPostHeight(99, 1_332)).toBeNull();
    expect(renderedXPostHeight(Number.NaN, 1_332)).toBeNull();
    expect(renderedXPostHeight(1_251, 1_332)).toBe(1_332);
    expect(renderedXPostHeight(1_900, 2_400)).toBe(2_000);
    expect(measureRenderedXPostHeight({ offsetHeight: 295 }, { scrollHeight: 376 })).toBe(376);
  });

  it("scales an official X iframe up with its resized card while keeping a quality cap", () => {
    expect(xPostVisualScale(512, 512)).toBe(1);
    expect(xPostVisualScale(512, 768)).toBe(1.5);
    expect(xPostVisualScale(512, 1_200)).toBe(2);
    expect(xPostVisualScale(0, 768)).toBeNull();
  });
});

describe("consistent presentation enlargement", () => {
  it("keeps enlargement available without visible overlay controls", () => {
    const note: BoardItem = {
      id: ItemIdSchema.make("note-1"),
      kind: "note",
      text: "Collected, not decorated.",
      x: 0,
      y: 0,
      width: 420,
      height: 280,
      rotation: 0,
      order: 1,
    };
    const swatch: BoardItem = {
      id: ItemIdSchema.make("swatch-1"),
      kind: "swatch",
      color: "#8C3335",
      label: "Oxblood",
      x: 0,
      y: 0,
      width: 360,
      height: 430,
      rotation: 0,
      order: 1,
    };
    const spotify: BoardItem = {
      id: ItemIdSchema.make("spotify-1"),
      kind: "spotify",
      src: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
      x: 0,
      y: 0,
      width: 520,
      height: 352,
      rotation: 0,
      order: 1,
    };
    expect(renderItem(false, note)).toContain('data-presentation-item-id="note-1"');
    expect(renderItem(false, swatch)).toContain('data-presentation-item-id="swatch-1"');
    const spotifyMarkup = renderItem(false, spotify);
    const websiteMarkup = renderItem(false, website);
    expect(spotifyMarkup).toContain('aria-label="Spotify card. Press Enter to enlarge."');
    expect(websiteMarkup).toContain(
      'aria-label="Website card: A collected room. Press Enter to enlarge."',
    );
    expect(spotifyMarkup).not.toContain("presentation-item-zoom");
    expect(websiteMarkup).not.toContain("presentation-item-zoom");
  });
});

describe("website card rendering", () => {
  it("renders stored metadata without a navigable link while editing", () => {
    const markup = renderItem(true, website);
    expect(markup).toContain("A collected room");
    expect(markup).toContain("Light, stone, and quiet objects.");
    expect(markup).toContain('src="https://cdn.example.com/story.jpg"');
    expect(markup).not.toContain("presentation-website-link");
    expect(markup).not.toContain('href="https://example.com/story"');
  });

  it("uses the clean card surface to enter the viewer before exposing its source link", () => {
    const markup = renderItem(false, website);
    expect(markup).toContain("A collected room");
    expect(markup).toContain('data-presentation-item-id="website-1"');
    expect(markup).toContain(
      'aria-label="Website card: A collected room. Press Enter to enlarge."',
    );
    expect(markup).not.toContain("presentation-website-link");
    expect(markup).not.toContain('href="https://example.com/story"');
  });
});
