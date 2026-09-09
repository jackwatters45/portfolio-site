/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly STRAVA_CLIENT_ID: string;
  readonly STRAVA_CLIENT_SECRET: string;
  readonly STRAVA_REFRESH_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
