import type { CSSProperties } from 'react';

export type IconName =
  | 'comment'
  | 'heart'
  | 'select'
  | 'list'
  | 'cursor'
  | 'settings'
  | 'close'
  | 'plus'
  | 'arrow'
  | 'check'
  | 'link'
  | 'keyboard';

const paths: Record<IconName, string> = {
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  comment:
    'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.6-4A8.5 8.5 0 1 1 21 11.5Z M8 9h8 M8 13h5',
  select:
    'M8 3H4a1 1 0 0 0-1 1v4 M16 3h4a1 1 0 0 1 1 1v4 M3 16v4a1 1 0 0 0 1 1h4 M21 16v4a1 1 0 0 1-1 1h-4 M12 8v8 M8 12h8',
  list: 'M4 5h16v14H4Z M10 5v14 M13 9h4 M13 13h4',
  cursor: 'M5 3l14 9-6 1-3 6Z',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M9 1.5h6l.6 2.3 2 .9L20 4.1l3 5.2-1.8 1.7v2l1.8 1.7-3 5.2-2.4-.6-2 .9L15 22.5H9l-.6-2.3-2-.9-2.4.6-3-5.2 1.8-1.7v-2L1 9.3l3-5.2 2.4.6 2-.9Z',
  close: 'M6 6l12 12 M18 6 6 18',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M7 17 17 7 M7 7h10v10',
  check: 'm5 12 4 4L19 6',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  keyboard: 'M3 6h18v12H3Z M6 9h1 M10 9h1 M14 9h1 M18 9h1 M7 14h10',
};

export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
