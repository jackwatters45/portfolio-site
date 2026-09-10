import { Clock, Context, Effect, Layer, Schema, Semaphore } from "effect";

import { BoardBackendError } from "../lib/board-rpc";
import { NonNegativeIntegerSchema, PositiveIntegerSchema } from "../lib/schema";
import {
  MAX_WEBSITE_REDIRECTS,
  normalizeWebsiteUrl,
  type WebsitePreview,
  WebsiteRedirectCountSchema,
  WebsiteSiteLabelSchema,
  WebsiteTitleSchema,
  type WebsiteUrl,
  WebsiteUrlSchema,
} from "../lib/website-preview";
import { normalizeXPostSource, type XPostPreview, type XPostUrl } from "../lib/x-post";
import { WebsitePreviewFetcher, type WebsiteFetchFailure } from "./website-preview-fetcher";
import { parseWebsitePreview } from "./website-preview-parser";
import { parseXPostOEmbed } from "./x-post-preview-parser";

interface WebsitePreviewServiceShape {
  readonly resolve: (url: string) => Effect.Effect<WebsitePreview, BoardBackendError>;
  readonly resolveXPost: (url: string) => Effect.Effect<XPostPreview, BoardBackendError>;
}

const XPreviewCacheTimestampMillisSchema = NonNegativeIntegerSchema.pipe(
  Schema.brand("XPreviewCacheTimestampMillis"),
);
type XPreviewCacheTimestampMillis = typeof XPreviewCacheTimestampMillisSchema.Type;
const XPreviewCacheDurationMillisSchema = PositiveIntegerSchema.pipe(
  Schema.brand("XPreviewCacheDurationMillis"),
);
type XPreviewCacheDurationMillis = typeof XPreviewCacheDurationMillisSchema.Type;
const MILLISECONDS_PER_MINUTE = 60_000;
const X_PREVIEW_FAILURE_CACHE_TTL: XPreviewCacheDurationMillis =
  XPreviewCacheDurationMillisSchema.make(5 * MILLISECONDS_PER_MINUTE);
const X_PREVIEW_SUCCESS_CACHE_TTL: XPreviewCacheDurationMillis =
  XPreviewCacheDurationMillisSchema.make(60 * MILLISECONDS_PER_MINUTE);

const invalid = (message: string) =>
  new BoardBackendError({
    code: "Invalid",
    message,
  });

const logFetchFailure = (error: WebsiteFetchFailure) =>
  Effect.logWarning("Website preview fetch failed", error).pipe(Effect.as(null));

const fallbackPreview = (url: WebsiteUrl): WebsitePreview => {
  const hostname = new URL(url).hostname.replace(/^www\./i, "");
  const normalizedLabel = hostname.slice(0, 80);
  const title = WebsiteTitleSchema.make(normalizedLabel);
  const siteLabel = WebsiteSiteLabelSchema.make(normalizedLabel);
  return { url, preferredLayout: "card", title, siteLabel };
};

export class WebsitePreviewService extends Context.Service<
  WebsitePreviewService,
  WebsitePreviewServiceShape
>()("mood-board/WebsitePreviewService") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const fetcher = yield* WebsitePreviewFetcher;
      const permits = yield* Semaphore.make(4);
      const xCache = new Map<
        XPostUrl,
        { readonly preview: XPostPreview; readonly expiresAt: XPreviewCacheTimestampMillis }
      >();

      const resolveOne = Effect.fn("WebsitePreviewService.resolve")(function* (input: string) {
        const normalizedInput = normalizeWebsiteUrl(input);
        if (normalizedInput === null) {
          return yield* invalid(
            "Use a public HTTPS website URL without credentials or a custom port.",
          );
        }
        let currentUrl = normalizedInput;

        for (
          let redirects = WebsiteRedirectCountSchema.make(0);
          redirects <= MAX_WEBSITE_REDIRECTS;
          redirects = WebsiteRedirectCountSchema.make(redirects + 1)
        ) {
          const response = yield* fetcher.fetch(currentUrl).pipe(
            Effect.matchEffect({
              onSuccess: Effect.succeed,
              onFailure: (error) =>
                error.reason === "Blocked"
                  ? Effect.fail(invalid(error.message))
                  : logFetchFailure(error),
            }),
          );
          if (response === null) return fallbackPreview(currentUrl);
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            if (response.location === undefined || redirects === MAX_WEBSITE_REDIRECTS) {
              return yield* invalid("That website redirected too many times.");
            }
            let redirectUrl: string;
            try {
              redirectUrl = new URL(response.location, currentUrl).href;
            } catch {
              return yield* invalid("That website returned an invalid redirect.");
            }
            const redirected = normalizeWebsiteUrl(redirectUrl);
            if (redirected === null) {
              return yield* invalid("That website redirects to an unsupported or private address.");
            }
            currentUrl = redirected;
            continue;
          }
          if (response.status < 200 || response.status >= 300) {
            return fallbackPreview(currentUrl);
          }
          const contentType = response.contentType?.split(";", 1)[0]?.trim().toLowerCase();
          if (contentType !== "text/html" && contentType !== "application/xhtml+xml") {
            return fallbackPreview(currentUrl);
          }
          if (response.body === undefined) return fallbackPreview(currentUrl);
          try {
            return parseWebsitePreview(new TextDecoder().decode(response.body), currentUrl);
          } catch {
            return fallbackPreview(currentUrl);
          }
        }

        return yield* invalid("That website could not be previewed.");
      });

      const resolveXPostOne = Effect.fn("WebsitePreviewService.resolveXPost")(function* (
        input: string,
      ) {
        const src = normalizeXPostSource(input);
        if (src === null) return yield* invalid("Use a public X or Twitter post URL.");
        const cached = xCache.get(src);
        const lookupTime = yield* Clock.currentTimeMillis;
        const lookupTimestamp = XPreviewCacheTimestampMillisSchema.make(lookupTime);
        if (cached !== undefined && cached.expiresAt > lookupTimestamp) return cached.preview;

        const endpoint = WebsiteUrlSchema.make(
          `https://publish.x.com/oembed?url=${encodeURIComponent(src)}&omit_script=1&dnt=1`,
        );
        const response = yield* fetcher.fetch(endpoint).pipe(Effect.catch(logFetchFailure));
        const contentType = response?.contentType?.split(";", 1)[0]?.trim().toLowerCase();
        const resolved =
          response !== null &&
          response.status === 200 &&
          contentType === "application/json" &&
          response.body !== undefined
            ? parseXPostOEmbed(response.body, src)
            : null;
        const preview = resolved ?? { src };
        const ttl = resolved === null ? X_PREVIEW_FAILURE_CACHE_TTL : X_PREVIEW_SUCCESS_CACHE_TTL;
        const insertionTime = yield* Clock.currentTimeMillis;
        xCache.set(src, {
          preview,
          expiresAt: XPreviewCacheTimestampMillisSchema.make(insertionTime + ttl),
        });
        if (xCache.size > 100) xCache.delete(xCache.keys().next().value ?? src);
        return preview;
      });

      return WebsitePreviewService.of({
        resolve: (url) => permits.withPermit(resolveOne(url)),
        resolveXPost: (url) => permits.withPermit(resolveXPostOne(url)),
      });
    }),
  );
}
