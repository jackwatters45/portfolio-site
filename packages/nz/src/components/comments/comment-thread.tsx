import { useForm } from '@tanstack/react-form';
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as Effect from 'effect/Effect';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import { useEffect, useId, useRef } from 'react';
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
  const key =
    view.kind === 'thread'
      ? `thread-${view.thread.id}`
      : `new-${view.target.anchor}`;
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
    onSettled: () => client.invalidateQueries({ queryKey: ['comments'] }),
  });

  const messages = current
    ? [current.message, ...(detail.data?.replies ?? [])]
    : [];
  const waiting =
    view.kind === 'thread' &&
    (detail.isPending || detail.isFetching || !!detail.error);
  const form = useForm({
    defaultValues: { body: drafts.get(key) ?? '' },
    onSubmit: async ({ value, formApi }) => {
      if (sending || waiting || blocked || !name) return;
      await post.mutateAsync(value.body.trim());
      formApi.reset({ body: '' });
    },
  });

  useEffect(() => {
    if (active && name && !blocked && view.kind === 'new')
      input.current?.focus();
  }, [active, name, blocked, view.kind]);

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
            void form.handleSubmit().catch(() => {
              // TanStack Query retains the request error for display below.
            });
          }}
        >
          <form.Field
            name="body"
            validators={{
              onChange: ({ value }) =>
                !value.trim()
                  ? 'Enter a comment.'
                  : value.trim().length > COMMENT_LIMIT
                    ? `Use ${COMMENT_LIMIT} characters or less.`
                    : undefined,
            }}
            listeners={{
              onChange: ({ value }) => drafts.set(key, value),
            }}
          >
            {(field) => (
              <>
                <label htmlFor={id}>
                  {view.kind === 'thread' ? 'Reply' : 'Comment'}
                </label>
                <textarea
                  ref={input}
                  id={id}
                  name={field.name}
                  rows={3}
                  maxLength={COMMENT_LIMIT}
                  required
                  value={field.state.value}
                  disabled={sending}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={!field.state.meta.isValid}
                  aria-describedby={
                    field.state.meta.isValid ? undefined : `${id}-error`
                  }
                />
                {!field.state.meta.isValid && (
                  <p
                    id={`${id}-error`}
                    className="nz-comment-error"
                    role="alert"
                  >
                    {field.state.meta.errors.join(' ')}
                  </p>
                )}
              </>
            )}
          </form.Field>
          {post.error && (
            <p className="nz-comment-error" role="alert">
              {post.error.message}
            </p>
          )}
          <form.Subscribe
            selector={(state) => state.canSubmit && !!state.values.body.trim()}
          >
            {(canSubmit) => (
              <button
                type="submit"
                className="nz-comment-primary"
                disabled={!canSubmit || sending || waiting}
              >
                {post.isPending
                  ? 'Posting…'
                  : view.kind === 'thread'
                    ? 'Reply'
                    : 'Post comment'}
              </button>
            )}
          </form.Subscribe>
        </form>
      )}
    </>
  );
}
