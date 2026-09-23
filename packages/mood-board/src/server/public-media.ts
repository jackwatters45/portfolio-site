import type { MediaId } from '../lib/media';
import type { PublicBoard } from '../lib/public-api';

export const publicBoardReferencesMedia = (
  board: PublicBoard | null,
  mediaId: MediaId,
): boolean => {
  if (board === null) return false;

  if (board.board.backgroundMediaId === mediaId) return true;

  return board.board.items.some((item) => item.mediaId === mediaId);
};
