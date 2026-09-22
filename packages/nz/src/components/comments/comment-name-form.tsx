import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import { useEffect, useId, useRef } from 'react';
import { saveCommentName } from '../../lib/comment-name';
import { NAME_LIMIT, validName } from '../../lib/comments-schema';
import type { CommentsApi } from '../../services/comments-api';

interface Props {
  name: string;
  runtime: ManagedRuntime.ManagedRuntime<CommentsApi, never>;
  onSave: () => void;
}

export function CommentNameForm({ name, runtime, onSave }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (name: string) => runtime.runPromise(saveCommentName(name)),
    onSuccess: (_, name) => {
      client.setQueryData(['comment-name'], name);
      onSave();
    },
  });
  const form = useForm({
    defaultValues: { name },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value.name.trim());
    },
  });

  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
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
        name="name"
        validators={{
          onChange: ({ value }) =>
            validName(value.trim())
              ? undefined
              : `Enter a name of ${NAME_LIMIT} characters or less, without control characters.`,
        }}
      >
        {(field) => (
          <>
            <label htmlFor={id}>Name</label>
            <input
              ref={input}
              id={id}
              name={field.name}
              autoComplete="name"
              maxLength={NAME_LIMIT}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
              aria-invalid={!field.state.meta.isValid}
              aria-describedby={`${id}-notice${field.state.meta.isValid ? '' : ` ${id}-error`}`}
              required
              disabled={save.isPending}
            />
            {!field.state.meta.isValid && (
              <p id={`${id}-error`} className="nz-comment-error" role="alert">
                {field.state.meta.errors.join(' ')}
              </p>
            )}
          </>
        )}
      </form.Field>
      <p id={`${id}-notice`} className="nz-comment-notice">
        Saved in this browser. Names and comments are public on GitHub.
      </p>
      {save.error && (
        <p className="nz-comment-error" role="alert">
          {save.error.message}
        </p>
      )}
      <form.Subscribe
        selector={(state) => state.canSubmit && !!state.values.name.trim()}
      >
        {(canSubmit) => (
          <button
            className="nz-comment-primary"
            type="submit"
            disabled={!canSubmit || save.isPending}
          >
            Continue
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}
