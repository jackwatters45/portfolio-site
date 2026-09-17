import type {
  BoardChange,
  BoardTimestamp,
  ItemId,
  RemoteBoard,
  RemoteBoardItem,
} from "../lib/board-rpc";
import type { MediaId } from "../lib/media";
import type { Board, BoardItem, BoardMutation } from "./board/types";

const MAX_MUTATION_CHARACTERS = 8 * 1024 * 1024;

const cloneItem = (item: RemoteBoardItem): BoardItem => ({
  id: item.id,
  kind: item.kind,
  x: item.x,
  y: item.y,
  width: item.width,
  height: item.height,
  rotation: item.rotation,
  order: item.order,
  ...(item.src === undefined ? {} : { src: item.src }),
  ...(item.mediaId === undefined ? {} : { mediaId: item.mediaId }),
  ...(item.href === undefined ? {} : { href: item.href }),
  ...(item.annotationTitle === undefined ? {} : { annotationTitle: item.annotationTitle }),
  ...(item.annotationDescription === undefined
    ? {}
    : { annotationDescription: item.annotationDescription }),
  ...(item.text === undefined ? {} : { text: item.text }),
  ...(item.color === undefined ? {} : { color: item.color }),
  ...(item.label === undefined ? {} : { label: item.label }),
  ...(item.websiteUrl === undefined ? {} : { websiteUrl: item.websiteUrl }),
  ...(item.websiteImageUrl === undefined ? {} : { websiteImageUrl: item.websiteImageUrl }),
  ...(item.websiteTitle === undefined ? {} : { websiteTitle: item.websiteTitle }),
  ...(item.websiteDescription === undefined ? {} : { websiteDescription: item.websiteDescription }),
  ...(item.websiteSiteLabel === undefined ? {} : { websiteSiteLabel: item.websiteSiteLabel }),
  ...(item.xDisplay === undefined ? {} : { xDisplay: item.xDisplay }),
  ...(item.xTheme === undefined ? {} : { xTheme: item.xTheme }),
  ...(item.xHideThread === undefined ? {} : { xHideThread: item.xHideThread }),
  ...(item.xAuthorName === undefined ? {} : { xAuthorName: item.xAuthorName }),
  ...(item.xAuthorHandle === undefined ? {} : { xAuthorHandle: item.xAuthorHandle }),
  ...(item.xPostText === undefined ? {} : { xPostText: item.xPostText }),
  ...(item.xPostDate === undefined ? {} : { xPostDate: item.xPostDate }),
});

export const toLocalBoard = (board: RemoteBoard): Board => ({
  version: 1,
  title: board.title,
  ...(board.background === undefined ? {} : { background: board.background }),
  ...(board.backgroundMediaId === undefined ? {} : { backgroundMediaId: board.backgroundMediaId }),
  items: board.items.map(cloneItem),
  updatedAt: board.updatedAt,
});

const sameItem = (left: BoardItem, right: BoardItem) =>
  left.id === right.id &&
  left.kind === right.kind &&
  left.x === right.x &&
  left.y === right.y &&
  left.width === right.width &&
  left.height === right.height &&
  left.rotation === right.rotation &&
  left.order === right.order &&
  left.src === right.src &&
  left.mediaId === right.mediaId &&
  left.href === right.href &&
  left.annotationTitle === right.annotationTitle &&
  left.annotationDescription === right.annotationDescription &&
  left.text === right.text &&
  left.color === right.color &&
  left.label === right.label &&
  left.websiteUrl === right.websiteUrl &&
  left.websiteImageUrl === right.websiteImageUrl &&
  left.websiteTitle === right.websiteTitle &&
  left.websiteDescription === right.websiteDescription &&
  left.websiteSiteLabel === right.websiteSiteLabel &&
  left.xDisplay === right.xDisplay &&
  left.xTheme === right.xTheme &&
  left.xHideThread === right.xHideThread &&
  left.xAuthorName === right.xAuthorName &&
  left.xAuthorHandle === right.xAuthorHandle &&
  left.xPostText === right.xPostText &&
  left.xPostDate === right.xPostDate;

const applyMutation = (
  board: Board,
  mutation: {
    readonly title?: string | undefined;
    readonly background?: string | null | undefined;
    readonly backgroundMediaId?: MediaId | null | undefined;
    readonly upserts: ReadonlyArray<RemoteBoardItem>;
    readonly deletes: ReadonlyArray<ItemId>;
  },
  updatedAt: BoardTimestamp,
): Board => {
  const deleted = new Set(mutation.deletes);
  const upserts = new Map(mutation.upserts.map((item) => [item.id, cloneItem(item)]));
  const items = board.items
    .filter((item) => !deleted.has(item.id))
    .map((item) => upserts.get(item.id) ?? item);
  const known = new Set(items.map((item) => item.id));

  for (const item of upserts.values()) {
    if (!known.has(item.id)) items.push(item);
  }
  items.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

  const background =
    mutation.background === undefined ? board.background : (mutation.background ?? undefined);
  const backgroundMediaId =
    mutation.backgroundMediaId === undefined
      ? board.backgroundMediaId
      : (mutation.backgroundMediaId ?? undefined);

  return {
    version: 1,
    title: mutation.title ?? board.title,
    ...(background === undefined ? {} : { background }),
    ...(backgroundMediaId === undefined ? {} : { backgroundMediaId }),
    items,
    updatedAt,
  };
};

export const applyBoardMutation = (board: Board, mutation: BoardMutation): Board =>
  applyMutation(board, mutation, board.updatedAt);

export const applyBoardChange = (board: Board, change: BoardChange): Board =>
  applyMutation(board, change, change.updatedAt);

const itemSize = (item: BoardItem) =>
  512 +
  (item.src?.length ?? 0) +
  (item.mediaId?.length ?? 0) +
  (item.href?.length ?? 0) +
  (item.annotationTitle?.length ?? 0) +
  (item.annotationDescription?.length ?? 0) +
  (item.text?.length ?? 0) +
  (item.color?.length ?? 0) +
  (item.label?.length ?? 0) +
  (item.websiteUrl?.length ?? 0) +
  (item.websiteImageUrl?.length ?? 0) +
  (item.websiteTitle?.length ?? 0) +
  (item.websiteDescription?.length ?? 0) +
  (item.websiteSiteLabel?.length ?? 0) +
  (item.xAuthorName?.length ?? 0) +
  (item.xAuthorHandle?.length ?? 0) +
  (item.xPostText?.length ?? 0) +
  (item.xPostDate?.length ?? 0);

export const diffBoards = (previous: Board, next: Board): ReadonlyArray<BoardMutation> => {
  const previousById = new Map(previous.items.map((item) => [item.id, item]));
  const nextIds = new Set(next.items.map((item) => item.id));
  const changed = next.items.filter((item) => {
    const oldItem = previousById.get(item.id);
    return oldItem === undefined || !sameItem(oldItem, item);
  });
  const deletes = previous.items.filter((item) => !nextIds.has(item.id)).map((item) => item.id);
  const title = previous.title === next.title ? undefined : next.title;
  const backgroundChanged = previous.background !== next.background;
  const backgroundMediaChanged = previous.backgroundMediaId !== next.backgroundMediaId;

  if (
    changed.length === 0 &&
    deletes.length === 0 &&
    title === undefined &&
    !backgroundChanged &&
    !backgroundMediaChanged
  )
    return [];

  const drafts: BoardMutation[] = [];
  let upserts: BoardItem[] = [];
  let size = 0;
  let metadataPending =
    title !== undefined || backgroundChanged || backgroundMediaChanged || deletes.length > 0;

  const flush = () => {
    if (upserts.length === 0 && !metadataPending) return;
    drafts.push({
      ...(metadataPending && title !== undefined ? { title } : {}),
      ...(metadataPending && backgroundChanged ? { background: next.background ?? null } : {}),
      ...(metadataPending && backgroundMediaChanged
        ? { backgroundMediaId: next.backgroundMediaId ?? null }
        : {}),
      upserts,
      deletes: metadataPending ? deletes : [],
    });
    upserts = [];
    size = 0;
    metadataPending = false;
  };

  for (const item of changed) {
    const nextSize = itemSize(item);
    if (upserts.length > 0 && size + nextSize > MAX_MUTATION_CHARACTERS) flush();
    upserts.push(item);
    size += nextSize;
    if (size >= MAX_MUTATION_CHARACTERS) flush();
  }
  flush();

  return drafts;
};
