import { SpeakerHigh } from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { BoardItem } from "../client/board/types";
import { mediaUrl } from "../client/media-url";
import type { AudioPlaybackCoordinator } from "../client/media/audio-playback";
import { loadSpotifyIframeApi, type SpotifyEmbedController } from "../client/media/spotify-embed";
import {
  isYouTubePlayingMessage,
  YOUTUBE_PLAYER_ORIGIN,
} from "../client/media/youtube-player-message";
import { preferredAudioCardHeight, SPOTIFY_AUDIO_CARD_HEIGHT } from "../lib/audio-card-layout";
import { parseSpotifySource, parseYouTubeSource } from "../lib/audio-source";

type Props = {
  readonly item: BoardItem;
  readonly coordinator: AudioPlaybackCoordinator;
  readonly editing?: boolean;
  readonly onHeight?: (height: number) => void;
};

const stopPointer = (event: ReactPointerEvent<HTMLElement>) => event.stopPropagation();

export function AudioCard({ item, coordinator, editing = false, onHeight }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const onHeightRef = useRef(onHeight);
  const spotifyMountRef = useRef<HTMLDivElement>(null);
  const youtubeFrameRef = useRef<HTMLIFrameElement>(null);
  const [failedNativeSource, setFailedNativeSource] = useState<string | null>(null);
  const [nativeAttempt, setNativeAttempt] = useState(0);
  const nativeSource = item.mediaId === undefined ? item.src : mediaUrl(item.mediaId);
  const nativeFailed = failedNativeSource !== null && failedNativeSource === nativeSource;
  const [spotifyError, setSpotifyError] = useState("");
  const [spotifyAttempt, setSpotifyAttempt] = useState(0);
  const spotify = useMemo(
    () => (item.kind === "spotify" ? parseSpotifySource(item.src ?? "") : null),
    [item.kind, item.src],
  );
  const youtube = useMemo(
    () => (item.kind === "youtube" ? parseYouTubeSource(item.src ?? "") : null),
    [item.kind, item.src],
  );
  const youtubeEmbedUrl =
    youtube === null
      ? null
      : `${youtube.embedUrl}&origin=${encodeURIComponent(
          typeof window === "undefined" ? "https://moodboard.invalid" : window.location.origin,
        )}`;

  useEffect(() => {
    onHeightRef.current = onHeight;
  }, [onHeight]);

  useEffect(() => {
    const kind =
      item.kind === "spotify" ? "spotify" : item.kind === "youtube" ? "youtube" : "audio";
    const height = preferredAudioCardHeight(kind, item.width);
    if (Math.abs(height - item.height) >= 4) onHeightRef.current?.(height);
  }, [item.height, item.kind, item.width]);

  useEffect(() => {
    if (item.kind !== "audio") return;
    const pause = () => audioRef.current?.pause();
    const unregister = coordinator.register(item.id, pause);
    return () => {
      pause();
      unregister();
    };
  }, [coordinator, item.id, item.kind]);

  useEffect(() => {
    if (spotify === null || spotifyMountRef.current === null) return;
    let active = true;
    let controller: SpotifyEmbedController | null = null;
    let unregister: (() => void) | null = null;
    const wrapper = spotifyMountRef.current;
    const mount = document.createElement("div");
    wrapper.replaceChildren(mount);
    setSpotifyError("");
    void loadSpotifyIframeApi()
      .then((api) => {
        if (!active) return;
        api.createController(
          mount,
          { uri: spotify.uri, width: "100%", height: String(SPOTIFY_AUDIO_CARD_HEIGHT) },
          (created) => {
            if (!active) {
              created.destroy();
              return;
            }
            controller = created;
            unregister = coordinator.register(item.id, () => created.pause());
            created.addListener("playback_update", (event) => {
              if (event.data?.isPaused === false) coordinator.playing(item.id);
            });
          },
        );
      })
      .catch((error: unknown) => {
        if (active)
          setSpotifyError(error instanceof Error ? error.message : "Spotify could not be loaded.");
      });
    return () => {
      active = false;
      unregister?.();
      controller?.pause();
      controller?.destroy();
      wrapper.replaceChildren();
    };
  }, [coordinator, item.id, spotify, spotifyAttempt]);

  useEffect(() => {
    if (youtube === null) return;
    const pause = () =>
      youtubeFrameRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
        YOUTUBE_PLAYER_ORIGIN,
      );
    const onMessage = (event: MessageEvent) => {
      if (isYouTubePlayingMessage(event, youtubeFrameRef.current?.contentWindow ?? null)) {
        coordinator.playing(item.id);
      }
    };
    window.addEventListener("message", onMessage);
    const unregister = coordinator.register(item.id, pause);
    return () => {
      window.removeEventListener("message", onMessage);
      pause();
      unregister();
    };
  }, [coordinator, item.id, youtube]);

  const title =
    item.label?.trim() ||
    (item.kind === "spotify"
      ? "Spotify reference"
      : item.kind === "youtube"
        ? "YouTube reference"
        : "Audio reference");

  return (
    <div className={`audio-card audio-card--${item.kind}`}>
      {item.kind === "audio" && (
        <header className="audio-card-heading">
          <span className="audio-card-icon" aria-hidden="true">
            <SpeakerHigh size={17} />
          </span>
          <span>
            <strong>{title}</strong>
            <small>{item.mediaId ? "Board audio" : "Hosted audio"}</small>
          </span>
        </header>
      )}

      <div
        className="audio-card-controls"
        inert={editing ? true : undefined}
        onPointerDown={editing ? undefined : stopPointer}
        onDoubleClick={editing ? undefined : (event) => event.stopPropagation()}
      >
        {item.kind === "audio" && !nativeFailed && (
          <audio
            key={`${nativeSource ?? "audio"}-${nativeAttempt}`}
            ref={audioRef}
            controls
            preload="none"
            src={nativeSource}
            aria-label={`Play ${title}`}
            onPlay={() => coordinator.playing(item.id)}
            onError={() => setFailedNativeSource(nativeSource ?? "")}
          />
        )}
        {item.kind === "audio" && nativeFailed && (
          <div className="audio-card-retry" role="status">
            <p className="audio-card-error">This audio source is unavailable.</p>
            <button
              type="button"
              onClick={() => {
                setFailedNativeSource(null);
                setNativeAttempt((attempt) => attempt + 1);
              }}
            >
              Retry audio
            </button>
          </div>
        )}

        {item.kind === "spotify" && spotify !== null && !spotifyError && (
          <div
            className="spotify-embed-mount"
            ref={spotifyMountRef}
            aria-label={`Spotify player for ${title}`}
          />
        )}
        {item.kind === "youtube" && youtubeEmbedUrl !== null && (
          <div className="youtube-embed-mount">
            <iframe
              ref={youtubeFrameRef}
              src={youtubeEmbedUrl}
              title={`YouTube player for ${title}`}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() =>
                youtubeFrameRef.current?.contentWindow?.postMessage(
                  JSON.stringify({ event: "listening", id: item.id }),
                  YOUTUBE_PLAYER_ORIGIN,
                )
              }
            />
          </div>
        )}
        {spotifyError && (
          <div className="audio-card-retry" role="status">
            <p className="audio-card-error">{spotifyError}</p>
            <button
              type="button"
              onClick={() => {
                setSpotifyError("");
                setSpotifyAttempt((attempt) => attempt + 1);
              }}
            >
              Retry player
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
