import { Option, Schema } from "effect";

import { BoardIdSchema, type BoardId } from "../lib/board-rpc";
import {
  normalizeProfileHandle,
  PublicIdSchema,
  type ProfileHandle,
  type PublicId,
} from "../lib/public-api";

const decodeBoardId = Schema.decodeUnknownOption(BoardIdSchema);
const decodePublicId = Schema.decodeUnknownOption(PublicIdSchema);

export const parseBoardId = (value: string): BoardId | null =>
  Option.getOrNull(decodeBoardId(value));

export const parsePublicId = (value: string): PublicId | null =>
  Option.getOrNull(decodePublicId(value));

export const parseProfileHandle = (value: string): ProfileHandle | null =>
  normalizeProfileHandle(value);

export const boardPath = (boardId: BoardId) => `/boards/${encodeURIComponent(boardId)}`;

export const profilePath = (handle: ProfileHandle) => `/@${encodeURIComponent(handle)}`;

export const sharePath = (publicId: PublicId) => `/share/${encodeURIComponent(publicId)}`;
