import type { CommentTarget, CommentThread, ThreadDetail } from './comments-schema';

export type View = 'list' | 'thread' | 'new' | 'name';

export interface CommentsState {
  threads: ReadonlyArray<CommentThread>;
  detail: ThreadDetail | null;
  threadId: number | null;
  target: CommentTarget | null;
  panel: boolean;
  view: View;
  picking: boolean;
  name: string;
  nameInput: string;
  drafts: Record<string, string>;
  resolved: boolean;
  loading: boolean;
  loadingThread: boolean;
  loadError: string;
  threadError: string;
  sendError: string;
  sending: boolean;
}

export function initialState(): CommentsState {
  return {
    threads: [], detail: null, threadId: null, target: null,
    panel: false, view: 'list', picking: false,
    name: '', nameInput: '', drafts: {}, resolved: false,
    loading: true, loadingThread: false,
    loadError: '', threadError: '', sendError: '', sending: false,
  };
}

export function currentThread(state: CommentsState) {
  return state.detail?.thread.id === state.threadId
    ? state.detail.thread
    : state.threads.find((thread) => thread.id === state.threadId);
}

export function draftKey(state: CommentsState) {
  return state.view === 'thread' ? `thread-${state.threadId}` : `new-${state.target?.anchor}`;
}
