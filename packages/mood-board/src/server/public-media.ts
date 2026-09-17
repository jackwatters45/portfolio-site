import { Option, Schema } from "effect";

import type { MediaId } from "../lib/media";
import { PublicBoardSchema } from "../lib/public-api";

const decodePublicBoard = Schema.decodeUnknownOption(PublicBoardSchema);

export const publicBoardReferencesMedia = (value: unknown, mediaId: MediaId): boolean => {
  const decoded = decodePublicBoard(value);
  if (Option.isNone(decoded)) return false;
  if (decoded.value.board.backgroundMediaId === mediaId) return true;
  return decoded.value.board.items.some((item) => item.mediaId === mediaId);
};
