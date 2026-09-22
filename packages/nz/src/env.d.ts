import type { Runtime } from '@astrojs/cloudflare';
import type { CommentsEnv } from './services/comments-handler';

declare global {
  namespace App {
    interface Locals {
      runtime: Runtime<CommentsEnv>['runtime'];
    }
  }
}
