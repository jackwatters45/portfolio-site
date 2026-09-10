import { ArrowSquareOut, ImageBroken, X } from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { BoardItem } from "../client/board/types";
import { mediaUrl } from "../client/media-url";
import { AudioPlaybackCoordinator } from "../client/media/audio-playback";
import {
  fitPresentationItemScale,
  type AvailablePresentationRoom,
} from "../client/media/presentation-item-fit";
import { AudioCard } from "./audio-card";
import { WebsiteCard } from "./website-card";
import { XPostCard } from "./x-post-card";

export type PresentationItemOrigin = {
  readonly x: number;
  readonly y: number;
};

type ViewerStyle = CSSProperties & {
  "--viewer-origin-x": string;
  "--viewer-origin-y": string;
};

type ItemFrameStyle = CSSProperties & {
  "--viewer-item-width": string;
  "--viewer-item-height": string;
  "--viewer-item-scale": number;
};

type Props = {
  readonly item: BoardItem;
  readonly origin: PresentationItemOrigin;
  readonly onClose: () => void;
};

const focusableSelector =
  "button:not([disabled]), a[href], audio[controls], iframe, [tabindex]:not([tabindex='-1'])";

const initialAvailableRoom = (): AvailablePresentationRoom => {
  if (typeof window === "undefined") return { width: 1_160, height: 650 };
  if (window.innerWidth < 640) {
    return {
      width: Math.max(1, window.innerWidth - 28),
      height: Math.max(1, window.innerHeight - 132),
    };
  }
  const inset = Math.min(84, Math.max(38, window.innerWidth * 0.06));
  return {
    width: Math.max(1, window.innerWidth - inset * 2),
    height: Math.max(1, window.innerHeight - inset - 76),
  };
};

const itemTitle = (item: BoardItem): string => {
  if (item.kind === "image") return item.annotationTitle?.trim() || "Image reference";
  if (item.kind === "note") return "Field note";
  if (item.kind === "swatch")
    return item.label?.trim() || item.color?.toUpperCase() || "Color study";
  if (item.kind === "website")
    return item.websiteTitle?.trim() || item.websiteSiteLabel?.trim() || "Website";
  if (item.kind === "x")
    return item.xAuthorName?.trim() || (item.xAuthorHandle ? `@${item.xAuthorHandle}` : "X post");
  return (
    item.label?.trim() ||
    (item.kind === "spotify"
      ? "Spotify reference"
      : item.kind === "youtube"
        ? "YouTube reference"
        : "Audio reference")
  );
};

const sourceLink = (item: BoardItem): { readonly href: string; readonly label: string } | null => {
  if (item.kind === "image" && item.href) return { href: item.href, label: "Open source" };
  if (item.kind === "website" && item.websiteUrl)
    return { href: item.websiteUrl, label: "Visit site" };
  if (item.kind === "x" && item.src) return { href: item.src, label: "Open on X" };
  if ((item.kind === "spotify" || item.kind === "youtube") && item.src) {
    return { href: item.src, label: "Open source" };
  }
  if (item.kind === "audio" && item.mediaId === undefined && item.src) {
    return { href: item.src, label: "Open audio" };
  }
  return null;
};

export function PresentationItemViewer({ item, origin, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [imageState, setImageState] = useState<"loading" | "loaded" | "error">("loading");
  const [availableRoom, setAvailableRoom] = useState(initialAvailableRoom);
  const [playback] = useState(() => new AudioPlaybackCoordinator());
  const imageSrc =
    item.kind === "image"
      ? item.mediaId === undefined
        ? item.src
        : mediaUrl(item.mediaId)
      : undefined;
  const title = itemTitle(item);
  const link = sourceLink(item);
  const resolvedImageState = imageSrc ? imageState : "error";

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const stage = stageRef.current;
    if (stage === null) return;
    const measure = () => {
      const computed = getComputedStyle(stage);
      setAvailableRoom({
        width: Math.max(
          1,
          stage.clientWidth -
            Number.parseFloat(computed.paddingLeft) -
            Number.parseFloat(computed.paddingRight),
        ),
        height: Math.max(
          1,
          stage.clientHeight -
            Number.parseFloat(computed.paddingTop) -
            Number.parseFloat(computed.paddingBottom),
        ),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", keyDown);
    return () => {
      playback.pauseAll();
      document.removeEventListener("keydown", keyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [playback]);

  const style: ViewerStyle = {
    "--viewer-origin-x": `${origin.x}px`,
    "--viewer-origin-y": `${origin.y}px`,
  };
  const itemScale = fitPresentationItemScale(item.width, item.height, availableRoom);
  const itemFrameStyle: ItemFrameStyle = {
    width: item.width * itemScale,
    height: item.height * itemScale,
    "--viewer-item-width": `${item.width}px`,
    "--viewer-item-height": `${item.height}px`,
    "--viewer-item-scale": itemScale,
  };

  const trapDialogFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || event.target !== event.currentTarget) return;
    event.preventDefault();
    closeRef.current?.focus();
  };

  return (
    <div
      ref={dialogRef}
      className={`presentation-image-viewer presentation-item-viewer presentation-item-viewer--${item.kind}`}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label={`Enlarged ${item.kind}: ${title}`}
      onKeyDown={trapDialogFocus}
    >
      <div
        className="presentation-image-viewer-backdrop"
        aria-hidden="true"
        onPointerDown={onClose}
      />

      <div ref={stageRef} className="presentation-image-viewer-stage">
        {item.kind === "image" ? (
          <figure
            className={`presentation-image-viewer-frame presentation-image-viewer-frame--contain is-${resolvedImageState}`}
            aria-busy={resolvedImageState === "loading"}
          >
            {imageSrc && (
              <img
                src={imageSrc}
                alt={title}
                draggable={false}
                referrerPolicy="no-referrer"
                onLoad={() => setImageState("loaded")}
                onError={() => setImageState("error")}
              />
            )}
            {resolvedImageState === "loading" && imageSrc && (
              <span className="presentation-image-viewer-loading" role="status">
                Loading full image
              </span>
            )}
            {resolvedImageState === "error" && (
              <div
                className="presentation-image-viewer-error"
                role="img"
                aria-label="Image unavailable"
              >
                <ImageBroken size={34} weight="light" />
                <span>Image unavailable</span>
              </div>
            )}
          </figure>
        ) : (
          <div className="presentation-item-viewer-frame" style={itemFrameStyle}>
            <div className={`presentation-item-viewer-surface board-item--${item.kind}`}>
              {item.kind === "note" && (
                <div className="note-content">
                  <p>{item.text}</p>
                  <span>Field note</span>
                </div>
              )}
              {item.kind === "swatch" && (
                <div className="swatch-content" style={{ backgroundColor: item.color }}>
                  <div className="swatch-label">
                    <span>{item.label || item.color || "Color study"}</span>
                    <span>{item.color?.toUpperCase()}</span>
                  </div>
                </div>
              )}
              {item.kind === "website" && <WebsiteCard item={item} editing />}
              {(item.kind === "spotify" || item.kind === "youtube" || item.kind === "audio") && (
                <AudioCard item={item} coordinator={playback} />
              )}
              {item.kind === "x" && <XPostCard item={item} />}
            </div>
          </div>
        )}
      </div>

      {item.kind === "image" && (item.annotationTitle || item.annotationDescription) && (
        <div className="presentation-item-viewer-caption">
          {item.annotationTitle && <strong>{item.annotationTitle}</strong>}
          {item.annotationDescription && <p>{item.annotationDescription}</p>}
        </div>
      )}

      {link && (
        <a
          className="presentation-image-viewer-source"
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
        >
          <span>{link.label}</span>
          <ArrowSquareOut size={15} weight="bold" />
        </a>
      )}

      <button
        ref={closeRef}
        type="button"
        className="presentation-image-viewer-close"
        aria-label={`Close enlarged ${item.kind}`}
        onClick={onClose}
      >
        <X size={18} weight="bold" />
      </button>
    </div>
  );
}
