import { Context, Schema, type Effect } from "effect";

import { OptionalErrorCauseSchema, type HttpStatusCode } from "../lib/schema";
import type { WebsiteUrl } from "../lib/website-preview";

export const WebsiteRedirectLocationSchema = Schema.String.pipe(
  Schema.brand("WebsiteRedirectLocation"),
);
export type WebsiteRedirectLocation = typeof WebsiteRedirectLocationSchema.Type;
export const WebsiteContentTypeSchema = Schema.String.pipe(Schema.brand("WebsiteContentType"));
export type WebsiteContentType = typeof WebsiteContentTypeSchema.Type;

export interface WebsiteFetchResponse {
  readonly status: HttpStatusCode;
  readonly location?: WebsiteRedirectLocation;
  readonly contentType?: WebsiteContentType;
  readonly body?: Uint8Array;
}

export class WebsiteFetchFailure extends Schema.Error<WebsiteFetchFailure>("WebsiteFetchFailure")({
  _tag: Schema.tag("WebsiteFetchFailure"),
  message: Schema.String,
  reason: Schema.Literals(["Blocked", "Unavailable", "TooLarge"]),
  cause: OptionalErrorCauseSchema,
}) {}

interface WebsitePreviewFetcherShape {
  readonly fetch: (url: WebsiteUrl) => Effect.Effect<WebsiteFetchResponse, WebsiteFetchFailure>;
}

export class WebsitePreviewFetcher extends Context.Service<
  WebsitePreviewFetcher,
  WebsitePreviewFetcherShape
>()("mood-board/WebsitePreviewFetcher") {}
