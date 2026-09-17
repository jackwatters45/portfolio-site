import { useState } from "react";

import { mediaUrl } from "../client/media-url";
import type { MediaId } from "../lib/media";

function BackgroundImage({ src }: { readonly src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img src={src} alt="" decoding="async" draggable={false} onError={() => setFailed(true)} />
  );
}

export function CanvasBackground({
  mediaId,
  src,
  className = "",
}: {
  readonly mediaId?: MediaId | undefined;
  readonly src?: string | undefined;
  readonly className?: string | undefined;
}) {
  const imageSource = src ?? (mediaId === undefined ? undefined : mediaUrl(mediaId));
  return (
    <div
      className={`canvas-background${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      data-has-image={imageSource === undefined ? "false" : "true"}
    >
      {imageSource !== undefined && <BackgroundImage key={imageSource} src={imageSource} />}
      <span className="canvas-background-wash" />
    </div>
  );
}
