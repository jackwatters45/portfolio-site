import type { RefObject } from 'react';
import { Icon, type IconName } from './icons';
import type { Peer } from './protocol';
import type { Connection } from './room-client';

function Tool({
  label,
  icon,
  pressed,
  expanded,
  onClick,
  count,
  disabled,
}: {
  label: string;
  icon: IconName;
  pressed?: boolean;
  expanded?: boolean;
  onClick: () => void;
  count?: number;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`pc-tool ${pressed || expanded ? 'pc-tool-active' : ''}`}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={16} />
      {count ? (
        <span className="pc-tool-badge">{count > 99 ? '99+' : count}</span>
      ) : null}
      {!expanded && (
        <span className="pc-tooltip" aria-hidden="true">
          {label}
        </span>
      )}
    </button>
  );
}
interface Props {
  active: boolean;
  welcome: boolean;
  picking: boolean;
  showCards: boolean;
  cursors: boolean;
  settings: boolean;
  pageComment: boolean;
  count: number;
  peers: readonly Peer[];
  connection: Connection;
  disabled: boolean;
  toolbar: RefObject<HTMLDivElement | null>;
  launcher: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
  onPick: () => void;
  onList: () => void;
  onPage: () => void;
  onCursors: () => void;
  onSettings: () => void;
}
export function Toolbar(props: Props) {
  const expanded = props.active && !props.welcome;
  const status =
    props.connection === 'live'
      ? 'Live'
      : props.connection === 'offline'
        ? 'Offline'
        : 'Connecting';
  return (
    <div
      ref={props.toolbar}
      data-comments-toolbar=""
      className={`pc-toolbar ${expanded ? 'pc-toolbar-open' : ''}`}
      role="toolbar"
      tabIndex={-1}
      aria-label="Comment tools"
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
          return;
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
          ),
        );
        const index =
          event.target instanceof HTMLButtonElement
            ? buttons.indexOf(event.target)
            : -1;
        if (index < 0) return;
        event.preventDefault();
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index +
                  (event.key === 'ArrowRight' ? 1 : -1) +
                  buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      }}
    >
      <button
        ref={props.launcher}
        type="button"
        className="pc-launcher"
        aria-label={props.active ? 'Close comments' : 'Open comments'}
        aria-expanded={props.active}
        disabled={props.disabled}
        onClick={props.onToggle}
      >
        <Icon name={props.active ? 'close' : 'comment'} size={18} />
        {!props.active && (
          <span className="pc-tooltip" aria-hidden="true">
            Comments
          </span>
        )}
      </button>
      {expanded && (
        <div className="pc-toolbar-tools">
          <output
            className={`pc-connection pc-connection-${props.connection}`}
            aria-label={`Comments: ${status}`}
            title={status}
          />
          <Tool
            label="Select an element"
            icon="select"
            pressed={props.picking}
            disabled={props.disabled}
            onClick={props.onPick}
          />
          <Tool
            label="Show comments"
            icon="list"
            expanded={props.showCards}
            count={props.count}
            disabled={props.disabled}
            onClick={props.onList}
          />
          <Tool
            label="Page comment"
            icon="plus"
            expanded={props.pageComment}
            disabled={props.disabled}
            onClick={props.onPage}
          />
          <Tool
            label="Live cursors"
            icon="cursor"
            pressed={props.cursors}
            onClick={props.onCursors}
          />
          <Tool
            label="Settings"
            icon="settings"
            expanded={props.settings}
            disabled={props.disabled}
            onClick={props.onSettings}
          />
          {!!props.peers.length && (
            <span
              className="pc-online-count"
              title={props.peers.map((peer) => peer.name).join(', ')}
            >
              {props.peers.length + 1} here
            </span>
          )}
        </div>
      )}
    </div>
  );
}
