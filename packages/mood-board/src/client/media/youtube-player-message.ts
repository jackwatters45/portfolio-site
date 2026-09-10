export const YOUTUBE_PLAYER_ORIGIN = "https://www.youtube-nocookie.com";

export const isYouTubePlayingMessage = (
  event: Pick<MessageEvent, "data" | "origin" | "source">,
  source: MessageEventSource | null,
): boolean => {
  if (event.origin !== YOUTUBE_PLAYER_ORIGIN || event.source !== source || source === null) {
    return false;
  }
  let payload: unknown = event.data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return false;
    }
  }
  if (payload === null || typeof payload !== "object") return false;
  const message = payload as { readonly event?: unknown; readonly info?: unknown };
  if (message.event === "onStateChange") return message.info === 1;
  if (
    message.event !== "infoDelivery" ||
    message.info === null ||
    typeof message.info !== "object"
  ) {
    return false;
  }
  return (message.info as { readonly playerState?: unknown }).playerState === 1;
};
