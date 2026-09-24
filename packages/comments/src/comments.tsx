import { RegistryContext } from '@effect/atom-react';
import { useContext, useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Composer } from './composer';
import { Conversation } from './conversation';
import { FloatingPanel, PanelHeading } from './floating-panel';
import { Icon } from './icons';
import { MessageActions } from './message-actions';
import {
  GENERAL_TARGET,
  validName,
  type Mutation,
  type Target,
  type Thread,
} from './protocol';
import { NameForm, Settings } from './settings';
import {
  cursorFor,
  pageTargets,
  pointFor,
  reveal,
  targetElement,
  targetFor,
} from './targets';
import { ThreadCard } from './thread-card';
import { Toolbar } from './toolbar';
import { useCommentUi } from './ui-state';
import { usePageEvents } from './use-page-events';
import { draftStore, usePreferences } from './use-preferences';
import { useRoom } from './use-room';

export interface CommentsProps {
  endpoint: string;
  rootSelector: string;
  room: string;
}

export default function Comments({
  endpoint,
  rootSelector,
  room,
}: CommentsProps) {
  const id = useId();
  const registry = useContext(RegistryContext);
  const { preferences, update, storageError } = usePreferences();
  const identified = validName(preferences.name);
  const sharingCursors = identified && preferences.cursors;
  const ui = useCommentUi(sharingCursors);

  const {
    mounted,
    active,
    picking,
    list,
    settings,
    welcome,
    keyboardPicker,
    selected,
    replyTo,
    hover,
    notice,
    layout,
    keyboardTarget,
    presenceNow,
    setMounted,
    setActive,
    setPicking,
    setList,
    setSettings,
    setWelcome,
    setKeyboardPicker,
    setSelected,
    setReplyTo,
    setHover,
    setNotice,
    setLayout,
    setKeyboardTarget,
  } = ui;

  const live = useRoom(endpoint, preferences);
  const store = useMemo(() => draftStore(room, registry), [room, registry]);
  const launcher = useRef<HTMLButtonElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const pageMarkers = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement | null>(null);

  const pageThreads = useMemo(
    () => live.threads.filter((thread) => !thread.target.selector),
    [live.threads],
  );

  const pageMessageCount = pageThreads.reduce(
    (count, thread) =>
      count + thread.messages.filter((message) => !message.deletedAt).length,
    0,
  );

  const channels = useMemo(() => {
    const grouped = new Map<string, { target: Target; threads: Thread[] }>();

    for (const thread of live.threads) {
      const channel = grouped.get(thread.target.selector);

      if (channel) channel.threads.push(thread);
      else
        grouped.set(thread.target.selector, {
          target: thread.target,
          threads: [thread],
        });
    }

    return [...grouped.values()];
  }, [live.threads]);

  const target = selected;

  const conversationThreads = useMemo(
    () =>
      live.threads
        .filter((thread) => thread.target.selector === target?.selector)
        .sort((a, b) =>
          (a.messages[0]?.createdAt ?? '').localeCompare(
            b.messages[0]?.createdAt ?? '',
          ),
        ),
    [live.threads, target?.selector],
  );

  const replyThread = conversationThreads.find(
    (thread) => thread.id === replyTo?.threadId,
  );

  const replyMessage = replyThread?.messages.find(
    (message) => message.id === replyTo?.messageId,
  );

  const draftKey = replyThread?.id ?? `new:${target?.selector ?? ''}`;

  const typingPeers = live.peers.filter(
    (peer) => peer.typing === draftKey && presenceNow - peer.updatedAt < 6000,
  );

  const canPick =
    active &&
    !welcome &&
    picking &&
    !selected &&
    !settings &&
    !keyboardPicker &&
    !list;

  const targets = useMemo(
    () => (mounted && root.current ? pageTargets(root.current) : []),
    [mounted],
  );

  const sending = live.sending || live.changing;
  const stopTyping = () => live.updatePresence({ typing: null });

  const closeCard = () => {
    if (sending) return;
    setSelected(null);
    setReplyTo(null);
    stopTyping();
  };

  const clearPanels = () => {
    setWelcome(false);
    setSelected(null);
    setReplyTo(null);
    setSettings(false);
    setKeyboardPicker(false);
    setList(null);
    setHover(null);
    stopTyping();
  };

  const choose = (value: Target) => {
    if (sending) return;
    clearPanels();
    setActive(true);
    setPicking(false);
    setSelected(value);
  };

  const close = () => {
    if (sending) return;
    clearPanels();
    setActive(false);
    setWelcome(false);
    launcher.current?.focus({ preventScroll: true });
  };

  const submit = async (body: string, previous?: Mutation) => {
    if (!target) return;

    await live.submit({
      body,
      previous,
      target,
      threadId: replyThread?.id,
      draft: store.atom(draftKey),
    });

    setReplyTo(null);
    setNotice(replyThread ? 'Reply added' : 'Message sent');
  };

  const like = async (threadId: string, messageId: string, liked: boolean) => {
    try {
      await live.like({ threadId, messageId, liked });
    } catch {
      setNotice(
        'Could not confirm your like. Check your connection and try again.',
      );
    }
  };

  usePageEvents({
    rootSelector,
    active,
    picking: canPick,
    pointerActive: canPick || sharingCursors,
    root: (element) => {
      root.current = element;
      setMounted(true);
    },
    layout: () => setLayout((value) => value + 1),
    pointer: (event) => {
      if (!root.current || !(event.target instanceof Element)) return;
      const element = targetElement(event.target, root.current);
      const point = { x: event.clientX, y: event.clientY };

      if (canPick) {
        const value = element ? targetFor(element, root.current, point) : null;
        setHover((previous) =>
          previous?.selector === value?.selector ? previous : value,
        );
      }

      if (sharingCursors) {
        const cursor = cursorFor(element ?? event.target, root.current, point);

        if (cursor) live.updatePresence({ cursor });
      }
    },
    // The presence lease expires the last cursor; leaving the page only clears selection.
    leave: () => setHover(null),
    click: (event) => {
      if (!root.current || !(event.target instanceof Element)) return;
      const element = targetElement(event.target, root.current);

      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      choose(
        targetFor(
          element,
          root.current,
          event.detail ? { x: event.clientX, y: event.clientY } : undefined,
        ),
      );
    },
    key: (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || sending) return;
      event.preventDefault();

      if (welcome) setWelcome(false);
      else if (settings) setSettings(false);
      else if (keyboardPicker) setKeyboardPicker(false);
      else if (list) setList(null);
      else if (replyTo) {
        setReplyTo(null);
        stopTyping();
      } else if (selected) closeCard();
      else close();
    },
  });
  const selectedPoint = target ? pointFor(target, root.current) : null;
  const selectedElement = selectedPoint?.element;
  const mobile = mounted && window.innerWidth <= 600;

  const anchor = useMemo(() => {
    if (!target || !mounted) return null;

    if (mobile) return toolbar.current;

    if (!target.selector)
      return {
        contextElement: pageMarkers.current ?? root.current ?? undefined,
        getBoundingClientRect: () =>
          pageMarkers.current?.getBoundingClientRect() ??
          new DOMRect(window.innerWidth - 12, 12, 0, 23),
      };

    if (!selectedElement) return null;

    return {
      contextElement: selectedElement,
      getBoundingClientRect: () => {
        const point = pointFor(target, root.current);

        if (!point) return new DOMRect();
        const right = root.current?.getBoundingClientRect().right ?? 0;

        const inMargin = window.innerWidth - right >= 404;

        return new DOMRect(
          inMargin ? right + 4 : point.x,
          inMargin ? point.y : point.rect.top,
          0,
          inMargin ? 0 : point.rect.height,
        );
      },
    };
  }, [mounted, target, mobile, selectedElement]);

  if (!mounted) return null;
  const unavailableTarget = target?.selector && !selectedPoint;
  const previewPoint = hover && canPick ? pointFor(hover, root.current) : null;
  const highlight = selectedPoint ?? previewPoint;

  const composer = (
    <Composer
      key={draftKey}
      draftKey={draftKey}
      store={store}
      author={preferences}
      connection={live.connection}
      replyTo={replyMessage}
      focusInput={!!replyThread || conversationThreads.length === 0}
      sending={sending}
      onSubmit={submit}
      onCancel={() => {
        setReplyTo(null);
        stopTyping();
      }}
      onName={() => setWelcome(true)}
      onTyping={(typing) =>
        live.updatePresence({ typing: typing ? draftKey : null })
      }
    />
  );

  const typing = !!typingPeers.length && (
    <output className="pc-typing">
      <span className="pc-typing-dots">
        <i />
        <i />
        <i />
      </span>
      {typingPeers.map((peer) => peer.name).join(', ')}{' '}
      {typingPeers.length === 1 ? 'is' : 'are'} typing…
    </output>
  );

  return createPortal(
    <div data-comments-ui="" className="pc-root" data-layout={layout}>
      {highlight && !welcome && (
        <div
          className={`pc-highlight ${selectedPoint ? 'pc-highlight-selected' : ''}`}
          style={{
            left: highlight.rect.left - 3,
            top: highlight.rect.top - 3,
            width: highlight.rect.width + 6,
            height: highlight.rect.height + 6,
          }}
        />
      )}
      {preferences.markers && pageThreads.length > 0 && (
        <button
          ref={pageMarkers}
          type="button"
          className={`pc-pin pc-page-comments ${target?.selector === '' ? 'pc-pin-active' : ''}`}
          aria-label={`Page comments: ${pageMessageCount} ${pageMessageCount === 1 ? 'message' : 'messages'}`}
          aria-expanded={target?.selector === ''}
          title="Page comments"
          disabled={sending}
          onClick={() => {
            if (target?.selector === '') closeCard();
            else choose(GENERAL_TARGET);
          }}
        >
          {pageMessageCount}
        </button>
      )}
      {preferences.markers &&
        channels.map((channel) => {
          const point = pointFor(channel.target, root.current);

          const count = channel.threads.reduce(
            (sum, thread) =>
              sum +
              thread.messages.filter((message) => !message.deletedAt).length,
            0,
          );

          const expanded = target?.selector === channel.target.selector;

          return point && point.y > 0 && point.y < window.innerHeight ? (
            <button
              key={channel.target.selector}
              type="button"
              className={`pc-pin ${expanded ? 'pc-pin-active' : ''}`}
              style={{ left: point.x, top: point.y }}
              aria-label={`${count} comments on ${channel.target.quote}`}
              aria-expanded={expanded}
              disabled={sending}
              onClick={() => {
                if (expanded) closeCard();
                else choose(channel.target);
              }}
            >
              {count}
            </button>
          ) : null;
        })}
      {sharingCursors &&
        live.peers.map((peer) => {
          const point =
            peer.cursor && presenceNow - peer.updatedAt < 10_000
              ? pointFor(peer.cursor, root.current)
              : null;

          return point && point.y >= 0 && point.y <= window.innerHeight ? (
            <div
              key={peer.id}
              className="pc-cursor"
              style={{
                transform: `translate3d(${point.x}px, ${point.y}px, 0)`,
                color: peer.color,
              }}
              aria-hidden="true"
            >
              <svg width="18" height="23" viewBox="0 0 18 23">
                <path
                  d="M1 1v18l5-5 5 8 3-2-5-8h8Z"
                  fill="currentColor"
                  stroke="white"
                  strokeWidth="1.5"
                />
              </svg>
              <span style={{ background: peer.color }}>{peer.name}</span>
            </div>
          ) : null;
        })}
      {active && welcome && (
        <FloatingPanel
          anchor={toolbar.current}
          label="Join comments"
          onClose={() => setWelcome(false)}
        >
          <PanelHeading
            title="Join comments"
            onClose={() => setWelcome(false)}
          />
          <NameForm
            name={preferences.name}
            welcome
            onSave={async (name) => {
              await update({ name });
              setWelcome(false);
            }}
          />
        </FloatingPanel>
      )}
      {active && !welcome && target && (
        <FloatingPanel
          anchor={anchor ?? toolbar.current}
          placement={
            mobile
              ? 'top-start'
              : target.selector
                ? 'bottom-start'
                : 'bottom-end'
          }
          label={target.selector ? 'Element conversation' : 'Page conversation'}
          layoutVersion={layout}
          focusIndex={0}
          className="pc-conversation-panel"
          onClose={closeCard}
        >
          <PanelHeading
            title={target.selector ? target.quote : 'Page comments'}
            onClose={closeCard}
          />
          {unavailableTarget && (
            <output className="pc-status">
              Selected element is hidden or unavailable.
            </output>
          )}
          <Conversation
            key={target.selector}
            threads={conversationThreads}
            renderThread={(thread) => (
              <ThreadCard
                thread={thread}
                replyingTo={
                  replyThread?.id === thread.id ? replyMessage?.id : undefined
                }
                disabled={sending}
                onReply={(message) => {
                  stopTyping();
                  setReplyTo({ threadId: thread.id, messageId: message.id });
                }}
                authorId={preferences.id}
                actions={(message) =>
                  identified &&
                  live.ownerId &&
                  message.ownerId === live.ownerId ? (
                    <MessageActions
                      message={message}
                      threadId={thread.id}
                      store={store}
                      author={preferences}
                      connection={live.connection}
                      sending={sending}
                      change={live.change}
                    />
                  ) : null
                }
                likesDisabled={
                  !identified || live.connection !== 'live' || live.liking
                }
                onLike={(messageId, liked) => like(thread.id, messageId, liked)}
              />
            )}
          />
          {composer}
          {typing}
        </FloatingPanel>
      )}
      {active && !welcome && list && (
        <FloatingPanel
          anchor={toolbar.current}
          label="All comments"
          className="pc-list-panel"
          onClose={() => setList(null)}
        >
          <PanelHeading title="Comments" onClose={() => setList(null)} />
          <div className="pc-conversation-list">
            {channels.map((channel) => (
              <button
                type="button"
                className="pc-conversation-link"
                key={channel.target.selector}
                onClick={() => {
                  choose(channel.target);
                  reveal(channel.target, root.current);
                }}
              >
                <Icon name="comment" size={15} />
                <span>
                  {channel.target.selector
                    ? channel.target.quote
                    : 'Page comments'}
                </span>
                <span className="pc-conversation-count">
                  {channel.threads.reduce(
                    (sum, thread) =>
                      sum +
                      thread.messages.filter((message) => !message.deletedAt)
                        .length,
                    0,
                  )}
                </span>
              </button>
            ))}
          </div>
        </FloatingPanel>
      )}
      {active && !welcome && settings && (
        <FloatingPanel
          anchor={toolbar.current}
          label="Comment settings"
          onClose={() => setSettings(false)}
        >
          <PanelHeading title="Settings" onClose={() => setSettings(false)} />
          <Settings
            preferences={preferences}
            update={update}
            onCursors={(cursors) => {
              update({ cursors });
              live.updatePresence({ cursor: null });
            }}
          />
        </FloatingPanel>
      )}
      {active && !welcome && keyboardPicker && (
        <FloatingPanel
          anchor={toolbar.current}
          label="Choose a page location"
          onClose={() => setKeyboardPicker(false)}
        >
          <PanelHeading
            title="Page location"
            onClose={() => setKeyboardPicker(false)}
          />
          <div className="pc-location-picker">
            <label htmlFor={`${id}-location`}>
              Element
              <select
                id={`${id}-location`}
                value={keyboardTarget}
                onChange={(event) => {
                  setKeyboardTarget(event.target.value);

                  const target = targets.find(
                    (value) => value.selector === event.target.value,
                  );

                  if (target) reveal(target, root.current);
                }}
              >
                <option value="">Choose an element</option>
                {targets.map((target) => (
                  <option key={target.selector} value={target.selector}>
                    {target.quote.slice(0, 85)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="pc-primary"
              disabled={!keyboardTarget}
              onClick={() => {
                const target = targets.find(
                  (value) => value.selector === keyboardTarget,
                );

                if (target) choose(target);
              }}
            >
              Comment here
              <Icon name="plus" size={14} />
            </button>
          </div>
        </FloatingPanel>
      )}
      {active &&
        !welcome &&
        (live.error || (!selected && live.connection === 'offline')) && (
          <output className="pc-connection-error pc-surface">
            {live.error || 'Offline. You can keep writing.'}
          </output>
        )}
      {active && storageError && (
        <output className="pc-connection-error pc-surface">
          Device storage is unavailable. Keep this page open to retain drafts.
        </output>
      )}
      {notice && <output className="pc-notice pc-surface">{notice}</output>}
      <Toolbar
        active={active}
        welcome={welcome}
        picking={canPick}
        showCards={list === 'all'}
        identified={identified}
        settings={settings}
        pageComment={target?.selector === ''}
        count={channels.length}
        peers={live.peers}
        disabled={sending}
        toolbar={toolbar}
        launcher={launcher}
        onToggle={() => {
          if (active) close();
          else {
            setWelcome(false);
            setActive(true);
            setPicking(identified);

            if (!identified) setList('all');
          }
        }}
        onPick={(keyboard) => {
          const next = !canPick;
          clearPanels();
          setPicking(next);
          setKeyboardPicker(keyboard && next);
        }}
        onList={() => {
          const next = list !== 'all';
          clearPanels();
          setPicking(false);
          setList(next ? 'all' : null);
        }}
        onPage={() => {
          if (target?.selector === '') closeCard();
          else choose(GENERAL_TARGET);
        }}
        onSettings={() => {
          const next = !settings;
          clearPanels();
          setSettings(next);
        }}
      />
    </div>,
    document.body,
  );
}
