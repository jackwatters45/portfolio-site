import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  type Placement,
  type VirtualElement,
} from '@floating-ui/react';
import { useLayoutEffect, type ReactNode } from 'react';
import { Icon } from './icons';

interface Props {
  anchor: Element | VirtualElement | null;
  label: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  placement?: Placement;
  focusIndex?: number;
  layoutVersion?: number;
}

export function FloatingPanel({
  anchor,
  label,
  children,
  onClose,
  className = '',
  placement = 'top-start',
  focusIndex = 1,
  layoutVersion = 0,
}: Props) {
  const { refs, floatingStyles, context, update } = useFloating({
    open: true,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
    strategy: 'fixed',
    placement,
    elements: { reference: anchor instanceof Element ? anchor : null },
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      flip({ padding: 12 }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply: ({ availableHeight, elements }) => {
          elements.floating.style.maxHeight = `${Math.max(120, availableHeight)}px`;
        },
      }),
    ],
  });

  useLayoutEffect(() => {
    refs.setPositionReference(anchor);
  }, [anchor, refs]);

  useLayoutEffect(() => {
    update();
  }, [layoutVersion, update]);

  const dismiss = useDismiss(context, {
    escapeKey: false,
    outsidePress: (event) =>
      !(
        event.target instanceof Element &&
        event.target.closest('[data-comments-toolbar], .pc-pin')
      ),
  });

  const { getFloatingProps } = useInteractions([dismiss]);

  return (
    <FloatingFocusManager
      context={context}
      modal={false}
      initialFocus={focusIndex}
      returnFocus
    >
      <dialog
        open
        ref={refs.setFloating}
        style={floatingStyles}
        className={`pc-floating-panel pc-surface ${className}`}
        aria-label={label}
        {...getFloatingProps()}
      >
        {children}
      </dialog>
    </FloatingFocusManager>
  );
}

export function PanelHeading({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <header className="pc-panel-heading">
      <h2>{title}</h2>
      <button
        type="button"
        className="pc-icon-button"
        aria-label={`Close ${title.toLowerCase()}`}
        onClick={onClose}
      >
        <Icon name="close" size={15} />
      </button>
    </header>
  );
}
