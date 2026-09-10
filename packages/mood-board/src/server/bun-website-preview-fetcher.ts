import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

import { Effect, Layer, Option, Schema } from "effect";

import { HttpStatusCodeSchema } from "../lib/schema";
import {
  isBlockedWebsiteAddress,
  MAX_WEBSITE_HTML_BYTES,
  WebsiteHtmlByteCountSchema,
  type WebsiteUrl,
} from "../lib/website-preview";
import {
  WebsiteContentTypeSchema,
  WebsiteFetchFailure,
  WebsitePreviewFetcher,
  WebsiteRedirectLocationSchema,
  type WebsiteFetchResponse,
} from "./website-preview-fetcher";

const headerValue = (value: string | ReadonlyArray<string> | undefined): string | undefined =>
  typeof value === "string" ? value : value?.[0];

const decodeHttpStatusCode = Schema.decodeUnknownOption(HttpStatusCodeSchema);

const fetchFailure = (cause: unknown) =>
  cause instanceof WebsiteFetchFailure
    ? cause
    : new WebsiteFetchFailure({
        message: "That website could not be reached.",
        reason: "Unavailable",
        cause,
      });

const lookupAddresses = Effect.fn("BunWebsitePreviewFetcher.lookupAddresses")((hostname: string) =>
  Effect.tryPromise({
    try: () => lookup(hostname, { all: true, verbatim: true }),
    catch: fetchFailure,
  }),
);

const requestPinned = Effect.fn("BunWebsitePreviewFetcher.requestPinned")(
  (target: URL, pinnedLookup: LookupFunction) =>
    Effect.callback<WebsiteFetchResponse, WebsiteFetchFailure>((resume) => {
      let settled = false;
      const finish = (value: WebsiteFetchResponse) => {
        if (settled) return;
        settled = true;
        resume(Effect.succeed(value));
      };
      const fail = (cause: unknown) => {
        if (settled) return;
        settled = true;
        resume(Effect.fail(fetchFailure(cause)));
      };
      try {
        const request = httpsRequest(
          target,
          {
            method: "GET",
            lookup: pinnedLookup,
            servername: target.hostname,
            headers: {
              accept: "text/html,application/xhtml+xml;q=0.9,application/json;q=0.8",
              "accept-encoding": "identity",
              "cache-control": "no-cache",
              "user-agent": "MoodboardLinkPreview/1.0",
            },
          },
          (response) => {
            const status = Option.getOrNull(decodeHttpStatusCode(response.statusCode));
            if (status === null) {
              fail(
                new WebsiteFetchFailure({
                  message: "That website returned an invalid HTTP status.",
                  reason: "Unavailable",
                }),
              );
              response.destroy();
              return;
            }
            const rawLocation = headerValue(response.headers.location);
            const location =
              rawLocation === undefined
                ? undefined
                : WebsiteRedirectLocationSchema.make(rawLocation);
            const rawContentType = headerValue(response.headers["content-type"]);
            const contentType =
              rawContentType === undefined
                ? undefined
                : WebsiteContentTypeSchema.make(rawContentType);
            if (status < 200 || status >= 300) {
              finish({ status, ...(location === undefined ? {} : { location }) });
              response.destroy();
              return;
            }
            const chunks: Uint8Array[] = [];
            let bytes = WebsiteHtmlByteCountSchema.make(0);
            let headProbe = "";
            response.on("data", (chunk: Buffer) => {
              bytes = WebsiteHtmlByteCountSchema.make(bytes + chunk.byteLength);
              if (bytes > MAX_WEBSITE_HTML_BYTES) {
                response.destroy();
                fail(
                  new WebsiteFetchFailure({
                    message: "That website response is too large to preview.",
                    reason: "TooLarge",
                  }),
                );
                return;
              }
              chunks.push(chunk);
              const probe = headProbe + chunk.toString("utf8");
              headProbe = probe.slice(-16);
              if (
                /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType ?? "") &&
                /<\/head\s*>/i.test(probe)
              ) {
                finish({
                  status,
                  ...(contentType === undefined ? {} : { contentType }),
                  body: Buffer.concat(chunks),
                });
                response.destroy();
              }
            });
            response.on("end", () =>
              finish({
                status,
                ...(contentType === undefined ? {} : { contentType }),
                body: Buffer.concat(chunks),
              }),
            );
            response.on("error", fail);
          },
        );
        request.on("error", fail);
        request.end();
        return Effect.sync(() => {
          settled = true;
          request.destroy();
        });
      } catch (cause) {
        fail(cause);
      }
    }),
);

const fetchPinned = Effect.fn("BunWebsitePreviewFetcher.fetchPinned")(function* (url: WebsiteUrl) {
  const target = yield* Effect.try({
    try: () => new URL(url),
    catch: fetchFailure,
  });
  const addresses = yield* lookupAddresses(target.hostname);
  if (
    addresses.length === 0 ||
    addresses.some((address) => isBlockedWebsiteAddress(address.address))
  ) {
    return yield* new WebsiteFetchFailure({
      message: "That website resolves to a private or reserved address.",
      reason: "Blocked",
    });
  }

  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    const family = options.family === 4 || options.family === 6 ? options.family : undefined;
    const selected =
      addresses.find((address) => family === undefined || address.family === family) ??
      addresses[0];
    if (selected === undefined) {
      callback(new Error("The website has no usable address."), "", 0);
    } else if (options.all) {
      callback(null, [selected]);
    } else {
      callback(null, selected.address, selected.family);
    }
  };

  return yield* requestPinned(target, pinnedLookup);
});

const fetchOne = Effect.fn("BunWebsitePreviewFetcher.fetch")((url: WebsiteUrl) =>
  fetchPinned(url).pipe(
    Effect.timeout("5 seconds"),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail(
        new WebsiteFetchFailure({
          message: "That website took too long to resolve or respond.",
          reason: "Unavailable",
        }),
      ),
    ),
  ),
);

export const BunWebsitePreviewFetcher = Layer.succeed(
  WebsitePreviewFetcher,
  WebsitePreviewFetcher.of({ fetch: (url) => fetchOne(url) }),
);
