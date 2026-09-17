import { XLogo } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { BoardItem } from "../client/board/types";
import { loadXWidgets } from "../client/media/x-embed";
import { measureRenderedXPostHeight, xPostVisualScale } from "../client/media/x-post-measurement";
import { parseXPostUrl } from "../lib/x-post";

type Props = {
  readonly item: BoardItem;
  readonly editing?: boolean;
  readonly onHeight?: (height: number) => void;
};

const stopPointer = (event: ReactPointerEvent<HTMLElement>) => event.stopPropagation();

const useResolvedTheme = (theme: BoardItem["xTheme"]): "light" | "dark" => {
  const [automatic, setAutomatic] = useState<"light" | "dark">("light");
  useEffect(() => {
    if (theme !== "automatic") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setAutomatic(query.matches ? "dark" : "light");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [theme]);
  return theme === "dark" ? "dark" : theme === "light" ? "light" : automatic;
};

function XPostSnapshot({ item, author }: { readonly item: BoardItem; readonly author: string }) {
  return (
    <div className="x-post-fallback">
      <span className="x-post-mark" aria-hidden="true">
        <XLogo size={19} weight="bold" />
      </span>
      <div className="x-post-snapshot">
        <strong>{author}</strong>
        {item.xAuthorHandle && item.xAuthorName && <small>@{item.xAuthorHandle}</small>}
        {item.xPostText && <p>{item.xPostText}</p>}
        {item.xPostDate && <time dateTime={item.xPostDate}>{item.xPostDate}</time>}
      </div>
    </div>
  );
}

export function XPostCard({ item, editing = false, onHeight }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const itemHeightRef = useRef(item.height);
  const onHeightRef = useRef(onHeight);
  useEffect(() => {
    onHeightRef.current = onHeight;
  }, [onHeight]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const theme = useResolvedTheme(item.xTheme);
  const source = parseXPostUrl(item.src ?? "");
  const sourceSrc = source?.src;
  const sourceHandle = source?.handle;

  const scaleCurrentIframe = useCallback(() => {
    const mount = mountRef.current;
    const iframe = mount?.querySelector("iframe");
    if (mount === null || mount === undefined || iframe === null || iframe === undefined)
      return false;
    const scale = xPostVisualScale(iframe.offsetWidth, mount.clientWidth);
    if (scale === null || iframe.offsetHeight < 100) return false;
    iframe.style.transform = scale === 1 ? "" : `scale(${scale})`;
    iframe.style.transformOrigin = "top center";
    mount.style.height = `${Math.ceil(iframe.offsetHeight * scale)}px`;
    return true;
  }, []);

  const reconcileCurrentHeight = useCallback(() => {
    const root = rootRef.current;
    const iframe = mountRef.current?.querySelector("iframe");
    if (root === null || iframe == null) return false;
    // offsetHeight is unscaled; getBoundingClientRect() is distorted by the canvas zoom transform.
    const next = measureRenderedXPostHeight(iframe, root);
    if (next === null) return false;
    if (Math.abs(next - itemHeightRef.current) >= 4 && onHeightRef.current !== undefined) {
      itemHeightRef.current = next;
      onHeightRef.current(next);
    }
    return true;
  }, []);

  useEffect(() => {
    itemHeightRef.current = item.height;
    reconcileCurrentHeight();
  }, [item.height, reconcileCurrentHeight]);

  useEffect(() => {
    if (sourceSrc === undefined || sourceHandle === undefined || mountRef.current === null) return;
    let active = true;
    let mutationObserver: MutationObserver | null = null;
    let iframeObserver: ResizeObserver | null = null;
    let rootObserver: ResizeObserver | null = null;
    let observedIframe: HTMLIFrameElement | null = null;
    let renderTimeout: number | undefined;
    const mount = mountRef.current;
    setStatus("loading");
    setError("");
    mount.style.height = "";
    mount.replaceChildren();

    const finishRendered = () => {
      const iframe = mount.querySelector("iframe");
      if (!active || iframe === null || iframe.offsetHeight < 100 || !scaleCurrentIframe())
        return false;
      if (renderTimeout !== undefined) {
        window.clearTimeout(renderTimeout);
        renderTimeout = undefined;
      }
      mutationObserver?.disconnect();
      setError("");
      setStatus("loaded");
      requestAnimationFrame(reconcileCurrentHeight);
      return true;
    };

    const observeIframe = () => {
      const iframe = mount.querySelector("iframe");
      if (iframe === null) return false;
      if (iframe !== observedIframe) {
        iframeObserver?.disconnect();
        observedIframe = iframe;
        iframeObserver = new ResizeObserver(finishRendered);
        iframeObserver.observe(iframe);
      }
      requestAnimationFrame(finishRendered);
      return finishRendered();
    };

    void loadXWidgets()
      .then((api) => {
        if (!active) return;
        const quote = document.createElement("blockquote");
        quote.className = "twitter-tweet";
        quote.dataset.dnt = "true";
        quote.dataset.theme = theme;
        if (item.xDisplay === "media") {
          quote.dataset.mediaMaxWidth = String(
            Math.round(Math.min(1_920, Math.max(560, item.width))),
          );
        } else {
          quote.dataset.conversation = "none";
        }
        const link = document.createElement("a");
        link.href = sourceSrc;
        link.textContent = item.xPostText ?? `Post by @${item.xAuthorHandle ?? sourceHandle}`;
        quote.append(link);
        mount.replaceChildren(quote);

        rootObserver = new ResizeObserver(finishRendered);
        if (rootRef.current !== null) rootObserver.observe(rootRef.current);
        mutationObserver = new MutationObserver(observeIframe);
        mutationObserver.observe(mount, { childList: true, subtree: true });
        api.widgets.load(mount);
        observeIframe();
        renderTimeout = window.setTimeout(() => {
          if (!active || finishRendered()) return;
          mutationObserver?.disconnect();
          iframeObserver?.disconnect();
          rootObserver?.disconnect();
          mount.replaceChildren();
          setStatus("error");
          setError("This X post could not be displayed here.");
        }, 20_000);
      })
      .catch((reason: unknown) => {
        if (active) {
          mount.replaceChildren();
          setStatus("error");
          setError(reason instanceof Error ? reason.message : "X could not be loaded.");
        }
      });

    return () => {
      active = false;
      mutationObserver?.disconnect();
      iframeObserver?.disconnect();
      rootObserver?.disconnect();
      if (renderTimeout !== undefined) window.clearTimeout(renderTimeout);
      mount.style.height = "";
      mount.replaceChildren();
    };
  }, [
    attempt,
    item.width,
    item.xAuthorHandle,
    item.xDisplay,
    item.xPostText,
    reconcileCurrentHeight,
    scaleCurrentIframe,
    sourceHandle,
    sourceSrc,
    theme,
  ]);

  const author =
    item.xAuthorName ||
    (item.xAuthorHandle ? `@${item.xAuthorHandle}` : source ? `@${source.handle}` : "X post");
  return (
    <div ref={rootRef} className={`x-post-card is-${status}${editing ? " is-editing" : ""}`}>
      {status !== "loaded" && <XPostSnapshot item={item} author={author} />}
      <div
        className="x-embed-mount"
        ref={mountRef}
        hidden={status === "error"}
        inert={editing ? true : undefined}
        onPointerDown={editing ? undefined : stopPointer}
        aria-label={`${item.xDisplay === "media" ? "X media" : "X post"} by ${author}`}
      />
      {status === "error" && (
        <div
          className="x-post-error"
          role="status"
          inert={editing ? true : undefined}
          onPointerDown={editing ? undefined : stopPointer}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError("");
              setStatus("loading");
              setAttempt((value) => value + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
