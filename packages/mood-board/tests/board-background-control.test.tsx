import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BoardBackgroundDraft } from "../src/client/board/board-background";
import { BoardBackgroundControl } from "../src/components/board-background-control";
import { MediaIdSchema } from "../src/lib/media";

const mediaId = MediaIdSchema.make("0123456789abcdef0123456789abcdef");

const renderControl = (
  draft: BoardBackgroundDraft,
  uploading = false,
  error = "",
  imageEnabled = true,
) =>
  renderToStaticMarkup(
    <BoardBackgroundControl
      draft={draft}
      normalizedHex="#EDEDED"
      effectiveHex="#EDEDED"
      uploading={uploading}
      dirty={true}
      error={error}
      imageEnabled={imageEnabled}
      onDraftChange={() => undefined}
      onChooseImage={() => undefined}
      onRemoveImage={() => undefined}
      onReset={() => undefined}
      onApply={() => undefined}
    />,
  );

describe("board background control", () => {
  it("offers a managed image picker with the supported phone-photo formats", () => {
    const markup = renderControl({ hex: "#EDEDED", lastValidHex: "#EDEDED" });
    expect(markup).toContain("Add background image");
    expect(markup).toContain("JPG, PNG, WebP, GIF, or HEIC");
    expect(markup).toContain(".heic,.heif,.hif");
    expect(markup).toContain("Fallback color");
    expect(markup).toContain("Reset all");
  });

  it("keeps the guest demo local by omitting managed background uploads", () => {
    const markup = renderControl({ hex: "#EDEDED", lastValidHex: "#EDEDED" }, false, "", false);
    expect(markup).toContain("browser-only demo");
    expect(markup).not.toContain("Add background image");
    expect(markup).not.toContain('type="file"');
  });

  it("shows replacement and removal actions for a ready background", () => {
    const markup = renderControl({
      hex: "#EDEDED",
      lastValidHex: "#EDEDED",
      mediaId,
    });
    expect(markup).toContain(`src="/api/owner/media/${mediaId}"`);
    expect(markup).toContain("Viewport cover");
    expect(markup).toContain("Replace");
    expect(markup).toContain("Remove image");
  });

  it("announces processing and inline failures", () => {
    const uploading = renderControl({ hex: "#EDEDED", lastValidHex: "#EDEDED" }, true);
    expect(uploading).toContain('aria-busy="true"');
    expect(uploading).toContain("Preparing image…");
    const failed = renderControl(
      { hex: "#EDEDED", lastValidHex: "#EDEDED" },
      false,
      "That image could not be decoded.",
    );
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("That image could not be decoded.");
  });
});
