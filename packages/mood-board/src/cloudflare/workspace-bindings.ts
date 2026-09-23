import type { DurableObjectStorage, R2Bucket } from '@cloudflare/workers-types';
import { Context } from 'effect';

export class WorkspaceBindings extends Context.Service<
  WorkspaceBindings,
  {
    readonly storage: DurableObjectStorage;
    readonly media: R2Bucket;
    readonly workspaceId: string;
  }
>()('mood-board/WorkspaceBindings') {}
