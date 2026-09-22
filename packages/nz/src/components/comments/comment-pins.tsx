import { useEffect, useEffectEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GENERAL_COMMENT_TARGET,
  QUOTE_LIMIT,
  type CommentTarget,
  type CommentThread,
} from '../../lib/comments-schema';

type Anchor = CommentTarget & { element: HTMLElement };

interface Props {
  threads: ReadonlyArray<CommentThread>;
  picking: boolean;
  sending: boolean;
  selectedAnchor?: string;
  onChoose: (target: CommentTarget) => void;
  onOpen: (thread: CommentThread) => void;
  onHash: () => void;
}

export function CommentPins({
  threads,
  picking,
  sending,
  selectedAnchor,
  onChoose,
  onOpen,
  onHash,
}: Props) {
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const choose = useEffectEvent((target: CommentTarget) => {
    if (!sending) onChoose(target);
  });
  const openHash = useEffectEvent(onHash);

  useEffect(() => {
    const values = Array.from(
      document.querySelectorAll<HTMLElement>('[data-comment-anchor]'),
    ).map((element) => ({
      element,
      anchor: element.dataset.commentAnchor ?? '',
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
    const fromHash = () => {
      const anchor = new URLSearchParams(location.hash.slice(1)).get('comment');
      if (anchor === GENERAL_COMMENT_TARGET.anchor) {
        openHash();
        return;
      }
      const found = values.find((value) => value.anchor === anchor);
      if (!found) return;
      found.element.closest('details')?.setAttribute('open', '');
      found.element.scrollIntoView({ block: 'center' });
      openHash();
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  useEffect(() => {
    if (!picking) return;
    document.body.classList.add('nz-comments-picking');
    const select = (event: MouseEvent) => {
      if (
        !(event.target instanceof Element) ||
        event.target.closest('[data-feedback-ui]')
      )
        return;
      const element = event.target.closest('[data-comment-anchor]');
      const found = anchors.find((value) => value.element === element);
      if (!found) return;
      event.preventDefault();
      event.stopPropagation();
      choose(found);
    };
    document.addEventListener('click', select, true);
    return () => {
      document.body.classList.remove('nz-comments-picking');
      document.removeEventListener('click', select, true);
    };
  }, [picking, anchors]);

  useEffect(() => {
    const element = anchors.find(
      (value) => value.anchor === selectedAnchor,
    )?.element;
    element?.classList.add('nz-comment-selected');
    return () => element?.classList.remove('nz-comment-selected');
  }, [selectedAnchor, anchors]);

  return anchors.map((anchor) => {
    const matches = threads.filter(
      (thread) => thread.anchor === anchor.anchor && !thread.closed,
    );
    if (!picking && !matches.length) return null;
    return createPortal(
      <button
        type="button"
        className="nz-comment-pin"
        data-feedback-ui=""
        disabled={sending}
        aria-label={`${matches.length ? 'Read comments on' : 'Comment on'} ${anchor.quote}`}
        onClick={() => (matches.length ? onOpen(matches[0]) : onChoose(anchor))}
      >
        {matches.length
          ? matches.reduce((sum, thread) => sum + 1 + thread.replyCount, 0)
          : '+'}
      </button>,
      anchor.element,
      anchor.anchor,
    );
  });
}
