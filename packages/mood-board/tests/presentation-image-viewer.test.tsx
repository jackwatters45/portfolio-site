import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BoardItem } from "../src/client/board/types";
import { fitPresentationItemScale } from "../src/client/media/presentation-item-fit";
import { PresentationItemViewer } from "../src/components/presentation-image-viewer";
import { ItemIdSchema } from "../src/lib/board-rpc";
import { ImageAnnotationTitleSchema } from "../src/lib/image-annotation";
import { MediaIdSchema } from "../src/lib/media";

const image: BoardItem = {
  id: ItemIdSchema.make("image-1"),
  kind: "image",
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  rotation: 0,
  order: 1,
  mediaId: MediaIdSchema.make("0123456789abcdef0123456789abcdef"),
  href: "https://shop.example/chair",
  annotationTitle: ImageAnnotationTitleSchema.make("Waxed field jacket"),
};

describe("presentation image viewer", () => {
  it("renders a modal, full-image presentation with a protected source link", () => {
    const markup = renderToStaticMarkup(
      <PresentationItemViewer item={image} origin={{ x: 180, y: 240 }} onClose={() => undefined} />,
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Enlarged image: Waxed field jacket"');
    expect(markup).toContain("presentation-image-viewer-frame--contain");
    expect(markup).toContain("--viewer-origin-x:180px");
    expect(markup).toContain('src="/api/owner/media/0123456789abcdef0123456789abcdef"');
    expect(markup).toContain('alt="Waxed field jacket"');
    expect(markup).toContain('aria-label="Close enlarged image"');
    expect(markup).toContain('href="https://shop.example/chair"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('referrerPolicy="no-referrer"');
  });

  it("renders an explicit unavailable state when an image has no source", () => {
    const markup = renderToStaticMarkup(
      <PresentationItemViewer
        item={{ ...image, mediaId: undefined, src: undefined, href: undefined }}
        origin={{ x: 0, y: 0 }}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain("is-error");
    expect(markup).toContain('aria-label="Image unavailable"');
    expect(markup).not.toContain("Open source");
  });

  it("fits an item inside a short, narrow viewport without a minimum-size overflow", () => {
    const scale = fitPresentationItemScale(360, 430, {
      width: 212,
      height: 108,
    });
    expect(360 * scale).toBeLessThanOrEqual(212.000_001);
    expect(430 * scale).toBeLessThanOrEqual(108.000_001);
  });

  it("enlarges a color study as a fitted item surface", () => {
    const markup = renderToStaticMarkup(
      <PresentationItemViewer
        item={{
          id: ItemIdSchema.make("swatch-1"),
          kind: "swatch",
          color: "#8C3335",
          label: "Oxblood / evening",
          x: 0,
          y: 0,
          width: 360,
          height: 430,
          rotation: 0,
          order: 1,
        }}
        origin={{ x: 320, y: 240 }}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Enlarged swatch: Oxblood / evening"');
    expect(markup).toContain("presentation-item-viewer-frame");
    expect(markup).toContain("presentation-item-viewer-surface board-item--swatch");
    expect(markup).toContain("Oxblood / evening");
    expect(markup).toContain('aria-label="Close enlarged swatch"');
  });
});
