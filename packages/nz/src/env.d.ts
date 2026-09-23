/// <reference types="@cloudflare/workers-types" />

export {};

declare global {
  namespace Cloudflare {
    interface Env {
      COMMENTS: { fetch(request: Request): Promise<Response> };
    }
  }
}
