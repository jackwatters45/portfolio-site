import { Context, Effect, Layer, Option, Schema } from "effect";
import type { HttpServerRequest } from "effect/unstable/http";

import { Sha256HexSchema } from "../lib/schema";

export const MEDIA_CLIENT_ID_HEADER = "x-mood-board-media-client";
export const MediaQuotaClientIdSchema = Schema.String.check(
  Schema.makeFilter((value) =>
    value.length > 0 ? undefined : { path: [], issue: "Media quota client IDs cannot be empty" },
  ),
).pipe(Schema.brand("MediaQuotaClientId"));
export type MediaQuotaClientId = typeof MediaQuotaClientIdSchema.Type;
export const MediaClientHashSchema = Sha256HexSchema.pipe(
  Schema.brand("MediaClientHash"),
  Schema.brand("MediaQuotaClientId"),
);
export type MediaClientHash = typeof MediaClientHashSchema.Type;
const decodeMediaClientHash = Schema.decodeUnknownOption(MediaClientHashSchema);
const MISSING_MEDIA_CLIENT = MediaQuotaClientIdSchema.make("missing-client");
export const SERVICE_DIRECT_MEDIA_CLIENT = MediaQuotaClientIdSchema.make("service-direct");

const hashText = Effect.fn("MediaClientIdentity.hashText")(function* (value: string) {
  const digest = yield* Effect.tryPromise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  ).pipe(Effect.orDie);
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return MediaClientHashSchema.make(hash);
});

interface MediaClientIdentityShape {
  readonly allowsScheduledMaintenance: boolean;
  readonly identify: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<MediaQuotaClientId>;
}

export class MediaClientIdentity extends Context.Service<
  MediaClientIdentity,
  MediaClientIdentityShape
>()("mood-board/MediaClientIdentity") {
  static readonly bun = Layer.succeed(
    this,
    this.of({
      allowsScheduledMaintenance: false,
      identify: (request) =>
        hashText(Option.getOrElse(request.remoteAddress, () => "unknown-socket")),
    }),
  );

  static readonly cloudflareForwarded = Layer.succeed(
    this,
    this.of({
      allowsScheduledMaintenance: true,
      identify: (request) =>
        Effect.succeed(
          Option.getOrElse(
            decodeMediaClientHash(request.headers[MEDIA_CLIENT_ID_HEADER]),
            () => MISSING_MEDIA_CLIENT,
          ),
        ),
    }),
  );
}

export const hashMediaClientAddress = hashText;
export const hashMediaClientAddressPromise = (value: string): Promise<MediaClientHash> =>
  Effect.runPromise(hashText(value));
