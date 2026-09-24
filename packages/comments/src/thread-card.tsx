import type { ReactNode } from 'react';
import { Icon } from './icons';
import type { Message, Thread } from './protocol';

interface MessageProps {
  message: Message;
  thread: Thread;
  authorId: string;
  likesDisabled: boolean;
  replyingTo?: string;
  disabled: boolean;
  onReply: (message: Message) => void;
  onLike: (messageId: string, liked: boolean) => void;
  actions?: (message: Message) => ReactNode;
}

function CommentMessage({
  message,
  thread,
  authorId,
  likesDisabled,
  replyingTo,
  disabled,
  onReply,
  onLike,
  actions,
}: MessageProps) {
  const likes = thread.likes.filter((like) => like.messageId === message.id);
  const liked = likes.some((like) => like.authorId === authorId);

  return (
    <div
      className={`pc-message ${replyingTo === message.id ? 'pc-message-replying' : ''}`}
    >
      <div className="pc-byline">
        <span
          className="pc-avatar"
          style={{ background: message.author.color }}
          aria-hidden="true"
        >
          {message.author.name.slice(0, 1).toUpperCase()}
        </span>
        <strong>{message.author.name}</strong>
        <time
          dateTime={message.createdAt}
          title={new Date(message.createdAt).toLocaleString()}
        >
          {new Date(message.createdAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </time>
      </div>
      <p>{message.body}</p>
      {message.editedAt && !message.deletedAt && (
        <span className="pc-edited">Edited</span>
      )}
      <div className="pc-message-controls">
        {!message.deletedAt && (
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
        )}
        {!message.deletedAt && (
          <button
            type="button"
            className="pc-text-button"
            disabled={disabled}
            aria-pressed={replyingTo === message.id}
            onClick={() => onReply(message)}
          >
            Reply
          </button>
        )}
        {!message.deletedAt && actions?.(message)}
      </div>
      {!message.deletedAt && likes.length > 0 && (
        <span className="pc-like-names">
          Liked by {likes.map((like) => like.authorName).join(', ')}
        </span>
      )}
    </div>
  );
}

export function ThreadCard({
  thread,
  ...messageProps
}: Omit<MessageProps, 'message'>) {
  const first = thread.messages[0];

  if (!first) return null;

  return (
    <article
      className="pc-conversation-thread"
      data-thread-id={thread.id}
      aria-label={`Message by ${first.author.name}`}
    >
      <CommentMessage {...messageProps} thread={thread} message={first} />
      {thread.messages.length > 1 && (
        <ol
          className="pc-replies"
          aria-label={`Replies to ${first.author.name}`}
        >
          {thread.messages.slice(1).map((message) => (
            <li key={message.id}>
              <CommentMessage
                {...messageProps}
                thread={thread}
                message={message}
              />
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
