export type XWidgetsApi = {
  readonly widgets: {
    readonly load: (element?: HTMLElement) => void;
  };
};

declare global {
  interface Window {
    twttr?: XWidgetsApi & { readonly ready?: (callback: (api: XWidgetsApi) => void) => void };
  }
}

let loadedApi: XWidgetsApi | null = null;
let loading: Promise<XWidgetsApi> | null = null;

export function loadXWidgets(): Promise<XWidgetsApi> {
  if (loadedApi !== null) return Promise.resolve(loadedApi);
  if (loading !== null) return loading;
  loading = new Promise<XWidgetsApi>((resolve, reject) => {
    let settled = false;
    const finish = (api: XWidgetsApi) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      loadedApi = api;
      resolve(api);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      loading = null;
      document.querySelector("script[data-moodboard-x-widgets]")?.remove();
      reject(new Error(message));
    };
    const ready = () => {
      const api = window.twttr;
      if (api?.widgets?.load === undefined) {
        fail("X returned an invalid widget API.");
        return;
      }
      if (api.ready) api.ready(finish);
      else finish(api);
    };
    const timeout = window.setTimeout(() => fail("X took too long to load."), 12_000);
    if (window.twttr?.widgets?.load !== undefined) {
      ready();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-moodboard-x-widgets]");
    if (existing !== null) {
      existing.addEventListener("load", ready, { once: true });
      existing.addEventListener("error", () => fail("X could not be loaded."), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://platform.x.com/widgets.js";
    script.dataset.moodboardXWidgets = "true";
    script.addEventListener("load", ready, { once: true });
    script.addEventListener("error", () => fail("X could not be loaded."), { once: true });
    document.head.append(script);
  });
  return loading;
}
