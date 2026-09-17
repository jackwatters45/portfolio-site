import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CanvasBackground } from "../src/components/canvas-background";
import { MediaIdSchema } from "../src/lib/media";

const mediaId = MediaIdSchema.make("0123456789abcdef0123456789abcdef");

describe("canvas background", () => {
  it("renders a decorative viewport-cover managed image", () => {
    const markup = renderToStaticMarkup(<CanvasBackground mediaId={mediaId} />);
    expect(markup).toContain('class="canvas-background"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain(`src="/api/owner/media/${mediaId}"`);
    expect(markup).toContain('alt=""');
  });

  it("keeps the color-only layer when no managed image is set", () => {
    const markup = renderToStaticMarkup(<CanvasBackground />);
    expect(markup).toContain('data-has-image="false"');
    expect(markup).not.toContain("<img");
  });
});
