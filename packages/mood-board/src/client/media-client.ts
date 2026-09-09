import { Effect, Option, Schema } from "effect";

import {
  mediaByteLimit,
  MediaByteLengthSchema,
  MediaUploadResponseSchema,
  normalizeMediaMimeType,
  type MediaByteLength,
  type MediaId,
  type MediaKind,
  type MediaMimeType,
  type MediaUploadResponse,
} from "../lib/media";
import { HttpStatusCodeSchema, type HttpStatusCode } from "../lib/schema";
import { signalAuthenticationRequired } from "./auth-client";
import { mediaUrl } from "./media-url";
import { RemoteClientErrorFields, RemoteClientFailureReasonSchema } from "./remote-client-error";

const MediaErrorResponseSchema = Schema.Struct({ error: Schema.String });
const decodeMediaErrorResponse = Schema.decodeUnknownOption(MediaErrorResponseSchema);

export class MediaClientError extends Schema.Error<MediaClientError>("MediaClientError")({
  _tag: Schema.tag("MediaClientError"),
  reason: Schema.Union([Schema.Literal("Validation"), RemoteClientFailureReasonSchema]),
  ...RemoteClientErrorFields,
}) {
  constructor(
    reason: MediaClientError["reason"],
    message: string,
    status: HttpStatusCode | null = null,
    cause?: unknown,
  ) {
    super({ reason, message, status, ...(cause === undefined ? {} : { cause }) });
  }
}

const responseMessage = Effect.fn("MediaClient.responseMessage")(function* (response: Response) {
  const value = yield* Effect.tryPromise(() => response.json()).pipe(
    Effect.catch(() => Effect.succeed(undefined)),
  );
  const decoded = decodeMediaErrorResponse(value);
  if (Option.isSome(decoded)) return decoded.value.error;
  if (response.status === 401 || response.status === 403) {
    return "Media upload requires access to the owner workspace.";
  }
  if (response.status === 413) return "That file is larger than the media upload limit.";
  if (response.status === 415) return "That file type is not supported.";
  if (response.status === 429) {
    return "This client has reached a media upload allowance. Wait and try again.";
  }
  if (response.status === 507) return "Managed media storage is full.";
  return "The media server could not accept that upload.";
});

const decodeUploadReceipt = Effect.fn("MediaClient.decodeUploadReceipt")(function* (
  response: Response,
) {
  const value: unknown = yield* Effect.tryPromise(() => response.json());
  return yield* Schema.decodeUnknownEffect(MediaUploadResponseSchema)(value);
});

const transportFailure = (cause: unknown, message: string): MediaClientError | DOMException =>
  cause instanceof DOMException && cause.name === "AbortError"
    ? cause
    : new MediaClientError("Transport", message, null, cause);

const uploadMediaEffect = Effect.fn("MediaClient.uploadMedia")(function* (
  blob: Blob,
  kind: MediaKind,
  signal?: AbortSignal,
) {
  const mimeType = normalizeMediaMimeType(kind, blob.type);
  if (mimeType === null) {
    return yield* new MediaClientError("Validation", "That file type is not supported.");
  }
  if (blob.size === 0) return yield* new MediaClientError("Validation", "That file is empty.");
  if (blob.size > mediaByteLimit(kind)) {
    return yield* new MediaClientError(
      "Validation",
      `That ${kind} is larger than the upload limit.`,
    );
  }

  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(`/api/owner/media?kind=${kind}`, {
        method: "POST",
        body: blob,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "content-type": mimeType,
          "x-media-kind": kind,
        },
        signal,
      }),
    catch: (cause) =>
      transportFailure(
        cause,
        "Media uploads require the live mood-board server. Start the Bun or Cloudflare server and try again.",
      ),
  });
  const status = HttpStatusCodeSchema.make(response.status);
  if (!response.ok) {
    if (response.status === 401) signalAuthenticationRequired();
    return yield* new MediaClientError("Http", yield* responseMessage(response), status);
  }

  const decoded = yield* decodeUploadReceipt(response).pipe(
    Effect.mapError(
      (cause) =>
        new MediaClientError(
          "InvalidPayload",
          "The media server returned an invalid upload receipt.",
          status,
          cause,
        ),
    ),
  );
  if (decoded.kind !== kind || decoded.byteLength !== blob.size) {
    return yield* new MediaClientError(
      "InvalidPayload",
      "The media server returned an invalid upload receipt.",
      status,
    );
  }
  return decoded;
});

export const uploadMedia = (
  blob: Blob,
  kind: MediaKind,
  signal?: AbortSignal,
): Promise<MediaUploadResponse> => Effect.runPromise(uploadMediaEffect(blob, kind, signal));

export type DownloadedMedia = {
  readonly blob: Blob;
  readonly mimeType: MediaMimeType;
  readonly byteLength: MediaByteLength;
};

const downloadMediaEffect = Effect.fn("MediaClient.downloadMedia")(function* (
  mediaId: MediaId,
  kind: MediaKind,
  signal?: AbortSignal,
) {
  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(mediaUrl(mediaId), {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      }),
    catch: (cause) =>
      transportFailure(cause, "The managed media could not be downloaded from the live server."),
  });
  const status = HttpStatusCodeSchema.make(response.status);
  if (!response.ok) {
    if (response.status === 401) signalAuthenticationRequired();
    return yield* new MediaClientError(
      "Http",
      response.status === 404
        ? "A managed media file used by this board is missing."
        : "A managed media file could not be downloaded.",
      status,
    );
  }
  const mimeType = normalizeMediaMimeType(kind, response.headers.get("content-type"));
  if (mimeType === null) {
    return yield* new MediaClientError(
      "InvalidPayload",
      "A managed media file has an unexpected type.",
    );
  }
  const blob = yield* Effect.tryPromise({
    try: () => response.blob(),
    catch: (cause) =>
      new MediaClientError(
        "InvalidPayload",
        "A managed media file could not be read.",
        status,
        cause,
      ),
  });
  if (blob.size === 0 || blob.size > mediaByteLimit(kind)) {
    return yield* new MediaClientError(
      "InvalidPayload",
      "A managed media file has an invalid size.",
      status,
    );
  }
  return {
    blob,
    mimeType,
    byteLength: MediaByteLengthSchema.make(blob.size),
  } satisfies DownloadedMedia;
});

export const downloadMedia = (
  mediaId: MediaId,
  kind: MediaKind,
  signal?: AbortSignal,
): Promise<DownloadedMedia> => Effect.runPromise(downloadMediaEffect(mediaId, kind, signal));
