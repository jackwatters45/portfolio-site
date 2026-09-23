import { useAtom } from '@effect/atom-react';
import { useForm } from '@tanstack/react-form';
import * as Schema from 'effect/Schema';
import { useEffect, useEffectEvent, useId, useRef } from 'react';
import { Icon } from './icons';
import { BODY_LIMIT, validName, type Author, type Mutation } from './protocol';
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
  reply?: boolean;
  focusInput?: boolean;
  onSubmit: (body: string, request?: Mutation) => Promise<void>;
  onCancel: () => void;
  onTyping: (typing: boolean) => void;
  sending: boolean;
}

export function Composer({
  draftKey,
  store,
  author,
  connection,
  reply,
  focusInput,
  onSubmit,
  onCancel,
  onTyping,
  sending,
}: Props) {
  const id = useId();
  const connected = connection === 'live';
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
      if (!connected || !validName(author.name)) return;
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
  }, [focusInput]);

  return (
    <form
      className="pc-composer"
      aria-busy={sending}
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="body">
        {(field) => (
          <>
            <label className="pc-sr-only" htmlFor={`${id}-body`}>
              {reply ? 'Reply' : 'Comment'}
            </label>
            <textarea
              ref={input}
              id={`${id}-body`}
              placeholder={reply ? 'Write a reply…' : 'Leave a comment…'}
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
        <span className="pc-posting-as">
          <span
            className="pc-author-dot"
            style={{ background: author.color }}
          />
          {author.name}
        </span>
        <button
          className="pc-text-button"
          type="button"
          disabled={sending}
          onClick={onCancel}
        >
          Cancel
        </button>
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
              {sending || isSubmitting ? 'Saving…' : reply ? 'Reply' : 'Add'}
              <Icon name={reply ? 'arrow' : 'plus'} size={14} />
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
