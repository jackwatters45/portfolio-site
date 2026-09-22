import type { Runtime } from '@astrojs/cloudflare';
import type { CommentsEnv } from '../server/comments';

declare global {
  namespace App {
    interface Locals extends Runtime<CommentsEnv> {}
  }
}
