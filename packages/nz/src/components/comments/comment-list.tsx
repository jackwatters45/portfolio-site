import { useState } from 'react';
import type { CommentThread } from '../../lib/comments-schema';

interface Props {
  threads: ReadonlyArray<CommentThread>;
  loading: boolean;
  error: Error | null;
  onOpen: (thread: CommentThread) => void;
}

export function CommentList({ threads, loading, error, onOpen }: Props) {
  const [resolved, setResolved] = useState(false);
  const visible = threads.filter((thread) => thread.closed === resolved);

  return (
    <>
      <div className="nz-comment-tabs">
        <button
          type="button"
          aria-pressed={!resolved}
          onClick={() => setResolved(false)}
        >
          Open
        </button>
        <button
          type="button"
          aria-pressed={resolved}
          onClick={() => setResolved(true)}
        >
          Resolved
        </button>
      </div>
      {error ? (
        <p className="nz-comment-error" role="alert">
          {error.message}
        </p>
      ) : loading && !threads.length ? (
        <output>Loading comments…</output>
      ) : !visible.length ? (
        <p className="nz-comment-empty">
          {resolved ? 'No resolved comments.' : 'No comments yet.'}
        </p>
      ) : null}
      {visible.map((thread) => (
        <button
          type="button"
          key={thread.id}
          className="nz-comment-thread"
          onClick={() => onOpen(thread)}
        >
          <span className="nz-comment-quote">{thread.quote}</span>
          <strong>{thread.message.name}</strong>
          <span className="nz-comment-preview">{thread.message.body}</span>
          {thread.replyCount > 0 && (
            <span className="nz-comment-replies">
              {thread.replyCount}{' '}
              {thread.replyCount === 1 ? 'reply' : 'replies'}
            </span>
          )}
        </button>
      ))}
    </>
  );
}
