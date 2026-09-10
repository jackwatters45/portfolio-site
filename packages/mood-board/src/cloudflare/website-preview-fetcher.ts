import { Effect, Layer, Stream } from "effect";

import { HttpStatusCodeSchema } from "../lib/schema";
import {
  MAX_WEBSITE_HTML_BYTES,
  WebsiteHtmlByteCountSchema,
  WebsiteHtmlByteOffsetSchema,
  type WebsiteUrl,
} from "../lib/website-preview";
import {
  WebsiteContentTypeSchema,
  WebsiteFetchFailure,
  WebsitePreviewFetcher,
  WebsiteRedirectLocationSchema,
} from "../server/website-preview-fetcher";

const fetchFailure = (cause: unknown) =>
  cause instanceof WebsiteFetchFailure
    ? cause
    : new WebsiteFetchFailure({
        message: "That website could not be reached.",
        reason: "Unavailable",
        cause,
      });

const readBoundedBody = Effect.fn("CloudflareWebsitePreviewFetcher.readBoundedBody")(function* (
  response: Response,
  stopAfterHtmlHead: boolean,
) {
  const source = response.body;
  if (source === null) return new Uint8Array();
  const decoder = new TextDecoder();
  let headProbe = "";
  let length = WebsiteHtmlByteCountSchema.make(0);
  const chunks = yield* Stream.fromReadableStream({
    evaluate: () => source,
    onError: fetchFailure,
  }).pipe(
    Stream.takeUntil((chunk) => {
      length = WebsiteHtmlByteCountSchema.make(length + chunk.byteLength);
      const probe = headProbe + decoder.decode(chunk, { stream: true });
      headProbe = probe.slice(-16);
      return length > MAX_WEBSITE_HTML_BYTES || (stopAfterHtmlHead && /<\/head\s*>/i.test(probe));
    }),
    Stream.runCollect,
  );
  if (length > MAX_WEBSITE_HTML_BYTES) {
    return yield* new WebsiteFetchFailure({
      message: "That website response is too large to preview.",
      reason: "TooLarge",
    });
  }
  const body = new Uint8Array(length);
  let offset = WebsiteHtmlByteOffsetSchema.make(0);
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset = WebsiteHtmlByteOffsetSchema.make(offset + chunk.byteLength);
  }
  return body;
});

const fetchOnce = Effect.fn("CloudflareWebsitePreviewFetcher.fetch")((url: WebsiteUrl) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetch(url, {
          redirect: "manual",
          signal,
          headers: {
            accept: "text/html,application/xhtml+xml;q=0.9,application/json;q=0.8",
            "cache-control": "no-cache",
            "user-agent": "MoodboardLinkPreview/1.0",
          },
        }),
      catch: fetchFailure,
    });
    const status = HttpStatusCodeSchema.make(response.status);
    const rawLocation = response.headers.get("location");
    const location =
      rawLocation === null ? undefined : WebsiteRedirectLocationSchema.make(rawLocation);
    if (status < 200 || status >= 300) {
      const responseBody = response.body;
      if (responseBody !== null) {
        yield* Effect.tryPromise({
          try: () => responseBody.cancel(),
          catch: fetchFailure,
        });
      }
      return {
        status,
        ...(location === undefined ? {} : { location }),
      };
    }
    const rawContentType = response.headers.get("content-type");
    const contentType =
      rawContentType === null ? undefined : WebsiteContentTypeSchema.make(rawContentType);
    const html = /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType ?? "");
    const body = yield* readBoundedBody(response, html);
    return {
      status,
      ...(contentType === undefined ? {} : { contentType }),
      body,
    };
  }).pipe(
    Effect.timeout("5 seconds"),
    Effect.catchTag("TimeoutError", () =>
      Effect.fail(
        new WebsiteFetchFailure({
          message: "That website took too long to respond.",
          reason: "Unavailable",
        }),
      ),
    ),
  ),
);

export const CloudflareWebsitePreviewFetcher = Layer.succeed(
  WebsitePreviewFetcher,
  WebsitePreviewFetcher.of({ fetch: (url) => fetchOnce(url) }),
);
