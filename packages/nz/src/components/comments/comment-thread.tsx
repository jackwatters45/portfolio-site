import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import { useEffect, useId, useRef, useState } from 'react';
import {
  COMMENT_LIMIT,
  GENERAL_COMMENT_TARGET,
  type CommentTarget,
  type CommentThread as Thread,
  type ThreadDetail,
  type ThreadList,
} from '../../lib/comments-schema';
import { CommentsApi } from '../../services/comments-api';

export type ThreadView =
  | { kind: 'thread'; thread: Thread }
  | { kind: 'new'; target: CommentTarget };

interface Props {
  view: ThreadView;
  active: boolean;
  sending: boolean;
  name: string;
  drafts: Map<string, string>;
  runtime: ManagedRuntime.ManagedRuntime<CommentsApi, never>;
  onCreated: (thread: Thread) => void;
  onAskName: () => void;
  onClose: () => void;
}

export function CommentThread({
  view,
  active,
  sending,
  name,
  drafts,
  runtime,
  onCreated,
  onAskName,
  onClose,
}: Props) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const posting = useRef(false);
  const key =
    view.kind === 'thread'
      ? `thread-${view.thread.id}`
      : `new-${view.target.anchor}`;
  const [draft, setDraft] = useState(() => drafts.get(key) ?? '');
  const client = useQueryClient();
  const detail = useQuery({
    queryKey: [
      'comments',
      'thread',
      view.kind === 'thread' ? view.thread.id : null,
    ],
    queryFn:
      view.kind === 'thread'
        ? ({ signal }) =>
            runtime.runPromise(
              Effect.flatMap(CommentsApi, (api) => api.read(view.thread.id)),
              { signal },
            )
        : skipToken,
    enabled: active && !sending && view.kind === 'thread',
    refetchInterval: active && !sending ? 45_000 : false,
  });
  const current =
    view.kind === 'thread' ? (detail.data?.thread ?? view.thread) : undefined;
  const context = current ?? (view.kind === 'new' ? view.target : view.thread);
  const blocked = !!(current?.closed || current?.locked);

  const post = useMutation({
    mutationKey: ['comments', 'write'],
    mutationFn: (body: string) =>
      runtime.runPromise(
        Effect.flatMap(CommentsApi, (api) =>
          Effect.gen(function* () {
            if (view.kind === 'thread') {
              const result = yield* api.reply(view.thread.id, { name, body });
              return { kind: 'reply' as const, ...result };
            }
            const result = yield* api.create({
              name,
              body,
              target: { anchor: view.target.anchor, quote: view.target.quote },
            });
            return { kind: 'thread' as const, ...result };
          }),
        ),
      ),
    onMutate: () => client.cancelQueries({ queryKey: ['comments'] }),
    onSuccess: (result) => {
      drafts.delete(key);
      setDraft('');
      if (result.kind === 'reply' && view.kind === 'thread') {
        client.setQueryData<ThreadDetail>(
          ['comments', 'thread', view.thread.id],
          (previous) =>
            previous && {
              thread: {
                ...previous.thread,
                replyCount: previous.thread.replyCount + 1,
              },
              replies: [...previous.replies, result.message],
            },
        );
      } else if (result.kind === 'thread') {
        client.setQueryData<typeof ThreadList.Type>(
          ['comments', 'threads'],
          (previous) => ({
            threads: [...(previous?.threads ?? []), result.thread],
          }),
        );
        client.setQueryData(['comments', 'thread', result.thread.id], {
          thread: result.thread,
          replies: [],
        });
        onCreated(result.thread);
      }
    },
    onSettled: () => {
      posting.current = false;
      return client.invalidateQueries({ queryKey: ['comments'] });
    },
  });

  useEffect(() => {
    if (view.kind === 'new') input.current?.focus();
  }, [view.kind]);

  const messages = current
    ? [current.message, ...(detail.data?.replies ?? [])]
    : [];
  const waiting =
    view.kind === 'thread' &&
    (detail.isPending || detail.isFetching || !!detail.error);

  return (
    <>
      {context.anchor !== GENERAL_COMMENT_TARGET.anchor ? (
        <button
          className="nz-comment-context"
          type="button"
          disabled={sending}
          onClick={() => {
            onClose();
            const element = Array.from(
              document.querySelectorAll<HTMLElement>('[data-comment-anchor]'),
            ).find(
              (element) => element.dataset.commentAnchor === context.anchor,
            );
            element?.closest('details')?.setAttribute('open', '');
            element?.scrollIntoView({ block: 'center' });
          }}
        >
          {context.quote}
        </button>
      ) : view.kind === 'thread' ? (
        <p className="nz-comment-context">{context.quote}</p>
      ) : null}
      {messages.map((message) => (
        <article className="nz-comment-message" key={message.id}>
          <div className="nz-comment-byline">
            <strong>{message.name}</strong>
            <time
              dateTime={message.createdAt}
              title={new Date(message.createdAt).toLocaleString()}
            >
              {new Date(message.createdAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              })}
            </time>
          </div>
          <p>{message.body}</p>
        </article>
      ))}
      {view.kind === 'thread' && detail.isFetching && <output>Loading…</output>}
      {view.kind === 'thread' && detail.error && (
        <p className="nz-comment-error" role="alert">
          {detail.error.message}
        </p>
      )}
      {blocked ? (
        <p className="nz-comment-empty">
          {current?.closed ? 'Resolved' : 'Replies are closed.'}
        </p>
      ) : !name ? (
        <button
          type="button"
          className="nz-comment-primary"
          onClick={onAskName}
        >
          Add your name to comment
        </button>
      ) : (
        <form
          className="nz-comment-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (posting.current || sending || !draft.trim() || waiting) return;
            posting.current = true;
            post.mutate(draft.trim());
          }}
        >
          <label htmlFor={id}>
            {view.kind === 'thread' ? 'Reply' : 'Comment'}
          </label>
          <textarea
            ref={input}
            id={id}
            rows={3}
            maxLength={COMMENT_LIMIT}
            required
            value={draft}
            disabled={sending}
            onChange={(event) => {
              setDraft(event.target.value);
              drafts.set(key, event.target.value);
            }}
          />
          {post.error && (
            <p className="nz-comment-error" role="alert">
              {post.error.message}
            </p>
          )}
          <button
            type="submit"
            className="nz-comment-primary"
            disabled={sending || !draft.trim() || waiting}
          >
            {post.isPending
              ? 'Posting…'
              : view.kind === 'thread'
                ? 'Reply'
                : 'Post comment'}
          </button>
        </form>
      )}
    </>
  );
}
