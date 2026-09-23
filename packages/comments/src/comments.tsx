import { RegistryContext } from '@effect/atom-react';
import { useContext, useEffect, useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Composer } from './composer';
import { FloatingPanel, PanelHeading } from './floating-panel';
import { Icon } from './icons';
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
    setHover,
    setNotice,
    setLayout,
    setKeyboardTarget,
  } = ui;
  const live = useRoom(endpoint, identified, preferences);
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
    (count, thread) => count + thread.messages.length,
    0,
  );
  const listedThreads = list === 'page' ? pageThreads : live.threads;
  const activeThread =
    selected?.kind === 'thread'
      ? live.threads.find((thread) => thread.id === selected.id)
      : undefined;
  const target =
    selected?.kind === 'new' ? selected.target : activeThread?.target;
  const draftKey =
    selected?.kind === 'thread' ? selected.id : `new:${target?.selector ?? ''}`;
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
  const sending = live.sending;
  const stopTyping = () => live.updatePresence({ typing: null });
  const closeCard = () => {
    if (sending) return;
    setSelected(null);
    stopTyping();
  };
  const clearPanels = () => {
    setSelected(null);
    setSettings(false);
    setKeyboardPicker(false);
    setList(null);
    setHover(null);
    stopTyping();
  };
  const choose = (value: Target) => {
    if (sending) return;
    clearPanels();
    setSelected({ kind: 'new', target: value });
  };
  const openThread = (thread: Thread, locate = true) => {
    if (sending) return;
    clearPanels();
    setActive(true);
    setPicking(false);
    setSelected({ kind: 'thread', id: thread.id });
    if (locate) reveal(thread.target, root.current);
  };
  const close = () => {
    if (sending) return;
    clearPanels();
    setActive(false);
    setWelcome(false);
    launcher.current?.focus({ preventScroll: true });
  };
  const copyLink = (thread: Thread) => {
    const url = new URL(location.href);
    url.hash = `comment=${thread.id}`;
    ui.copyLink(url.href);
  };
  const submit = async (body: string, previous?: Mutation) => {
    if (!selected || !target) return;
    const threadId = await live.submit({
      body,
      previous,
      target,
      threadId: selected.kind === 'thread' ? selected.id : undefined,
      draft: store.atom(draftKey),
    });
    setSelected({ kind: 'thread', id: threadId });
    setList(null);
    setNotice(selected.kind === 'new' ? 'Comment added' : 'Reply added');
  };
  const hash = () => {
    const comment = new URLSearchParams(location.hash.slice(1)).get('comment');
    if (!comment) return;
    setActive(true);
    setWelcome(!validName(preferences.name));
    setSelected({ kind: 'thread', id: comment });
  };
  usePageEvents({
    rootSelector,
    active: active && !welcome,
    picking: canPick,
    pointerActive: canPick || sharingCursors,
    root: (element) => {
      root.current = element;
      setMounted(true);
      hash();
    },
    layout: () => setLayout((value) => value + 1),
    hash,
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
      if (settings) setSettings(false);
      else if (keyboardPicker) setKeyboardPicker(false);
      else if (list) setList(null);
      else if (selected) closeCard();
      else close();
    },
  });
  const hashRevealed = useRef('');
  useEffect(() => {
    if (
      activeThread &&
      location.hash === `#comment=${activeThread.id}` &&
      hashRevealed.current !== activeThread.id
    ) {
      hashRevealed.current = activeThread.id;
      reveal(activeThread.target, root.current);
    }
  }, [activeThread]);
  const anchor = useMemo(() => {
    if (!target || !mounted) return null;
    if (!target.selector)
      return {
        contextElement: pageMarkers.current ?? root.current ?? undefined,
        getBoundingClientRect: () =>
          pageMarkers.current?.getBoundingClientRect() ??
          new DOMRect(window.innerWidth - 12, 12, 0, 23),
      };
    return {
      contextElement: root.current ?? undefined,
      getBoundingClientRect: () => {
        const point = pointFor(target, root.current);
        const right = root.current?.getBoundingClientRect().right ?? 0;
        const inMargin =
          selected?.kind === 'thread' && window.innerWidth - right >= 310;
        return new DOMRect(
          inMargin ? right + 4 : (point?.x ?? 16),
          inMargin ? (point?.y ?? 80) : (point?.rect.top ?? 80),
          0,
          inMargin ? 0 : (point?.rect.height ?? 0),
        );
      },
    };
  }, [mounted, target, selected?.kind]);
  if (!mounted) return null;
  const selectedPoint = target ? pointFor(target, root.current) : null;
  const previewPoint = hover && canPick ? pointFor(hover, root.current) : null;
  const highlight = selectedPoint ?? previewPoint;
  const composer = (
    <Composer
      key={draftKey}
      draftKey={draftKey}
      store={store}
      author={preferences}
      connection={live.connection}
      reply={selected?.kind === 'thread'}
      focusInput={selected?.kind === 'new'}
      sending={sending}
      onSubmit={submit}
      onCancel={closeCard}
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
        >
          {previewPoint && !selectedPoint && (
            <span className="pc-target-label">{hover?.quote.slice(0, 50)}</span>
          )}
        </div>
      )}
      {identified && preferences.markers && pageThreads.length > 0 && (
        <button
          ref={pageMarkers}
          type="button"
          className={`pc-pin pc-page-comments ${list === 'page' || activeThread?.target.selector === '' ? 'pc-pin-active' : ''}`}
          aria-label={`Page comments: ${pageMessageCount} ${pageMessageCount === 1 ? 'message' : 'messages'}`}
          aria-expanded={
            list === 'page' || activeThread?.target.selector === ''
          }
          title="Page comments"
          disabled={sending}
          onClick={() => {
            if (list === 'page' || activeThread?.target.selector === '') {
              clearPanels();
              return;
            }
            const thread =
              pageThreads.length === 1 ? pageThreads[0] : undefined;
            if (thread) openThread(thread, false);
            else {
              clearPanels();
              setActive(true);
              setPicking(false);
              setList('page');
            }
          }}
        >
          {pageMessageCount}
        </button>
      )}
      {identified &&
        preferences.markers &&
        live.threads.map((thread) => {
          const point = pointFor(thread.target, root.current);
          return point && point.y > 0 && point.y < window.innerHeight ? (
            <button
              key={thread.id}
              type="button"
              className={`pc-pin ${activeThread?.id === thread.id ? 'pc-pin-active' : ''}`}
              style={{ left: point.x, top: point.y }}
              aria-label={`${thread.messages.length} ${thread.messages.length === 1 ? 'comment' : 'comments'} on ${thread.target.quote}`}
              aria-pressed={activeThread?.id === thread.id}
              disabled={sending}
              onClick={() => openThread(thread, false)}
            >
              {thread.messages.length}
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
          onClose={close}
        >
          <PanelHeading title="Join comments" onClose={close} />
          <NameForm
            name={preferences.name}
            welcome
            onSave={async (name) => {
              await update({ name });
              setWelcome(false);
              setPicking(true);
            }}
          />
        </FloatingPanel>
      )}
      {active && !welcome && selected?.kind === 'new' && (
        <FloatingPanel
          anchor={anchor ?? toolbar.current}
          placement={target?.selector ? 'bottom-start' : 'bottom-end'}
          label="New comment"
          className="pc-new-comment"
          onClose={closeCard}
        >
          <PanelHeading
            title={target?.quote ?? 'Page comment'}
            onClose={closeCard}
          />
          {composer}
          {typing}
        </FloatingPanel>
      )}
      {active && !welcome && activeThread && (
        <FloatingPanel
          anchor={anchor ?? toolbar.current}
          placement={target?.selector ? 'bottom-start' : 'bottom-end'}
          label="Comment thread"
          focusIndex={0}
          className="pc-thread-panel"
          onClose={closeCard}
        >
          <ThreadCard
            thread={activeThread}
            active
            onOpen={() => openThread(activeThread)}
            onClose={closeCard}
            onLocate={() => reveal(activeThread.target, root.current)}
            onCopy={() => copyLink(activeThread)}
          >
            {composer}
            {typing}
          </ThreadCard>
        </FloatingPanel>
      )}
      {active && !welcome && list && (
        <FloatingPanel
          anchor={list === 'page' ? pageMarkers.current : toolbar.current}
          placement={list === 'page' ? 'bottom-end' : 'top-start'}
          label={list === 'page' ? 'Page comments' : 'All comments'}
          className="pc-list-panel"
          onClose={() => setList(null)}
        >
          <PanelHeading
            title={list === 'page' ? 'Page comments' : 'Comments'}
            onClose={() => setList(null)}
          />
          <div className="pc-thread-list">
            {listedThreads.length ? (
              listedThreads.map((thread) => (
                <ThreadCard
                  key={thread.id}
                  thread={thread}
                  active={false}
                  onOpen={() => openThread(thread)}
                  onClose={closeCard}
                  onLocate={() => openThread(thread)}
                  onCopy={() => copyLink(thread)}
                />
              ))
            ) : (
              <div className="pc-empty-list">
                <span>
                  {live.connection === 'live'
                    ? 'No comments yet'
                    : 'Connecting…'}
                </span>
                <button
                  className="pc-text-button"
                  type="button"
                  onClick={() => {
                    setList(null);
                    setPicking(true);
                  }}
                >
                  Select an element
                </button>
              </div>
            )}
          </div>
        </FloatingPanel>
      )}
      {active &&
        !welcome &&
        selected?.kind === 'thread' &&
        !activeThread &&
        live.connection === 'live' && (
          <FloatingPanel
            anchor={toolbar.current}
            label="Comment not found"
            focusIndex={0}
            onClose={closeCard}
          >
            <PanelHeading title="Comment not found" onClose={closeCard} />
          </FloatingPanel>
        )}
      {active && !welcome && settings && (
        <FloatingPanel
          anchor={toolbar.current}
          label="Comment settings"
          onClose={() => setSettings(false)}
        >
          <PanelHeading title="Settings" onClose={() => setSettings(false)} />
          <Settings preferences={preferences} update={update} />
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
      {canPick && (
        <div className="pc-hint">
          <span>Select an element</span>
          <button
            type="button"
            aria-label="Choose a location with keyboard"
            title="Choose a location with keyboard"
            onClick={() => setKeyboardPicker(true)}
          >
            <Icon name="keyboard" size={15} />
          </button>
          <kbd>esc</kbd>
        </div>
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
        cursors={preferences.cursors}
        settings={settings}
        pageComment={selected?.kind === 'new' && !selected.target.selector}
        count={live.threads.length}
        peers={live.peers}
        disabled={sending}
        toolbar={toolbar}
        launcher={launcher}
        onToggle={() => {
          if (active) close();
          else {
            setWelcome(!validName(preferences.name));
            setActive(true);
            setPicking(true);
          }
        }}
        onPick={() => {
          const next = !canPick;
          clearPanels();
          setPicking(next);
        }}
        onList={() => {
          const next = list !== 'all';
          clearPanels();
          setPicking(false);
          setList(next ? 'all' : null);
        }}
        onPage={() => choose(GENERAL_TARGET)}
        onCursors={() => {
          update({ cursors: !preferences.cursors });
          live.updatePresence({ cursor: null });
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
