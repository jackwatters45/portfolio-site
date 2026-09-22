import {
  QueryClient,
  QueryClientProvider,
  useIsFetching,
  useIsMutating,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { loadCommentName } from '../../lib/comment-name';
import {
  GENERAL_COMMENT_TARGET,
  validName,
  type CommentTarget,
  type CommentThread as Thread,
} from '../../lib/comments-schema';
import { CommentsApi } from '../../services/comments-api';
import { CommentList } from './comment-list';
import { CommentNameForm } from './comment-name-form';
import { CommentPins } from './comment-pins';
import { CommentThread, type ThreadView } from './comment-thread';
import '../../styles/comments.css';

// The HTTP layer has no per-user state. Query caches belong to each island.
const runtime = ManagedRuntime.make(CommentsApi.layer);
type ContentView = { kind: 'list' } | ThreadView;
type View = ContentView | { kind: 'name'; next: ContentView | 'pick' };

export default function Comments() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 15_000,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <CommentsPanel />
    </QueryClientProvider>
  );
}

function CommentsPanel() {
  const id = useId();
  const client = useQueryClient();
  const [panel, setPanel] = useState<'closed' | 'open' | 'picking'>('closed');
  const [view, setView] = useState<View>({ kind: 'list' });
  const drafts = useMemo(() => new Map<string, string>(), []);
  const launcher = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const sending = useIsMutating({ mutationKey: ['comments', 'write'] }) > 0;
  const fetching = useIsFetching({ queryKey: ['comments'] }) > 0;
  const list = useQuery({
    queryKey: ['comments', 'threads'],
    queryFn: ({ signal }) =>
      runtime.runPromise(
        Effect.flatMap(CommentsApi, (api) => api.list()),
        { signal },
      ),
    enabled: !sending,
    refetchInterval:
      panel === 'open' &&
      (view.kind === 'list' || view.kind === 'thread') &&
      !sending
        ? 45_000
        : false,
  });
  const savedName = useQuery({
    queryKey: ['comment-name'],
    queryFn: ({ signal }) =>
      runtime.runPromise(
        loadCommentName.pipe(
          Effect.map((name) => (validName(name) ? name : '')),
        ),
        { signal },
      ),
    staleTime: Infinity,
  });
  const name = savedName.data ?? '';
  const threads = list.data?.threads ?? [];
  const count = threads.filter((thread) => !thread.closed).length;
  const selectedAnchor =
    panel === 'open'
      ? view.kind === 'thread'
        ? view.thread.anchor
        : view.kind === 'new'
          ? view.target.anchor
          : undefined
      : undefined;

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['comments'] });
  };
  const close = () => {
    if (sending) return;
    setPanel('closed');
    requestAnimationFrame(() => launcher.current?.focus());
  };
  const openThread = (thread: Thread) => {
    setView({ kind: 'thread', thread });
    setPanel('open');
  };
  const chooseTarget = (target: CommentTarget) => {
    const existing = threads.find(
      (thread) =>
        thread.anchor === target.anchor && !thread.closed && !thread.locked,
    );
    if (existing) openThread(existing);
    else {
      setView({ kind: 'new', target });
      setPanel('open');
    }
  };
  const askName = (next: ContentView | 'pick') => {
    setView({ kind: 'name', next });
    setPanel('open');
  };
  const escape = useEffectEvent(close);

  useEffect(() => {
    if (panel === 'closed') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') escape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  useEffect(() => {
    if (panel === 'open' && view.kind !== 'name' && view.kind !== 'new')
      heading.current?.focus();
  }, [panel, view]);

  const title =
    view.kind === 'name'
      ? 'Your name'
      : view.kind === 'new'
        ? view.target.anchor === GENERAL_COMMENT_TARGET.anchor
          ? 'General comment'
          : 'New comment'
        : 'Comments';

  return (
    <>
      <CommentPins
        threads={threads}
        picking={panel === 'picking'}
        sending={sending}
        selectedAnchor={selectedAnchor}
        onChoose={chooseTarget}
        onOpen={openThread}
        onHash={() => {
          setView({ kind: 'list' });
          setPanel('open');
        }}
      />
      <div className="nz-feedback-ui" data-feedback-ui="">
        <button
          ref={launcher}
          type="button"
          className="nz-comment-launcher"
          hidden={panel === 'picking'}
          aria-expanded={panel === 'open'}
          aria-controls={`${id}-panel`}
          disabled={sending}
          onClick={() => {
            if (panel === 'open') close();
            else {
              setPanel('open');
              refresh();
            }
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M20 11.5a8 8 0 0 1-8 8H4l1.7-4A8 8 0 1 1 20 11.5Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <path
              d="M8 10h8M8 14h5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          Comments{' '}
          {count > 0 && <span className="nz-comment-count">{count}</span>}
        </button>
        {panel === 'picking' && (
          <div className="nz-comment-picker" aria-live="polite">
            <span>Choose a marked plan</span>
            <button
              type="button"
              onClick={() => {
                setPanel('open');
                setView({ kind: 'list' });
              }}
            >
              Cancel
            </button>
          </div>
        )}
        <dialog
          open={panel === 'open'}
          id={`${id}-panel`}
          className="nz-comments-panel"
          aria-labelledby={`${id}-title`}
        >
          <header className="nz-comments-header">
            {view.kind !== 'list' && (
              <button
                type="button"
                className="nz-comment-icon"
                aria-label="Back to comments"
                disabled={sending}
                onClick={() => setView({ kind: 'list' })}
              >
                ←
              </button>
            )}
            <h2 ref={heading} id={`${id}-title`} tabIndex={-1}>
              {title}
            </h2>
            {(view.kind === 'list' || view.kind === 'thread') && (
              <button
                type="button"
                className="nz-comment-icon"
                aria-label="Refresh comments"
                disabled={sending || fetching}
                onClick={refresh}
              >
                ↻
              </button>
            )}
            <button
              type="button"
              className="nz-comment-icon"
              aria-label="Close comments"
              disabled={sending}
              onClick={close}
            >
              ×
            </button>
          </header>
          <div className="nz-comments-content">
            <div hidden={view.kind !== 'list'}>
              <CommentList
                threads={threads}
                loading={list.isPending}
                error={list.error}
                onOpen={openThread}
              />
            </div>
            {view.kind === 'name' && (
              <CommentNameForm
                name={name}
                runtime={runtime}
                onSave={() => {
                  if (view.next === 'pick') {
                    setView({ kind: 'list' });
                    setPanel('picking');
                  } else setView(view.next);
                }}
              />
            )}
            {(view.kind === 'new' || view.kind === 'thread') && (
              <CommentThread
                key={
                  view.kind === 'thread'
                    ? `thread-${view.thread.id}`
                    : `new-${view.target.anchor}`
                }
                view={view}
                active={panel === 'open'}
                sending={sending}
                name={name}
                drafts={drafts}
                runtime={runtime}
                onCreated={openThread}
                onAskName={() => askName(view)}
                onClose={close}
              />
            )}
          </div>
          {view.kind !== 'name' && (view.kind === 'list' || name) && (
            <footer className="nz-comments-footer">
              {view.kind === 'list' && (
                <div className="nz-comment-actions">
                  <button
                    type="button"
                    className="nz-comment-primary"
                    disabled={!!list.error || list.isPending}
                    onClick={() => {
                      if (name) setPanel('picking');
                      else askName('pick');
                    }}
                  >
                    Inline comment
                  </button>
                  <button
                    type="button"
                    className="nz-comment-secondary"
                    disabled={!!list.error || list.isPending}
                    onClick={() => {
                      const next = {
                        kind: 'new',
                        target: GENERAL_COMMENT_TARGET,
                      } as const;
                      if (!name) askName(next);
                      else {
                        setView(next);
                        setPanel('open');
                      }
                    }}
                  >
                    General comment
                  </button>
                </div>
              )}
              {name && (
                <button
                  type="button"
                  className="nz-comment-name-button"
                  disabled={sending}
                  onClick={() => askName(view)}
                  aria-label={`Change name, currently ${name}`}
                >
                  {name} · Change name
                </button>
              )}
            </footer>
          )}
        </dialog>
      </div>
    </>
  );
}
