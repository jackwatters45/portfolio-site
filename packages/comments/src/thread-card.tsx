import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';
import type { Message, Thread } from './protocol';

export function ThreadCard({
  thread,
  active,
  onOpen,
  onClose,
  onLocate,
  onCopy,
  authorId,
  likesDisabled,
  onLike,
  actions,
  children,
}: {
  thread: Thread;
  active: boolean;
  onOpen: () => void;
  onClose: () => void;
  onLocate: () => void;
  onCopy: () => void;
  authorId: string;
  likesDisabled: boolean;
  onLike: (messageId: string, liked: boolean) => void;
  actions?: (message: Message) => ReactNode;
  children?: ReactNode;
}) {
  const first = thread.messages[0];
  const messages = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (active && follow.current && messages.current)
      messages.current.scrollTop = messages.current.scrollHeight;
  }, [thread.messages.length, active]);

  if (!first) return null;

  return (
    <article
      className={`pc-card ${active ? 'pc-card-active' : ''}`}
      aria-label={`Comment by ${first.author.name}`}
    >
      <header className="pc-card-context">
        <button type="button" onClick={onLocate} title={thread.target.quote}>
          <Icon name="arrow" size={13} />
          <span>{thread.target.quote}</span>
        </button>
        {active && (
          <>
            <button
              className="pc-icon-button"
              type="button"
              aria-label="Copy comment link"
              onClick={onCopy}
            >
              <Icon name="link" size={14} />
            </button>
            <button
              className="pc-icon-button"
              type="button"
              aria-label="Close conversation"
              onClick={onClose}
            >
              <Icon name="close" size={16} />
            </button>
          </>
        )}
      </header>
      {active ? (
        <div
          className="pc-messages"
          ref={messages}
          onScroll={() => {
            const el = messages.current;

            if (el)
              follow.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 32;
          }}
        >
          {thread.messages.map((message) => {
            const likes = thread.likes.filter(
              (like) => like.messageId === message.id,
            );

            const liked = likes.some((like) => like.authorId === authorId);

            return (
              <div className="pc-message" key={message.id}>
                <div className="pc-byline">
                  <span
                    className="pc-avatar"
                    style={{ background: message.author.color }}
                  >
                    {message.author.name.slice(0, 1).toUpperCase()}
                  </span>
                  <strong>{message.author.name}</strong>
                  <time
                    dateTime={message.createdAt}
                    title={new Date(message.createdAt).toLocaleString()}
                  >
                    {new Date(message.createdAt).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <p>{message.body}</p>
                {message.editedAt && !message.deletedAt && (
                  <span className="pc-edited">Edited</span>
                )}
                {!message.deletedAt && (
                  <div className="pc-likes">
                    <button
                      type="button"
                      className="pc-like"
                      aria-label={`${liked ? 'Unlike' : 'Like'} comment by ${message.author.name}, ${likes.length} ${likes.length === 1 ? 'like' : 'likes'}`}
                      aria-pressed={liked}
                      disabled={likesDisabled}
                      onClick={() => onLike(message.id, !liked)}
                    >
                      <Icon name="heart" size={14} />
                      <span>{likes.length || 'Like'}</span>
                    </button>
                    {likes.length > 0 && (
                      <span className="pc-like-names">
                        Liked by{' '}
                        {likes.map((like) => like.authorName).join(', ')}
                      </span>
                    )}
                  </div>
                )}
                {!message.deletedAt && actions?.(message)}
              </div>
            );
          })}
        </div>
      ) : (
        <button
          className="pc-card-preview"
          type="button"
          onClick={onOpen}
          aria-label={`Open comment by ${first.author.name}: ${first.body}`}
        >
          <span className="pc-byline">
            <span
              className="pc-avatar"
              style={{ background: first.author.color }}
            >
              {first.author.name.slice(0, 1).toUpperCase()}
            </span>
            <strong>{first.author.name}</strong>
            <time dateTime={first.createdAt}>
              {new Date(first.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </time>
          </span>
          <span className="pc-preview-body">{first.body}</span>
          {thread.messages.length > 1 && (
            <span className="pc-reply-count">
              {thread.messages.length - 1}{' '}
              {thread.messages.length === 2 ? 'reply' : 'replies'}
            </span>
          )}
        </button>
      )}
      {active && children}
    </article>
  );
}
