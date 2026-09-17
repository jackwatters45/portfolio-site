import {
  ArrowDown,
  ArrowUp,
  ArrowUDownLeft,
  ArrowUUpLeft,
  Copy,
  DownloadSimple,
  Eye,
  FileArrowUp,
  FolderOpen,
  FrameCorners,
  HouseSimple,
  ImageSquare,
  LinkSimple,
  Minus,
  NotePencil,
  Palette,
  PencilSimple,
  Plus,
  Shuffle,
  SignOut,
  SpeakerHigh,
  SquaresFour,
  Trash,
  X,
  XLogo,
} from "@phosphor-icons/react";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { authClient } from "../client/auth-client";
import { createBoardCatalog, type BoardCatalog } from "../client/board-catalog";
import { boardPath } from "../client/board-route";
import { startBoardSync, type BoardSync, type CloudSyncState } from "../client/board-sync";
import {
  createBoardArchive,
  importBoardFile,
  MAX_LEGACY_JSON_BYTES,
} from "../client/board/board-archive";
import {
  reconcileRemoteBackgroundDraft,
  type BoardBackgroundDraft,
} from "../client/board/board-background";
import { normalizeImportedBoard } from "../client/board/board-import";
import { shuffleBoardItems } from "../client/board/board-shuffle";
import {
  accessibleFieldColors,
  blobToDataUrl,
  createDemoBoard,
  createEmptyBoard,
  createId,
  DEFAULT_BOARD_BACKGROUND,
  DEFAULT_CUSTOM_COLOR,
  fitCamera,
  formatHexColorInput,
  ingestImageFile,
  inspectImageUrl,
  MAX_ZOOM,
  MIN_ZOOM,
  normalizeHexColor,
  screenToWorld,
  SWATCHES,
  zoomCamera,
} from "../client/board/board-utils";
import {
  collectDroppedImageFiles,
  estimateItemBytes,
  shouldStageImageSelection,
  type BulkLayoutKind,
  type PreparedBulkImage,
  type TraversalFailure,
} from "../client/board/bulk-image-import";
import { layoutBulkImages, placeLayoutWithoutOverlap } from "../client/board/bulk-layout";
import { deleteLocalBoard, loadDocument, saveDocument } from "../client/board/storage";
import type { Board, BoardItem, Camera } from "../client/board/types";
import { uploadMedia } from "../client/media-client";
import { AudioPlaybackCoordinator } from "../client/media/audio-playback";
import { IMAGE_FILE_ACCEPT } from "../client/media/image-preflight";
import { MAX_X_POST_CARD_WIDTH } from "../client/media/x-post-measurement";
import type { AccountId } from "../lib/account";
import {
  MIN_AUDIO_CARD_WIDTH,
  minimumAudioCardHeight,
  preferredAudioCardHeight,
} from "../lib/audio-card-layout";
import {
  isLikelyAudioUrl,
  MAX_AUDIO_SOURCE_CHARACTERS,
  parseAudioSource,
} from "../lib/audio-source";
import {
  BoardTimestampSchema,
  DEFAULT_BOARD_ID,
  MAX_REMOTE_BOARD_BYTES,
  MAX_REMOTE_ITEMS,
  type BoardId,
  type BoardSummary,
  type ItemId,
} from "../lib/board-rpc";
import {
  MAX_IMAGE_ANNOTATION_DESCRIPTION_CHARACTERS,
  MAX_IMAGE_ANNOTATION_TITLE_CHARACTERS,
  normalizeImageAnnotationDescription,
  normalizeImageAnnotationTitle,
} from "../lib/image-annotation";
import { MAX_IMAGE_LINK_CHARACTERS, normalizeImageLink } from "../lib/image-link";
import { MAX_AUDIO_UPLOAD_BYTES, normalizeMediaMimeType } from "../lib/media";
import {
  MAX_WEBSITE_SITE_LABEL_CHARACTERS,
  MAX_WEBSITE_URL_CHARACTERS,
  normalizeWebsiteUrl,
  WebsiteSiteLabelSchema,
  WebsiteTitleSchema,
  type WebsiteUrl,
} from "../lib/website-preview";
import {
  MAX_X_POST_INPUT_CHARACTERS,
  parseXPostInput,
  type XPostDisplay,
  type XPostTheme,
} from "../lib/x-post";
import { MenuAccountIdentity } from "./account-identity";
import { BoardBackgroundControl } from "./board-background-control";
import { BoardItemView } from "./board-item-view";
import { CanvasBackground } from "./canvas-background";
import { PresentationItemViewer, type PresentationItemOrigin } from "./presentation-image-viewer";

type PanelState =
  | { type: "menu" }
  | { type: "boards" }
  | { type: "images" }
  | { type: "url" }
  | { type: "imageLink"; itemId: ItemId }
  | { type: "audio"; itemId?: ItemId }
  | { type: "website"; itemId?: ItemId }
  | { type: "x"; itemId: ItemId }
  | { type: "note"; itemId?: ItemId }
  | { type: "color"; itemId?: ItemId }
  | null;

type Point = { x: number; y: number };
type BulkSession = {
  readonly files: ReadonlyArray<File>;
  readonly anchor: Point;
  readonly omitted: number;
  readonly truncated: boolean;
  readonly failures: ReadonlyArray<TraversalFailure>;
};
type SaveState = "saved" | "saving" | "error";
type HistoryEntry = { board: Board; camera?: Camera };
type CustomColorDraft = {
  hex: string;
  label: string;
  lastValidHex: string;
};
type AppStyle = CSSProperties & {
  "--field": string;
  "--field-foreground": string;
  "--field-muted": string;
  "--field-selection": string;
};
type CanvasGesture = {
  center: Point;
  distance?: number;
  start?: Point;
  itemId?: ItemId;
  itemOrigin?: Point;
  itemPosition?: Point;
  presentationItemId?: string;
  linkHref?: string;
};
type PresentedItem = {
  readonly itemId: ItemId;
  readonly origin: PresentationItemOrigin;
};

const BulkImageStager = lazy(async () => {
  const module = await import("./bulk-image-stager");
  return { default: module.BulkImageStager };
});

const editorPanelForItem = (item: BoardItem): PanelState => {
  if (item.kind === "image") return { type: "imageLink", itemId: item.id };
  if (item.kind === "note") return { type: "note", itemId: item.id };
  if (item.kind === "swatch") return { type: "color", itemId: item.id };
  if (item.kind === "website") return { type: "website", itemId: item.id };
  if (item.kind === "x") return { type: "x", itemId: item.id };
  return { type: "audio", itemId: item.id };
};

const makeInitialBoard = (boardId: BoardId) =>
  boardId === DEFAULT_BOARD_ID ? createDemoBoard() : createEmptyBoard();

const localWebsiteMetadata = (url: WebsiteUrl) => {
  const normalizedLabel = new URL(url).hostname
    .replace(/^www\./, "")
    .slice(0, MAX_WEBSITE_SITE_LABEL_CHARACTERS);
  return {
    websiteTitle: WebsiteTitleSchema.make(normalizedLabel),
    websiteSiteLabel: WebsiteSiteLabelSchema.make(normalizedLabel),
  };
};

const makeInitialCamera = (): Camera => ({
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  z: 0.45,
});

function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      data-tooltip={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return (
    (target instanceof HTMLElement && target.isContentEditable) ||
    target.closest("input, textarea, select, button, a, audio, video, .audio-card-controls") !==
      null
  );
}

function BoardWorkspace({
  accountId,
  boardId,
  onNavigate,
  onWorkingChange,
  localOnly,
}: {
  accountId: AccountId;
  boardId: BoardId;
  onNavigate: (boardId: BoardId, replace?: boolean, force?: boolean) => void;
  onWorkingChange: (boardId: BoardId, working: boolean) => void;
  localOnly: boolean;
}) {
  const navigateRoute = useNavigate();
  const session = authClient.useSession();
  const initialBoardRef = useRef(makeInitialBoard(boardId));
  const initialCameraRef = useRef(makeInitialCamera());
  const initialBoard = initialBoardRef.current;
  const initialCamera = initialCameraRef.current;
  const viewportRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef(initialBoard);
  const cameraRef = useRef(initialCamera);
  const playbackCoordinatorRef = useRef(new AudioPlaybackCoordinator());
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const activePointers = useRef(new Map<number, Point>());
  const gesture = useRef<CanvasGesture | null>(null);
  const bulkSessionRef = useRef<BulkSession | null>(null);
  const dropCollectionRef = useRef<{
    readonly generation: number;
    readonly controller: AbortController;
  } | null>(null);
  const dropGenerationRef = useRef(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageSelectionFolderRef = useRef(false);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const backgroundUploadRef = useRef<AbortController | null>(null);
  const archiveOperationRef = useRef<AbortController | null>(null);
  const shuffleAnimationTimerRef = useRef<number | null>(null);
  const backgroundUploadGenerationRef = useRef(0);
  const backgroundDraftTouchedRef = useRef(false);
  const composerRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const saveGeneration = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const syncRef = useRef<BoardSync | null>(null);
  const catalogRef = useRef<BoardCatalog | null>(null);
  const deletingBoardRef = useRef<BoardId | null>(null);
  const workingCountRef = useRef(0);

  const [board, setBoard] = useState(initialBoard);
  const [camera, setCamera] = useState(initialCamera);
  const [ready, setReady] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState(true);
  const [editing, setEditing] = useState(true);
  const [selectedId, setSelectedId] = useState<ItemId | null>(null);
  const [panel, setPanel] = useState<PanelState>(null);
  const [panelDraft, setPanelDraft] = useState("");
  const [panelError, setPanelError] = useState("");
  const [annotationTitle, setAnnotationTitle] = useState("");
  const [annotationDescription, setAnnotationDescription] = useState("");
  const [audioLabel, setAudioLabel] = useState("");
  const [xDisplay, setXDisplay] = useState<XPostDisplay>("post");
  const [xTheme, setXTheme] = useState<XPostTheme>("automatic");
  const [customColor, setCustomColor] = useState<CustomColorDraft>({
    hex: DEFAULT_CUSTOM_COLOR,
    label: "",
    lastValidHex: DEFAULT_CUSTOM_COLOR,
  });
  const [backgroundDraft, setBackgroundDraft] = useState<BoardBackgroundDraft>({
    hex: DEFAULT_BOARD_BACKGROUND,
    lastValidHex: DEFAULT_BOARD_BACKGROUND,
  });
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [backgroundUploadError, setBackgroundUploadError] = useState("");
  const [backgroundConflict, setBackgroundConflict] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [syncState, setSyncState] = useState<CloudSyncState>(localOnly ? "local" : "connecting");
  const [boardSummaries, setBoardSummaries] = useState<ReadonlyArray<BoardSummary>>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [spacePressed, setSpacePressed] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [bulkSession, setBulkSession] = useState<BulkSession | null>(null);
  const [collectingDrop, setCollectingDrop] = useState(false);
  const [working, setWorking] = useState(false);
  const [imageIntakeStatus, setImageIntakeStatus] = useState("");
  const [toast, setToast] = useState("");
  const [presentedItem, setPresentedItem] = useState<PresentedItem | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [shuffleAnimating, setShuffleAnimating] = useState(false);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    return () => {
      dropGenerationRef.current += 1;
      dropCollectionRef.current?.controller.abort();
      dropCollectionRef.current = null;
      backgroundUploadGenerationRef.current += 1;
      backgroundUploadRef.current?.abort();
      backgroundUploadRef.current = null;
      archiveOperationRef.current?.abort();
      archiveOperationRef.current = null;
      if (shuffleAnimationTimerRef.current !== null) {
        window.clearTimeout(shuffleAnimationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    onWorkingChange(boardId, false);
    return () => onWorkingChange(boardId, false);
  }, [boardId, onWorkingChange]);

  useEffect(() => {
    const coordinator = playbackCoordinatorRef.current;
    return () => coordinator.pauseAll();
  }, []);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    document.title = `${board.title} — Moodboard`;
  }, [board.title]);

  const showToast = useCallback((message: string, duration = 2800) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), duration);
  }, []);

  const signOutAccount = useCallback(async () => {
    archiveOperationRef.current?.abort();
    setSigningOut(true);
    setSignOutError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setSignOutError(result.error.message ?? "You could not be signed out.");
        setSigningOut(false);
        return;
      }
      await navigateRoute({ to: "/" });
    } catch (cause) {
      setSignOutError(cause instanceof Error ? cause.message : "You could not be signed out.");
      setSigningOut(false);
    }
  }, [navigateRoute]);

  const beginWorking = useCallback(() => {
    workingCountRef.current += 1;
    setWorking(true);
    onWorkingChange(boardId, true);
  }, [boardId, onWorkingChange]);

  const endWorking = useCallback(() => {
    workingCountRef.current = Math.max(0, workingCountRef.current - 1);
    if (workingCountRef.current === 0) {
      setWorking(false);
      onWorkingChange(boardId, false);
    }
  }, [boardId, onWorkingChange]);

  const cancelBackgroundUpload = useCallback(() => {
    backgroundUploadGenerationRef.current += 1;
    backgroundUploadRef.current?.abort();
    backgroundUploadRef.current = null;
    setBackgroundUploading(false);
    setBackgroundUploadError("");
    backgroundDraftTouchedRef.current = false;
    setBackgroundConflict(false);
  }, []);

  const chooseBackgroundImage = useCallback(
    async (file: File) => {
      if (localOnly) {
        setBackgroundUploadError("Sign in to upload a private background image.");
        return;
      }
      const generation = ++backgroundUploadGenerationRef.current;
      backgroundUploadRef.current?.abort();
      const controller = new AbortController();
      backgroundUploadRef.current = controller;
      backgroundDraftTouchedRef.current = true;
      setBackgroundUploading(true);
      setBackgroundUploadError("");
      setPanelError("");
      beginWorking();
      try {
        const image = await ingestImageFile(file, controller.signal);
        const uploaded = await uploadMedia(image.blob, "image", controller.signal);
        if (controller.signal.aborted || generation !== backgroundUploadGenerationRef.current)
          return;
        setBackgroundDraft((current) => ({ ...current, mediaId: uploaded.mediaId }));
        showToast("Background image ready — apply to save");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setBackgroundUploadError(
            error instanceof Error ? error.message : "That background image could not be prepared.",
          );
        }
      } finally {
        if (generation === backgroundUploadGenerationRef.current) {
          backgroundUploadRef.current = null;
          setBackgroundUploading(false);
        }
        endWorking();
      }
    },
    [beginWorking, endWorking, localOnly, showToast],
  );

  useEffect(() => {
    if (localOnly) return;
    const catalog = createBoardCatalog();
    catalogRef.current = catalog;
    return () => {
      if (catalogRef.current === catalog) catalogRef.current = null;
      void catalog.close();
    };
  }, [localOnly]);

  const refreshBoards = useCallback(async () => {
    const catalog = catalogRef.current;
    if (!catalog) return;
    setCatalogLoading(true);
    try {
      setBoardSummaries(await catalog.list());
    } catch {
      showToast("The board library could not be refreshed.");
    } finally {
      setCatalogLoading(false);
    }
  }, [showToast]);

  const createNewBoard = useCallback(async () => {
    const catalog = catalogRef.current;
    if (!catalog) return;
    beginWorking();
    try {
      const summary = await catalog.create(panelDraft.trim() || "Untitled mood");
      onNavigate(summary.id, false, true);
    } catch {
      showToast("The new board could not be created.");
    } finally {
      endWorking();
    }
  }, [beginWorking, endWorking, onNavigate, panelDraft, showToast]);

  const duplicateBoard = useCallback(
    async (summary: BoardSummary) => {
      const catalog = catalogRef.current;
      if (!catalog) return;
      beginWorking();
      try {
        const title = `${summary.title} — copy`.slice(0, 120);
        const duplicate = await catalog.duplicate(summary.id, title);
        onNavigate(duplicate.id, false, true);
      } catch {
        showToast("That board could not be duplicated.");
      } finally {
        endWorking();
      }
    },
    [beginWorking, endWorking, onNavigate, showToast],
  );

  const deleteBoard = useCallback(
    async (summary: BoardSummary) => {
      if (summary.id === DEFAULT_BOARD_ID) return;
      if (!window.confirm(`Delete “${summary.title}”? This removes its server and local copies.`))
        return;
      const catalog = catalogRef.current;
      if (!catalog) return;
      beginWorking();
      deletingBoardRef.current = summary.id;
      let deletedOnServer = false;
      try {
        await catalog.delete(summary.id);
        deletedOnServer = true;
        if (summary.id === boardId) onNavigate(DEFAULT_BOARD_ID, true, true);
        else await refreshBoards();

        await saveQueue.current.catch(() => undefined);
        await deleteLocalBoard(accountId, summary.id).catch(() => undefined);
      } catch {
        if (!deletedOnServer) showToast("That board could not be deleted.");
      } finally {
        deletingBoardRef.current = null;
        endWorking();
      }
    },
    [accountId, beginWorking, boardId, endWorking, onNavigate, refreshBoards, showToast],
  );

  useEffect(() => {
    if (panel?.type === "boards") void refreshBoards();
  }, [panel?.type, refreshBoards]);

  const persistDocument = useCallback(
    (document: { board: Board; camera: Camera }) => {
      if (deletingBoardRef.current === boardId) return;
      const generation = ++saveGeneration.current;
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (generation !== saveGeneration.current || deletingBoardRef.current === boardId) return;
          setSaveState("saving");
          try {
            await saveDocument(accountId, boardId, document);
            if (generation === saveGeneration.current) setSaveState("saved");
          } catch {
            if (generation === saveGeneration.current) setSaveState("error");
          }
        });
    },
    [accountId, boardId],
  );

  const reconcileSelection = useCallback((nextBoard: Board) => {
    setSelectedId((current) =>
      current && nextBoard.items.some((item) => item.id === current) ? current : null,
    );
    setPanel((current) => {
      if (
        !current ||
        current.type === "menu" ||
        current.type === "boards" ||
        current.type === "images" ||
        current.type === "url" ||
        !current.itemId
      )
        return current;
      return nextBoard.items.some((item) => item.id === current.itemId) ? current : null;
    });
  }, []);

  const applyBoard = useCallback((updater: Board | ((current: Board) => Board)) => {
    const current = boardRef.current;
    const next = typeof updater === "function" ? updater(current) : updater;
    if (next === current) return;
    undoStack.current = [...undoStack.current.slice(-49), { board: current }];
    redoStack.current = [];
    const stamped = { ...next, updatedAt: BoardTimestampSchema.make(Date.now()) };
    boardRef.current = stamped;
    setBoard(stamped);
    syncRef.current?.commit(current, stamped);
    setHistoryState({ canUndo: true, canRedo: false });
  }, []);

  const reconcileEmbeddedItemSize = useCallback((id: ItemId, width: number, height: number) => {
    const current = boardRef.current;
    const source = current.items.find((item) => item.id === id);
    if (source === undefined) return;
    const nextWidth = Math.min(
      source.kind === "x" ? MAX_X_POST_CARD_WIDTH : 2_400,
      Math.max(320, width),
    );
    const nextHeight =
      source.kind === "x"
        ? Math.min(2_000, Math.max(240, height))
        : source.kind === "audio" || source.kind === "spotify" || source.kind === "youtube"
          ? Math.min(2_400, Math.max(minimumAudioCardHeight(source.kind), height))
          : undefined;
    if (nextHeight === undefined) return;
    if (Math.abs(source.width - nextWidth) < 1 && Math.abs(source.height - nextHeight) < 4) return;
    const next = {
      ...current,
      updatedAt: BoardTimestampSchema.make(Date.now()),
      items: current.items.map((item) =>
        item.id === id ? { ...item, width: nextWidth, height: nextHeight } : item,
      ),
    };
    boardRef.current = next;
    setBoard(next);
    syncRef.current?.commit(current, next);
  }, []);

  const replaceDocument = useCallback((nextBoard: Board, nextCamera: Camera) => {
    const current = boardRef.current;
    undoStack.current = [
      ...undoStack.current.slice(-49),
      { board: current, camera: cameraRef.current },
    ];
    redoStack.current = [];
    const stamped = { ...nextBoard, updatedAt: BoardTimestampSchema.make(Date.now()) };
    boardRef.current = stamped;
    cameraRef.current = nextCamera;
    setBoard(stamped);
    setCamera(nextCamera);
    syncRef.current?.commit(current, stamped);
    setSelectedId(null);
    setPanel(null);
    setHistoryState({ canUndo: true, canRedo: false });
  }, []);

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    const current = boardRef.current;
    redoStack.current.push({
      board: current,
      camera: previous.camera ? cameraRef.current : undefined,
    });
    const stamped = {
      ...previous.board,
      updatedAt: BoardTimestampSchema.make(Date.now()),
    };
    boardRef.current = stamped;
    setBoard(stamped);
    const background = stamped.background ?? DEFAULT_BOARD_BACKGROUND;
    setBackgroundDraft({
      hex: background,
      lastValidHex: background,
      ...(stamped.backgroundMediaId === undefined ? {} : { mediaId: stamped.backgroundMediaId }),
    });
    backgroundDraftTouchedRef.current = false;
    setBackgroundConflict(false);
    syncRef.current?.commit(current, stamped);
    if (previous.camera) {
      cameraRef.current = previous.camera;
      setCamera(previous.camera);
    }
    reconcileSelection(stamped);
    setHistoryState({ canUndo: undoStack.current.length > 0, canRedo: true });
  }, [reconcileSelection]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    const current = boardRef.current;
    undoStack.current.push({
      board: current,
      camera: next.camera ? cameraRef.current : undefined,
    });
    const stamped = { ...next.board, updatedAt: BoardTimestampSchema.make(Date.now()) };
    boardRef.current = stamped;
    setBoard(stamped);
    const background = stamped.background ?? DEFAULT_BOARD_BACKGROUND;
    setBackgroundDraft({
      hex: background,
      lastValidHex: background,
      ...(stamped.backgroundMediaId === undefined ? {} : { mediaId: stamped.backgroundMediaId }),
    });
    backgroundDraftTouchedRef.current = false;
    setBackgroundConflict(false);
    syncRef.current?.commit(current, stamped);
    if (next.camera) {
      cameraRef.current = next.camera;
      setCamera(next.camera);
    }
    reconcileSelection(stamped);
    setHistoryState({ canUndo: true, canRedo: redoStack.current.length > 0 });
  }, [reconcileSelection]);

  const fitToBoard = useCallback(() => {
    setCamera(fitCamera(boardRef.current.items));
  }, []);

  const stopShuffleAnimation = useCallback(() => {
    if (shuffleAnimationTimerRef.current !== null) {
      window.clearTimeout(shuffleAnimationTimerRef.current);
      shuffleAnimationTimerRef.current = null;
    }
    setShuffleAnimating(false);
  }, []);

  const shuffleBoard = useCallback(() => {
    const current = boardRef.current;
    if (current.items.length < 2) return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const sidePadding = viewportWidth < 640 ? 34 : 72;
    const bottomPadding = viewportWidth < 640 ? 118 : 126;
    try {
      const items = shuffleBoardItems(current.items, Math.random, {
        maxWidth: Math.max(1, viewportWidth - sidePadding * 2) / MIN_ZOOM,
        maxHeight: Math.max(1, viewportHeight - 48 - bottomPadding) / MIN_ZOOM,
      });
      stopShuffleAnimation();
      setShuffleAnimating(true);
      replaceDocument({ ...current, items }, fitCamera(items));
      shuffleAnimationTimerRef.current = window.setTimeout(stopShuffleAnimation, 480);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "This board could not be shuffled.");
    }
  }, [replaceDocument, showToast, stopShuffleAnimation]);

  const zoomAtCenter = useCallback((factor: number) => {
    setCamera((current) =>
      zoomCamera(
        current,
        { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        current.z * factor,
      ),
    );
  }, []);

  const selectPanel = useCallback(
    (nextPanel: PanelState) => {
      cancelBackgroundUpload();
      if (nextPanel !== null) {
        previousFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      setPanelError("");
      if (nextPanel?.type === "imageLink") {
        const item = boardRef.current.items.find((entry) => entry.id === nextPanel.itemId);
        setPanelDraft(item?.kind === "image" ? (item.href ?? "") : "");
        setAnnotationTitle(item?.kind === "image" ? (item.annotationTitle ?? "") : "");
        setAnnotationDescription(item?.kind === "image" ? (item.annotationDescription ?? "") : "");
      } else if (nextPanel?.type === "audio") {
        const item = nextPanel.itemId
          ? boardRef.current.items.find((entry) => entry.id === nextPanel.itemId)
          : undefined;
        setPanelDraft(
          item?.kind === "audio" || item?.kind === "spotify" || item?.kind === "youtube"
            ? (item.src ?? "")
            : "",
        );
        setAudioLabel(
          item?.kind === "audio" || item?.kind === "spotify" || item?.kind === "youtube"
            ? (item.label ?? "")
            : "",
        );
      } else if (nextPanel?.type === "website") {
        const item = nextPanel.itemId
          ? boardRef.current.items.find((entry) => entry.id === nextPanel.itemId)
          : undefined;
        setPanelDraft(item?.kind === "website" ? (item.websiteUrl ?? "") : "");
      } else if (nextPanel?.type === "x") {
        const item = boardRef.current.items.find((entry) => entry.id === nextPanel.itemId);
        setPanelDraft(item?.kind === "x" ? (item.src ?? "") : "");
        setXDisplay(item?.kind === "x" ? (item.xDisplay ?? "post") : "post");
        setXTheme(item?.kind === "x" ? (item.xTheme ?? "automatic") : "automatic");
      } else if (nextPanel?.type === "note" && nextPanel.itemId) {
        setPanelDraft(
          boardRef.current.items.find((item) => item.id === nextPanel.itemId)?.text ?? "",
        );
      } else if (nextPanel?.type === "color") {
        const item = nextPanel.itemId
          ? boardRef.current.items.find((entry) => entry.id === nextPanel.itemId)
          : undefined;
        const color = normalizeHexColor(item?.color ?? "") ?? DEFAULT_CUSTOM_COLOR;
        setCustomColor({
          hex: color,
          label: item?.label ?? "",
          lastValidHex: color,
        });
        setPanelDraft("");
      } else if (nextPanel?.type === "menu") {
        const background = boardRef.current.background ?? DEFAULT_BOARD_BACKGROUND;
        setBackgroundDraft({
          hex: background,
          lastValidHex: background,
          ...(boardRef.current.backgroundMediaId === undefined
            ? {}
            : { mediaId: boardRef.current.backgroundMediaId }),
        });
        setPanelDraft(boardRef.current.title);
      } else if (nextPanel?.type === "boards") {
        setPanelDraft("");
      } else {
        setPanelDraft("");
        if (nextPanel?.type === "url") {
          setXDisplay("post");
          setXTheme("automatic");
        }
      }
      setPanel(nextPanel);
    },
    [cancelBackgroundUpload],
  );

  useEffect(() => {
    if (!panel) return;
    if (previousFocus.current === null) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    const restoreTarget = previousFocus.current;
    const restoreItemId = "itemId" in panel ? (panel.itemId ?? null) : null;
    const viewportElement = viewportRef.current;
    const frame = window.requestAnimationFrame(() => {
      const focusTarget =
        composerRef.current?.querySelector<HTMLElement>("[data-initial-focus], [autofocus]") ??
        composerRef.current?.querySelector<HTMLElement>(
          "input, textarea, .color-grid button, button:not([disabled])",
        );
      focusTarget?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (restoreTarget?.isConnected) restoreTarget.focus();
      else if (restoreItemId !== null) {
        viewportElement
          ?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(restoreItemId)}"]`)
          ?.focus();
      }
      if (previousFocus.current === restoreTarget) previousFocus.current = null;
    };
  }, [panel]);

  useEffect(() => {
    let cancelled = false;
    loadDocument(accountId, boardId)
      .then((document) => {
        if (cancelled) return;
        if (document?.board) {
          const normalized = normalizeImportedBoard(document, {
            allowManagedMedia: !localOnly,
          });
          setBoard(normalized.board);
          setCamera(normalized.camera ?? fitCamera(normalized.board.items));
        } else {
          setCamera(fitCamera(initialBoard.items));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCamera(fitCamera(initialBoard.items));
          setPersistenceEnabled(false);
          setSaveState("error");
          showToast("The saved board could not be opened. Its local copy was left untouched.");
        }
      })
      .finally(() => !cancelled && setReady(true));

    return () => {
      cancelled = true;
      window.clearTimeout(toastTimer.current);
    };
  }, [accountId, boardId, initialBoard, localOnly, showToast]);

  const applyRemoteBoard = useCallback(
    (next: Board, remoteDivergence: boolean) => {
      const previous = boardRef.current;
      const backgroundReconciliation = reconcileRemoteBackgroundDraft(
        previous,
        next,
        backgroundDraftTouchedRef.current,
      );
      if (backgroundReconciliation.draft !== undefined) {
        setBackgroundDraft(backgroundReconciliation.draft);
      }
      setBackgroundConflict(
        (existing) =>
          reconcileRemoteBackgroundDraft(
            previous,
            next,
            backgroundDraftTouchedRef.current,
            existing,
          ).conflict,
      );
      boardRef.current = next;
      setBoard(next);
      reconcileSelection(next);

      if (remoteDivergence) {
        undoStack.current = [];
        redoStack.current = [];
        setHistoryState({ canUndo: false, canRedo: false });
      }
    },
    [reconcileSelection],
  );

  useEffect(() => {
    if (!ready) return;
    if (localOnly) return;
    const sync = startBoardSync({
      accountId,
      boardId,
      initialBoard: boardRef.current,
      onBoard: applyRemoteBoard,
      onStatus: setSyncState,
      onUnavailable: (unavailableBoardId) => {
        if (unavailableBoardId === boardId && deletingBoardRef.current !== unavailableBoardId)
          onNavigate(DEFAULT_BOARD_ID, true, true);
      },
    });
    syncRef.current = sync;

    return () => {
      if (syncRef.current === sync) syncRef.current = null;
      void sync.close();
    };
  }, [accountId, applyRemoteBoard, boardId, localOnly, onNavigate, ready]);

  useEffect(() => {
    if (!ready || !persistenceEnabled) return;
    persistDocument({ board, camera: cameraRef.current });
  }, [board, persistDocument, persistenceEnabled, ready]);

  useEffect(() => {
    if (!ready || !persistenceEnabled) return;
    const timeout = window.setTimeout(() => {
      persistDocument({ board: boardRef.current, camera });
    }, 550);
    return () => window.clearTimeout(timeout);
  }, [camera, persistDocument, persistenceEnabled, ready]);

  useEffect(() => {
    const flush = () => {
      if (persistenceEnabled)
        persistDocument({ board: boardRef.current, camera: cameraRef.current });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [persistDocument, persistenceEnabled]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        setCamera((current) =>
          zoomCamera(
            current,
            { x: event.clientX, y: event.clientY },
            current.z * Math.exp(-event.deltaY * 0.0025),
          ),
        );
      } else {
        setCamera((current) => ({
          ...current,
          x: current.x - event.deltaX / current.z,
          y: current.y - event.deltaY / current.z,
        }));
      }
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  const removeItem = useCallback(
    (id: ItemId) => {
      applyBoard((current) => {
        if (!current.items.some((item) => item.id === id)) return current;
        return { ...current, items: current.items.filter((item) => item.id !== id) };
      });
      setSelectedId((current) => (current === id ? null : current));
    },
    [applyBoard],
  );

  const removeSelected = useCallback(() => {
    if (selectedId) removeItem(selectedId);
  }, [removeItem, selectedId]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    applyBoard((current) => {
      const source = current.items.find((item) => item.id === selectedId);
      if (!source) return current;
      const copy: BoardItem = {
        ...source,
        id: createId(),
        x: source.x + 42,
        y: source.y + 42,
        order: Math.max(0, ...current.items.map((item) => item.order)) + 1,
      };
      window.setTimeout(() => setSelectedId(copy.id), 0);
      return { ...current, items: [...current.items, copy] };
    });
  }, [applyBoard, selectedId]);

  const reorderItem = useCallback(
    (id: ItemId, direction: "front" | "back") => {
      applyBoard((current) => {
        if (!current.items.some((item) => item.id === id)) return current;
        const orders = current.items.map((item) => item.order);
        const order =
          direction === "front" ? Math.max(0, ...orders) + 1 : Math.min(0, ...orders) - 1;
        return {
          ...current,
          items: current.items.map((item) => (item.id === id ? { ...item, order } : item)),
        };
      });
    },
    [applyBoard],
  );

  const reorderSelected = useCallback(
    (direction: "front" | "back") => {
      if (selectedId) reorderItem(selectedId, direction);
    },
    [reorderItem, selectedId],
  );

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (bulkSession !== null) return;
      if (event.key === "Escape") {
        setSelectedId(null);
        cancelBackgroundUpload();
        setPanel(null);
        return;
      }
      if (isTypingTarget(event.target)) return;
      const command = event.metaKey || event.ctrlKey;

      if (event.code === "Space") {
        event.preventDefault();
        setSpacePressed(true);
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId && editing) {
        event.preventDefault();
        removeSelected();
      } else if (command && event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (command && event.key === "0") {
        event.preventDefault();
        fitToBoard();
      } else if (event.key === "+" || event.key === "=") {
        zoomAtCenter(1.2);
      } else if (event.key === "-") {
        zoomAtCenter(1 / 1.2);
      }
    };

    const keyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
    };

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [
    bulkSession,
    cancelBackgroundUpload,
    editing,
    fitToBoard,
    redo,
    removeSelected,
    selectedId,
    undo,
    zoomAtCenter,
  ]);

  const addSingleImage = useCallback(
    async (file: File, screenPoint?: Point, workingStarted = false) => {
      if (!workingStarted) beginWorking();
      try {
        if (boardRef.current.items.length >= MAX_REMOTE_ITEMS) {
          showToast(`This board can hold ${MAX_REMOTE_ITEMS} items.`);
          return;
        }
        const convertingHeic =
          /^image\/hei[cf]$/i.test(file.type) || /\.(?:heic|heif|hif)$/i.test(file.name);
        setImageIntakeStatus(convertingHeic ? "Converting HEIC photo…" : "Preparing image…");
        const image = await ingestImageFile(file);
        setImageIntakeStatus(localOnly ? "Saving image to this browser…" : "Uploading image…");
        const source = localOnly
          ? { src: await blobToDataUrl(image.blob) }
          : { mediaId: (await uploadMedia(image.blob, "image")).mediaId };
        setImageIntakeStatus("Adding image to board…");
        const current = boardRef.current;
        if (current.items.length >= MAX_REMOTE_ITEMS) {
          showToast(`This board can hold ${MAX_REMOTE_ITEMS} items.`);
          return;
        }
        const point = screenPoint ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const anchor = screenToWorld(point, cameraRef.current);
        const layout = placeLayoutWithoutOverlap(
          layoutBulkImages([{ id: "single", width: image.width, height: image.height }], "loose"),
          anchor,
          current.items,
        );
        const placed = layout.items[0];
        if (!placed) throw new Error("The image could not be placed.");
        const item: BoardItem = {
          id: createId(),
          kind: "image",
          ...source,
          x: placed.x,
          y: placed.y,
          width: placed.width,
          height: placed.height,
          rotation: 0,
          order: Math.max(0, ...current.items.map((entry) => entry.order)) + 1,
        };
        const projectedBytes = [...current.items, item].reduce(
          (total, entry) => total + estimateItemBytes(entry),
          0,
        );
        if (projectedBytes > MAX_REMOTE_BOARD_BYTES) {
          showToast(
            localOnly
              ? "That image would make this browser board too large."
              : "That image would exceed this board’s remote storage limit.",
          );
          return;
        }
        applyBoard({ ...current, items: [...current.items, item] });
        setSelectedId(item.id);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "That image could not be added.", 8000);
      } finally {
        setImageIntakeStatus("");
        endWorking();
      }
    },
    [applyBoard, beginWorking, endWorking, localOnly, showToast],
  );

  const openImagePicker = useCallback(() => {
    if (working) return;
    const input = imageInputRef.current;
    if (input === null) return;
    imageSelectionFolderRef.current = false;
    input.removeAttribute("webkitdirectory");
    input.click();
  }, [working]);

  const openFolderPicker = useCallback(() => {
    if (working) return;
    const input = imageInputRef.current;
    if (input === null) return;
    imageSelectionFolderRef.current = true;
    input.setAttribute("webkitdirectory", "");
    input.click();
  }, [working]);

  const openBulkStaging = useCallback(
    (
      files: ReadonlyArray<File>,
      screenPoint?: Point,
      workingStarted = false,
      intake: {
        readonly omitted?: number;
        readonly truncated?: boolean;
        readonly failures?: ReadonlyArray<TraversalFailure>;
      } = {},
    ) => {
      if (
        files.length === 0 ||
        bulkSessionRef.current !== null ||
        (!workingStarted && dropCollectionRef.current !== null)
      ) {
        if (workingStarted) endWorking();
        return;
      }
      const point = screenPoint ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      if (!workingStarted) beginWorking();
      const session: BulkSession = {
        files,
        anchor: screenToWorld(point, cameraRef.current),
        omitted: intake.omitted ?? 0,
        truncated: intake.truncated ?? false,
        failures: intake.failures ?? [],
      };
      bulkSessionRef.current = session;
      setPanel(null);
      setSelectedId(null);
      setBulkSession(session);
    },
    [beginWorking, endWorking],
  );

  const addImageSelection = useCallback(
    (
      files: ReadonlyArray<File>,
      options: { readonly folder?: boolean; readonly screenPoint?: Point } = {},
    ) => {
      if (files.length > 0) setPanel(null);
      const file = files[0];
      if (!shouldStageImageSelection(files.length, options.folder) && file !== undefined) {
        void addSingleImage(file, options.screenPoint);
      } else {
        openBulkStaging(files, options.screenPoint);
      }
    },
    [addSingleImage, openBulkStaging],
  );

  const closeBulkStaging = useCallback(() => {
    bulkSessionRef.current = null;
    setBulkSession(null);
    endWorking();
  }, [endWorking]);

  const cancelDropCollection = useCallback(() => {
    const collection = dropCollectionRef.current;
    if (collection === null) return;
    dropGenerationRef.current += 1;
    collection.controller.abort();
    dropCollectionRef.current = null;
    setCollectingDrop(false);
    endWorking();
    showToast("Folder reading cancelled");
  }, [endWorking, showToast]);

  const commitBulkImages = useCallback(
    (images: ReadonlyArray<PreparedBulkImage>, layoutKind: BulkLayoutKind): string | null => {
      const current = boardRef.current;
      if (current.items.length + images.length > MAX_REMOTE_ITEMS) {
        return `This board can hold ${MAX_REMOTE_ITEMS} items. Select fewer images.`;
      }
      const layout = layoutBulkImages(
        images.map((image) => ({ id: image.entryId, width: image.width, height: image.height })),
        layoutKind,
      );
      let placed;
      try {
        placed = placeLayoutWithoutOverlap(
          layout,
          bulkSession?.anchor ?? { x: 0, y: 0 },
          current.items,
        );
      } catch (error) {
        return error instanceof Error ? error.message : "Open canvas space could not be found.";
      }
      const prepared = new Map(images.map((image) => [image.entryId, image]));
      const topOrder = Math.max(0, ...current.items.map((item) => item.order));
      const additions = placed.items.map((item, index): BoardItem => {
        const image = prepared.get(item.id);
        if (!image) throw new Error("A prepared image was missing from this import.");
        return {
          id: createId(),
          kind: "image",
          ...(image.mediaId === undefined ? { src: image.src } : { mediaId: image.mediaId }),
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          rotation: 0,
          order: topOrder + index + 1,
        };
      });
      const projectedBytes = [...current.items, ...additions].reduce(
        (total, item) => total + estimateItemBytes(item),
        0,
      );
      if (projectedBytes > MAX_REMOTE_BOARD_BYTES) {
        return localOnly
          ? "Those images would make this browser board too large. Select fewer images."
          : "Those images would exceed this board’s remote storage limit. Select fewer images.";
      }
      applyBoard({ ...current, items: [...current.items, ...additions] });
      window.setTimeout(() => setSelectedId(additions.at(-1)?.id ?? null), 0);
      showToast(`${additions.length} ${additions.length === 1 ? "image" : "images"} added`);
      return null;
    },
    [applyBoard, bulkSession?.anchor, localOnly, showToast],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (bulkSession !== null || isTypingTarget(event.target)) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) {
        event.preventDefault();
        addImageSelection(files);
        return;
      }
      const text = event.clipboardData?.getData("text/plain").trim();
      if (text && isLikelyAudioUrl(text)) {
        event.preventDefault();
        setPanelDraft(text);
        setAudioLabel("");
        setPanelError("");
        setPanel({ type: "audio" });
      } else if (text && (/^https?:\/\//i.test(text) || parseXPostInput(text) !== null)) {
        event.preventDefault();
        const xInput = parseXPostInput(text);
        setPanelDraft(text);
        if (xInput !== null) {
          setXDisplay(xInput.display);
          setXTheme("automatic");
        }
        setPanelError("");
        setPanel({ type: "url" });
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImageSelection, bulkSession]);

  function setItemPreview(id: ItemId, point: Point) {
    const element = Array.from(
      viewportRef.current?.querySelectorAll<HTMLElement>("[data-item-id]") ?? [],
    ).find((candidate) => candidate.dataset.itemId === id);
    element?.style.setProperty("--item-x", `${point.x}px`);
    element?.style.setProperty("--item-y", `${point.y}px`);
  }

  function presentItem(itemId: ItemId, origin?: PresentationItemOrigin) {
    const item = boardRef.current.items.find((entry) => entry.id === itemId);
    if (editing || item === undefined) return;
    playbackCoordinatorRef.current.pauseAll();
    setPresentedItem({
      itemId,
      origin: origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    });
  }

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (bulkSession !== null || (event.button !== 0 && event.button !== 1)) return;
    stopShuffleAnimation();
    event.preventDefault();
    setPanel(null);
    const point = { x: event.clientX, y: event.clientY };
    const target = event.target as HTMLElement;
    const itemElement = target.closest<HTMLElement>("[data-item-id]");
    const presentationDetailLink = editing
      ? null
      : target.closest<HTMLAnchorElement>(".presentation-detail-link");
    const presentationItem = editing
      ? null
      : target.closest<HTMLElement>("[data-presentation-item-id]");
    const presentationItemId = presentationItem?.dataset.presentationItemId;
    const item =
      editing && event.pointerType === "touch"
        ? boardRef.current.items.find((entry) => entry.id === itemElement?.dataset.itemId)
        : undefined;

    if (activePointers.current.size >= 1 && gesture.current?.itemId && gesture.current.itemOrigin) {
      setItemPreview(gesture.current.itemId, gesture.current.itemOrigin);
    }

    activePointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointers = [...activePointers.current.values()];

    if (pointers.length >= 2) {
      const [a, b] = pointers;
      gesture.current = {
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        distance: Math.hypot(a.x - b.x, a.y - b.y),
      };
    } else if (item) {
      setSelectedId(item.id);
      gesture.current = {
        center: point,
        start: point,
        itemId: item.id,
        itemOrigin: { x: item.x, y: item.y },
        itemPosition: { x: item.x, y: item.y },
      };
    } else {
      setSelectedId(null);
      gesture.current = {
        center: point,
        start: point,
        ...(presentationDetailLink !== null
          ? { linkHref: presentationDetailLink.href }
          : presentationItemId === undefined
            ? {}
            : { presentationItemId }),
      };
    }
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activePointers.current.has(event.pointerId) || !gesture.current) return;
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointers = [...activePointers.current.values()];

    if (pointers.length >= 2) {
      const [a, b] = pointers;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const previous = gesture.current;
      setCamera((current) => {
        const anchor = screenToWorld(previous.center, current);
        const z = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, current.z * (distance / Math.max(1, previous.distance ?? distance))),
        );
        return { x: center.x / z - anchor.x, y: center.y / z - anchor.y, z };
      });
      gesture.current = { center, distance };
    } else if (pointers.length === 1) {
      const point = pointers[0];
      const previous = gesture.current;
      if (previous.itemId && previous.itemOrigin && previous.start) {
        const itemPosition = {
          x: previous.itemOrigin.x + (point.x - previous.start.x) / cameraRef.current.z,
          y: previous.itemOrigin.y + (point.y - previous.start.y) / cameraRef.current.z,
        };
        setItemPreview(previous.itemId, itemPosition);
        gesture.current = { ...previous, center: point, itemPosition };
      } else {
        setCamera((current) => ({
          ...current,
          x: current.x + (point.x - previous.center.x) / current.z,
          y: current.y + (point.y - previous.center.y) / current.z,
        }));
        gesture.current = { ...previous, center: point };
      }
    }
  }

  function handleCanvasPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const endingGesture = gesture.current;
    const wasOnlyPointer = activePointers.current.size === 1;
    if (wasOnlyPointer && endingGesture?.itemId && endingGesture.itemOrigin) {
      if (event.type === "pointercancel") {
        setItemPreview(endingGesture.itemId, endingGesture.itemOrigin);
      } else if (endingGesture.itemPosition) {
        commitItemPosition(
          endingGesture.itemId,
          endingGesture.itemPosition.x,
          endingGesture.itemPosition.y,
        );
      }
    } else if (
      wasOnlyPointer &&
      event.type !== "pointercancel" &&
      endingGesture?.start !== undefined &&
      Math.hypot(event.clientX - endingGesture.start.x, event.clientY - endingGesture.start.y) < 6
    ) {
      if (endingGesture.presentationItemId !== undefined) {
        const items = boardRef.current.items;
        const item = items.find((entry) => entry.id === endingGesture.presentationItemId);
        if (item !== undefined) presentItem(item.id, endingGesture.start);
      } else if (endingGesture.linkHref !== undefined) {
        window.open(endingGesture.linkHref, "_blank", "noopener,noreferrer");
      }
    }

    activePointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const pointers = [...activePointers.current.values()];
    gesture.current = pointers.length ? { center: pointers[0] } : null;
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingFiles(false);
    if (bulkSessionRef.current !== null || dropCollectionRef.current !== null) return;
    const screenPoint = { x: event.clientX, y: event.clientY };
    const generation = ++dropGenerationRef.current;
    const controller = new AbortController();
    dropCollectionRef.current = { generation, controller };
    setCollectingDrop(true);
    beginWorking();
    void collectDroppedImageFiles(event.dataTransfer, {
      limit: 150,
      signal: controller.signal,
    })
      .then((collection) => {
        if (dropCollectionRef.current?.generation !== generation) return;
        dropCollectionRef.current = null;
        setCollectingDrop(false);
        if (collection.files.length === 0) {
          endWorking();
          showToast(collection.failures[0]?.message ?? "No files were found in that drop.");
        } else if (
          collection.hadDirectory ||
          collection.files.length > 1 ||
          collection.failures.length > 0 ||
          collection.omitted > 0 ||
          collection.truncated
        ) {
          openBulkStaging(collection.files, screenPoint, true, collection);
        } else {
          const file = collection.files[0];
          if (file === undefined) endWorking();
          else void addSingleImage(file, screenPoint, true);
        }
      })
      .catch((error) => {
        if (dropCollectionRef.current?.generation !== generation) return;
        dropCollectionRef.current = null;
        setCollectingDrop(false);
        endWorking();
        if (!controller.signal.aborted) {
          showToast(error instanceof Error ? error.message : "That folder could not be read.");
        }
      });
  }

  function commitItemPosition(id: ItemId, x: number, y: number) {
    applyBoard((current) => {
      const source = current.items.find((item) => item.id === id);
      if (!source || (source.x === x && source.y === y)) return current;
      return {
        ...current,
        items: current.items.map((item) => (item.id === id ? { ...item, x, y } : item)),
      };
    });
  }

  function commitItemSize(id: ItemId, width: number, height: number) {
    applyBoard((current) => {
      const source = current.items.find((item) => item.id === id);
      if (!source || (source.width === width && source.height === height)) return current;
      return {
        ...current,
        items: current.items.map((item) => (item.id === id ? { ...item, width, height } : item)),
      };
    });
  }

  async function saveXPost(
    parsed: NonNullable<ReturnType<typeof parseXPostInput>>,
    editingId?: string,
  ) {
    if (editingId === undefined && boardRef.current.items.length >= MAX_REMOTE_ITEMS) {
      setPanelError(`This board can hold ${MAX_REMOTE_ITEMS} items.`);
      return;
    }
    beginWorking();
    try {
      const existing =
        editingId === undefined
          ? undefined
          : boardRef.current.items.find((item) => item.id === editingId && item.kind === "x");
      if (editingId !== undefined && existing === undefined) {
        throw new Error("That X card is no longer on this board.");
      }
      let preview: Awaited<ReturnType<BoardSync["resolveXPostPreview"]>> | undefined;
      const sync = syncRef.current;
      if (sync !== null && syncState === "live") {
        preview = await sync.resolveXPostPreview(parsed.src).catch(() => undefined);
      }
      const sameSource = existing?.src === parsed.src;
      const snapshot = {
        xAuthorName: preview?.authorName ?? (sameSource ? existing?.xAuthorName : undefined),
        xAuthorHandle:
          preview?.authorHandle ?? (sameSource ? existing?.xAuthorHandle : parsed.handle),
        xPostText: preview?.text ?? (sameSource ? existing?.xPostText : undefined),
        xPostDate: preview?.date ?? (sameSource ? existing?.xPostDate : undefined),
      };
      if (existing !== undefined) {
        applyBoard((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === editingId && item.kind === "x"
              ? {
                  ...item,
                  src: parsed.src,
                  xDisplay,
                  xTheme,
                  xHideThread: true,
                  ...snapshot,
                }
              : item,
          ),
        }));
        setPanel(null);
        showToast(preview === undefined ? "X card updated" : "X card refreshed");
        return;
      }
      if (boardRef.current.items.length >= MAX_REMOTE_ITEMS) {
        throw new Error(`This board can hold ${MAX_REMOTE_ITEMS} items.`);
      }
      const point = screenToWorld(
        { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        cameraRef.current,
      );
      const width = xDisplay === "media" ? 560 : 550;
      const height = xDisplay === "media" ? 390 : 620;
      const item: BoardItem = {
        id: createId(),
        kind: "x",
        src: parsed.src,
        xDisplay,
        xTheme,
        xHideThread: true,
        ...snapshot,
        x: point.x - width / 2,
        y: point.y - height / 2,
        width,
        height,
        rotation: 0,
        order: Math.max(0, ...boardRef.current.items.map((entry) => entry.order)) + 1,
      };
      applyBoard((current) => ({ ...current, items: [...current.items, item] }));
      setSelectedId(item.id);
      setPanel(null);
      showToast(xDisplay === "media" ? "X media added" : "X post added");
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : "That X post could not be added.");
    } finally {
      endWorking();
    }
  }

  async function submitLink(event: FormEvent) {
    event.preventDefault();
    setPanelError("");
    const xInput = parseXPostInput(panelDraft);
    if (xInput !== null) {
      await saveXPost(xInput);
      return;
    }
    const linkUrl = normalizeWebsiteUrl(panelDraft);
    if (linkUrl === null) {
      setPanelError("Use a public HTTPS URL without credentials or a custom port.");
      return;
    }
    if (boardRef.current.items.length >= MAX_REMOTE_ITEMS) {
      setPanelError(`This board can hold ${MAX_REMOTE_ITEMS} items.`);
      return;
    }

    const addImage = (
      src: string,
      image: { readonly width: number; readonly height: number },
      href?: string,
    ) => {
      if (boardRef.current.items.length >= MAX_REMOTE_ITEMS) {
        throw new Error(`This board can hold ${MAX_REMOTE_ITEMS} items.`);
      }
      const point = screenToWorld(
        { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        cameraRef.current,
      );
      const ratio = Math.min(8, Math.max(0.125, image.width / image.height));
      const width = ratio < 0.85 ? 420 : ratio > 1.65 ? 680 : 560;
      const height = width / ratio;
      const item: BoardItem = {
        id: createId(),
        kind: "image",
        src,
        ...(href === undefined ? {} : { href }),
        x: point.x - width / 2,
        y: point.y - height / 2,
        width,
        height,
        rotation: 0,
        order: Math.max(0, ...boardRef.current.items.map((entry) => entry.order)) + 1,
      };
      applyBoard((current) => ({ ...current, items: [...current.items, item] }));
      setSelectedId(item.id);
      setPanel(null);
    };

    beginWorking();
    try {
      try {
        const image = await inspectImageUrl(linkUrl);
        addImage(linkUrl, image);
        return;
      } catch {
        // A webpage URL is expected to fail direct image inspection.
      }

      if (localOnly) {
        const point = screenToWorld(
          { x: window.innerWidth / 2, y: window.innerHeight / 2 },
          cameraRef.current,
        );
        const metadata = localWebsiteMetadata(linkUrl);
        const width = 540;
        const height = 360;
        const item: BoardItem = {
          id: createId(),
          kind: "website",
          websiteUrl: linkUrl,
          ...metadata,
          x: point.x - width / 2,
          y: point.y - height / 2,
          width,
          height,
          rotation: 0,
          order: Math.max(0, ...boardRef.current.items.map((entry) => entry.order)) + 1,
        };
        applyBoard((current) => ({ ...current, items: [...current.items, item] }));
        setSelectedId(item.id);
        setPanel(null);
        showToast("Link added locally");
        return;
      }

      const sync = syncRef.current;
      if (sync === null || syncState !== "live") {
        throw new Error("Connect to the board server before resolving this link.");
      }
      const preview = await sync.resolveWebsitePreview(linkUrl);
      if (preview.preferredLayout === "image" && preview.imageUrl !== undefined) {
        try {
          const image = await inspectImageUrl(preview.imageUrl);
          addImage(preview.imageUrl, image, preview.url);
          showToast("Linked image added");
          return;
        } catch {
          // Keep a durable link card when a remote preview image refuses hotlinking.
        }
      }

      if (boardRef.current.items.length >= MAX_REMOTE_ITEMS) {
        throw new Error(`This board can hold ${MAX_REMOTE_ITEMS} items.`);
      }
      const point = screenToWorld(
        { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        cameraRef.current,
      );
      const width = 540;
      const height = 360;
      const item: BoardItem = {
        id: createId(),
        kind: "website",
        websiteUrl: preview.url,
        websiteImageUrl: preview.imageUrl,
        websiteTitle: preview.title,
        websiteDescription: preview.description,
        websiteSiteLabel: preview.siteLabel,
        x: point.x - width / 2,
        y: point.y - height / 2,
        width,
        height,
        rotation: 0,
        order: Math.max(0, ...boardRef.current.items.map((entry) => entry.order)) + 1,
      };
      applyBoard((current) => ({ ...current, items: [...current.items, item] }));
      setSelectedId(item.id);
      setPanel(null);
      showToast("Link added");
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : "That link could not be added.");
    } finally {
      endWorking();
    }
  }

  async function submitWebsite(event: FormEvent) {
    event.preventDefault();
    setPanelError("");
    const websiteUrl = normalizeWebsiteUrl(panelDraft);
    if (websiteUrl === null) {
      setPanelError("Use a public HTTPS website URL without credentials or a custom port.");
      return;
    }
    if (localOnly) {
      const metadata = localWebsiteMetadata(websiteUrl);
      const editingId = panel?.type === "website" ? panel.itemId : undefined;
      if (editingId !== undefined) {
        applyBoard((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === editingId && item.kind === "website"
              ? {
                  ...item,
                  websiteUrl,
                  websiteImageUrl: undefined,
                  websiteDescription: undefined,
                  ...metadata,
                }
              : item,
          ),
        }));
        setPanel(null);
        showToast("Website link updated");
        return;
      }
      const point = screenToWorld(
        { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        cameraRef.current,
      );
      const width = 540;
      const height = 360;
      const item: BoardItem = {
        id: createId(),
        kind: "website",
        websiteUrl,
        ...metadata,
        x: point.x - width / 2,
        y: point.y - height / 2,
        width,
        height,
        rotation: 0,
        order: Math.max(0, ...boardRef.current.items.map((entry) => entry.order)) + 1,
      };
      applyBoard((current) => ({ ...current, items: [...current.items, item] }));
      setSelectedId(item.id);
      setPanel(null);
      showToast("Website link added");
      return;
    }

    const sync = syncRef.current;
    if (sync === null || syncState !== "live") {
      setPanelError("Connect to the board server before creating a website preview.");
      return;
    }

    beginWorking();
    try {
      const preview = await sync.resolveWebsitePreview(websiteUrl);
      const editingId = panel?.type === "website" ? panel.itemId : undefined;
      if (editingId !== undefined) {
        applyBoard((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === editingId && item.kind === "website"
              ? {
                  ...item,
                  websiteUrl: preview.url,
                  websiteImageUrl: preview.imageUrl,
                  websiteTitle: preview.title,
                  websiteDescription: preview.description,
                  websiteSiteLabel: preview.siteLabel,
                  width: Math.max(320, item.width),
                  height: Math.max(280, item.height),
                }
              : item,
          ),
        }));
        setPanel(null);
        showToast("Website preview refreshed");
        return;
      }

      if (boardRef.current.items.length >= MAX_REMOTE_ITEMS) {
        throw new Error(`This board can hold ${MAX_REMOTE_ITEMS} items.`);
      }
      const point = screenToWorld(
        { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        cameraRef.current,
      );
      const width = 540;
      const height = 360;
      const item: BoardItem = {
        id: createId(),
        kind: "website",
        websiteUrl: preview.url,
        websiteImageUrl: preview.imageUrl,
        websiteTitle: preview.title,
        websiteDescription: preview.description,
        websiteSiteLabel: preview.siteLabel,
        x: point.x - width / 2,
        y: point.y - height / 2,
        width,
        height,
        rotation: 0,
        order: Math.max(0, ...boardRef.current.items.map((entry) => entry.order)) + 1,
      };
      applyBoard((current) => ({ ...current, items: [...current.items, item] }));
      setSelectedId(item.id);
      setPanel(null);
      showToast("Website added");
    } catch (error) {
      setPanelError(
        error instanceof Error ? error.message : "That website preview could not be created.",
      );
    } finally {
      endWorking();
    }
  }

  function submitAudio(event: FormEvent) {
    event.preventDefault();
    const source = parseAudioSource(panelDraft);
    if (source === null) {
      setPanelError("Use a supported Spotify or YouTube link, or a hosted HTTPS audio file URL.");
      return;
    }
    const label = audioLabel.trim() || undefined;
    const editingId = panel?.type === "audio" ? panel.itemId : undefined;
    if (editingId) {
      playbackCoordinatorRef.current.pauseAll();
      applyBoard((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === editingId &&
          (item.kind === "audio" || item.kind === "spotify" || item.kind === "youtube")
            ? {
                ...item,
                kind: source.kind,
                src: source.src,
                mediaId: undefined,
                label,
                width: Math.max(MIN_AUDIO_CARD_WIDTH, item.width),
                height: preferredAudioCardHeight(
                  source.kind,
                  Math.max(MIN_AUDIO_CARD_WIDTH, item.width),
                ),
              }
            : item,
        ),
      }));
      setPanel(null);
      showToast("Audio card updated");
      return;
    }

    const point = screenToWorld(
      { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      cameraRef.current,
    );
    const width = 520;
    const height = preferredAudioCardHeight(source.kind, width);
    const item: BoardItem = {
      id: createId(),
      kind: source.kind,
      src: source.src,
      label,
      x: point.x - width / 2,
      y: point.y - height / 2,
      width,
      height,
      rotation: 0,
      order: Math.max(0, ...boardRef.current.items.map((entry) => entry.order)) + 1,
    };
    applyBoard((current) => ({ ...current, items: [...current.items, item] }));
    setSelectedId(item.id);
    setPanel(null);
    showToast(
      source.kind === "spotify"
        ? "Spotify card added"
        : source.kind === "youtube"
          ? "YouTube card added"
          : "Audio card added",
    );
  }

  async function addLocalAudio(file: File) {
    setPanelError("");
    if (localOnly) {
      setPanelError("Sign in to upload audio files to a private workspace.");
      return;
    }
    const mimeType = normalizeMediaMimeType("audio", file.type);
    if (mimeType === null) {
      setPanelError("Choose an MP3, M4A, WAV, Ogg, or WebM audio file.");
      return;
    }
    if (file.size === 0 || file.size > MAX_AUDIO_UPLOAD_BYTES) {
      setPanelError("Local audio must be non-empty and no larger than 25 MB.");
      return;
    }
    const editingId = panel?.type === "audio" ? panel.itemId : undefined;
    if (!editingId && boardRef.current.items.length >= MAX_REMOTE_ITEMS) {
      setPanelError(`This board can hold ${MAX_REMOTE_ITEMS} items.`);
      return;
    }
    beginWorking();
    try {
      const uploaded = await uploadMedia(file, "audio");
      const label =
        audioLabel.trim() || file.name.replace(/\.[^.]+$/, "").slice(0, 120) || undefined;
      if (editingId) {
        playbackCoordinatorRef.current.pauseAll();
        applyBoard((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === editingId &&
            (item.kind === "audio" || item.kind === "spotify" || item.kind === "youtube")
              ? {
                  ...item,
                  kind: "audio",
                  src: undefined,
                  mediaId: uploaded.mediaId,
                  label,
                  width: Math.max(MIN_AUDIO_CARD_WIDTH, item.width),
                  height: preferredAudioCardHeight(
                    "audio",
                    Math.max(MIN_AUDIO_CARD_WIDTH, item.width),
                  ),
                }
              : item,
          ),
        }));
      } else {
        const point = screenToWorld(
          { x: window.innerWidth / 2, y: window.innerHeight / 2 },
          cameraRef.current,
        );
        const width = 520;
        const height = preferredAudioCardHeight("audio", width);
        const item: BoardItem = {
          id: createId(),
          kind: "audio",
          mediaId: uploaded.mediaId,
          label,
          x: point.x - width / 2,
          y: point.y - height / 2,
          width,
          height,
          rotation: 0,
          order: Math.max(0, ...boardRef.current.items.map((entry) => entry.order)) + 1,
        };
        applyBoard((current) => ({ ...current, items: [...current.items, item] }));
        setSelectedId(item.id);
      }
      setPanel(null);
      showToast(editingId ? "Audio card updated" : "Local audio added");
    } catch (error) {
      setPanelError(
        error instanceof Error ? error.message : "That audio file could not be uploaded.",
      );
    } finally {
      if (audioInputRef.current) audioInputRef.current.value = "";
      endWorking();
    }
  }

  function submitImageLink(event: FormEvent) {
    event.preventDefault();
    if (panel?.type !== "imageLink") return;
    const rawTitle = annotationTitle.trim();
    const rawDescription = annotationDescription.trim();
    const title = normalizeImageAnnotationTitle(rawTitle);
    const description = normalizeImageAnnotationDescription(rawDescription);
    if ((rawTitle && title === undefined) || (rawDescription && description === undefined)) {
      setPanelError("Image details exceed the supported length.");
      return;
    }
    const href = panelDraft.trim() ? normalizeImageLink(panelDraft) : undefined;
    if (href === null) {
      setPanelError("Use a full http or https page URL without a username or password.");
      return;
    }
    applyBoard((current) => {
      const source = current.items.find((item) => item.id === panel.itemId);
      if (source?.kind !== "image") return current;
      if (
        source.annotationTitle === title &&
        source.annotationDescription === description &&
        source.href === href
      )
        return current;
      return {
        ...current,
        items: current.items.map((item) => {
          if (item.id !== panel.itemId) return item;
          const next = { ...item };
          if (title) next.annotationTitle = title;
          else delete next.annotationTitle;
          if (description) next.annotationDescription = description;
          else delete next.annotationDescription;
          if (href) next.href = href;
          else delete next.href;
          return next;
        }),
      };
    });
    setPanel(null);
    showToast(title || description || href ? "Image details saved" : "Image details cleared");
  }

  function removeImageLink() {
    if (panel?.type !== "imageLink") return;
    applyBoard((current) => {
      const source = current.items.find((item) => item.id === panel.itemId);
      if (
        source?.kind !== "image" ||
        (source.href === undefined &&
          source.annotationTitle === undefined &&
          source.annotationDescription === undefined)
      )
        return current;
      return {
        ...current,
        items: current.items.map((item) => {
          if (item.id !== panel.itemId) return item;
          const next = { ...item };
          delete next.href;
          delete next.annotationTitle;
          delete next.annotationDescription;
          return next;
        }),
      };
    });
    setPanel(null);
    showToast("Image details removed");
  }

  function copyImageLink() {
    if (panel?.type !== "imageLink") return;
    const item = boardRef.current.items.find((entry) => entry.id === panel.itemId);
    if (item?.href === undefined) return;
    if (!navigator.clipboard) {
      showToast("Copy is not available in this browser");
      return;
    }
    void navigator.clipboard.writeText(item.href).then(
      () => showToast("Image link copied"),
      () => showToast("The image link could not be copied"),
    );
  }

  function submitNote(event: FormEvent) {
    event.preventDefault();
    const text = panelDraft.trim();
    if (!text) {
      setPanelError("Write a few words first.");
      return;
    }

    const editingId = panel?.type === "note" ? panel.itemId : undefined;
    if (editingId) {
      applyBoard((current) => ({
        ...current,
        items: current.items.map((item) => (item.id === editingId ? { ...item, text } : item)),
      }));
      setPanel(null);
      return;
    }

    const point = screenToWorld(
      { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      cameraRef.current,
    );
    const item: BoardItem = {
      id: createId(),
      kind: "note",
      text,
      x: point.x - 260,
      y: point.y - 165,
      width: 520,
      height: 330,
      rotation: 0,
      order: Math.max(0, ...boardRef.current.items.map((entry) => entry.order)) + 1,
    };
    applyBoard((current) => ({ ...current, items: [...current.items, item] }));
    setSelectedId(item.id);
    setPanel(null);
  }

  function submitCustomColor(event: FormEvent) {
    event.preventDefault();
    const color = normalizeHexColor(customColor.hex);
    if (color === null) {
      setPanelError("Use a six-digit hex value such as #C85A3D.");
      return;
    }
    addSwatch(color, customColor.label);
  }

  function applyBackground() {
    if (backgroundConflict) {
      setPanelError("Close and reopen this panel before applying the latest background.");
      return;
    }
    const color = normalizeHexColor(backgroundDraft.hex);
    if (color === null) {
      setPanelError("Use a six-digit hex value such as #EDEDED.");
      return;
    }
    const background = color === DEFAULT_BOARD_BACKGROUND ? undefined : color;
    const backgroundMediaId = backgroundDraft.mediaId;
    applyBoard((current) => {
      if (current.background === background && current.backgroundMediaId === backgroundMediaId)
        return current;
      const next = { ...current };
      if (background === undefined) delete next.background;
      else next.background = background;
      if (backgroundMediaId === undefined) delete next.backgroundMediaId;
      else next.backgroundMediaId = backgroundMediaId;
      return next;
    });
    setBackgroundDraft({
      hex: color,
      lastValidHex: color,
      ...(backgroundMediaId === undefined ? {} : { mediaId: backgroundMediaId }),
    });
    backgroundDraftTouchedRef.current = false;
    setBackgroundConflict(false);
    setPanelError("");
    setBackgroundUploadError("");
    showToast(
      backgroundMediaId === undefined ? "Board background updated" : "Background image applied",
    );
  }

  function addSwatch(color: string, label?: string) {
    const normalizedColor = normalizeHexColor(color);
    if (normalizedColor === null) {
      setPanelError("Use a six-digit hex value such as #C85A3D.");
      return;
    }
    const normalizedLabel = label?.trim() || undefined;
    const editingId = panel?.type === "color" ? panel.itemId : undefined;
    if (editingId) {
      applyBoard((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === editingId
            ? { ...item, color: normalizedColor, label: normalizedLabel }
            : item,
        ),
      }));
      setPanel(null);
      return;
    }

    const point = screenToWorld(
      { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      cameraRef.current,
    );
    const item: BoardItem = {
      id: createId(),
      kind: "swatch",
      color: normalizedColor,
      label: normalizedLabel,
      x: point.x - 175,
      y: point.y - 225,
      width: 350,
      height: 450,
      rotation: 0,
      order: Math.max(0, ...boardRef.current.items.map((entry) => entry.order)) + 1,
    };
    applyBoard((current) => ({ ...current, items: [...current.items, item] }));
    setSelectedId(item.id);
    setPanel(null);
  }

  async function exportBoard() {
    const current = boardRef.current;
    const hasManagedMedia =
      current.backgroundMediaId !== undefined ||
      current.items.some((item) => item.mediaId !== undefined);
    if (localOnly && hasManagedMedia) {
      showToast("This guest board contains unsupported managed media and was not exported.");
      return;
    }
    archiveOperationRef.current?.abort();
    const controller = new AbortController();
    archiveOperationRef.current = controller;
    beginWorking();
    try {
      const blob = hasManagedMedia
        ? await createBoardArchive(current, cameraRef.current, {
            signal: controller.signal,
          })
        : new Blob(
            [
              JSON.stringify(
                { format: "moodboard", board: current, camera: cameraRef.current },
                null,
                2,
              ),
            ],
            { type: "application/json" },
          );
      if (controller.signal.aborted) return;
      if (!hasManagedMedia && blob.size > MAX_LEGACY_JSON_BYTES) {
        throw new Error(
          "This legacy JSON board is larger than 50 MB. Remove some embedded images first.",
        );
      }
      const slug =
        current.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "mood";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${slug}${hasManagedMedia ? ".moodboard" : ".moodboard.json"}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      showToast(hasManagedMedia ? "Portable board archive downloaded" : "Board file downloaded");
    } catch (error) {
      if (!controller.signal.aborted) {
        showToast(error instanceof Error ? error.message : "That board could not be exported.");
      }
    } finally {
      if (archiveOperationRef.current === controller) archiveOperationRef.current = null;
      endWorking();
    }
  }

  async function importBoard(file: File) {
    archiveOperationRef.current?.abort();
    const controller = new AbortController();
    archiveOperationRef.current = controller;
    beginWorking();
    try {
      const imported = await importBoardFile(file, {
        signal: controller.signal,
        ...(localOnly
          ? {
              upload: async () => {
                throw new Error(
                  "The guest demo imports JSON boards only. Sign in to import managed media archives.",
                );
              },
            }
          : {}),
      });
      if (controller.signal.aborted) return;
      const nextCamera = imported.camera ?? fitCamera(imported.board.items);
      setPersistenceEnabled(true);
      replaceDocument(imported.board, nextCamera);
      setPanel(null);
      showToast("Board imported");
    } catch (error) {
      if (!controller.signal.aborted) {
        showToast(error instanceof Error ? error.message : "That board could not be imported.");
      }
    } finally {
      if (archiveOperationRef.current === controller) archiveOperationRef.current = null;
      if (importInputRef.current) importInputRef.current.value = "";
      endWorking();
    }
  }

  function replaceBoard(next: Board) {
    replaceDocument(next, fitCamera(next.items));
    setPanel(null);
  }

  const selectedItem = board.items.find((item) => item.id === selectedId);
  const presentedBoardItem =
    presentedItem === null
      ? undefined
      : board.items.find((item) => item.id === presentedItem.itemId);
  const imageLinkItem =
    panel?.type === "imageLink"
      ? board.items.find((item) => item.id === panel.itemId && item.kind === "image")
      : undefined;
  const normalizedCustomColor = normalizeHexColor(customColor.hex);
  const customPreviewColor = normalizedCustomColor ?? customColor.lastValidHex;
  const normalizedBackgroundDraft = normalizeHexColor(backgroundDraft.hex);
  const savedBackground = board.background ?? DEFAULT_BOARD_BACKGROUND;
  const backgroundDirty =
    normalizedBackgroundDraft !== null &&
    (normalizedBackgroundDraft !== savedBackground ||
      backgroundDraft.mediaId !== board.backgroundMediaId);
  const effectiveBackground =
    panel?.type === "menu"
      ? (normalizedBackgroundDraft ?? backgroundDraft.lastValidHex)
      : savedBackground;
  const effectiveBackgroundMediaId =
    panel?.type === "menu" ? backgroundDraft.mediaId : board.backgroundMediaId;
  const fieldColors = accessibleFieldColors(effectiveBackground);
  const appStyle: AppStyle = {
    "--field": effectiveBackground,
    "--field-foreground": fieldColors.foreground,
    "--field-muted": fieldColors.muted,
    "--field-selection": fieldColors.selection,
  };
  const { canUndo, canRedo } = historyState;
  const detectedXInput =
    panel?.type === "url" || panel?.type === "x" ? parseXPostInput(panelDraft) : null;

  return (
    <main
      className={`app-shell${spacePressed ? " is-space-panning" : ""}${!editing ? " is-presenting" : ""}${shuffleAnimating ? " is-shuffling" : ""}${effectiveBackgroundMediaId === undefined ? "" : " has-background-image"}`}
      style={appStyle}
    >
      <div
        ref={viewportRef}
        className="canvas-viewport"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerEnd}
        onPointerCancel={handleCanvasPointerEnd}
        onDragEnter={(event) => {
          event.preventDefault();
          if (event.dataTransfer.types.includes("Files")) setDraggingFiles(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDraggingFiles(false);
        }}
        onDrop={handleDrop}
      >
        <CanvasBackground mediaId={effectiveBackgroundMediaId} />
        <div
          className="canvas-world"
          role={editing ? "group" : undefined}
          aria-label={editing ? "Mood board canvas items" : undefined}
          style={
            {
              transform: `scale(${camera.z}) translate3d(${camera.x}px, ${camera.y}px, 0)`,
              "--camera-zoom": camera.z,
            } as CSSProperties
          }
        >
          {board.items.map((item, index) => (
            <BoardItemView
              key={item.id}
              item={item}
              zoom={camera.z}
              selected={item.id === selectedId}
              editing={editing}
              spacePressed={spacePressed}
              entryDelay={180 + ((index * 83) % 520)}
              onSelect={setSelectedId}
              onMove={commitItemPosition}
              onResize={commitItemSize}
              onAutoResize={reconcileEmbeddedItemSize}
              onEdit={(entry) => selectPanel(editorPanelForItem(entry))}
              onDelete={removeItem}
              onReorder={reorderItem}
              onPresentItem={(entry, origin) => presentItem(entry.id, origin)}
              onInteractionStart={stopShuffleAnimation}
              playbackCoordinator={playbackCoordinatorRef.current}
            />
          ))}
        </div>

        {draggingFiles && (
          <div className="drop-surface">
            <div>Drop to place</div>
          </div>
        )}
      </div>

      {board.items.length === 0 && ready && (
        <div className="empty-state">
          <div className="empty-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <h1>Drop images anywhere</h1>
          <p>Add references, a few words, and the colors you keep coming back to.</p>
          <button
            type="button"
            className="text-button"
            disabled={working}
            onClick={openImagePicker}
          >
            {imageIntakeStatus || "Choose images"}
          </button>
        </div>
      )}

      {presentedBoardItem && presentedItem && (
        <PresentationItemViewer
          key={`${presentedBoardItem.id}:${presentedBoardItem.mediaId ?? presentedBoardItem.src ?? "item"}`}
          item={presentedBoardItem}
          origin={presentedItem.origin}
          onClose={() => setPresentedItem(null)}
        />
      )}

      {!ready && (
        <div
          className="loading-state"
          role="status"
          aria-live="polite"
          aria-label="Opening your mood board"
        >
          <span />
          <span />
          <span />
        </div>
      )}

      {(imageIntakeStatus || toast) && (
        <div className="toast" role="status" aria-live="polite">
          {imageIntakeStatus && <span className="toast-progress-dot" aria-hidden="true" />}
          {imageIntakeStatus || toast}
        </div>
      )}

      {editing && selectedItem && !panel && (
        <div className="selection-toolbar" aria-label="Selected item actions">
          {selectedItem.kind === "image" ? (
            <IconButton
              label={
                selectedItem.href ||
                selectedItem.annotationTitle ||
                selectedItem.annotationDescription
                  ? "Edit image details"
                  : "Add image details"
              }
              onClick={() => selectPanel({ type: "imageLink", itemId: selectedItem.id })}
            >
              <NotePencil size={17} />
            </IconButton>
          ) : (
            <IconButton
              label="Edit item"
              onClick={() => selectPanel(editorPanelForItem(selectedItem))}
            >
              <PencilSimple size={17} />
            </IconButton>
          )}
          <IconButton label="Send backward" onClick={() => reorderSelected("back")}>
            <ArrowDown size={17} />
          </IconButton>
          <IconButton label="Bring forward" onClick={() => reorderSelected("front")}>
            <ArrowUp size={17} />
          </IconButton>
          <IconButton label="Duplicate" onClick={duplicateSelected}>
            <Copy size={17} />
          </IconButton>
          <IconButton label="Delete" className="danger-button" onClick={removeSelected}>
            <Trash size={17} />
          </IconButton>
        </div>
      )}

      {panel && editing && (
        <section
          ref={composerRef}
          className={`composer composer--${panel.type}`}
          role="dialog"
          aria-modal="false"
          aria-label={`${panel.type} panel`}
        >
          <div className="composer-heading">
            <div>
              <span className="eyebrow">
                {panel.type === "menu" && "Moodboard"}
                {panel.type === "boards" && "Library"}
                {panel.type === "imageLink" && "Image details"}
                {panel.type === "audio" && "Sound reference"}
                {panel.type === "x" && "X reference"}
                {panel.type !== "menu" &&
                  panel.type !== "boards" &&
                  panel.type !== "imageLink" &&
                  panel.type !== "audio" &&
                  panel.type !== "x" &&
                  (localOnly && panel.type === "website" ? "Local link" : "Add to board")}
              </span>
              <h2>
                {panel.type === "menu" && "This board"}
                {panel.type === "boards" && "Your boards"}
                {panel.type === "images" && "Images from your device"}
                {panel.type === "url" && "Add a link"}
                {panel.type === "imageLink" &&
                  (imageLinkItem?.href ||
                  imageLinkItem?.annotationTitle ||
                  imageLinkItem?.annotationDescription
                    ? "Edit details"
                    : "Add details")}
                {panel.type === "audio" && (panel.itemId ? "Edit audio card" : "Add audio")}
                {panel.type === "website" &&
                  (localOnly
                    ? panel.itemId
                      ? "Edit website link"
                      : "Add website link"
                    : panel.itemId
                      ? "Refresh website card"
                      : "Add website")}
                {panel.type === "x" && "Edit X card"}
                {panel.type === "note" && (panel.itemId ? "Edit note" : "A few words")}
                {panel.type === "color" && (panel.itemId ? "Change color" : "Color study")}
              </h2>
            </div>
            <IconButton
              label="Close panel"
              onClick={() => {
                cancelBackgroundUpload();
                setPanel(null);
              }}
            >
              <X size={17} />
            </IconButton>
          </div>

          {panel.type === "menu" && (
            <div className="menu-panel-content">
              <MenuAccountIdentity
                user={localOnly ? undefined : session.data?.user}
                pending={localOnly ? false : session.isPending}
                error={localOnly ? false : session.error != null}
                returnTo={boardPath(DEFAULT_BOARD_ID)}
                onRetry={() => void session.refetch()}
              />
              <label className="field-block">
                <span>Board title</span>
                <input
                  value={panelDraft}
                  maxLength={120}
                  onChange={(event) => setPanelDraft(event.target.value)}
                  onBlur={() => {
                    const title = panelDraft.trim() || "Untitled mood";
                    if (title !== boardRef.current.title)
                      applyBoard((current) => ({ ...current, title }));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>
              <BoardBackgroundControl
                draft={backgroundDraft}
                normalizedHex={normalizedBackgroundDraft}
                effectiveHex={effectiveBackground}
                uploading={backgroundUploading}
                dirty={backgroundDirty && !backgroundConflict}
                error={
                  backgroundConflict
                    ? "The background changed on another client. Close and reopen this panel to use the latest version."
                    : backgroundUploadError || panelError
                }
                imageEnabled={!localOnly}
                onDraftChange={(nextDraft) => {
                  backgroundDraftTouchedRef.current = true;
                  setPanelError("");
                  setBackgroundUploadError("");
                  setBackgroundDraft(nextDraft);
                }}
                onChooseImage={(file) => void chooseBackgroundImage(file)}
                onRemoveImage={() => {
                  backgroundDraftTouchedRef.current = true;
                  setBackgroundUploadError("");
                  setBackgroundDraft((current) => {
                    const next = { ...current };
                    delete next.mediaId;
                    return next;
                  });
                }}
                onReset={() => {
                  backgroundDraftTouchedRef.current = true;
                  setPanelError("");
                  setBackgroundUploadError("");
                  setBackgroundDraft({
                    hex: DEFAULT_BOARD_BACKGROUND,
                    lastValidHex: DEFAULT_BOARD_BACKGROUND,
                  });
                }}
                onApply={applyBackground}
              />
              <div className="save-line" role="status" aria-live="polite">
                <span className={`save-dot save-dot--${saveState}`} />
                {saveState === "saved" && localOnly && "Saved in this browser"}
                {saveState === "saved" &&
                  !localOnly &&
                  syncState === "live" &&
                  "Saved locally · Live sync"}
                {saveState === "saved" &&
                  !localOnly &&
                  syncState === "connecting" &&
                  "Saved locally · Connecting…"}
                {saveState === "saved" &&
                  !localOnly &&
                  syncState === "local" &&
                  "Saved locally · Reconnecting…"}
                {saveState === "saved" && syncState === "error" && "Saved locally · Cloud pending"}
                {saveState === "saving" && "Saving locally…"}
                {saveState === "error" && "Could not save locally"}
              </div>
              <div className="mobile-menu-tools" aria-label="Mobile board tools">
                <button type="button" onClick={() => selectPanel({ type: "url" })}>
                  <LinkSimple size={18} />
                  <span>Link</span>
                </button>
                <button type="button" onClick={() => selectPanel({ type: "color" })}>
                  <Palette size={18} />
                  <span>Color</span>
                </button>
                <button type="button" disabled={!canUndo} onClick={undo}>
                  <ArrowUUpLeft size={18} />
                  <span>Undo</span>
                </button>
                <button type="button" disabled={!canRedo} onClick={redo}>
                  <ArrowUDownLeft size={18} />
                  <span>Redo</span>
                </button>
              </div>
              <div className="menu-actions">
                <button
                  type="button"
                  className="action-row"
                  disabled={working || board.items.length < 2}
                  onClick={shuffleBoard}
                >
                  <Shuffle size={18} />
                  <span>
                    <strong>Shuffle board</strong>
                    <small>Try a new arrangement; undo whenever you want</small>
                  </span>
                </button>
                <Link className="action-row" to="/">
                  <HouseSimple size={18} />
                  <span>
                    <strong>Return home</strong>
                    <small>About this project and your board library</small>
                  </span>
                </Link>
                {!localOnly && (
                  <button
                    type="button"
                    className="action-row"
                    disabled={working}
                    onClick={() => selectPanel({ type: "boards" })}
                  >
                    <SquaresFour size={18} />
                    <span>
                      <strong>Open board library</strong>
                      <small>Create, switch, duplicate, or delete</small>
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  className="action-row"
                  onClick={() => selectPanel({ type: "url" })}
                >
                  <LinkSimple size={18} />
                  <span>
                    <strong>Add a link</strong>
                    <small>
                      Images, Instagram, X posts, embed code, and websites are recognized
                      automatically
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className="action-row"
                  onClick={() => selectPanel({ type: "audio" })}
                >
                  <SpeakerHigh size={18} />
                  <span>
                    <strong>Add audio, Spotify, or YouTube</strong>
                    <small>
                      {localOnly
                        ? "Paste a hosted audio or supported player link"
                        : "Upload a file or paste a supported player link"}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className="action-row"
                  disabled={working}
                  onClick={() => selectPanel({ type: "images" })}
                >
                  <ImageSquare size={18} />
                  <span>
                    <strong>Add images</strong>
                    <small>Add one directly or review a group</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="action-row"
                  disabled={working}
                  onClick={() => void exportBoard()}
                >
                  <DownloadSimple size={18} />
                  <span>
                    <strong>Download portable board</strong>
                    <small>
                      {localOnly
                        ? "Keep a backup before clearing this browser"
                        : "Managed images and audio travel in a .moodboard archive"}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className="action-row"
                  onClick={() => importInputRef.current?.click()}
                >
                  <FileArrowUp size={18} />
                  <span>
                    <strong>Import board file</strong>
                    <small>
                      {localOnly
                        ? "Open a JSON board saved without managed media"
                        : "Open a .moodboard archive or legacy JSON file"}
                    </small>
                  </span>
                </button>
              </div>
              <div className="menu-footer-actions">
                <button type="button" onClick={() => replaceBoard(createEmptyBoard())}>
                  Clear this board
                </button>
                <button type="button" onClick={() => replaceBoard(createDemoBoard())}>
                  Restore sample
                </button>
              </div>
              <p className="local-note">
                {localOnly
                  ? "This guest board stays only in this browser. Download it before clearing site data, or sign in for a persistent private workspace."
                  : "The board is backed up in this browser and syncs live through your private workspace."}
              </p>
              {!localOnly && session.data?.user !== undefined && (
                <div className="menu-sign-out">
                  <button type="button" disabled={signingOut} onClick={() => void signOutAccount()}>
                    <SignOut size={16} />
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                  {signOutError && <p role="alert">{signOutError}</p>}
                </div>
              )}
            </div>
          )}

          {panel.type === "boards" && (
            <div className="board-library">
              <form
                className="board-create-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createNewBoard();
                }}
              >
                <label className="field-block">
                  <span>New board</span>
                  <input
                    value={panelDraft}
                    maxLength={120}
                    placeholder="Trip to Kyoto"
                    onChange={(event) => setPanelDraft(event.target.value)}
                  />
                </label>
                <button type="submit" aria-label="Create board" disabled={working}>
                  <Plus size={18} />
                </button>
              </form>

              <div className="board-list" aria-label="Boards">
                {catalogLoading && boardSummaries.length === 0 && (
                  <p className="board-list-status">Loading boards…</p>
                )}
                {!catalogLoading && boardSummaries.length === 0 && (
                  <p className="board-list-status">No boards found.</p>
                )}
                {boardSummaries.map((summary) => (
                  <div
                    key={summary.id}
                    className={`board-list-row${summary.id === boardId ? " is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className="board-list-open"
                      aria-current={summary.id === boardId ? "page" : undefined}
                      disabled={working}
                      onClick={() => onNavigate(summary.id)}
                    >
                      <strong>{summary.title || "Untitled mood"}</strong>
                      <small>
                        {summary.itemCount} {summary.itemCount === 1 ? "item" : "items"}
                        <span aria-hidden="true"> · </span>
                        {new Date(summary.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </small>
                    </button>
                    <div className="board-list-actions">
                      <IconButton
                        label={`Duplicate ${summary.title}`}
                        disabled={working}
                        onClick={() => void duplicateBoard(summary)}
                      >
                        <Copy size={16} />
                      </IconButton>
                      <IconButton
                        label={
                          summary.id === DEFAULT_BOARD_ID
                            ? "The default board cannot be deleted"
                            : `Delete ${summary.title}`
                        }
                        className="danger-button"
                        disabled={working || summary.id === DEFAULT_BOARD_ID}
                        onClick={() => void deleteBoard(summary)}
                      >
                        <Trash size={16} />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
              <p className="local-note">
                Each board keeps its own local backup, camera position, and offline edit queue.
              </p>
            </div>
          )}

          {panel.type === "images" && (
            <div className="image-source-panel">
              <button
                type="button"
                className="action-row"
                data-initial-focus
                disabled={working}
                onClick={openImagePicker}
              >
                <ImageSquare size={18} />
                <span>
                  <strong>Choose images</strong>
                  <small>One adds immediately; multiple open review</small>
                </span>
              </button>
              <button type="button" className="action-row" onClick={openFolderPicker}>
                <FolderOpen size={18} />
                <span>
                  <strong>Choose a folder</strong>
                  <small>Pick what to keep before placing anything</small>
                </span>
              </button>
              <p className="local-note">
                JPEG, PNG, GIF, WebP, and iPhone HEIC photos stay local while they are checked and
                compressed.
              </p>
            </div>
          )}

          {panel.type === "url" && (
            <form onSubmit={(event) => void submitLink(event)}>
              <label className="field-block">
                <span>URL or X embed code</span>
                <textarea
                  autoFocus
                  inputMode="url"
                  autoComplete="url"
                  rows={5}
                  maxLength={MAX_X_POST_INPUT_CHARACTERS}
                  placeholder="https://… or paste official X embed code"
                  value={panelDraft}
                  onChange={(event) => {
                    const value = event.target.value;
                    const parsed = parseXPostInput(value);
                    setPanelDraft(value);
                    if (parsed !== null) setXDisplay(parsed.display);
                    setPanelError("");
                  }}
                />
                <small>
                  Images, Instagram, X posts, and websites are recognized. X embed HTML is parsed,
                  never stored or executed.
                </small>
              </label>
              {detectedXInput !== null && (
                <div className="x-card-options" aria-label="X card options">
                  <div className="x-detected">
                    <XLogo size={16} weight="bold" />
                    {detectedXInput.fromEmbedCode
                      ? detectedXInput.display === "media"
                        ? "X video/media embed detected"
                        : "X post embed detected"
                      : "X post URL detected"}
                  </div>
                  <small className="x-detection-note">
                    {detectedXInput.fromEmbedCode
                      ? "The official embed code determines the card format. Viewing it contacts X and shares viewer IP/browser information."
                      : "X URLs use the complete post format. Viewing it contacts X and shares viewer IP/browser information."}
                  </small>
                  <label className="field-block">
                    <span>Theme</span>
                    <select
                      value={xTheme}
                      onChange={(event) => setXTheme(event.target.value as XPostTheme)}
                    >
                      <option value="automatic">Automatic</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>
                </div>
              )}
              {panelError && (
                <p className="field-error" role="alert">
                  {panelError}
                </p>
              )}
              <button className="primary-button" disabled={working} type="submit">
                {working ? "Reading link…" : detectedXInput ? "Add X card" : "Add link"}
              </button>
            </form>
          )}

          {panel.type === "website" && (
            <form onSubmit={(event) => void submitWebsite(event)}>
              <label className="field-block">
                <span>Website URL</span>
                <input
                  autoFocus
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  maxLength={MAX_WEBSITE_URL_CHARACTERS}
                  placeholder="https://…"
                  value={panelDraft}
                  onChange={(event) => {
                    setPanelDraft(event.target.value);
                    setPanelError("");
                  }}
                />
                <small>
                  {localOnly
                    ? "The demo saves a simple hostname card without contacting the preview server."
                    : "We’ll save the site’s preview image and text, not a live webpage."}
                </small>
              </label>
              {panelError && (
                <p className="field-error" role="alert">
                  {panelError}
                </p>
              )}
              <button className="primary-button" disabled={working} type="submit">
                {working
                  ? "Reading website…"
                  : localOnly
                    ? panel.itemId
                      ? "Update website link"
                      : "Add website link"
                    : panel.itemId
                      ? "Refresh website card"
                      : "Add website card"}
              </button>
            </form>
          )}

          {panel.type === "x" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setPanelError("");
                const parsed = parseXPostInput(panelDraft);
                if (parsed === null) {
                  setPanelError("Use an X or Twitter status URL, or official post embed code.");
                  return;
                }
                void saveXPost(parsed, panel.itemId);
              }}
            >
              <label className="field-block">
                <span>X URL or official embed code</span>
                <textarea
                  autoFocus
                  rows={4}
                  maxLength={MAX_X_POST_INPUT_CHARACTERS}
                  value={panelDraft}
                  onChange={(event) => {
                    const value = event.target.value;
                    const parsed = parseXPostInput(value);
                    setPanelDraft(value);
                    if (parsed !== null) setXDisplay(parsed.display);
                    setPanelError("");
                  }}
                />
              </label>
              <div className="x-card-options" aria-label="X card options">
                <div className="x-detected">
                  <XLogo size={16} weight="bold" />
                  {xDisplay === "media" ? "Video/media embed" : "Complete post"}
                </div>
                <small className="x-detection-note">
                  Paste official embed code to change the saved format.
                </small>
                <label className="field-block">
                  <span>Theme</span>
                  <select
                    value={xTheme}
                    onChange={(event) => setXTheme(event.target.value as XPostTheme)}
                  >
                    <option value="automatic">Automatic</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
              </div>
              <small className="x-editor-note">
                {localOnly
                  ? "The demo keeps the X source locally. The official widget loads for viewers and contacts X."
                  : "Saving refreshes the safe author/text snapshot when the server is available. X’s official widget loads automatically for viewers; pasted embed HTML is never stored."}
              </small>
              {panelError && (
                <p className="field-error" role="alert">
                  {panelError}
                </p>
              )}
              <button className="primary-button" disabled={working} type="submit">
                {localOnly
                  ? "Save X card locally"
                  : working
                    ? "Refreshing X post…"
                    : "Save and refresh"}
              </button>
            </form>
          )}

          {panel.type === "audio" && (
            <form onSubmit={submitAudio}>
              <label className="field-block">
                <span>Spotify, YouTube, or hosted audio URL</span>
                <input
                  autoFocus
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  maxLength={MAX_AUDIO_SOURCE_CHARACTERS}
                  placeholder="https://…"
                  value={panelDraft}
                  onChange={(event) => {
                    setPanelDraft(event.target.value);
                    setPanelError("");
                  }}
                />
                <small>
                  Spotify and YouTube players load automatically for viewers and contact their
                  provider. Direct audio must use a playable hosted HTTPS file URL.
                </small>
              </label>
              <label className="field-block audio-label-field">
                <span>
                  Label <small>Optional</small>
                </span>
                <input
                  type="text"
                  maxLength={120}
                  placeholder="Night train field recording"
                  value={audioLabel}
                  onChange={(event) => setAudioLabel(event.target.value)}
                />
              </label>
              {!localOnly && (
                <div className="audio-upload-note">
                  <span>Or keep the sound with this board.</span>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={working}
                    onClick={() => audioInputRef.current?.click()}
                  >
                    {working ? "Uploading audio…" : "Choose local audio"}
                  </button>
                  <small>MP3, M4A, WAV, Ogg, or WebM · up to 25 MB</small>
                </div>
              )}
              {localOnly && (
                <small className="local-demo-help">
                  Hosted audio, Spotify, and YouTube work in the demo. Sign in to upload audio
                  files.
                </small>
              )}
              {panelError && (
                <p className="field-error" role="alert">
                  {panelError}
                </p>
              )}
              <button className="primary-button" disabled={working} type="submit">
                {panel.itemId ? "Save URL source" : "Add URL source"}
              </button>
            </form>
          )}

          {panel.type === "imageLink" && (
            <form className="annotation-form" onSubmit={submitImageLink}>
              <p className="annotation-form-intro">
                These details appear when the image is hovered or focused in present mode.
              </p>
              <label className="field-block">
                <span>Title</span>
                <input
                  autoFocus
                  maxLength={MAX_IMAGE_ANNOTATION_TITLE_CHARACTERS}
                  placeholder="Waxed field jacket"
                  value={annotationTitle}
                  onChange={(event) => setAnnotationTitle(event.target.value)}
                />
              </label>
              <label className="field-block">
                <span>Description</span>
                <textarea
                  rows={4}
                  maxLength={MAX_IMAGE_ANNOTATION_DESCRIPTION_CHARACTERS}
                  placeholder="Why it belongs here, where it came from, or anything worth remembering…"
                  value={annotationDescription}
                  onChange={(event) => setAnnotationDescription(event.target.value)}
                />
              </label>
              <label className="field-block">
                <span>
                  URL <small>Optional</small>
                </span>
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  maxLength={MAX_IMAGE_LINK_CHARACTERS}
                  placeholder="https://…"
                  value={panelDraft}
                  onChange={(event) => {
                    setPanelDraft(event.target.value);
                    setPanelError("");
                  }}
                />
                <small>Use a product page, source, booking, or related link.</small>
              </label>
              {panelError && (
                <p className="field-error" role="alert">
                  {panelError}
                </p>
              )}
              <button className="primary-button" type="submit">
                Save details
              </button>
              {(imageLinkItem?.href ||
                imageLinkItem?.annotationTitle ||
                imageLinkItem?.annotationDescription) && (
                <div className="image-link-actions">
                  {imageLinkItem.href && (
                    <button type="button" className="text-button" onClick={copyImageLink}>
                      Copy URL
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-button danger-button"
                    onClick={removeImageLink}
                  >
                    Remove details
                  </button>
                </div>
              )}
            </form>
          )}

          {panel.type === "note" && (
            <form onSubmit={submitNote}>
              <label className="field-block">
                <span>Note</span>
                <textarea
                  autoFocus
                  maxLength={220}
                  rows={4}
                  placeholder="A feeling, a material, a line to remember…"
                  value={panelDraft}
                  onChange={(event) => setPanelDraft(event.target.value)}
                />
              </label>
              {panelError && (
                <p className="field-error" role="alert">
                  {panelError}
                </p>
              )}
              <button className="primary-button" type="submit">
                {panel.itemId ? "Save note" : "Add note"}
              </button>
            </form>
          )}

          {panel.type === "color" && (
            <div className="color-panel-content">
              <div className="color-grid" aria-label="Curated colors">
                {SWATCHES.map((swatch) => (
                  <button
                    key={swatch.color}
                    type="button"
                    aria-label={`Use ${swatch.label}, ${swatch.color.toUpperCase()}`}
                    onClick={() => addSwatch(swatch.color, swatch.label)}
                  >
                    <span style={{ backgroundColor: swatch.color }} />
                    <small>{swatch.label}</small>
                  </button>
                ))}
              </div>

              <form className="custom-color-form" onSubmit={submitCustomColor}>
                <div className="custom-color-heading">
                  <span>Custom color</span>
                  <small>Choose visually or enter an exact six-digit value.</small>
                </div>
                <div className="custom-color-controls">
                  <label className="field-block color-picker-field">
                    <span>Visual picker</span>
                    <input
                      type="color"
                      value={customPreviewColor}
                      aria-label={`Choose a custom color. Current value ${customPreviewColor}`}
                      onChange={(event) => {
                        setPanelError("");
                        const hex = event.target.value.toUpperCase();
                        setCustomColor((current) => ({
                          ...current,
                          hex,
                          lastValidHex: hex,
                        }));
                      }}
                    />
                  </label>
                  <label className="field-block">
                    <span>Hex value</span>
                    <input
                      type="text"
                      inputMode="text"
                      data-initial-focus
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={7}
                      placeholder="#C85A3D"
                      value={customColor.hex}
                      aria-invalid={normalizedCustomColor === null}
                      aria-describedby="custom-color-help"
                      onChange={(event) => {
                        setPanelError("");
                        const hex = formatHexColorInput(event.target.value);
                        const validHex = normalizeHexColor(hex);
                        setCustomColor((current) => ({
                          ...current,
                          hex,
                          lastValidHex: validHex ?? current.lastValidHex,
                        }));
                      }}
                    />
                    <small id="custom-color-help">Format: #RRGGBB</small>
                  </label>
                </div>
                <label className="field-block">
                  <span>
                    Label <small>Optional</small>
                  </span>
                  <input
                    type="text"
                    maxLength={120}
                    placeholder={normalizedCustomColor ?? "Optional name"}
                    value={customColor.label}
                    onChange={(event) =>
                      setCustomColor((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </label>
                <div
                  className="custom-color-preview"
                  role="img"
                  aria-label={
                    normalizedCustomColor === null
                      ? `Custom color preview remains ${customPreviewColor}. ${customColor.hex || "Empty value"} is incomplete or invalid.`
                      : `Custom color preview: ${customColor.label.trim() || customPreviewColor}, ${customPreviewColor}`
                  }
                >
                  <span
                    className="custom-color-preview-chip"
                    style={{ backgroundColor: customPreviewColor }}
                  />
                  <span>
                    <strong>
                      {customColor.label.trim() || normalizedCustomColor || "Incomplete hex value"}
                    </strong>
                    <small>
                      {normalizedCustomColor ?? `${customColor.hex || "Empty value"} · not saved`}
                    </small>
                  </span>
                </div>
                {normalizedCustomColor === null && (
                  <p className="field-error" role="alert">
                    Use six digits, for example #C85A3D.
                  </p>
                )}
                {panelError && (
                  <p className="field-error" role="alert">
                    {panelError}
                  </p>
                )}
                <button
                  className="primary-button"
                  type="submit"
                  disabled={normalizedCustomColor === null}
                >
                  {panel.itemId ? "Save custom color" : "Add custom color"}
                </button>
              </form>
            </div>
          )}
        </section>
      )}

      <header className={`bottom-dock${editing ? "" : " bottom-dock--present"}`}>
        <IconButton
          label={editing ? "Board menu" : "Edit board"}
          onClick={() => {
            if (editing) selectPanel({ type: "menu" });
            else {
              setPresentedItem(null);
              setEditing(true);
            }
          }}
        >
          <span className="brand-dot" />
        </IconButton>

        {editing ? (
          <>
            {!localOnly && (
              <>
                <IconButton
                  label="All boards"
                  disabled={working}
                  onClick={() => selectPanel({ type: "boards" })}
                >
                  <SquaresFour size={18} />
                </IconButton>
                <span className="dock-separator" />
              </>
            )}
            <IconButton
              label="Add images"
              disabled={working}
              onClick={() => selectPanel({ type: "images" })}
            >
              <ImageSquare size={18} />
            </IconButton>
            <IconButton label="Add link" onClick={() => selectPanel({ type: "url" })}>
              <LinkSimple size={18} />
            </IconButton>
            <IconButton
              label="Add audio"
              className="mobile-optional"
              onClick={() => selectPanel({ type: "audio" })}
            >
              <SpeakerHigh size={18} />
            </IconButton>
            <IconButton label="Add note" onClick={() => selectPanel({ type: "note" })}>
              <NotePencil size={18} />
            </IconButton>
            <IconButton
              label="Add color"
              className="mobile-optional"
              onClick={() => selectPanel({ type: "color" })}
            >
              <Palette size={18} />
            </IconButton>
            <span className="dock-separator mobile-optional" />
            <IconButton label="Undo" className="mobile-optional" disabled={!canUndo} onClick={undo}>
              <ArrowUUpLeft size={18} />
            </IconButton>
            <IconButton label="Redo" className="mobile-optional" disabled={!canRedo} onClick={redo}>
              <ArrowUDownLeft size={18} />
            </IconButton>
            <IconButton
              label="Shuffle board"
              className="mobile-optional"
              disabled={working || board.items.length < 2}
              onClick={shuffleBoard}
            >
              <Shuffle size={18} />
            </IconButton>
            <span className="dock-separator" />
            <IconButton
              label="Zoom out"
              className="mobile-optional"
              onClick={() => zoomAtCenter(1 / 1.2)}
            >
              <Minus size={18} />
            </IconButton>
            <IconButton label="Zoom in" onClick={() => zoomAtCenter(1.2)}>
              <Plus size={18} />
            </IconButton>
            <IconButton label="Fit board" className="mobile-optional" onClick={fitToBoard}>
              <FrameCorners size={18} />
            </IconButton>
            <span className="dock-separator" />
            <IconButton
              label="Present board"
              onClick={() => {
                setEditing(false);
                setSelectedId(null);
                setPanel(null);
              }}
            >
              <Eye size={18} />
            </IconButton>
          </>
        ) : (
          <div className="present-zoom-controls">
            <IconButton label="Zoom in" onClick={() => zoomAtCenter(1.2)}>
              <Plus size={17} />
            </IconButton>
            <IconButton label="Zoom out" onClick={() => zoomAtCenter(1 / 1.2)}>
              <Minus size={17} />
            </IconButton>
          </div>
        )}
      </header>

      {collectingDrop && (
        <div className="bulk-collector-backdrop">
          <div
            className="bulk-collector-status"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-collector-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelDropCollection();
              }
            }}
          >
            <FolderOpen size={24} weight="light" />
            <div>
              <strong id="bulk-collector-title">Reading image folder</strong>
              <span>Collecting up to 150 files locally.</span>
            </div>
            <button type="button" autoFocus onClick={cancelDropCollection}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {working && bulkSession === null && !collectingDrop && (
        <div className="working-indicator" role="status" aria-live="polite" aria-label="Working" />
      )}

      {bulkSession && (
        <Suspense
          fallback={
            <div className="bulk-collector-backdrop" role="status" aria-live="polite">
              <div className="bulk-collector-status">
                <ImageSquare size={24} weight="light" />
                <div>
                  <strong>Preparing image staging…</strong>
                </div>
              </div>
            </div>
          }
        >
          <BulkImageStager
            initialFiles={bulkSession.files}
            localOnly={localOnly}
            initialOmitted={bulkSession.omitted}
            initialTruncated={bulkSession.truncated}
            initialFailures={bulkSession.failures}
            maxItems={Math.max(0, MAX_REMOTE_ITEMS - board.items.length)}
            onClose={closeBulkStaging}
            onCommit={commitBulkImages}
          />
        </Suspense>
      )}

      <input
        ref={imageInputRef}
        className="visually-hidden"
        type="file"
        accept={IMAGE_FILE_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        disabled={working}
        multiple
        onChange={(event) => {
          const folder = imageSelectionFolderRef.current;
          const files = Array.from(event.currentTarget.files ?? []);
          imageSelectionFolderRef.current = false;
          event.currentTarget.removeAttribute("webkitdirectory");
          event.currentTarget.value = "";
          addImageSelection(files, { folder });
        }}
      />
      {!localOnly && (
        <input
          ref={audioInputRef}
          className="visually-hidden"
          type="file"
          accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg,.webm"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void addLocalAudio(file);
          }}
        />
      )}
      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        accept={
          localOnly
            ? ".moodboard.json,.json,application/json"
            : ".moodboard,.moodboard.json,.json,application/json,application/zip,application/vnd.moodboard+zip"
        }
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importBoard(file);
        }}
      />
    </main>
  );
}

export default function BoardEditor({
  accountId,
  boardId = DEFAULT_BOARD_ID,
  localOnly = false,
}: {
  readonly accountId: AccountId;
  readonly boardId?: BoardId;
  readonly localOnly?: boolean;
}) {
  const navigateRoute = useNavigate();
  const navigationBlocked = useRef(false);

  useBlocker({
    shouldBlockFn: () => navigationBlocked.current,
    enableBeforeUnload: () => navigationBlocked.current,
    disabled: localOnly,
  });

  const navigate = useCallback(
    (nextBoardId: BoardId, replace = false, force = false) => {
      if (localOnly || (navigationBlocked.current && !force)) return;
      if (force) navigationBlocked.current = false;
      void navigateRoute({
        to: "/boards/$boardId",
        params: { boardId: nextBoardId },
        replace,
      });
    },
    [localOnly, navigateRoute],
  );

  return (
    <BoardWorkspace
      key={boardId}
      accountId={accountId}
      boardId={boardId}
      onNavigate={navigate}
      localOnly={localOnly}
      onWorkingChange={(sourceBoardId, working) => {
        if (sourceBoardId === boardId) navigationBlocked.current = working;
      }}
    />
  );
}
