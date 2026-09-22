import { useMutation, useQueryClient } from '@tanstack/react-query';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import { useEffect, useId, useRef, useState } from 'react';
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
  const [value, setValue] = useState(name);
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (name: string) => runtime.runPromise(saveCommentName(name)),
    onSuccess: (_, name) => {
      client.setQueryData(['comment-name'], name);
      onSave();
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
        if (validName(value.trim()) && !save.isPending)
          save.mutate(value.trim());
      }}
    >
      <label htmlFor={id}>Name</label>
      <input
        ref={input}
        id={id}
        autoComplete="name"
        maxLength={NAME_LIMIT}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required
        disabled={save.isPending}
      />
      <p className="nz-comment-notice">
        Saved in this browser. Names and comments are public on GitHub.
      </p>
      <button
        className="nz-comment-primary"
        type="submit"
        disabled={!validName(value.trim()) || save.isPending}
      >
        Continue
      </button>
    </form>
  );
}
