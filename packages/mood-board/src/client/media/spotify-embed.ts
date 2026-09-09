export type SpotifyPlaybackUpdate = {
  readonly data?: {
    readonly isPaused?: boolean;
  };
};

export type SpotifyEmbedController = {
  readonly addListener: (
    event: "playback_update",
    listener: (event: SpotifyPlaybackUpdate) => void,
  ) => void;
  readonly pause: () => void;
  readonly destroy: () => void;
};

export type SpotifyIframeApi = {
  readonly createController: (
    element: HTMLElement,
    options: {
      readonly uri: string;
      readonly width: string;
      readonly height: string;
    },
    callback: (controller: SpotifyEmbedController) => void,
  ) => void;
};

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
    SpotifyIframeConfig?: { loading?: number };
  }
}

const scriptSelector = 'script[data-moodboard-spotify-api="true"]';
let loadedApi: SpotifyIframeApi | null = null;
let loading: Promise<SpotifyIframeApi> | null = null;

export function loadSpotifyIframeApi(): Promise<SpotifyIframeApi> {
  if (loadedApi !== null) return Promise.resolve(loadedApi);
  if (loading !== null) return loading;

  loading = new Promise<SpotifyIframeApi>((resolve, reject) => {
    const previous = window.onSpotifyIframeApiReady;
    let settled = false;
    const cleanupFailure = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (window.onSpotifyIframeApiReady === ready) {
        window.onSpotifyIframeApiReady = previous;
      }
      document.querySelector<HTMLScriptElement>(scriptSelector)?.remove();
      document.querySelector<HTMLScriptElement>("#spotify-iframeapi-script")?.remove();
      if (window.SpotifyIframeConfig) window.SpotifyIframeConfig.loading = 0;
      loading = null;
      reject(new Error(message));
    };
    const ready = (api: SpotifyIframeApi) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      loadedApi = api;
      loading = null;
      if (window.onSpotifyIframeApiReady === ready) {
        window.onSpotifyIframeApiReady = previous;
      }
      previous?.(api);
      resolve(api);
    };
    const timeout = window.setTimeout(
      () => cleanupFailure("Spotify took too long to load."),
      12_000,
    );
    window.onSpotifyIframeApiReady = ready;

    const existing = document.querySelector<HTMLScriptElement>(scriptSelector);
    if (existing !== null) return;
    const script = document.createElement("script");
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;
    script.dataset.moodboardSpotifyApi = "true";
    script.onerror = () => cleanupFailure("Spotify could not be loaded.");
    document.head.append(script);
  });

  return loading;
}
