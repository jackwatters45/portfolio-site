import { Option, Schema } from "effect";

export const MAX_AUDIO_SOURCE_CHARACTERS = 4_096;

export const SPOTIFY_RESOURCE_TYPES = ["track", "album", "playlist", "episode", "show"] as const;
export const SpotifyResourceTypeSchema = Schema.Literals(SPOTIFY_RESOURCE_TYPES);
export type SpotifyResourceType = typeof SpotifyResourceTypeSchema.Type;
const decodeSpotifyResourceType = Schema.decodeUnknownOption(SpotifyResourceTypeSchema);

export const SpotifyResourceIdSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9]{10,64}$/),
).pipe(Schema.brand("SpotifyResourceId"));
export type SpotifyResourceId = typeof SpotifyResourceIdSchema.Type;
const decodeSpotifyResourceId = Schema.decodeUnknownOption(SpotifyResourceIdSchema);

export const YouTubeVideoIdSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]{11}$/),
).pipe(Schema.brand("YouTubeVideoId"));
export type YouTubeVideoId = typeof YouTubeVideoIdSchema.Type;
const decodeYouTubeVideoId = Schema.decodeUnknownOption(YouTubeVideoIdSchema);

export const SpotifyEmbedUrlSchema = Schema.String.check(
  Schema.isPattern(
    /^https:\/\/open\.spotify\.com\/embed\/(?:track|album|playlist|episode|show)\/[A-Za-z0-9]{10,64}$/,
  ),
).pipe(Schema.brand("SpotifyEmbedUrl"));
export type SpotifyEmbedUrl = typeof SpotifyEmbedUrlSchema.Type;

export const SpotifyUriSchema = Schema.String.check(
  Schema.isPattern(/^spotify:(?:track|album|playlist|episode|show):[A-Za-z0-9]{10,64}$/),
).pipe(Schema.brand("SpotifyUri"));
export type SpotifyUri = typeof SpotifyUriSchema.Type;

export const YouTubeEmbedUrlSchema = Schema.String.check(
  Schema.isPattern(
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}\?rel=0&playsinline=1&enablejsapi=1$/,
  ),
).pipe(Schema.brand("YouTubeEmbedUrl"));
export type YouTubeEmbedUrl = typeof YouTubeEmbedUrlSchema.Type;

export type SpotifySource = {
  readonly kind: "spotify";
  readonly src: SpotifySourceUrl;
  readonly embedUrl: SpotifyEmbedUrl;
  readonly uri: SpotifyUri;
  readonly resourceType: SpotifyResourceType;
  readonly resourceId: SpotifyResourceId;
};

type RawSpotifySource = Omit<SpotifySource, "src"> & { readonly src: string };

export type YouTubeSource = {
  readonly kind: "youtube";
  readonly src: YouTubeSourceUrl;
  readonly embedUrl: YouTubeEmbedUrl;
  readonly videoId: YouTubeVideoId;
};

type RawYouTubeSource = Omit<YouTubeSource, "src"> & { readonly src: string };

export type DirectAudioSource = {
  readonly kind: "audio";
  readonly src: DirectAudioSourceUrl;
};

export type AudioSource = SpotifySource | YouTubeSource | DirectAudioSource;

const youtubeHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
]);
const withoutDnsRootDot = (hostname: string): string =>
  hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;

const isYouTubeFamilyHost = (hostname: string) => {
  const normalized = withoutDnsRootDot(hostname);
  return (
    normalized === "youtube.com" ||
    normalized.endsWith(".youtube.com") ||
    normalized === "youtu.be" ||
    normalized.endsWith(".youtu.be") ||
    normalized === "youtube-nocookie.com" ||
    normalized.endsWith(".youtube-nocookie.com")
  );
};

function parseSpotifySourceValue(value: string): RawSpotifySource | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_AUDIO_SOURCE_CHARACTERS) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "open.spotify.com" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  )
    return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0]?.toLowerCase().startsWith("intl-")) segments.shift();
  if (segments[0]?.toLowerCase() === "embed") segments.shift();
  if (segments.length !== 2) return null;
  const [rawType, rawResourceId] = segments;
  const resourceType = Option.getOrNull(decodeSpotifyResourceType(rawType?.toLowerCase()));
  const resourceId = Option.getOrNull(decodeSpotifyResourceId(rawResourceId));
  if (resourceType === null || resourceId === null) return null;

  const src = `https://open.spotify.com/${resourceType}/${resourceId}`;
  return {
    kind: "spotify",
    src,
    embedUrl: SpotifyEmbedUrlSchema.make(
      `https://open.spotify.com/embed/${resourceType}/${resourceId}`,
    ),
    uri: SpotifyUriSchema.make(`spotify:${resourceType}:${resourceId}`),
    resourceType,
    resourceId,
  };
}

export function parseSpotifySource(value: string): SpotifySource | null {
  const parsed = parseSpotifySourceValue(value);
  return parsed === null ? null : { ...parsed, src: SpotifySourceUrlSchema.make(parsed.src) };
}

const normalizeSpotifySourceValue = (value: string): string | null =>
  parseSpotifySourceValue(value)?.src ?? null;

export function normalizeSpotifySource(value: string): SpotifySourceUrl | null {
  const src = normalizeSpotifySourceValue(value);
  return src === null ? null : SpotifySourceUrlSchema.make(src);
}

function parseYouTubeSourceValue(value: string): RawYouTubeSource | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_AUDIO_SOURCE_CHARACTERS) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const hostname = withoutDnsRootDot(url.hostname);
  if (
    url.protocol !== "https:" ||
    !youtubeHosts.has(hostname) ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  )
    return null;

  const segments = url.pathname.split("/").filter(Boolean);
  let rawVideoId: string | null = null;
  if (hostname === "youtu.be" && segments.length === 1) {
    rawVideoId = segments[0] ?? null;
  } else if (
    (hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com") &&
    url.pathname === "/watch"
  ) {
    rawVideoId = url.searchParams.get("v");
  } else if (
    (hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com") &&
    segments.length === 2 &&
    (segments[0] === "live" || segments[0] === "shorts" || segments[0] === "embed")
  ) {
    rawVideoId = segments[1] ?? null;
  } else if (
    hostname === "www.youtube-nocookie.com" &&
    segments.length === 2 &&
    segments[0] === "embed"
  ) {
    rawVideoId = segments[1] ?? null;
  }
  const videoId = Option.getOrNull(decodeYouTubeVideoId(rawVideoId));
  if (videoId === null) return null;
  return {
    kind: "youtube",
    src: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: YouTubeEmbedUrlSchema.make(
      `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1&enablejsapi=1`,
    ),
    videoId,
  };
}

export function parseYouTubeSource(value: string): YouTubeSource | null {
  const parsed = parseYouTubeSourceValue(value);
  return parsed === null ? null : { ...parsed, src: YouTubeSourceUrlSchema.make(parsed.src) };
}

const normalizeYouTubeSourceValue = (value: string): string | null =>
  parseYouTubeSourceValue(value)?.src ?? null;

export function normalizeYouTubeSource(value: string): YouTubeSourceUrl | null {
  const src = normalizeYouTubeSourceValue(value);
  return src === null ? null : YouTubeSourceUrlSchema.make(src);
}

function normalizeDirectAudioSourceValue(value: string): string | null {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_AUDIO_SOURCE_CHARACTERS ||
    !/^https:\/\/[^/\\]/i.test(trimmed)
  )
    return null;
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      url.hostname === "open.spotify.com" ||
      isYouTubeFamilyHost(url.hostname)
    )
      return null;
    return url.href.length <= MAX_AUDIO_SOURCE_CHARACTERS ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizeDirectAudioSource(value: string): DirectAudioSourceUrl | null {
  const src = normalizeDirectAudioSourceValue(value);
  return src === null ? null : DirectAudioSourceUrlSchema.make(src);
}

export const SpotifySourceUrlSchema = Schema.String.check(
  Schema.isMaxLength(MAX_AUDIO_SOURCE_CHARACTERS),
)
  .check(
    Schema.makeFilter((value) =>
      normalizeSpotifySourceValue(value) === value
        ? undefined
        : { path: [], issue: "Spotify sources must be canonical public URLs" },
    ),
  )
  .pipe(Schema.brand("SpotifySourceUrl"));
export type SpotifySourceUrl = typeof SpotifySourceUrlSchema.Type;

export const YouTubeSourceUrlSchema = Schema.String.check(
  Schema.isMaxLength(MAX_AUDIO_SOURCE_CHARACTERS),
)
  .check(
    Schema.makeFilter((value) =>
      normalizeYouTubeSourceValue(value) === value
        ? undefined
        : { path: [], issue: "YouTube sources must be canonical public URLs" },
    ),
  )
  .pipe(Schema.brand("YouTubeSourceUrl"));
export type YouTubeSourceUrl = typeof YouTubeSourceUrlSchema.Type;

export const DirectAudioSourceUrlSchema = Schema.String.check(
  Schema.isMaxLength(MAX_AUDIO_SOURCE_CHARACTERS),
)
  .check(
    Schema.makeFilter((value) =>
      normalizeDirectAudioSourceValue(value) === value
        ? undefined
        : { path: [], issue: "Direct audio sources must be canonical hosted HTTPS URLs" },
    ),
  )
  .pipe(Schema.brand("DirectAudioSourceUrl"));
export type DirectAudioSourceUrl = typeof DirectAudioSourceUrlSchema.Type;

export function parseAudioSource(value: string): AudioSource | null {
  const spotify = parseSpotifySource(value);
  if (spotify !== null) return spotify;
  const youtube = parseYouTubeSource(value);
  if (youtube !== null) return youtube;
  const src = normalizeDirectAudioSource(value);
  return src === null ? null : { kind: "audio", src };
}

export function isLikelyAudioUrl(value: string): boolean {
  if (parseSpotifySource(value) !== null || parseYouTubeSource(value) !== null) return true;
  const src = normalizeDirectAudioSource(value);
  if (src === null) return false;
  try {
    return /\.(?:mp3|m4a|aac|ogg|oga|wav|flac|opus|webm)(?:$|[?#])/i.test(new URL(src).pathname);
  } catch {
    return false;
  }
}
