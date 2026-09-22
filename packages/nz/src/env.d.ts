/// <reference types="@cloudflare/workers-types" />

import type { CommentsEnv } from './services/comments-handler';

declare global {
  namespace Cloudflare {
    // oxlint-disable-next-line typescript/no-empty-interface -- Workers bindings require interface augmentation.
    interface Env extends CommentsEnv {}
  }
}
