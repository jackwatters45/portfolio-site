export const NAME_LIMIT = 60;
export const COMMENT_LIMIT = 2000;
export const QUOTE_LIMIT = 180;
export const NAME_STORAGE_KEY = 'nz-comment-name';

export interface CommentTarget {
  anchor: string;
  quote: string;
}

// General threads use the same API without attaching to a page element.
export const GENERAL_COMMENT_TARGET: CommentTarget = {
  anchor: 'general',
  quote: 'General comment',
};

export interface CommentMessage {
  id: number;
  name: string;
  body: string;
  createdAt: string;
}

export interface CommentThread extends CommentTarget {
  id: number;
  closed: boolean;
  locked: boolean;
  replyCount: number;
  message: CommentMessage;
}

export interface ThreadDetail {
  thread: CommentThread;
  replies: CommentMessage[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= NAME_LIMIT &&
    [...value].every(
      (character) =>
        character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    )
  );
}

export function validTarget(value: unknown): value is CommentTarget {
  return (
    isRecord(value) &&
    typeof value.anchor === 'string' &&
    /^[a-z][a-z0-9-]{0,79}$/.test(value.anchor) &&
    typeof value.quote === 'string' &&
    value.quote.trim().length > 0 &&
    value.quote.length <= QUOTE_LIMIT
  );
}
