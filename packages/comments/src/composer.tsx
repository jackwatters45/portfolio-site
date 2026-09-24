import { useAtom } from '@effect/atom-react';
import { useForm } from '@tanstack/react-form';
import * as Schema from 'effect/Schema';
import { useEffect, useEffectEvent, useId, useRef } from 'react';
import { Icon } from './icons';
import {
  BODY_LIMIT,
  validName,
  type Author,
  type Message,
  type Mutation,
} from './protocol';
import type { Connection } from './room-client';
import { DraftSchema, type draftStore } from './use-preferences';

const CommentForm = Schema.Struct({
  body: Schema.String.check(Schema.isMaxLength(BODY_LIMIT)),
});

interface Props {
  draftKey: string;
  store: ReturnType<typeof draftStore>;
  author: Author;
  connection: Connection;
  replyTo?: Message;
  editing?: boolean;
  focusInput?: boolean;
  onSubmit: (body: string, request?: Mutation) => Promise<void>;
  onCancel?: () => void;
  onName: () => void;
  onTyping: (typing: boolean) => void;
  sending: boolean;
}

export function Composer({
  draftKey,
  store,
  author,
  connection,
  replyTo,
  editing,
  focusInput,
  onSubmit,
  onCancel,
  onName,
  onTyping,
  sending,
}: Props) {
  const id = useId();
  const connected = connection === 'live';
  const reply = !!replyTo;
  const [draft, setDraft] = useAtom(store.atom(draftKey));
  const input = useRef<HTMLTextAreaElement>(null);
  const typing = useEffectEvent(onTyping);

  const form = useForm({
    defaultValues: { body: draft.body },
    validators: {
      onChange: Schema.toStandardSchemaV1(CommentForm),
      onSubmit: ({ value }): string | undefined =>
        value.body.trim() ? undefined : 'Write a comment.',
    },
    onSubmit: async ({ value, formApi }) => {
      if (sending || !connected || !validName(author.name)) return;
      onTyping(false);

      try {
        await onSubmit(value.body.trim(), store.get(draftKey).request);
        formApi.reset({ body: '' });
      } catch (error) {
        formApi.setErrorMap({
          onSubmit:
            error instanceof Error
              ? error.message
              : 'Could not save your comment.',
        });
      }
    },
  });

  useEffect(() => {
    if (focusInput) input.current?.focus({ preventScroll: true });

    return () => typing(false);
  }, [focusInput, replyTo?.id]);

  return (
    <form
      className="pc-composer"
      aria-busy={sending}
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {replyTo && (
        <div className="pc-reply-context">
          <div>
            <strong>Replying to {replyTo.author.name}</strong>
            <span title={replyTo.body}>{replyTo.body}</span>
          </div>
          <button
            type="button"
            className="pc-icon-button"
            aria-label="Cancel reply"
            disabled={sending}
            onClick={onCancel}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      <form.Field name="body">
        {(field) => (
          <>
            <label className="pc-sr-only" htmlFor={`${id}-body`}>
              {editing ? 'Edit comment' : reply ? 'Reply' : 'Message'}
            </label>
            <textarea
              ref={input}
              id={`${id}-body`}
              placeholder={reply ? 'Write a reply…' : 'Write a message…'}
              rows={3}
              maxLength={BODY_LIMIT}
              required
              value={field.state.value}
              readOnly={sending}
              onChange={(event) => {
                field.handleChange(event.target.value);
                setDraft(new DraftSchema({ body: event.target.value }));
                onTyping(!!event.target.value.trim());
              }}
              onBlur={() => {
                field.handleBlur();
                onTyping(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void form.handleSubmit();
                }
              }}
            />
          </>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
        {(error) =>
          error ? (
            <p className="pc-error" role="alert">
              {error}
            </p>
          ) : null
        }
      </form.Subscribe>
      {!connected && (
        <output className="pc-status">
          {connection === 'offline' ? 'Offline.' : 'Connecting.'} You can keep
          writing.
        </output>
      )}
      <div className="pc-composer-footer">
        {validName(author.name) ? (
          <span className="pc-posting-as">
            <span
              className="pc-author-dot"
              style={{ background: author.color }}
            />
            {author.name}
          </span>
        ) : (
          <button className="pc-text-button" type="button" onClick={onName}>
            Enter name to {reply ? 'reply' : 'comment'}
          </button>
        )}
        {editing && onCancel && (
          <button
            className="pc-text-button"
            type="button"
            disabled={sending}
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
        <form.Subscribe
          selector={(state) =>
            [state.canSubmit, state.isSubmitting, state.values.body] as const
          }
        >
          {([canSubmit, isSubmitting, body]) => (
            <button
              className="pc-primary"
              type="submit"
              disabled={
                !canSubmit ||
                isSubmitting ||
                sending ||
                !connected ||
                !body.trim() ||
                !validName(author.name)
              }
            >
              {sending || isSubmitting
                ? 'Saving…'
                : editing
                  ? 'Save'
                  : reply
                    ? 'Reply'
                    : 'Send'}
              <Icon name="arrow" size={14} />
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
