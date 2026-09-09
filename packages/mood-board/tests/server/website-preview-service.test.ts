import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { HttpStatusCodeSchema } from "../../src/lib/schema";
import {
  WebsiteContentTypeSchema,
  WebsiteFetchFailure,
  WebsitePreviewFetcher,
  WebsiteRedirectLocationSchema,
  type WebsiteFetchResponse,
} from "../../src/server/website-preview-fetcher";
import { WebsitePreviewService } from "../../src/server/website-preview-service";

type FakeResponse = WebsiteFetchResponse | WebsiteFetchFailure;

const httpStatus = (value: number) => HttpStatusCodeSchema.make(value);
const contentType = (value: string) => WebsiteContentTypeSchema.make(value);
const redirectLocation = (value: string) => WebsiteRedirectLocationSchema.make(value);

const fetcherLayer = (responses: Readonly<Record<string, FakeResponse>>) =>
  Layer.succeed(
    WebsitePreviewFetcher,
    WebsitePreviewFetcher.of({
      fetch: (url) => {
        const response = responses[url];
        return response === undefined
          ? Effect.fail(
              new WebsiteFetchFailure({ message: "Unexpected URL", reason: "Unavailable" }),
            )
          : response instanceof WebsiteFetchFailure
            ? Effect.fail(response)
            : Effect.succeed(response);
      },
    }),
  );

const runX = (url: string, responses: Readonly<Record<string, FakeResponse>>) =>
  WebsitePreviewService.use((service) => service.resolveXPost(url)).pipe(
    Effect.provide(WebsitePreviewService.layer),
    Effect.provide(fetcherLayer(responses)),
  );

const run = (url: string, responses: Readonly<Record<string, FakeResponse>>) =>
  WebsitePreviewService.use((service) => service.resolve(url)).pipe(
    Effect.provide(WebsitePreviewService.layer),
    Effect.provide(fetcherLayer(responses)),
  );

describe("WebsitePreviewService", () => {
  it.effect("resolves a sanitized X snapshot and degrades to a durable source", () =>
    Effect.gen(function* () {
      const source = "https://x.com/sheherenow_/status/2082226100764369045";
      const endpoint = `https://publish.x.com/oembed?url=${encodeURIComponent(source)}&omit_script=1&dnt=1`;
      const preview = yield* runX(source, {
        [endpoint]: {
          status: httpStatus(200),
          contentType: contentType("application/json; charset=utf-8"),
          body: new TextEncoder().encode(
            JSON.stringify({
              provider_name: "X",
              url: source,
              author_name: "Jem",
              author_url: "https://x.com/sheherenow_",
              html: `<blockquote class="twitter-tweet"><p>Cooking &amp; ideas</p><a href="${source}">July 28, 2026</a></blockquote>`,
            }),
          ),
        },
      });
      expect(preview).toMatchObject({
        src: source,
        authorName: "Jem",
        authorHandle: "sheherenow_",
        text: "Cooking & ideas",
        date: "2026-07-28",
      });
      expect(yield* runX(source, {})).toEqual({ src: source });
    }),
  );

  it.effect("revalidates redirects and returns a bounded snapshot", () =>
    Effect.gen(function* () {
      const preview = yield* run("https://example.com/start", {
        "https://example.com/start": {
          status: httpStatus(302),
          location: redirectLocation("/story"),
        },
        "https://example.com/story": {
          status: httpStatus(200),
          contentType: contentType("text/html; charset=utf-8"),
          body: new TextEncoder().encode('<meta property="og:title" content="A quiet story">'),
        },
      });
      expect(preview).toEqual({
        url: "https://example.com/story",
        preferredLayout: "card",
        title: "A quiet story",
        siteLabel: "example.com",
      });
    }),
  );

  it.effect("rejects private redirects and falls back for non-HTML responses", () =>
    Effect.gen(function* () {
      const privateRedirect = yield* Effect.flip(
        run("https://example.com/start", {
          "https://example.com/start": {
            status: httpStatus(302),
            location: redirectLocation("https://127.0.0.1/admin"),
          },
        }),
      );
      expect(privateRedirect.code).toBe("Invalid");

      const malformedRedirect = yield* Effect.flip(
        run("https://example.com/bad", {
          "https://example.com/bad": {
            status: httpStatus(302),
            location: redirectLocation("https://["),
          },
        }),
      );
      expect(malformedRedirect.message).toContain("invalid redirect");

      const nonHtml = yield* run("https://example.com/file", {
        "https://example.com/file": {
          status: httpStatus(200),
          contentType: contentType("application/pdf"),
          body: new Uint8Array(),
        },
      });
      expect(nonHtml).toEqual({
        url: "https://example.com/file",
        preferredLayout: "card",
        title: "example.com",
        siteLabel: "example.com",
      });

      const unavailable = yield* run("https://example.com/offline", {});
      expect(unavailable.title).toBe("example.com");

      const blocked = yield* Effect.flip(
        run("https://example.com/private-dns", {
          "https://example.com/private-dns": new WebsiteFetchFailure({
            message: "Private address",
            reason: "Blocked",
          }),
        }),
      );
      expect(blocked.code).toBe("Invalid");
    }),
  );
});
