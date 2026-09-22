import {
  type SubmitEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { loadCommentName, saveCommentName } from '../lib/comment-name';
import {
  COMMENT_LIMIT,
  type CommentMessage,
  type CommentTarget,
  type CommentThread,
  GENERAL_COMMENT_TARGET,
  NAME_LIMIT,
  QUOTE_LIMIT,
  type ThreadDetail,
  validName,
} from '../lib/comments';
import '../styles/comments.css';

type View = 'list' | 'thread' | 'new' | 'name';
type Anchor = CommentTarget & { element: HTMLElement };

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/comments${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const value = await response.json().catch(() => {
    throw new Error('Comments are unavailable. Please try again later.');
  });
  if (!response.ok) throw new Error(value.error ?? 'Could not load comments.');
  return value as T;
}

function Bubble() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 11.5a8 8 0 0 1-8 8H4l1.7-4A8 8 0 1 1 20 11.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8 10h8M8 14h5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Message({ value }: { value: CommentMessage }) {
  const date = new Date(value.createdAt);
  return (
    <article className="nz-comment-message">
      <div className="nz-comment-byline">
        <strong>{value.name}</strong>
        <time dateTime={value.createdAt} title={date.toLocaleString()}>
          {date.toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          })}
        </time>
      </div>
      <p>{value.body}</p>
    </article>
  );
}

export default function Comments() {
  const id = useId();
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [threadId, setThreadId] = useState<number | null>(null);
  const [target, setTarget] = useState<CommentTarget | null>(null);
  const [panel, setPanel] = useState(false);
  const [view, setView] = useState<View>('list');
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [resolved, setResolved] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const returnView = useRef<View | 'pick'>('list');
  const launcher = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const commentField = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);
  const current =
    detail?.thread.id === threadId
      ? detail.thread
      : threads.find((item) => item.id === threadId);
  const draftKey =
    view === 'thread' ? `thread-${threadId}` : `new-${target?.anchor}`;
  const draft = drafts[draftKey] ?? '';
  const context = view === 'thread' ? current : target;
  const contextElement = anchors.find(
    (item) => item.anchor === context?.anchor,
  )?.element;

  const openThread = useCallback((value: CommentThread) => {
    setThreadId(value.id);
    setView('thread');
    setPanel(true);
    setPicking(false);
    setSendError('');
  }, []);

  const chooseTarget = useCallback(
    (value: CommentTarget) => {
      const existing = threads.find(
        (item) => item.anchor === value.anchor && !item.closed && !item.locked,
      );
      if (existing) {
        openThread(existing);
        return;
      }
      setTarget(value);
      setView('new');
      setPanel(true);
      setPicking(false);
      setSendError('');
    },
    [threads, openThread],
  );

  useEffect(() => {
    const values = Array.from(
      document.querySelectorAll<HTMLElement>('[data-comment-anchor]'),
    ).map((element) => ({
      element,
      anchor: element.dataset.commentAnchor!,
      quote: (
        element.querySelector('h3, dt, figcaption')?.textContent ??
        element.textContent ??
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, QUOTE_LIMIT),
    }));
    setAnchors(values);
    void loadCommentName().then((saved) => {
      if (validName(saved)) setName((currentName) => currentName || saved);
    });
    const fromHash = () => {
      const anchor = new URLSearchParams(location.hash.slice(1)).get('comment');
      if (anchor === GENERAL_COMMENT_TARGET.anchor) {
        setPanel(true);
        setView('list');
        return;
      }
      const found = values.find((item) => item.anchor === anchor);
      if (found) {
        found.element.closest('details')?.setAttribute('open', '');
        found.element.scrollIntoView({ block: 'center' });
        setTarget(found);
        setPanel(true);
        setView('list');
      }
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: The refresh counter explicitly reloads server data.
  useEffect(() => {
    if (sending) return;
    const controller = new AbortController();
    setLoading(true);
    api<{ threads: CommentThread[] }>('', { signal: controller.signal })
      .then((value) => {
        setThreads(value.threads);
        setLoadError('');
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh, sending]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: The refresh counter explicitly reloads server data.
  useEffect(() => {
    if (!panel || view !== 'thread' || !threadId || sending) return;
    const controller = new AbortController();
    setLoadingThread(true);
    setThreadError('');
    api<ThreadDetail>(`/${threadId}`, { signal: controller.signal })
      .then((value) => {
        setDetail(value);
        setThreads((items) =>
          items.map((item) =>
            item.id === value.thread.id ? value.thread : item,
          ),
        );
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setThreadError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingThread(false);
      });
    return () => controller.abort();
  }, [panel, view, threadId, refresh, sending]);

  useEffect(() => {
    if (!panel || sending || (view !== 'thread' && view !== 'list')) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible')
        setRefresh((value) => value + 1);
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [panel, view, sending]);

  useEffect(() => {
    if (!panel) return;
    if (view === 'name') nameField.current?.focus();
    else if (view === 'new') commentField.current?.focus();
    else heading.current?.focus();
  }, [panel, view]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || sendingRef.current) return;
      setPicking(false);
      setPanel(false);
      launcher.current?.focus();
    };
    if (panel || picking) window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [panel, picking]);

  useEffect(() => {
    if (!picking) return;
    document.body.classList.add('nz-comments-picking');
    const select = (event: MouseEvent) => {
      if (
        !(event.target instanceof Element) ||
        event.target.closest('[data-feedback-ui]')
      )
        return;
      const element = event.target.closest<HTMLElement>(
        '[data-comment-anchor]',
      );
      const found = anchors.find((item) => item.element === element);
      if (!found) return;
      event.preventDefault();
      event.stopPropagation();
      chooseTarget(found);
    };
    document.addEventListener('click', select, true);
    return () => {
      document.body.classList.remove('nz-comments-picking');
      document.removeEventListener('click', select, true);
    };
  }, [picking, anchors, chooseTarget]);

  useEffect(() => {
    const anchor =
      panel && view === 'thread'
        ? current?.anchor
        : panel && view === 'new'
          ? target?.anchor
          : null;
    const element = anchors.find((item) => item.anchor === anchor)?.element;
    element?.classList.add('nz-comment-selected');
    return () => element?.classList.remove('nz-comment-selected');
  }, [panel, view, current?.anchor, target?.anchor, anchors]);

  function startPicking() {
    setPanel(false);
    setPicking(true);
    setSendError('');
  }

  function startGeneralComment() {
    setTarget(GENERAL_COMMENT_TARGET);
    setPicking(false);
    setPanel(true);
    setView('new');
    setSendError('');
    if (!name) askName('new');
  }

  function askName(next: View | 'pick') {
    returnView.current = next;
    setNameInput(name);
    setView('name');
    setPanel(true);
    setSendError('');
  }

  function saveName(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = nameInput.trim();
    if (!validName(value)) return;
    setName(value);
    void saveCommentName(value);
    if (returnView.current === 'pick') startPicking();
    else setView(returnView.current);
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || !validName(name) || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError('');
    try {
      if (view === 'thread' && current) {
        const { message } = await api<{ message: CommentMessage }>(
          `/${current.id}`,
          {
            method: 'POST',
            body: JSON.stringify({ name, body: draft.trim() }),
          },
        );
        setDetail((value) =>
          value
            ? {
                thread: {
                  ...value.thread,
                  replyCount: value.thread.replyCount + 1,
                },
                replies: [...value.replies, message],
              }
            : value,
        );
      } else if (target) {
        const { thread } = await api<{ thread: CommentThread }>('', {
          method: 'POST',
          body: JSON.stringify({
            name,
            body: draft.trim(),
            target: { anchor: target.anchor, quote: target.quote },
          }),
        });
        setThreads((items) => [...items, thread]);
        setDetail({ thread, replies: [] });
        openThread(thread);
      }
      setDrafts((values) => ({ ...values, [draftKey]: '' }));
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : 'Could not save your comment.',
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function close() {
    if (sendingRef.current) return;
    setPanel(false);
    launcher.current?.focus();
  }

  const visible = threads.filter((item) => item.closed === resolved);
  const count = threads.filter((item) => !item.closed).length;

  return (
    <>
      {anchors.map((anchor) => {
        const matches = threads.filter(
          (item) => item.anchor === anchor.anchor && !item.closed,
        );
        if (!picking && !matches.length) return null;
        return createPortal(
          <button
            type="button"
            className="nz-comment-pin"
            data-feedback-ui=""
            disabled={sending}
            aria-label={
              matches.length
                ? `Read comments on ${anchor.quote}`
                : `Comment on ${anchor.quote}`
            }
            onClick={() =>
              matches.length ? openThread(matches[0]) : chooseTarget(anchor)
            }
          >
            {matches.length
              ? matches.reduce((sum, item) => sum + 1 + item.replyCount, 0)
              : '+'}
          </button>,
          anchor.element,
          anchor.anchor,
        );
      })}
      <div className="nz-feedback-ui" data-feedback-ui="">
        {picking ? (
          <div className="nz-comment-picker" aria-live="polite">
            <Bubble />
            <span>Choose a marked plan</span>
            <button
              type="button"
              onClick={() => {
                setPicking(false);
                setPanel(true);
                setView('list');
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            ref={launcher}
            type="button"
            className="nz-comment-launcher"
            aria-expanded={panel}
            aria-controls={`${id}-panel`}
            onClick={() => {
              if (panel) close();
              else {
                setPanel(true);
                setRefresh((value) => value + 1);
              }
            }}
          >
            <Bubble /> Comments{' '}
            {count > 0 && <span className="nz-comment-count">{count}</span>}
          </button>
        )}
        <dialog
          open={panel}
          id={`${id}-panel`}
          className="nz-comments-panel"
          aria-labelledby={`${id}-title`}
        >
          <header className="nz-comments-header">
            {view !== 'list' && (
              <button
                type="button"
                className="nz-comment-icon"
                aria-label="Back to comments"
                disabled={sending}
                onClick={() => {
                  setView('list');
                  setSendError('');
                }}
              >
                ←
              </button>
            )}
            <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
              {view === 'name'
                ? 'Your name'
                : view === 'new'
                  ? target?.anchor === GENERAL_COMMENT_TARGET.anchor
                    ? 'General comment'
                    : 'New comment'
                  : 'Comments'}
            </h2>
            {(view === 'list' || view === 'thread') && (
              <button
                type="button"
                className="nz-comment-icon"
                aria-label="Refresh comments"
                disabled={
                  sending || loading || (view === 'thread' && loadingThread)
                }
                onClick={() => setRefresh((value) => value + 1)}
              >
                ↻
              </button>
            )}
            <button
              type="button"
              className="nz-comment-icon"
              aria-label="Close comments"
              disabled={sending}
              onClick={close}
            >
              ×
            </button>
          </header>
          <div className="nz-comments-content">
            {view === 'name' ? (
              <form className="nz-comment-form" onSubmit={saveName}>
                <label htmlFor={`${id}-name`}>Name</label>
                <input
                  ref={nameField}
                  id={`${id}-name`}
                  autoComplete="given-name"
                  maxLength={NAME_LIMIT}
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  required
                />
                <p className="nz-comment-notice">
                  Saved in this browser. Names and comments are public on
                  GitHub.
                </p>
                <button
                  className="nz-comment-primary"
                  type="submit"
                  disabled={!validName(nameInput.trim())}
                >
                  Continue
                </button>
              </form>
            ) : view === 'list' ? (
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
                {loadError ? (
                  <p className="nz-comment-error" role="alert">
                    {loadError}
                  </p>
                ) : loading && !threads.length ? (
                  <output>Loading comments…</output>
                ) : !visible.length ? (
                  <p className="nz-comment-empty">
                    {resolved ? 'No resolved comments.' : 'No comments yet.'}
                  </p>
                ) : null}
                {visible.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="nz-comment-thread"
                    onClick={() => openThread(item)}
                  >
                    <span className="nz-comment-quote">{item.quote}</span>
                    <strong>{item.message.name}</strong>
                    <span className="nz-comment-preview">
                      {item.message.body}
                    </span>
                    {item.replyCount > 0 && (
                      <span className="nz-comment-replies">
                        {item.replyCount}{' '}
                        {item.replyCount === 1 ? 'reply' : 'replies'}
                      </span>
                    )}
                  </button>
                ))}
              </>
            ) : (
              <>
                {contextElement ? (
                  <button
                    className="nz-comment-context"
                    type="button"
                    onClick={() => {
                      close();
                      contextElement.scrollIntoView({ block: 'center' });
                    }}
                  >
                    {context?.quote}
                  </button>
                ) : view === 'thread' ? (
                  <p className="nz-comment-context">{context?.quote}</p>
                ) : null}
                {view === 'thread' && current && (
                  <>
                    <Message value={current.message} />
                    {detail?.thread.id === threadId &&
                      detail.replies.map((reply) => (
                        <Message key={reply.id} value={reply} />
                      ))}
                    {loadingThread && <output>Loading…</output>}
                    {threadError && (
                      <p className="nz-comment-error" role="alert">
                        {threadError}
                      </p>
                    )}
                  </>
                )}
                {view === 'thread' && (current?.closed || current?.locked) ? (
                  <p className="nz-comment-empty">
                    {current.closed ? 'Resolved' : 'Replies are closed.'}
                  </p>
                ) : !name ? (
                  <button
                    type="button"
                    className="nz-comment-primary"
                    onClick={() => askName(view)}
                  >
                    Add your name to comment
                  </button>
                ) : (
                  <form className="nz-comment-form" onSubmit={submit}>
                    <label htmlFor={`${id}-body`}>
                      {view === 'thread' ? 'Reply' : 'Comment'}
                    </label>
                    <textarea
                      ref={commentField}
                      id={`${id}-body`}
                      rows={3}
                      maxLength={COMMENT_LIMIT}
                      required
                      value={draft}
                      disabled={sending}
                      onChange={(event) =>
                        setDrafts((values) => ({
                          ...values,
                          [draftKey]: event.target.value,
                        }))
                      }
                    />
                    {sendError && (
                      <p className="nz-comment-error" role="alert">
                        {sendError}
                      </p>
                    )}
                    <button
                      type="submit"
                      className="nz-comment-primary"
                      disabled={
                        sending ||
                        !draft.trim() ||
                        (view === 'thread' && (loadingThread || !!threadError))
                      }
                    >
                      {sending
                        ? 'Posting…'
                        : view === 'thread'
                          ? 'Reply'
                          : 'Post comment'}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
          {view !== 'name' && (
            <footer className="nz-comments-footer">
              {view === 'list' && (
                <div className="nz-comment-actions">
                  <button
                    type="button"
                    className="nz-comment-primary"
                    disabled={!!loadError || loading}
                    onClick={() => (name ? startPicking() : askName('pick'))}
                  >
                    Inline comment
                  </button>
                  <button
                    type="button"
                    className="nz-comment-secondary"
                    disabled={!!loadError || loading}
                    onClick={startGeneralComment}
                  >
                    General comment
                  </button>
                </div>
              )}
              {name && (
                <button
                  type="button"
                  className="nz-comment-name-button"
                  disabled={sending}
                  onClick={() => askName(view)}
                  aria-label={`Change name, currently ${name}`}
                >
                  {name} · Change name
                </button>
              )}
            </footer>
          )}
        </dialog>
      </div>
    </>
  );
}
