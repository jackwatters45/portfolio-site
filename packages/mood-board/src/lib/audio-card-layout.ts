export type AudioCardKind = "audio" | "spotify" | "youtube";

export const MIN_AUDIO_CARD_WIDTH = 320;
export const MIN_NATIVE_AUDIO_CARD_HEIGHT = 114;
export const NATIVE_AUDIO_CARD_HEIGHT = 154;
export const MIN_SPOTIFY_AUDIO_CARD_HEIGHT = 152;
export const SPOTIFY_AUDIO_CARD_HEIGHT = 352;
export const MIN_YOUTUBE_AUDIO_CARD_HEIGHT = 180;

export const minimumAudioCardHeight = (kind: AudioCardKind): number =>
  kind === "spotify"
    ? MIN_SPOTIFY_AUDIO_CARD_HEIGHT
    : kind === "youtube"
      ? MIN_YOUTUBE_AUDIO_CARD_HEIGHT
      : MIN_NATIVE_AUDIO_CARD_HEIGHT;

export const preferredAudioCardHeight = (kind: AudioCardKind, width: number): number =>
  kind === "spotify"
    ? SPOTIFY_AUDIO_CARD_HEIGHT
    : kind === "youtube"
      ? Math.max(MIN_YOUTUBE_AUDIO_CARD_HEIGHT, Math.ceil((width * 9) / 16))
      : NATIVE_AUDIO_CARD_HEIGHT;
