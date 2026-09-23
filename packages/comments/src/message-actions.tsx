import { useAtom } from '@effect/atom-react';
import { useForm } from '@tanstack/react-form';
import { Atom } from 'effect/unstable/reactivity';
import { useMemo } from 'react';
import { Composer } from './composer';
import type { Author, Message } from './protocol';
import type { Connection } from './room-client';
import { DraftSchema, type draftStore } from './use-preferences';
import type { useRoom } from './use-room';

type Action = { kind: 'edit'; original: string } | { kind: 'delete' } | null;

export function MessageActions({
  message,
  threadId,
  store,
  author,
  connection,
  sending,
  change,
}: {
  message: Message;
  threadId: string;
  store: ReturnType<typeof draftStore>;
  author: Author;
  connection: Connection;
  sending: boolean;
  change: ReturnType<typeof useRoom>['change'];
}) {
  const state = useMemo(() => Atom.make<Action>(null), []);
  const [action, setAction] = useAtom(state);
  const draftKey = `edit:${message.id}`;
  const [, setDraft] = useAtom(store.atom(draftKey));

  const close = () => {
    setAction(null);
    setDraft(new DraftSchema({ body: '' }));
  };

  if (action?.kind === 'edit')
    return (
      <Composer
        draftKey={draftKey}
        store={store}
        author={author}
        connection={connection}
        editing
        focusInput
        sending={sending}
        onSubmit={async (body) => {
          await change({
            change: {
              type: 'edit',
              threadId,
              messageId: message.id,
              body,
              expectedBody: action.original,
            },
            draft: store.atom(draftKey),
          });
          close();
        }}
        onCancel={close}
        onName={() => {}}
        onTyping={() => {}}
      />
    );

  if (action?.kind === 'delete')
    return (
      <DeleteConfirmation
        disabled={sending || connection !== 'live'}
        onCancel={close}
        onDelete={async () => {
          await change({
            change: { type: 'delete', threadId, messageId: message.id },
            draft: store.atom(`delete:${message.id}`),
          });
          close();
        }}
      />
    );

  return (
    <div className="pc-message-actions">
      <button
        type="button"
        className="pc-text-button"
        disabled={sending || connection !== 'live'}
        onClick={() => {
          setDraft(new DraftSchema({ body: message.body }));
          setAction({ kind: 'edit', original: message.body });
        }}
      >
        Edit
      </button>
      <button
        type="button"
        className="pc-text-button"
        disabled={sending || connection !== 'live'}
        onClick={() => setAction({ kind: 'delete' })}
      >
        Delete
      </button>
    </div>
  );
}

function DeleteConfirmation({
  disabled,
  onCancel,
  onDelete,
}: {
  disabled: boolean;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  const form = useForm({
    defaultValues: {},
    validators: { onSubmit: (): string | undefined => undefined },
    onSubmit: async ({ formApi }) => {
      if (disabled) return;

      try {
        await onDelete();
      } catch (error) {
        formApi.setErrorMap({
          onSubmit:
            error instanceof Error
              ? error.message
              : 'Could not delete this comment.',
        });
      }
    },
  });

  return (
    <form
      className="pc-delete-confirmation"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <p>Delete this comment? Other replies will remain.</p>
      <form.Subscribe
        selector={(state) =>
          [state.isSubmitting, state.errorMap.onSubmit] as const
        }
      >
        {([pending, error]) => (
          <>
            {error && (
              <p className="pc-error" role="alert">
                {error}
              </p>
            )}
            <div className="pc-message-actions">
              <button
                type="button"
                className="pc-text-button"
                disabled={pending}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="pc-primary"
                disabled={disabled || pending}
              >
                {pending ? 'Deleting…' : 'Delete comment'}
              </button>
            </div>
          </>
        )}
      </form.Subscribe>
    </form>
  );
}
