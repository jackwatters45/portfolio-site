import type {
  BoardId,
  BoardMutationPayload,
  ClientId,
  MutationId,
  RemoteBoard,
  RemoteBoardItem,
} from "../../lib/board-rpc";
import type { Camera } from "./camera";

type Primitive = string | number | boolean | bigint | symbol | null | undefined;
type MutableElement<T> = T extends Primitive ? T : Mutable<T>;
type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends ReadonlyArray<infer Item>
    ? Array<MutableElement<Item>>
    : T[Key];
};

export type { Camera };

export type BoardItem = Mutable<RemoteBoardItem>;
export type ItemKind = BoardItem["kind"];

export type Board = Mutable<RemoteBoard>;

export type SavedDocument = {
  board: Board;
  camera: Camera;
};

export type BoardMutation = Mutable<BoardMutationPayload>;

export type PendingBoardMutation = {
  boardId: BoardId;
  clientId: ClientId;
  mutationId: MutationId;
  mutation: BoardMutation;
};
