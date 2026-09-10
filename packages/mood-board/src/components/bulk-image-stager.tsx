import { FolderOpen, ImageSquare, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { blobToDataUrl, ingestImageFile, inspectImageFile } from "../client/board/board-utils";
import {
  BULK_CONCURRENCY,
  type BulkImageEntry,
  type BulkLayoutKind,
  type BulkSort,
  MAX_BULK_FILES,
  type PreparedBulkImage,
  runBoundedWorkers,
  selectedBulkTotals,
  sortBulkEntries,
  stageBulkFiles,
  toggleBulkSelection,
  type TraversalFailure,
} from "../client/board/bulk-image-import";
import { uploadMedia } from "../client/media-client";
import { IMAGE_FILE_ACCEPT } from "../client/media/image-preflight";

type Props = {
  readonly initialFiles: ReadonlyArray<File>;
  readonly initialOmitted: number;
  readonly initialTruncated: boolean;
  readonly initialFailures: ReadonlyArray<TraversalFailure>;
  readonly maxItems: number;
  readonly localOnly?: boolean;
  readonly onClose: () => void;
  readonly onCommit: (
    images: ReadonlyArray<PreparedBulkImage>,
    layout: BulkLayoutKind,
  ) => string | null;
};

type Phase = "staging" | "processing" | "done";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "This image could not be uploaded.";

export function BulkImageStager({
  initialFiles,
  initialOmitted,
  initialTruncated,
  initialFailures,
  maxItems,
  localOnly = false,
  onClose,
  onCommit,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const entriesRef = useRef<ReadonlyArray<BulkImageEntry>>([]);
  const inspectionControllerRef = useRef(new AbortController());
  const processingControllerRef = useRef<AbortController | null>(null);
  const inspectionGenerationRef = useRef(0);
  const generationRef = useRef(0);
  const initializedRef = useRef(false);
  const preparedRef = useRef(new Map<string, PreparedBulkImage>());
  const restoreFocusRef = useRef(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  const [entries, setEntries] = useState<ReadonlyArray<BulkImageEntry>>([]);
  const [omitted, setOmitted] = useState(initialOmitted);
  const [truncated] = useState(initialTruncated);
  const [sort, setSort] = useState<BulkSort>("original");
  const [layout, setLayout] = useState<BulkLayoutKind>("loose");
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("staging");
  const [inspectionProgress, setInspectionProgress] = useState({ completed: 0, total: 0 });
  const [processingProgress, setProcessingProgress] = useState({ completed: 0, total: 0 });
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const inspectEntries = useCallback((created: ReadonlyArray<BulkImageEntry>) => {
    const signal = inspectionControllerRef.current.signal;
    const generation = inspectionGenerationRef.current;
    setInspectionProgress((progress) => ({
      completed: progress.completed,
      total: progress.total + created.length,
    }));
    void runBoundedWorkers(created, (entry) => inspectImageFile(entry.file, signal), {
      concurrency: BULK_CONCURRENCY,
      signal,
      onSettled: (index, result) => {
        if (signal.aborted || generation !== inspectionGenerationRef.current) return;
        setInspectionProgress((progress) => ({
          ...progress,
          completed: Math.min(progress.total, progress.completed + 1),
        }));
        const target = created[index];
        if (!target) return;
        setEntries((current) =>
          current.map((entry) => {
            if (entry.id !== target.id) return entry;
            if (!result.ok) {
              return {
                ...entry,
                selected: false,
                status: "failed",
                error: errorMessage(result.error),
              };
            }
            return {
              ...entry,
              width: result.value.width,
              height: result.value.height,
              captureTime: result.value.captureTime,
              previewUrl: result.value.thumbnailSrc,
              status: "ready",
              error: undefined,
            };
          }),
        );
      },
    });
  }, []);

  const appendFiles = useCallback(
    (files: ReadonlyArray<File>) => {
      if (files.length === 0 || phase !== "staging") return;
      const current = entriesRef.current;
      const capacity = Math.max(0, MAX_BULK_FILES - current.length);
      const staged = stageBulkFiles(files, current.length, capacity);
      setOmitted((value) => value + staged.omitted);
      if (staged.entries.length === 0) return;
      const next = [...current, ...staged.entries];
      entriesRef.current = next;
      setEntries(next);
      inspectEntries(staged.entries);
    },
    [inspectEntries, phase],
  );

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    appendFiles(initialFiles);
  }, [appendFiles, initialFiles]);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    const inspectionController = inspectionControllerRef.current;
    const restoreFocus = restoreFocusRef.current;
    dialog?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => {
      inspectionGenerationRef.current += 1;
      inspectionController.abort();
      processingControllerRef.current?.abort();
      restoreFocus?.focus();
    };
  }, []);

  const displayed = useMemo(() => sortBulkEntries(entries, sort), [entries, sort]);
  const displayedIds = useMemo(() => displayed.map((entry) => entry.id), [displayed]);
  const navigableIds = useMemo(
    () =>
      displayed
        .filter((entry) => entry.status !== "failed" && entry.status !== "added")
        .map((entry) => entry.id),
    [displayed],
  );
  const totals = useMemo(() => selectedBulkTotals(entries), [entries]);
  const checking = entries.some((entry) => entry.status === "checking");
  const failedCount = entries.filter((entry) => entry.status === "failed").length;
  const readySelected = displayed.filter((entry) => entry.selected && entry.status === "ready");
  const largeSelectionWarning =
    totals.count >= 75 || totals.bytes > 200 * 1024 * 1024
      ? "Large selection: preparation and upload may take a while; selected files must still fit the board limit."
      : "";
  const itemCapacityError =
    readySelected.length > maxItems
      ? `This board has room for ${Math.max(0, maxItems)} more ${maxItems === 1 ? "item" : "items"}. Select fewer images.`
      : "";

  const close = () => {
    generationRef.current += 1;
    inspectionGenerationRef.current += 1;
    inspectionControllerRef.current.abort();
    processingControllerRef.current?.abort();
    onClose();
  };

  const cancelProcessing = () => {
    generationRef.current += 1;
    processingControllerRef.current?.abort();
    processingControllerRef.current = null;
    setEntries((current) =>
      current.map((entry) =>
        entry.status === "processing" || entry.status === "prepared"
          ? { ...entry, status: "ready" }
          : entry,
      ),
    );
    setPhase("staging");
    setSessionError("Upload cancelled. Nothing was added.");
  };

  const processSelected = async () => {
    if (checking || readySelected.length === 0 || phase !== "staging") return;
    setSessionError("");
    if (itemCapacityError) {
      setSessionError(itemCapacityError);
      return;
    }
    setPhase("processing");
    setProcessingProgress({ completed: 0, total: readySelected.length });
    const generation = ++generationRef.current;
    const controller = new AbortController();
    processingControllerRef.current = controller;
    const selected = readySelected;
    setEntries((current) =>
      current.map((entry) =>
        selected.some((candidate) => candidate.id === entry.id)
          ? { ...entry, status: "processing", error: undefined }
          : entry,
      ),
    );

    const results = await runBoundedWorkers(
      selected,
      async (entry) => {
        const cached = preparedRef.current.get(entry.id);
        if (cached) return cached;
        const image = await ingestImageFile(entry.file, controller.signal);
        const source = localOnly
          ? { src: await blobToDataUrl(image.blob, controller.signal) }
          : { mediaId: (await uploadMedia(image.blob, "image", controller.signal)).mediaId };
        const prepared = {
          entryId: entry.id,
          ...source,
          width: image.width,
          height: image.height,
        } satisfies PreparedBulkImage;
        preparedRef.current.set(entry.id, prepared);
        return prepared;
      },
      {
        concurrency: BULK_CONCURRENCY,
        signal: controller.signal,
        onSettled: (index, result) => {
          if (controller.signal.aborted || generation !== generationRef.current) return;
          setProcessingProgress((progress) => ({
            ...progress,
            completed: Math.min(progress.total, progress.completed + 1),
          }));
          const target = selected[index];
          if (!target) return;
          setEntries((current) =>
            current.map((entry) => {
              if (entry.id !== target.id) return entry;
              return result.ok
                ? { ...entry, status: "prepared", error: undefined }
                : {
                    ...entry,
                    selected: false,
                    status: "failed",
                    error: errorMessage(result.error),
                  };
            }),
          );
        },
      },
    );

    if (controller.signal.aborted || generation !== generationRef.current) return;
    processingControllerRef.current = null;
    const successful: PreparedBulkImage[] = [];
    const failed = new Map<string, string>();
    results.forEach((result, index) => {
      const entry = selected[index];
      if (!entry || !result) return;
      if (result.ok) successful.push(result.value);
      else failed.set(entry.id, errorMessage(result.error));
    });

    if (successful.length === 0) {
      setEntries((current) =>
        current.map((entry) =>
          failed.has(entry.id)
            ? { ...entry, selected: false, status: "failed", error: failed.get(entry.id) }
            : entry.status === "processing"
              ? { ...entry, status: "ready" }
              : entry,
        ),
      );
      setPhase("staging");
      setSessionError("None of the selected images could be uploaded.");
      return;
    }

    const commitError = onCommit(successful, layout);
    if (commitError !== null) {
      setEntries((current) =>
        current.map((entry) => {
          if (failed.has(entry.id)) {
            return {
              ...entry,
              selected: false,
              status: "failed",
              error: failed.get(entry.id),
            };
          }
          return entry.status === "processing" || entry.status === "prepared"
            ? { ...entry, status: "ready" }
            : entry;
        }),
      );
      setPhase("staging");
      setSessionError(
        failed.size > 0
          ? `${commitError} ${failed.size} selected ${failed.size === 1 ? "file also failed" : "files also failed"} during upload.`
          : commitError,
      );
      return;
    }

    setEntries((current) =>
      current.map((entry) => {
        if (successful.some((image) => image.entryId === entry.id)) {
          return { ...entry, selected: false, status: "added", error: undefined };
        }
        if (failed.has(entry.id)) {
          return { ...entry, selected: false, status: "failed", error: failed.get(entry.id) };
        }
        return entry;
      }),
    );
    setPhase("done");
    setSessionError(
      failed.size > 0
        ? `${successful.length} added; ${failed.size} could not be uploaded.`
        : `${successful.length} ${successful.length === 1 ? "image" : "images"} added.`,
    );
  };

  const focusGridEntry = (currentId: string, key: string) => {
    const currentIndex = navigableIds.indexOf(currentId);
    if (currentIndex < 0) return;
    const columns = Math.max(
      1,
      Math.floor((dialogRef.current?.querySelector(".bulk-stager-grid")?.clientWidth ?? 160) / 154),
    );
    const nextIndex =
      key === "Home"
        ? 0
        : key === "End"
          ? navigableIds.length - 1
          : key === "ArrowLeft"
            ? currentIndex - 1
            : key === "ArrowRight"
              ? currentIndex + 1
              : key === "ArrowUp"
                ? currentIndex - columns
                : currentIndex + columns;
    const nextId = navigableIds[Math.max(0, Math.min(navigableIds.length - 1, nextIndex))];
    if (!nextId) return;
    dialogRef.current
      ?.querySelector<HTMLInputElement>(`input[data-bulk-entry="${CSS.escape(nextId)}"]`)
      ?.focus();
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (phase === "processing") cancelProcessing();
      else close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
      ) ?? [],
    ).filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="bulk-stager-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="bulk-stager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-stager-title"
        aria-describedby="bulk-stager-summary"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="bulk-stager-header">
          <div>
            <span className="eyebrow">Private media staging</span>
            <h2 id="bulk-stager-title">Choose what belongs</h2>
            <p id="bulk-stager-summary">
              {totals.count} selected · {formatBytes(totals.bytes)}
              {checking
                ? ` · Read ${inspectionProgress.completed} of ${inspectionProgress.total}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={phase === "done" ? "Done" : "Close image staging"}
            data-initial-focus
            onClick={close}
          >
            <X size={18} />
          </button>
        </header>

        <div className="bulk-stager-tools">
          <div className="bulk-stager-selection-actions">
            <button
              type="button"
              onClick={() =>
                setEntries((current) =>
                  current.map((entry) =>
                    entry.status === "failed" || entry.status === "added"
                      ? entry
                      : { ...entry, selected: true },
                  ),
                )
              }
              disabled={phase !== "staging"}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() =>
                setEntries((current) => current.map((entry) => ({ ...entry, selected: false })))
              }
              disabled={phase !== "staging"}
            >
              Clear
            </button>
          </div>
          <label>
            <span>Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as BulkSort)}
              disabled={phase !== "staging"}
            >
              <option value="original">Original order</option>
              <option value="filename">Filename</option>
              <option value="capture">Capture time</option>
            </select>
          </label>
        </div>

        <div className="bulk-stager-notices">
          {(omitted > 0 || truncated) && (
            <p className="bulk-stager-warning" role="status">
              {truncated
                ? "Additional folder contents were omitted after the 150-file staging limit was reached."
                : `${omitted} ${omitted === 1 ? "file was" : "files were"} omitted from this 150-file staging limit.`}
            </p>
          )}
          {initialFailures.length > 0 && (
            <div className="bulk-stager-warning" role="status">
              <strong>
                {initialFailures.length} dropped{" "}
                {initialFailures.length === 1 ? "entry" : "entries"} could not be read.
              </strong>
              <ul>
                {initialFailures.map((failure, index) => (
                  <li key={`${failure.name}-${index}`} title={failure.message}>
                    {failure.name}: {failure.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {largeSelectionWarning && (
            <p className="bulk-stager-warning" role="status">
              {largeSelectionWarning}
            </p>
          )}
        </div>

        <div className="bulk-stager-grid" aria-label="Staged images">
          {displayed.map((entry) => (
            <label
              key={entry.id}
              className={`bulk-stager-card is-${entry.status}${entry.selected ? " is-selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={entry.selected}
                disabled={
                  phase !== "staging" || entry.status === "failed" || entry.status === "added"
                }
                aria-label={`Select ${entry.file.name}`}
                data-bulk-entry={entry.id}
                onKeyDown={(event) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
                      event.key,
                    )
                  ) {
                    event.preventDefault();
                    focusGridEntry(entry.id, event.key);
                  }
                }}
                onClick={(event) => {
                  const selected = !entry.selected;
                  setEntries((current) =>
                    toggleBulkSelection(
                      current,
                      displayedIds,
                      entry.id,
                      selected,
                      rangeAnchor,
                      event.shiftKey,
                    ),
                  );
                  setRangeAnchor(entry.id);
                }}
                onChange={() => undefined}
              />
              <span className="bulk-stager-thumb">
                {entry.previewUrl ? (
                  <img src={entry.previewUrl} alt="" loading="lazy" decoding="async" />
                ) : (
                  <ImageSquare size={26} aria-hidden="true" />
                )}
                <span>{entry.status}</span>
              </span>
              <span className="bulk-stager-card-copy">
                <strong title={entry.file.name}>{entry.file.name}</strong>
                <small>
                  {entry.width && entry.height ? `${entry.width} × ${entry.height} · ` : ""}
                  {formatBytes(entry.file.size)}
                </small>
                {entry.error && (
                  <em role="alert" title={entry.error}>
                    {entry.error}
                  </em>
                )}
              </span>
            </label>
          ))}
        </div>

        <footer className="bulk-stager-footer">
          <fieldset disabled={phase !== "staging"}>
            <legend>Initial layout</legend>
            {(
              [
                ["loose", "Loose grid"],
                ["contact", "Contact sheet"],
                ["masonry", "Masonry"],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="bulk-layout"
                  value={value}
                  checked={layout === value}
                  onChange={() => setLayout(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <div className="bulk-stager-footer-row">
            <div className="bulk-stager-file-actions">
              <button
                type="button"
                disabled={phase !== "staging" || checking}
                onClick={() => addInputRef.current?.click()}
              >
                <ImageSquare size={17} /> Add files
              </button>
              <button
                type="button"
                disabled={phase !== "staging" || checking}
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderOpen size={17} /> Add folder
              </button>
            </div>
            <div className="bulk-stager-primary-actions">
              {phase === "processing" ? (
                <button type="button" className="text-button" onClick={cancelProcessing}>
                  Cancel upload
                </button>
              ) : phase === "done" ? (
                <button type="button" className="primary-button" onClick={close}>
                  Done
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  disabled={checking || readySelected.length === 0 || itemCapacityError !== ""}
                  onClick={() => void processSelected()}
                >
                  Add {readySelected.length || "selected"}
                </button>
              )}
            </div>
          </div>
          <div className="bulk-stager-status" role="status" aria-live="polite">
            {phase === "processing" &&
              `Uploaded ${processingProgress.completed} of ${processingProgress.total} images…`}
            {phase !== "processing" && (sessionError || itemCapacityError)}
            {failedCount > 0 && phase !== "done" ? ` ${failedCount} failed.` : ""}
          </div>
        </footer>

        <input
          ref={addInputRef}
          className="visually-hidden"
          type="file"
          accept={IMAGE_FILE_ACCEPT}
          multiple
          tabIndex={-1}
          onChange={(event) => {
            appendFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          className="visually-hidden"
          type="file"
          accept={IMAGE_FILE_ACCEPT}
          multiple
          tabIndex={-1}
          onChange={(event) => {
            appendFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />
      </div>
    </div>
  );
}
