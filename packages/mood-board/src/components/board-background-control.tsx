import { ImageSquare, SpinnerGap } from "@phosphor-icons/react";
import { useRef, type FormEvent } from "react";

import type { BoardBackgroundDraft } from "../client/board/board-background";
import {
  BOARD_BACKGROUNDS,
  formatHexColorInput,
  normalizeHexColor,
} from "../client/board/board-utils";
import { IMAGE_FILE_ACCEPT } from "../client/media/image-preflight";
import { CanvasBackground } from "./canvas-background";

type Props = {
  readonly draft: BoardBackgroundDraft;
  readonly normalizedHex: string | null;
  readonly effectiveHex: string;
  readonly uploading: boolean;
  readonly dirty: boolean;
  readonly error: string;
  readonly imageEnabled?: boolean;
  readonly onDraftChange: (draft: BoardBackgroundDraft) => void;
  readonly onChooseImage: (file: File) => void;
  readonly onRemoveImage: () => void;
  readonly onReset: () => void;
  readonly onApply: () => void;
};

export function BoardBackgroundControl({
  draft,
  normalizedHex,
  effectiveHex,
  uploading,
  dirty,
  error,
  imageEnabled = true,
  onDraftChange,
  onChooseImage,
  onRemoveImage,
  onReset,
  onApply,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseImage = () => inputRef.current?.click();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || uploading || normalizedHex === null) return;
    onApply();
  };

  return (
    <form
      className="board-background-control"
      aria-labelledby="board-background-title"
      onSubmit={submit}
    >
      <div className="board-background-heading">
        <span id="board-background-title">Board background</span>
        <small>
          {imageEnabled
            ? "Layer an image over a fallback color, then apply both together."
            : "Choose a quiet fallback color for this browser-only demo."}
        </small>
      </div>

      {imageEnabled && (
        <div
          className={`background-image-control${uploading ? " is-uploading" : ""}`}
          aria-busy={uploading}
        >
          {draft.mediaId === undefined ? (
            <button
              type="button"
              className="background-image-empty"
              disabled={uploading}
              aria-busy={uploading}
              onClick={chooseImage}
            >
              {uploading ? (
                <SpinnerGap className="background-image-spinner" size={22} aria-hidden="true" />
              ) : (
                <ImageSquare size={22} weight="light" aria-hidden="true" />
              )}
              <span>
                <strong>{uploading ? "Preparing image…" : "Add background image"}</strong>
                <small>JPG, PNG, WebP, GIF, or HEIC</small>
              </span>
            </button>
          ) : (
            <div className="background-image-ready">
              <div className="background-image-preview">
                <CanvasBackground mediaId={draft.mediaId} />
                <span>Viewport cover</span>
                {uploading && (
                  <div className="background-image-busy" role="status" aria-live="polite">
                    <SpinnerGap className="background-image-spinner" size={20} aria-hidden="true" />
                    Preparing replacement…
                  </div>
                )}
              </div>
              <div className="background-image-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={uploading}
                  onClick={chooseImage}
                >
                  Replace
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={uploading}
                  onClick={onRemoveImage}
                >
                  Remove image
                </button>
              </div>
            </div>
          )}
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept={IMAGE_FILE_ACCEPT}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file !== undefined) onChooseImage(file);
              event.currentTarget.value = "";
            }}
          />
        </div>
      )}

      <div className="background-presets" aria-label="Background color presets">
        {BOARD_BACKGROUNDS.map((preset) => (
          <button
            key={preset.color}
            type="button"
            className={normalizedHex === preset.color ? "is-active" : ""}
            aria-label={`Preview ${preset.label}, ${preset.color}`}
            aria-pressed={normalizedHex === preset.color}
            onClick={() =>
              onDraftChange({
                ...draft,
                hex: preset.color,
                lastValidHex: preset.color,
              })
            }
          >
            <span style={{ backgroundColor: preset.color }} />
            <small>{preset.label}</small>
          </button>
        ))}
      </div>

      <div className="background-custom-row">
        <label className="field-block color-picker-field">
          <span>Fallback color</span>
          <input
            type="color"
            value={normalizedHex ?? draft.lastValidHex}
            aria-label={`Choose fallback color. Current preview ${effectiveHex}`}
            onChange={(event) => {
              const hex = event.target.value.toUpperCase();
              onDraftChange({ ...draft, hex, lastValidHex: hex });
            }}
          />
        </label>
        <label className="field-block">
          <span>Exact hex</span>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={7}
            value={draft.hex}
            aria-invalid={normalizedHex === null}
            aria-describedby="board-background-help"
            onChange={(event) => {
              const hex = formatHexColorInput(event.target.value);
              const validHex = normalizeHexColor(hex);
              onDraftChange({
                ...draft,
                hex,
                lastValidHex: validHex ?? draft.lastValidHex,
              });
            }}
          />
          <small id="board-background-help">Format: #RRGGBB</small>
        </label>
      </div>

      {normalizedHex === null && (
        <p className="field-error" role="alert">
          Use six digits, for example #EDEDED.
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="background-actions">
        <button type="button" className="text-button" disabled={uploading} onClick={onReset}>
          Reset all
        </button>
        <button
          type="submit"
          className="background-apply-button"
          disabled={!dirty || uploading || normalizedHex === null}
        >
          Apply background
        </button>
      </div>
      {imageEnabled && (
        <small className="background-image-note">
          Images stay fixed to the viewport while you move around the infinite canvas.
        </small>
      )}
    </form>
  );
}
