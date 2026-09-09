import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BoardItem } from "../src/client/board/types";
import { AudioPlaybackCoordinator } from "../src/client/media/audio-playback";
import { isYouTubePlayingMessage } from "../src/client/media/youtube-player-message";
import { AudioCard } from "../src/components/audio-card";
import { preferredAudioCardHeight } from "../src/lib/audio-card-layout";
import { ItemIdSchema } from "../src/lib/board-rpc";

const coordinator = new AudioPlaybackCoordinator();
const base: BoardItem = {
  id: ItemIdSchema.make("audio-1"),
  kind: "audio",
  x: 0,
  y: 0,
  width: 520,
  height: 220,
  rotation: 0,
  order: 1,
  src: "https://media.example/field-recording.mp3",
  label: "Dawn field recording",
};

describe("AudioCard", () => {
  it("uses compact heights matched to native and provider controls", () => {
    expect(preferredAudioCardHeight("audio", 520)).toBe(154);
    expect(preferredAudioCardHeight("spotify", 520)).toBe(352);
    expect(preferredAudioCardHeight("youtube", 520)).toBe(293);
    expect(preferredAudioCardHeight("youtube", 320)).toBe(180);
  });

  it("renders native controls without preloading or autoplay", () => {
    const markup = renderToStaticMarkup(
      <AudioCard item={base} coordinator={coordinator} editing />,
    );
    expect(markup).toContain("<audio");
    expect(markup).toContain("inert");
    expect(markup).toContain('preload="none"');
    expect(markup).toContain('controls=""');
    expect(markup).not.toContain("autoplay");
    expect(markup).not.toContain("Open source");
  });

  it("mounts YouTube automatically without autoplay or a redundant source link", () => {
    const youtube = {
      ...base,
      id: ItemIdSchema.make("youtube-1"),
      kind: "youtube" as const,
      width: 520,
      height: 400,
      src: "https://www.youtube.com/watch?v=ryig6M3rZYU",
    };
    const markup = renderToStaticMarkup(<AudioCard item={youtube} coordinator={coordinator} />);
    expect(markup).toContain("youtube-embed-mount");
    expect(markup).toContain("<iframe");
    expect(markup).toContain("https://www.youtube-nocookie.com/embed/ryig6M3rZYU");
    expect(markup).not.toContain("Load YouTube player");
    expect(markup).not.toContain("autoplay=1");
    expect(markup).not.toContain("Open source");
  });

  it("accepts playing events only from the mounted privacy-enhanced player", () => {
    const source = {} as MessageEventSource;
    const playing = {
      origin: "https://www.youtube-nocookie.com",
      source,
      data: JSON.stringify({ event: "onStateChange", info: 1 }),
    };
    expect(isYouTubePlayingMessage(playing, source)).toBe(true);
    expect(
      isYouTubePlayingMessage(
        {
          ...playing,
          data: JSON.stringify({ event: "infoDelivery", info: { playerState: 1 } }),
        },
        source,
      ),
    ).toBe(true);
    expect(isYouTubePlayingMessage({ ...playing, origin: "https://www.youtube.com" }, source)).toBe(
      false,
    );
    expect(isYouTubePlayingMessage(playing, {} as MessageEventSource)).toBe(false);
    expect(isYouTubePlayingMessage({ ...playing, data: "not-json" }, source)).toBe(false);
    expect(
      isYouTubePlayingMessage(
        {
          ...playing,
          data: { event: "onStateChange", info: 2 },
        },
        source,
      ),
    ).toBe(false);
  });

  it("mounts Spotify automatically without a redundant source link", () => {
    const spotify = {
      ...base,
      id: ItemIdSchema.make("spotify-1"),
      kind: "spotify" as const,
      src: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    };
    const markup = renderToStaticMarkup(<AudioCard item={spotify} coordinator={coordinator} />);
    expect(markup).toContain("spotify-embed-mount");
    expect(markup).not.toContain("Load Spotify player");
    expect(markup).not.toContain("iframe-api");
    expect(markup).not.toContain("Open source");
  });
});
