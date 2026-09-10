import { ArrowSquareOut, ImageBroken } from "@phosphor-icons/react";
import {
  lazy,
  memo,
  Suspense,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { BoardItem } from "../client/board/types";
import { mediaUrl } from "../client/media-url";
import type { AudioPlaybackCoordinator } from "../client/media/audio-playback";
import { MAX_X_POST_CARD_WIDTH } from "../client/media/x-post-measurement";
import {
  MIN_NATIVE_AUDIO_CARD_HEIGHT,
  MIN_SPOTIFY_AUDIO_CARD_HEIGHT,
  MIN_YOUTUBE_AUDIO_CARD_HEIGHT,
} from "../lib/audio-card-layout";
import type { ItemId } from "../lib/board-rpc";
import type { PresentationItemOrigin } from "./presentation-image-viewer";
import { WebsiteCard } from "./website-card";

const AudioCard = lazy(async () => {
  const module = await import("./audio-card");
  return { default: module.AudioCard };
});

const XPostCard = lazy(async () => {
  const module = await import("./x-post-card");
  return { default: module.XPostCard };
});

type Props = {
  item: BoardItem;
  zoom: number;
  selected: boolean;
  editing: boolean;
  spacePressed: boolean;
  entryDelay: number;
  onSelect: (id: ItemId) => void;
  onMove: (id: ItemId, x: number, y: number) => void;
  onResize: (id: ItemId, width: number, height: number) => void;
  onAutoResize?: (id: ItemId, width: number, height: number) => void;
  onEdit: (item: BoardItem) => void;
  onDelete: (id: ItemId) => void;
  onReorder: (id: ItemId, direction: "front" | "back") => void;
  onPresentItem: (item: BoardItem, origin?: PresentationItemOrigin) => void;
  onInteractionStart?: () => void;
  playbackCoordinator: AudioPlaybackCoordinator;
};

type ItemStyle = CSSProperties & {
  "--item-x": string;
  "--item-y": string;
  "--item-width": string;
  "--item-height": string;
  "--item-rotation": string;
};

function BoardItemComponent({
  item,
  zoom,
  selected,
  editing,
  spacePressed,
  entryDelay,
  onSelect,
  onMove,
  onResize,
  onAutoResize,
  onEdit,
  onDelete,
  onReorder,
  onPresentItem,
  onInteractionStart,
  playbackCoordinator,
}: Props) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const imageSrc = item.mediaId === undefined ? item.src : mediaUrl(item.mediaId);
  const imageFailed = imageSrc !== undefined && failedImageSrc === imageSrc;
  const hasImageAnnotation =
    item.kind === "image" &&
    Boolean(item.annotationTitle || item.annotationDescription || item.href);
  const hasPresentationDetails = hasImageAnnotation || item.kind === "x";
  const editingInteractiveMedia =
    editing &&
    (item.kind === "audio" ||
      item.kind === "spotify" ||
      item.kind === "youtube" ||
      item.kind === "x");

  function beginMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!editing || spacePressed || event.button !== 0) return;
    event.preventDefault();
    onInteractionStart?.();
    onSelect(item.id);
    if (event.pointerType === "touch") return;
    event.stopPropagation();

    const element = elementRef.current;
    if (!element) return;

    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let nextX = item.x;
    let nextY = item.y;
    let moved = false;
    element.setPointerCapture(pointerId);
    element.classList.add("is-moving");

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const deltaX = (moveEvent.clientX - startX) / zoom;
      const deltaY = (moveEvent.clientY - startY) / zoom;
      nextX = item.x + deltaX;
      nextY = item.y + deltaY;
      moved ||= Math.abs(deltaX) + Math.abs(deltaY) > 1;
      element.style.setProperty("--item-x", `${nextX}px`);
      element.style.setProperty("--item-y", `${nextY}px`);
    };

    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancel);
      element.classList.remove("is-moving");
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      if (moved) onMove(item.id, nextX, nextY);
    };

    const cancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancel);
      element.classList.remove("is-moving");
      element.style.setProperty("--item-x", `${item.x}px`);
      element.style.setProperty("--item-y", `${item.y}px`);
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancel);
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    onInteractionStart?.();
    const element = elementRef.current;
    if (!element) return;

    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let nextWidth = item.width;
    let nextHeight = item.height;
    element.setPointerCapture(pointerId);
    element.classList.add("is-resizing");

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const angle = (item.rotation * Math.PI) / 180;
      const screenDeltaX = (moveEvent.clientX - startX) / zoom;
      const screenDeltaY = (moveEvent.clientY - startY) / zoom;
      const localDeltaX = screenDeltaX * Math.cos(angle) + screenDeltaY * Math.sin(angle);
      const localDeltaY = -screenDeltaX * Math.sin(angle) + screenDeltaY * Math.cos(angle);
      const scaleDelta =
        (localDeltaX * item.width + localDeltaY * item.height) /
        (item.width ** 2 + item.height ** 2);
      const audioItem = item.kind === "audio" || item.kind === "spotify" || item.kind === "youtube";
      const fixedWidthItem = audioItem || item.kind === "website" || item.kind === "x";
      const minimumHeight =
        item.kind === "youtube"
          ? MIN_YOUTUBE_AUDIO_CARD_HEIGHT
          : item.kind === "spotify"
            ? MIN_SPOTIFY_AUDIO_CARD_HEIGHT
            : item.kind === "website"
              ? 280
              : item.kind === "x"
                ? 240
                : audioItem
                  ? MIN_NATIVE_AUDIO_CARD_HEIGHT
                  : 80;
      const minScale = Math.max(
        (fixedWidthItem ? 320 : 80) / item.width,
        minimumHeight / item.height,
      );
      const maximumWidth = item.kind === "x" ? MAX_X_POST_CARD_WIDTH : 2_400;
      const maxScale = Math.min(maximumWidth / item.width, 2_400 / item.height);
      const scale = Math.min(maxScale, Math.max(minScale, 1 + scaleDelta));
      nextWidth = item.width * scale;
      nextHeight = item.height * scale;
      element.style.setProperty("--item-width", `${nextWidth}px`);
      element.style.setProperty("--item-height", `${nextHeight}px`);
    };

    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancel);
      element.classList.remove("is-resizing");
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      if (Math.abs(nextWidth - item.width) > 0.5) onResize(item.id, nextWidth, nextHeight);
    };

    const cancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancel);
      element.classList.remove("is-resizing");
      element.style.setProperty("--item-width", `${item.width}px`);
      element.style.setProperty("--item-height", `${item.height}px`);
    };

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancel);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const interactiveTarget = (event.target as HTMLElement).closest(
      "a, button, audio, iframe, .audio-card-controls, .x-post-card",
    );
    if (!editing) {
      if (interactiveTarget === null && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        event.stopPropagation();
        presentItem();
      }
      return;
    }
    if (interactiveTarget !== null) return;
    const key = event.key;
    if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      onDelete(item.id);
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onSelect(item.id);
      if (key === "Enter") onEdit(item);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.altKey) {
      onReorder(item.id, key === "ArrowUp" || key === "ArrowRight" ? "front" : "back");
      return;
    }
    if (event.shiftKey) {
      const grow = key === "ArrowUp" || key === "ArrowRight";
      const scale = grow ? 1.06 : 0.94;
      const audioItem = item.kind === "audio" || item.kind === "spotify" || item.kind === "youtube";
      const fixedWidthItem = audioItem || item.kind === "website" || item.kind === "x";
      const minimumHeight =
        item.kind === "youtube"
          ? MIN_YOUTUBE_AUDIO_CARD_HEIGHT
          : item.kind === "spotify"
            ? MIN_SPOTIFY_AUDIO_CARD_HEIGHT
            : item.kind === "website"
              ? 280
              : item.kind === "x"
                ? 240
                : audioItem
                  ? MIN_NATIVE_AUDIO_CARD_HEIGHT
                  : 80;
      const minScale = Math.max(
        (fixedWidthItem ? 320 : 80) / item.width,
        minimumHeight / item.height,
      );
      const maximumWidth = item.kind === "x" ? MAX_X_POST_CARD_WIDTH : 2_400;
      const maxScale = Math.min(maximumWidth / item.width, 2_400 / item.height);
      const boundedScale = Math.min(maxScale, Math.max(minScale, scale));
      onResize(item.id, item.width * boundedScale, item.height * boundedScale);
      return;
    }

    const step = 10 / zoom;
    const x = item.x + (key === "ArrowRight" ? step : key === "ArrowLeft" ? -step : 0);
    const y = item.y + (key === "ArrowDown" ? step : key === "ArrowUp" ? -step : 0);
    onMove(item.id, x, y);
  }

  const imageContent = imageFailed ? (
    <div className="broken-image" role="img" aria-label="Image unavailable">
      <ImageBroken size={32} weight="light" />
      <span>Image unavailable</span>
    </div>
  ) : (
    <img
      src={imageSrc}
      alt="Mood board reference"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailedImageSrc(imageSrc ?? null)}
    />
  );

  const presentItem = () => {
    const bounds = elementRef.current?.getBoundingClientRect();
    onPresentItem(
      item,
      bounds === undefined
        ? undefined
        : {
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
          },
    );
  };

  const presentationKeyboardTarget =
    !editing &&
    (item.kind === "website" ||
      item.kind === "audio" ||
      item.kind === "spotify" ||
      item.kind === "youtube" ||
      item.kind === "x");

  const presentationLabel =
    item.kind === "website"
      ? `Website card: ${item.websiteTitle ?? item.websiteSiteLabel}. Press Enter to enlarge.`
      : item.kind === "x"
        ? `X ${item.xDisplay === "media" ? "media" : "post"} reference. Press Enter to enlarge.`
        : `${item.kind === "spotify" ? "Spotify" : item.kind === "youtube" ? "YouTube" : "Audio"} card. Press Enter to enlarge.`;

  const style: ItemStyle = {
    "--item-x": `${item.x}px`,
    "--item-y": `${item.y}px`,
    "--item-width": `${item.width}px`,
    "--item-height": `${item.height}px`,
    "--item-rotation": `${item.rotation}deg`,
    zIndex: item.order,
    animationDelay: `${entryDelay}ms`,
  };

  return (
    <div
      ref={elementRef}
      className={`board-item board-item--${item.kind}${selected && editing ? " is-selected" : ""}${editingInteractiveMedia ? " is-media-editing" : ""}${item.href || item.websiteUrl ? " has-link" : ""}${hasPresentationDetails ? " has-annotation" : ""}`}
      style={style}
      onPointerDown={beginMove}
      onDoubleClick={(event) => {
        if (editing) {
          onEdit(item);
          return;
        }
        if (
          (event.target as HTMLElement).closest(
            "a, button, audio, iframe, .audio-card-controls, .x-post-card",
          ) === null
        ) {
          presentItem();
        }
      }}
      onFocus={() => editing && onSelect(item.id)}
      onKeyDown={handleKeyDown}
      role={editing || presentationKeyboardTarget ? "group" : undefined}
      aria-label={
        editing
          ? `${selected ? "Selected. " : ""}${
              item.kind === "image"
                ? `Image reference${hasImageAnnotation ? " with details" : ""}. Arrow keys move; Shift and arrow keys resize; Alt and arrow keys change layering.`
                : item.kind === "note"
                  ? `Note: ${item.text}`
                  : item.kind === "swatch"
                    ? `Color swatch: ${item.label ?? item.color}`
                    : item.kind === "website"
                      ? `Website card: ${item.websiteTitle ?? item.websiteSiteLabel}`
                      : item.kind === "x"
                        ? `X ${item.xDisplay === "media" ? "media" : "post"} reference: ${item.xAuthorHandle ? `@${item.xAuthorHandle}` : item.src}`
                        : `${item.kind === "spotify" ? "Spotify" : item.kind === "youtube" ? "YouTube" : "Audio"} card: ${item.label || (item.mediaId ? "managed board audio" : item.src)}`
            }`
          : presentationKeyboardTarget
            ? presentationLabel
            : undefined
      }
      tabIndex={editing || presentationKeyboardTarget ? 0 : undefined}
      data-item-id={item.id}
      data-presentation-item-id={editing ? undefined : item.id}
    >
      {item.kind === "image" &&
        (!editing ? (
          <button
            type="button"
            className="presentation-image-trigger presentation-item-trigger"
            data-presentation-item-id={item.id}
            aria-label={`Enlarge${item.annotationTitle ? ` ${item.annotationTitle}` : " image"}`}
            onClick={(event) => {
              if (event.detail === 0) presentItem();
            }}
          >
            {imageContent}
          </button>
        ) : (
          imageContent
        ))}

      {!editing && hasPresentationDetails && (
        <aside
          className={`item-annotation${item.kind === "x" ? " item-annotation--x" : ""}`}
          aria-label={item.kind === "x" ? "X post details" : "Image details"}
        >
          {item.kind === "image" ? (
            <>
              {item.annotationTitle && <strong>{item.annotationTitle}</strong>}
              {item.annotationDescription && <p>{item.annotationDescription}</p>}
              {item.href && (
                <a
                  className="item-annotation-link presentation-item-link presentation-detail-link"
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  onClick={(event) => {
                    if (event.detail > 0) event.preventDefault();
                  }}
                >
                  <span>{item.annotationTitle ? "View source" : "Open source page"}</span>
                  <ArrowSquareOut size={14} weight="bold" />
                </a>
              )}
            </>
          ) : item.kind === "x" ? (
            <>
              <strong>
                {item.xAuthorName || (item.xAuthorHandle ? `@${item.xAuthorHandle}` : "X post")}
              </strong>
              {(item.xAuthorHandle || item.xPostDate) && (
                <span className="item-annotation-meta">
                  {item.xAuthorHandle ? `@${item.xAuthorHandle}` : ""}
                  {item.xAuthorHandle && item.xPostDate ? " · " : ""}
                  {item.xPostDate ?? ""}
                </span>
              )}
              {item.xPostText && <p>{item.xPostText}</p>}
              {item.src && (
                <a
                  className="item-annotation-link presentation-item-link presentation-detail-link"
                  href={item.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  onClick={(event) => {
                    if (event.detail > 0) event.preventDefault();
                  }}
                >
                  <span>Open on X</span>
                  <ArrowSquareOut size={14} weight="bold" />
                </a>
              )}
            </>
          ) : null}
        </aside>
      )}

      {item.kind === "note" &&
        (!editing ? (
          <button
            type="button"
            className="presentation-item-trigger"
            data-presentation-item-id={item.id}
            aria-label="Enlarge field note"
            onClick={(event) => {
              if (event.detail === 0) presentItem();
            }}
          >
            <div className="note-content">
              <p>{item.text}</p>
              <span>Field note</span>
            </div>
          </button>
        ) : (
          <div className="note-content">
            <p>{item.text}</p>
            <span>Field note</span>
          </div>
        ))}

      {item.kind === "website" && <WebsiteCard item={item} editing />}

      {(item.kind === "spotify" || item.kind === "youtube" || item.kind === "audio") && (
        <Suspense
          fallback={<div className="audio-card audio-card-loading">Loading audio card…</div>}
        >
          <AudioCard
            item={item}
            coordinator={playbackCoordinator}
            editing
            onHeight={(height) => (onAutoResize ?? onResize)(item.id, item.width, height)}
          />
        </Suspense>
      )}

      {item.kind === "x" && (
        <Suspense
          fallback={<div className="x-post-card x-post-card-loading">Loading X reference…</div>}
        >
          <XPostCard
            item={item}
            editing
            onHeight={(height) => (onAutoResize ?? onResize)(item.id, item.width, height)}
          />
        </Suspense>
      )}

      {item.kind === "swatch" &&
        (!editing ? (
          <button
            type="button"
            className="presentation-item-trigger"
            data-presentation-item-id={item.id}
            aria-label={`Enlarge ${item.label || item.color || "color study"}`}
            onClick={(event) => {
              if (event.detail === 0) presentItem();
            }}
          >
            <div className="swatch-content" style={{ backgroundColor: item.color }}>
              <div className="swatch-label">
                <span>{item.label || item.color || "Color study"}</span>
                <span>{item.color?.toUpperCase()}</span>
              </div>
            </div>
          </button>
        ) : (
          <div className="swatch-content" style={{ backgroundColor: item.color }}>
            <div className="swatch-label">
              <span>{item.label || item.color || "Color study"}</span>
              <span>{item.color?.toUpperCase()}</span>
            </div>
          </div>
        ))}

      {selected && editing && (
        <button
          type="button"
          className="resize-handle"
          onPointerDown={beginResize}
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
    </div>
  );
}

export const BoardItemView = memo(BoardItemComponent);
