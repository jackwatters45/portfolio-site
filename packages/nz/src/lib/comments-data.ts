import * as Effect from 'effect/Effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import { loadCommentName, saveCommentName } from './comment-name';
import { validName } from './comments-schema';
import { CommentsApi } from '../services/comments-api';
import { currentThread, draftKey, type CommentsState } from './comments-state';

// Browser boundary: owns request cancellation and the service runtime lifecycle.
export function commentData(get: () => CommentsState, update: (value: Partial<CommentsState>) => void) {
  const runtime = ManagedRuntime.make(CommentsApi.layer);
  let listFiber: { interruptUnsafe(): void } | undefined;
  let threadFiber: { interruptUnsafe(): void } | undefined;
  let disposed = false;
  const apply = (value: Partial<CommentsState>) => { if (!disposed) update(value); };

  function loadList() {
    if (get().sending || disposed) return;
    listFiber?.interruptUnsafe();
    apply({ loading: true });
    listFiber = runtime.runFork(CommentsApi.use((api) => api.list()).pipe(
      Effect.match({
        onSuccess: ({ threads }) => apply({ threads, loading: false, loadError: '' }),
        onFailure: (error) => apply({ loading: false, loadError: error.message }),
      }),
    ));
  }

  function loadThread() {
    const state = get();
    const id = state.threadId;
    threadFiber?.interruptUnsafe();
    if (!state.panel || state.view !== 'thread' || !id || state.sending || disposed) return;
    apply({ loadingThread: true, threadError: '' });
    threadFiber = runtime.runFork(CommentsApi.use((api) => api.read(id)).pipe(
      Effect.match({
        onSuccess: (detail) => {
          if (get().threadId !== id) return;
          apply({ detail, loadingThread: false,
            threads: get().threads.map((thread) => thread.id === id ? detail.thread : thread) });
        },
        onFailure: (error) => { if (get().threadId === id) apply({ loadingThread: false, threadError: error.message }); },
      }),
    ));
  }

  function refresh() {
    loadList();
    loadThread();
  }

  function submit() {
    const state = get();
    const key = draftKey(state);
    const body = state.drafts[key]?.trim();
    const current = currentThread(state);
    if (!body || !validName(state.name) || state.sending ||
      (state.view === 'thread' ? !current || state.loadingThread || !!state.threadError : !state.target)) return;
    listFiber?.interruptUnsafe();
    threadFiber?.interruptUnsafe();
    apply({ sending: true, sendError: '' });
    runtime.runFork(Effect.gen(function* () {
      const api = yield* CommentsApi;
      if (state.view === 'thread' && current) {
        const { message } = yield* api.reply(current.id, { name: state.name, body });
        const detail = get().detail;
        if (detail?.thread.id === current.id) apply({ detail: {
          thread: { ...detail.thread, replyCount: detail.thread.replyCount + 1 },
          replies: [...detail.replies, message],
        } });
      } else if (state.target) {
        const { thread } = yield* api.create({ name: state.name, body,
          target: { anchor: state.target.anchor, quote: state.target.quote } });
        apply({ threads: [...get().threads, thread], detail: { thread, replies: [] },
          threadId: thread.id, view: 'thread', panel: true, picking: false });
      }
      apply({ drafts: { ...get().drafts, [key]: '' } });
    }).pipe(
      Effect.catchTag('CommentError', (error) => Effect.sync(() => apply({ sendError: error.message }))),
      Effect.ensuring(Effect.sync(() => {
        apply({ sending: false });
        if (!disposed) refresh();
      })),
    ));
  }

  const nameFiber = runtime.runFork(loadCommentName.pipe(Effect.tap((name) => Effect.sync(() => {
    if (validName(name) && !get().name) apply({ name });
  }))));
  const polling = runtime.runFork(Effect.sync(() => {
    const state = get();
    if (document.visibilityState === 'visible' && state.panel && (state.view === 'list' || state.view === 'thread')) refresh();
  }).pipe(Effect.delay('45 seconds'), Effect.forever));

  return {
    refresh, loadThread, submit,
    saveName: (name: string) => runtime.runFork(saveCommentName(name)),
    dispose() {
      disposed = true;
      listFiber?.interruptUnsafe();
      threadFiber?.interruptUnsafe();
      nameFiber.interruptUnsafe();
      polling.interruptUnsafe();
      void runtime.dispose();
    },
  };
}
