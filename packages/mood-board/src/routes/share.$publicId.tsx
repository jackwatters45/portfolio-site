import { Copy, CornersOut, Minus, Plus, ShareNetwork } from "@phosphor-icons/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { parsePublicId } from "../client/board-route";
import {
  accessibleFieldColors,
  fitCamera,
  MAX_ZOOM,
  MIN_ZOOM,
  screenToWorld,
  zoomCamera,
} from "../client/board/board-utils";
import type { BoardItem, Camera } from "../client/board/types";
import { publicMediaUrl } from "../client/media-url";
import { AudioPlaybackCoordinator } from "../client/media/audio-playback";
import { loadPublicBoard, PublicApiError } from "../client/public-api-client";
import { BoardItemView } from "../components/board-item-view";
import { CanvasBackground } from "../components/canvas-background";
import {
  PresentationItemViewer,
  type PresentationItemOrigin,
} from "../components/presentation-image-viewer";
import { ItemIdSchema, type ItemId } from "../lib/board-rpc";
import type { PublicBoard } from "../lib/public-api";

export const Route = createFileRoute("/share/$publicId")({
  params: {
    parse: ({ publicId }) => {
      const parsed = parsePublicId(publicId);
      if (parsed === null) throw notFound();
      return { publicId: parsed };
    },
    stringify: ({ publicId }) => ({ publicId }),
  },
  component: PublicBoardPage,
});

interface PublicBoardStyle extends CSSProperties {
  "--field": string;
  "--field-foreground": string;
  "--field-muted": string;
  "--field-selection": string;
}

interface PublicWorldStyle extends CSSProperties {
  "--camera-zoom": number;
}

type Point = { readonly x: number; readonly y: number };
type PublicGesture = {
  readonly center: Point;
  readonly start?: Point;
  readonly distance?: number;
  readonly presentationItemId?: string;
  readonly linkHref?: string;
};
type PresentedItem = {
  readonly itemId: ItemId;
  readonly origin: PresentationItemOrigin;
};

const shareCurrentPage = async (title: string): Promise<string> => {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url: window.location.href });
      return "Share sheet opened";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "";
    }
  }
  await navigator.clipboard.writeText(window.location.href);
  return "Board link copied";
};

function PublicBoardPage() {
  const { publicId } = Route.useParams();
  const [snapshot, setSnapshot] = useState<PublicBoard | null>(null);
  const [itemSizeOverrides, setItemSizeOverrides] = useState<
    Readonly<Record<string, { readonly width: number; readonly height: number }>>
  >({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [camera, setCamera] = useState<Camera>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    z: 1,
  });
  const [presentedItem, setPresentedItem] = useState<PresentedItem | null>(null);
  const [playback] = useState(() => new AudioPlaybackCoordinator());
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<PublicGesture | null>(null);

  const items = useMemo<BoardItem[]>(
    () =>
      snapshot?.board.items.map((item, index) => {
        const id = ItemIdSchema.make(`public-item-${index}`);
        const override = itemSizeOverrides[id];
        if (item.mediaId === undefined) {
          return { id, ...item, ...(override === undefined ? {} : override) };
        }
        const { mediaId, ...rest } = item;
        return {
          id,
          ...rest,
          src: publicMediaUrl(publicId, mediaId),
          ...(override === undefined ? {} : override),
        };
      }) ?? [],
    [itemSizeOverrides, publicId, snapshot],
  );
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    let active = true;
    void loadPublicBoard(publicId).then(
      (value) => {
        if (!active) return;
        setItemSizeOverrides({});
        setSnapshot(value);
      },
      (reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof PublicApiError && reason.status === 404
            ? "This board is private, unpublished, or does not exist."
            : "The public board could not be loaded.",
        );
      },
    );
    return () => {
      active = false;
      playback.pauseAll();
    };
  }, [playback, publicId]);

  useEffect(() => {
    if (snapshot === null) return;
    const refit = () => setCamera(fitCamera(itemsRef.current));
    refit();
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, [snapshot]);

  const reconcileItemSize = (id: ItemId, width: number, height: number) => {
    setItemSizeOverrides((current) => {
      const previous = current[id];
      if (
        previous !== undefined &&
        Math.abs(previous.width - width) < 1 &&
        Math.abs(previous.height - height) < 4
      )
        return current;
      return { ...current, [id]: { width, height } };
    });
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        setCamera((current) =>
          zoomCamera(
            current,
            { x: event.clientX, y: event.clientY },
            current.z * Math.exp(-event.deltaY * 0.0025),
          ),
        );
      } else {
        setCamera((current) => ({
          ...current,
          x: current.x - event.deltaX / current.z,
          y: current.y - event.deltaY / current.z,
        }));
      }
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [snapshot]);

  const presentItem = (itemId: ItemId, origin?: PresentationItemOrigin) => {
    if (!items.some((item) => item.id === itemId)) return;
    playback.pauseAll();
    setPresentedItem({
      itemId,
      origin: origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    });
  };

  const beginPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as Element;
    const presentationDetailLink = target.closest<HTMLAnchorElement>(".presentation-detail-link");
    const presentationItem = target.closest<HTMLElement>("[data-presentation-item-id]");
    const presentationItemId = presentationItem?.dataset.presentationItemId;
    if (
      presentationDetailLink === null &&
      presentationItemId === undefined &&
      target.closest("button, a, audio, video, .audio-card-controls") !== null
    )
      return;
    event.preventDefault();
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointers = [...pointersRef.current.values()];
    if (pointers.length >= 2) {
      const [left, right] = pointers;
      gestureRef.current = {
        center: { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 },
        distance: Math.hypot(left.x - right.x, left.y - right.y),
      };
    } else {
      gestureRef.current = {
        center: point,
        start: point,
        ...(presentationDetailLink !== null
          ? { linkHref: presentationDetailLink.href }
          : presentationItemId === undefined
            ? {}
            : { presentationItemId }),
      };
    }
  };

  const movePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || !pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointers = [...pointersRef.current.values()];
    if (pointers.length >= 2) {
      const [left, right] = pointers;
      const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
      const distance = Math.max(1, Math.hypot(left.x - right.x, left.y - right.y));
      setCamera((current) => {
        const anchor = screenToWorld(gesture.center, current);
        const z = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, current.z * (distance / Math.max(1, gesture.distance ?? distance))),
        );
        return { x: center.x / z - anchor.x, y: center.y / z - anchor.y, z };
      });
      gestureRef.current = { center, distance };
    } else {
      const point = pointers[0];
      if (point === undefined) return;
      setCamera((current) => ({
        ...current,
        x: current.x + (point.x - gesture.center.x) / current.z,
        y: current.y + (point.y - gesture.center.y) / current.z,
      }));
      gestureRef.current = { ...gesture, center: point };
    }
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (
      pointersRef.current.size === 1 &&
      event.type !== "pointercancel" &&
      gesture?.start !== undefined &&
      Math.hypot(event.clientX - gesture.start.x, event.clientY - gesture.start.y) < 6
    ) {
      if (gesture.presentationItemId !== undefined) {
        const item = items.find((item) => item.id === gesture.presentationItemId);
        if (item !== undefined) presentItem(item.id, gesture.start);
      } else if (gesture.linkHref !== undefined) {
        window.open(gesture.linkHref, "_blank", "noopener,noreferrer");
      }
    }
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const pointers = [...pointersRef.current.values()];
    gestureRef.current = pointers.length > 0 ? { center: pointers[0] } : null;
  };

  if (error) {
    return (
      <main className="public-state-page">
        <span className="public-mark">Moodboard</span>
        <h1>Board unavailable</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (snapshot === null) {
    return (
      <main className="public-state-page" aria-busy="true">
        <p>Loading public board…</p>
      </main>
    );
  }

  const background = snapshot.board.background ?? "#EDEDED";
  const colors = accessibleFieldColors(background);
  const style: PublicBoardStyle = {
    "--field": background,
    "--field-foreground": colors.foreground,
    "--field-muted": colors.muted,
    "--field-selection": colors.selection,
  };

  const worldStyle: PublicWorldStyle = {
    transform: `scale(${camera.z}) translate3d(${camera.x}px, ${camera.y}px, 0)`,
    "--camera-zoom": camera.z,
  };
  const presentedBoardItem =
    presentedItem === null ? undefined : items.find((item) => item.id === presentedItem.itemId);

  return (
    <main className="app-shell is-presenting public-board-page" style={style}>
      <div
        ref={viewportRef}
        className="canvas-viewport public-canvas"
        role="region"
        aria-label={`Read-only mood board: ${snapshot.board.title}`}
        onPointerDown={beginPointer}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <CanvasBackground
          src={
            snapshot.board.backgroundMediaId === undefined
              ? undefined
              : publicMediaUrl(publicId, snapshot.board.backgroundMediaId)
          }
        />
        <div className="canvas-world" style={worldStyle}>
          {items.map((item, index) => (
            <BoardItemView
              key={item.id}
              item={item}
              zoom={camera.z}
              selected={false}
              editing={false}
              spacePressed={false}
              entryDelay={80 + ((index * 61) % 360)}
              onSelect={() => undefined}
              onMove={() => undefined}
              onResize={() => undefined}
              onAutoResize={reconcileItemSize}
              onEdit={() => undefined}
              onDelete={() => undefined}
              onReorder={() => undefined}
              onPresentItem={(item, origin) => presentItem(item.id, origin)}
              playbackCoordinator={playback}
            />
          ))}
        </div>
        {items.length === 0 && (
          <p className="public-empty-board">
            <span>This published board is empty.</span>
          </p>
        )}
      </div>

      {presentedBoardItem && presentedItem && (
        <PresentationItemViewer
          key={`${presentedBoardItem.id}:${presentedBoardItem.mediaId ?? presentedBoardItem.src ?? "item"}`}
          item={presentedBoardItem}
          origin={presentedItem.origin}
          onClose={() => setPresentedItem(null)}
        />
      )}

      <header className="public-board-header">
        <div>
          <h1>{snapshot.board.title || "Untitled mood"}</h1>
          <Link to="/@{$handle}" params={{ handle: snapshot.owner.handle }}>
            by {snapshot.owner.displayName} <span>@{snapshot.owner.handle}</span>
          </Link>
        </div>
        <div className="public-board-actions">
          <button type="button" aria-label="Fit board" onClick={() => setCamera(fitCamera(items))}>
            <CornersOut size={18} />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() =>
              setCamera((current) =>
                zoomCamera(
                  current,
                  { x: window.innerWidth / 2, y: window.innerHeight / 2 },
                  current.z / 1.2,
                ),
              )
            }
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() =>
              setCamera((current) =>
                zoomCamera(
                  current,
                  { x: window.innerWidth / 2, y: window.innerHeight / 2 },
                  current.z * 1.2,
                ),
              )
            }
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            className="public-share-button"
            aria-label="Share board"
            onClick={() => {
              void shareCurrentPage(snapshot.board.title).then(setNotice, () =>
                setNotice("Could not copy this link"),
              );
            }}
          >
            {typeof navigator.share === "function" ? (
              <ShareNetwork size={18} />
            ) : (
              <Copy size={18} />
            )}
            <span>Share</span>
          </button>
        </div>
      </header>
      <p className="visually-hidden" role="status" aria-live="polite">
        {notice}
      </p>
    </main>
  );
}
