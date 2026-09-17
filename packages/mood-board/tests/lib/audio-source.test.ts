import { describe, expect, it } from "vitest";

import {
  isLikelyAudioUrl,
  normalizeDirectAudioSource,
  parseAudioSource,
  parseSpotifySource,
  parseYouTubeSource,
} from "../../src/lib/audio-source";

const id = "4uLU6hMCjMI75M1A2tKUQC";
const youtubeId = "ryig6M3rZYU";
const youtubeFixture = `https://www.youtube.com/watch?v=${youtubeId}`;

describe("audio sources", () => {
  it("canonicalizes supported Spotify URLs", () => {
    for (const type of ["track", "album", "playlist", "episode", "show"] as const) {
      expect(
        parseSpotifySource(`https://open.spotify.com/${type}/${id}?si=tracking`),
      ).toMatchObject({
        kind: "spotify",
        src: `https://open.spotify.com/${type}/${id}`,
        embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
        uri: `spotify:${type}:${id}`,
      });
    }
    expect(
      parseSpotifySource(`https://open.spotify.com/intl-de/embed/track/${id}?utm_source=generator`)
        ?.src,
    ).toBe(`https://open.spotify.com/track/${id}`);
  });

  it("rejects unsupported or unsafe Spotify destinations", () => {
    for (const value of [
      `http://open.spotify.com/track/${id}`,
      `https://spotify.com/track/${id}`,
      `https://evil.open.spotify.com/track/${id}`,
      `https://open.spotify.com/user/${id}`,
      `https://open.spotify.com/track/short`,
      `https://user:pass@open.spotify.com/track/${id}`,
      `https://open.spotify.com/track/${id}/extra`,
    ])
      expect(parseSpotifySource(value)).toBeNull();
  });

  it("canonicalizes common privacy-safe YouTube links with strict video IDs", () => {
    for (const value of [
      youtubeFixture,
      `https://youtu.be/${youtubeId}?si=tracking`,
      `https://m.youtube.com/watch?v=${youtubeId}`,
      `https://music.youtube.com/watch?v=${youtubeId}`,
      `https://www.youtube.com/live/${youtubeId}?feature=share`,
      `https://www.youtube.com/shorts/${youtubeId}`,
      `https://www.youtube.com/embed/${youtubeId}`,
      `https://www.youtube-nocookie.com/embed/${youtubeId}`,
      `https://www.youtube.com./watch?v=${youtubeId}`,
      `https://www.youtube.com%2e/watch?v=${youtubeId}`,
    ]) {
      expect(parseYouTubeSource(value)).toMatchObject({
        kind: "youtube",
        src: youtubeFixture,
        embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&playsinline=1&enablejsapi=1`,
        videoId: youtubeId,
      });
    }
  });

  it("rejects unsafe or malformed YouTube destinations without audio fallback", () => {
    for (const value of [
      `http://www.youtube.com/watch?v=${youtubeId}`,
      `https://evil.youtube.com/watch?v=${youtubeId}`,
      `https://user:pass@www.youtube.com/watch?v=${youtubeId}`,
      `https://www.youtube.com:444/watch?v=${youtubeId}`,
      "https://www.youtube.com/watch?v=too-short",
      `https://youtu.be/${youtubeId}/extra`,
      `https://www.youtube-nocookie.com/watch?v=${youtubeId}`,
      "https://www.youtube.com./watch?v=too-short",
      `https://youtu.be./${youtubeId}/extra`,
      `https://www.youtube-nocookie.com./watch?v=${youtubeId}`,
    ]) {
      expect(parseYouTubeSource(value)).toBeNull();
      expect(parseAudioSource(value)).toBeNull();
      expect(normalizeDirectAudioSource(value)).toBeNull();
    }
  });

  it("accepts hosted HTTPS audio and rejects browser-local or insecure sources", () => {
    expect(normalizeDirectAudioSource("https://media.example/field-recording.mp3?token=x")).toBe(
      "https://media.example/field-recording.mp3?token=x",
    );
    for (const value of [
      "http://media.example/audio.mp3",
      "data:audio/mpeg;base64,AAAA",
      "blob:https://example.com/id",
      "file:///tmp/audio.mp3",
      "https://user:pass@media.example/audio.mp3",
      "https:media.example/audio.mp3",
      "https://media.example:444/audio.mp3",
    ])
      expect(normalizeDirectAudioSource(value)).toBeNull();
  });

  it("classifies sources and only auto-detects obvious pasted audio URLs", () => {
    expect(parseAudioSource(`https://open.spotify.com/track/${id}`)?.kind).toBe("spotify");
    expect(parseAudioSource(youtubeFixture)?.kind).toBe("youtube");
    expect(parseAudioSource("https://media.example/audio.ogg")?.kind).toBe("audio");
    expect(isLikelyAudioUrl(youtubeFixture)).toBe(true);
    expect(isLikelyAudioUrl("https://media.example/audio.m4a?download=1")).toBe(true);
    expect(isLikelyAudioUrl("https://shop.example/chair")).toBe(false);
  });
});
