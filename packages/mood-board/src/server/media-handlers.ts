import { Clock, Effect, Option, Schema, Semaphore, Stream } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import {
  mediaByteLimit,
  MediaByteCountSchema,
  MediaByteLengthSchema,
  MediaCleanupAgeDaysSchema,
  MediaDurationMillisSchema,
  MediaIdSchema,
  MediaTimestampSchema,
  type MediaByteCount,
  type MediaByteLength,
  type MediaCleanupAgeDays,
  type MediaDurationMillis,
  type MediaEtag,
  type MediaKind,
  type MediaMimeType,
  type MediaReservationId,
  normalizeMediaKind,
  normalizeMediaMimeType,
  parseMediaRange,
  RetryAfterSecondsSchema,
  type RetryAfterSeconds,
} from "../lib/media";
import { MediaClientIdentity } from "./media-client-identity";
import { MediaService, MediaServiceError } from "./media-service";

const decodeMediaByteLength = Schema.decodeUnknownOption(MediaByteLengthSchema);
const decodeMediaCleanupAgeDays = Schema.decodeUnknownOption(MediaCleanupAgeDaysSchema);
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
const mediaCleanupAgeMillis = (days: MediaCleanupAgeDays): MediaDurationMillis =>
  MediaDurationMillisSchema.make(days * MILLISECONDS_PER_DAY);

interface BoundedBodyState {
  readonly chunks: Uint8Array[];
  readonly size: MediaByteCount;
}

const emptyBoundedBodyState = (): BoundedBodyState => ({
  chunks: [],
  size: MediaByteCountSchema.make(0),
});
const DEFAULT_RETRY_AFTER_SECONDS = RetryAfterSecondsSchema.make(60);

const jsonError = (
  status: number,
  message: string,
  code?: string,
  retryAfter?: RetryAfterSeconds,
) =>
  HttpServerResponse.jsonUnsafe(
    { error: message, ...(code === undefined ? {} : { code }) },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        ...(retryAfter === undefined ? {} : { "retry-after": String(retryAfter) }),
      },
    },
  );

const readBoundedBody = Effect.fn("MediaHandlers.readBoundedBody")(function* (
  request: HttpServerRequest.HttpServerRequest,
  limit: MediaByteLength,
) {
  return yield* Stream.runFoldEffect(request.stream, emptyBoundedBodyState, (state, chunk) => {
    const nextSize = state.size + chunk.byteLength;
    if (nextSize > limit) {
      return Effect.fail(new MediaServiceError({ reason: "TooLarge" }));
    }
    const size = MediaByteCountSchema.make(nextSize);
    state.chunks.push(chunk);
    return Effect.succeed({ chunks: state.chunks, size });
  }).pipe(
    Effect.map(({ chunks, size }) => {
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    }),
  );
});

const ifNoneMatchIncludes = (header: string | undefined, etag: MediaEtag): boolean => {
  if (header === undefined) return false;
  const target = `"${etag}"`;
  return header.split(",").some((value) => {
    const candidate = value.trim();
    return candidate === "*" || candidate.replace(/^W\//, "") === target;
  });
};

const uploadFailure = (error: unknown) => {
  if (error instanceof MediaServiceError) {
    switch (error.reason) {
      case "Empty":
      case "InvalidContent":
        return jsonError(400, "The upload is empty or does not match its declared media type.");
      case "TooLarge":
        return jsonError(413, "The upload exceeds the media size limit.");
      case "RequestQuota":
        return jsonError(
          429,
          "Too many media uploads. Wait before trying again.",
          "media_request_rate_limited",
          error.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS,
        );
      case "ByteQuota":
        return jsonError(
          429,
          "This client has reached its daily media upload allowance.",
          "media_byte_rate_limited",
          error.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS,
        );
      case "StorageQuota":
        return jsonError(507, "Managed media storage is full.", "media_storage_full");
      case "Timeout":
        return jsonError(408, "The media upload took too long.", "media_upload_timeout");
      case "Persistence":
        return jsonError(503, "Media storage is temporarily unavailable.");
    }
  }
  return jsonError(400, "The media upload could not be read.");
};

const recoverUploadFailure = (error: unknown) => {
  const response = uploadFailure(error);
  return error instanceof MediaServiceError && error.reason === "Persistence"
    ? Effect.logError(error).pipe(Effect.as(response))
    : Effect.succeed(response);
};

const recoverMediaUnavailable = (message: string) => (error: MediaServiceError) =>
  Effect.logError(error).pipe(Effect.as(jsonError(503, message)));

export const MediaHandlers = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const media = yield* MediaService;
    const identities = yield* MediaClientIdentity;
    const readGate = yield* Semaphore.make(4);

    const uploadBody = Effect.fn("MediaHandlers.UploadBody")(function* (
      request: HttpServerRequest.HttpServerRequest,
      kind: MediaKind,
      mimeType: MediaMimeType,
      limit: MediaByteLength,
      declaredLength: MediaByteLength,
      reservation: MediaReservationId,
    ) {
      const bytes = yield* readBoundedBody(request, limit).pipe(
        Effect.timeout("2 minutes"),
        Effect.mapError((error) =>
          error._tag === "TimeoutError" ? new MediaServiceError({ reason: "Timeout" }) : error,
        ),
      );
      if (bytes.byteLength !== declaredLength) {
        return jsonError(400, "The upload length does not match Content-Length.");
      }
      const uploaded = yield* media.upload(kind, mimeType, bytes, reservation);
      return HttpServerResponse.jsonUnsafe(uploaded, {
        status: 201,
        headers: {
          "cache-control": "no-store",
          location: uploaded.url,
          "x-content-type-options": "nosniff",
        },
      });
    });

    const upload = Effect.fn("MediaHandlers.Upload")(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const url = new URL(request.url, "http://mood-board.local");
      const kind = normalizeMediaKind(
        url.searchParams.get("kind") ?? request.headers["x-media-kind"],
      );
      if (kind === null) return jsonError(400, "A valid media kind is required.");
      const mimeType = normalizeMediaMimeType(kind, request.headers["content-type"]);
      if (mimeType === null) return jsonError(415, "That media type is not supported.");
      const limit = mediaByteLimit(kind);
      const contentLength = request.headers["content-length"];
      if (contentLength === undefined) {
        return jsonError(411, "Content-Length is required for media uploads.");
      }
      const declaredLength = Option.getOrNull(decodeMediaByteLength(Number(contentLength)));
      if (declaredLength === null) {
        return jsonError(400, "Content-Length must be a positive integer.");
      }
      if (declaredLength > limit) {
        return jsonError(413, "The upload exceeds the media size limit.");
      }
      const clientId = yield* identities.identify(request);
      const reservation = yield* media.reserveUpload(clientId, declaredLength);
      return yield* uploadBody(request, kind, mimeType, limit, declaredLength, reservation).pipe(
        Effect.ensuring(media.releaseReservation(reservation)),
      );
    });

    yield* router.add(
      "POST",
      "/api/owner/media",
      upload().pipe(Effect.catch(recoverUploadFailure)),
    );

    const serve = Effect.fn("MediaHandlers.Serve")(function* () {
      const params = yield* HttpRouter.params;
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (request.method !== "GET" && request.method !== "HEAD") {
        return HttpServerResponse.empty({ status: 405, headers: { allow: "GET, HEAD" } });
      }
      const head = request.method === "HEAD";
      const mediaId = Option.getOrNull(Schema.decodeUnknownOption(MediaIdSchema)(params.mediaId));
      if (mediaId === null) return jsonError(404, "Not found");
      const asset = yield* media.describe(mediaId);
      if (asset === null) return jsonError(404, "Not found");

      const httpEtag = `"${asset.etag}"`;
      const baseHeaders = {
        "accept-ranges": "bytes",
        "content-disposition": "inline",
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": asset.mimeType,
        etag: httpEtag,
        "x-content-type-options": "nosniff",
      };
      if (ifNoneMatchIncludes(request.headers["if-none-match"], asset.etag)) {
        return HttpServerResponse.empty({ status: 304, headers: baseHeaders });
      }

      const requestedRange =
        request.headers["if-range"] === undefined || request.headers["if-range"] === httpEtag
          ? request.headers.range
          : undefined;
      const range = parseMediaRange(requestedRange, asset.byteLength);
      if (range === null) {
        return HttpServerResponse.empty({
          status: 416,
          headers: {
            ...baseHeaders,
            "content-range": `bytes */${asset.byteLength}`,
          },
        });
      }
      const ranged = requestedRange !== undefined;
      const length = MediaByteLengthSchema.make(range.end - range.start + 1);
      const headers = {
        ...baseHeaders,
        "content-length": String(length),
        ...(ranged
          ? { "content-range": `bytes ${range.start}-${range.end}/${asset.byteLength}` }
          : {}),
      };
      if (head) return HttpServerResponse.empty({ status: ranged ? 206 : 200, headers });
      const result = yield* media.read(
        mediaId,
        ranged ? { offset: range.start, length } : undefined,
      );
      if (result === null) return jsonError(404, "Not found");
      return HttpServerResponse.uint8Array(result.bytes, {
        status: ranged ? 206 : 200,
        headers,
        contentType: asset.mimeType,
      });
    });

    const cleanup = Effect.fn("MediaHandlers.Cleanup")(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (request.headers["x-media-cleanup"] !== "confirm") {
        return jsonError(400, "Media cleanup requires explicit confirmation.");
      }
      if (request.headers["sec-fetch-site"] === "cross-site") {
        return jsonError(403, "Cross-site media cleanup is not allowed.");
      }
      const url = new URL(request.url, "http://mood-board.local");
      const days = Option.getOrNull(
        decodeMediaCleanupAgeDays(Number(url.searchParams.get("olderThanDays") ?? "30")),
      );
      if (days === null) {
        return jsonError(400, "olderThanDays must be between 30 and 3650.");
      }
      const cleanupAge = mediaCleanupAgeMillis(days);
      const now = yield* Clock.currentTimeMillis;
      const removed = yield* media.cleanupUnreferenced(
        MediaTimestampSchema.make(Math.max(0, now - cleanupAge)),
      );
      return HttpServerResponse.jsonUnsafe(
        { removed },
        {
          headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
        },
      );
    });

    yield* router.add(
      "POST",
      "/api/owner/media/cleanup",
      cleanup().pipe(
        Effect.catch(recoverMediaUnavailable("Media cleanup is temporarily unavailable.")),
      ),
    );

    const maintenance = Effect.fn("MediaHandlers.Maintenance")(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (
        !identities.allowsScheduledMaintenance ||
        request.headers["x-mood-board-maintenance"] !== "scheduled"
      ) {
        return jsonError(404, "Not found");
      }
      const removed = yield* media.maintain();
      return HttpServerResponse.jsonUnsafe(
        { removed },
        {
          headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
        },
      );
    });

    yield* router.add(
      "POST",
      "/_internal/media/maintenance",
      maintenance().pipe(
        Effect.catch(recoverMediaUnavailable("Media maintenance is temporarily unavailable.")),
      ),
    );

    yield* router.add("*", "/api/owner/*", jsonError(404, "Not found"));
    yield* router.add(
      "*",
      "/media/:mediaId",
      serve().pipe(
        (effect) => readGate.withPermit(effect),
        Effect.catch(recoverMediaUnavailable("Media storage is temporarily unavailable.")),
      ),
    );
    yield* router.add("*", "/media/*", jsonError(404, "Not found"));
  }),
);
