import type { MediaId } from "../../lib/media";
import { DEFAULT_BOARD_BACKGROUND } from "./board-utils";
import type { Board } from "./types";

export type BoardBackgroundDraft = {
  readonly hex: string;
  readonly lastValidHex: string;
  readonly mediaId?: MediaId | undefined;
};

export const backgroundDraftFromBoard = (board: Board): BoardBackgroundDraft => {
  const hex = board.background ?? DEFAULT_BOARD_BACKGROUND;
  return {
    hex,
    lastValidHex: hex,
    ...(board.backgroundMediaId === undefined ? {} : { mediaId: board.backgroundMediaId }),
  };
};

export const reconcileRemoteBackgroundDraft = (
  previous: Board,
  next: Board,
  locallyTouched: boolean,
  existingConflict = false,
): { readonly draft?: BoardBackgroundDraft; readonly conflict: boolean } => {
  const changed =
    previous.background !== next.background ||
    previous.backgroundMediaId !== next.backgroundMediaId;
  return locallyTouched
    ? { conflict: existingConflict || changed }
    : { draft: backgroundDraftFromBoard(next), conflict: false };
};
