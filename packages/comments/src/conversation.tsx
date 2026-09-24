import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { Thread } from './protocol';

export function Conversation({
  threads,
  renderThread,
}: {
  threads: readonly Thread[];
  renderThread: (thread: Thread) => ReactNode;
}) {
  const messages = useRef<HTMLElement>(null);
  const follow = useRef(true);

  const count = threads.reduce(
    (sum, thread) => sum + thread.messages.length,
    0,
  );

  useLayoutEffect(() => {
    const container = messages.current;

    if (container && follow.current)
      container.scrollTop = container.scrollHeight;
  }, [count]);

  return (
    <section
      className="pc-conversation-messages"
      ref={messages}
      aria-label="Messages"
      onScroll={(event) => {
        const container = event.currentTarget;
        follow.current =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
          32;
      }}
    >
      {threads.map((thread) => (
        <div key={thread.id}>{renderThread(thread)}</div>
      ))}
    </section>
  );
}
