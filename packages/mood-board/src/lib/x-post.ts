import { Option, Schema } from "effect";

export const MIN_X_CARD_WIDTH = 320;
export const MIN_X_CARD_HEIGHT = 240;
export const MAX_X_POST_INPUT_CHARACTERS = 20_000;
export const MAX_X_POST_URL_CHARACTERS = 2_048;
export const MAX_X_AUTHOR_NAME_CHARACTERS = 120;
export const MAX_X_AUTHOR_HANDLE_CHARACTERS = 15;
export const MAX_X_POST_TEXT_CHARACTERS = 1_000;
export const MAX_X_POST_DATE_CHARACTERS = 10;

const XEmbedMediaWidthSchema = Schema.Int.check(Schema.isBetween({ minimum: 560, maximum: 1_920 }));
const decodeXEmbedMediaWidth = Schema.decodeUnknownOption(XEmbedMediaWidthSchema);

export const XPostDisplaySchema = Schema.Literals(["post", "media"]);
export type XPostDisplay = typeof XPostDisplaySchema.Type;
export const XPostThemeSchema = Schema.Literals(["automatic", "light", "dark"]);
export type XPostTheme = typeof XPostThemeSchema.Type;
export const XPostIdSchema = Schema.String.check(Schema.isPattern(/^\d{1,20}$/)).pipe(
  Schema.brand("XPostId"),
);
export type XPostId = typeof XPostIdSchema.Type;

export type XPostSource = {
  readonly src: XPostUrl;
  readonly postId: XPostId;
  readonly handle: XAuthorHandle;
};

type RawXPostSource = {
  readonly src: string;
  readonly postId: XPostId;
  readonly handle: XAuthorHandle;
};

export type ParsedXPostInput = XPostSource & {
  readonly display: XPostDisplay;
  readonly fromEmbedCode: boolean;
};

const decodeAttributeEntities = (value: string): string =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");

const attributes = (tag: string): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4];
    if (name !== undefined && value !== undefined) result[name] = decodeAttributeEntities(value);
  }
  return result;
};

const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "m.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "m.twitter.com",
]);

const parseXPostUrlValue = (value: string): RawXPostSource | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_X_POST_URL_CHARACTERS) return null;
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      !X_HOSTS.has(url.hostname.toLowerCase())
    )
      return null;
    const match = url.pathname.match(
      /^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,20})(?:\/(?:video|photo)\/\d+)?\/?$/i,
    );
    if (match === null) return null;
    const rawHandle = match[1];
    const rawPostId = match[2];
    if (rawHandle === undefined || rawPostId === undefined) return null;
    const handle = XAuthorHandleSchema.make(rawHandle.toLowerCase());
    const postId = XPostIdSchema.make(rawPostId);
    return {
      src: `https://x.com/${handle}/status/${postId}`,
      postId,
      handle,
    };
  } catch {
    return null;
  }
};

export const parseXPostUrl = (value: string): XPostSource | null => {
  const parsed = parseXPostUrlValue(value);
  return parsed === null ? null : { ...parsed, src: XPostUrlSchema.make(parsed.src) };
};

const normalizeXPostSourceValue = (value: string): string | null =>
  parseXPostUrlValue(value)?.src ?? null;

export const normalizeXPostSource = (value: string): XPostUrl | null => {
  const src = normalizeXPostSourceValue(value);
  return src === null ? null : XPostUrlSchema.make(src);
};

const stripOfficialScript = (value: string): string | null => {
  const script = /\s*<script\b([^>]*)>\s*<\/script\s*>\s*$/i.exec(value);
  if (script === null) return value.trim();
  const values = attributes(script[0]);
  const src = values.src?.toLowerCase();
  if (
    src !== "https://platform.x.com/widgets.js" &&
    src !== "https://platform.twitter.com/widgets.js"
  ) {
    return null;
  }
  return value.slice(0, script.index).trim();
};

export const parseXPostInput = (value: string): ParsedXPostInput | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_X_POST_INPUT_CHARACTERS) return null;
  const direct = parseXPostUrl(trimmed);
  if (direct !== null) return { ...direct, display: "post", fromEmbedCode: false };

  const withoutScript = stripOfficialScript(trimmed);
  if (withoutScript === null) return null;
  const blockquote = /^(<blockquote\b[^>]*>)([\s\S]*)<\/blockquote\s*>$/i.exec(withoutScript);
  if (blockquote === null) return null;
  const openTag = blockquote[1];
  const body = blockquote[2];
  if (openTag === undefined || body === undefined) return null;
  const values = attributes(openTag);
  const classes = new Set((values.class ?? "").split(/\s+/).filter(Boolean));
  const videoEmbed = classes.has("twitter-video");
  if (!classes.has("twitter-tweet") && !videoEmbed) return null;
  const mediaWidth =
    values["data-media-max-width"] === undefined
      ? undefined
      : Option.getOrNull(decodeXEmbedMediaWidth(Number(values["data-media-max-width"])));
  if (mediaWidth === null) return null;

  const sources = [...body.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi)]
    .map((match) => parseXPostUrl(decodeAttributeEntities(match[1] ?? match[2] ?? "")))
    .filter((source): source is XPostSource => source !== null);
  const unique = new Map(sources.map((source) => [source.src, source]));
  if (unique.size !== 1) return null;
  const source = [...unique.values()][0];
  if (source === undefined) return null;
  return {
    ...source,
    display: videoEmbed || mediaWidth !== undefined ? "media" : "post",
    fromEmbedCode: true,
  };
};

export const isXSnapshotDate = (value: string): boolean => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 2006 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export const cleanXSnapshotText = (value: unknown, maximum: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, maximum);
  return cleaned.length === 0 ? undefined : cleaned;
};

export const XPostUrlSchema = Schema.String.check(Schema.isMaxLength(MAX_X_POST_URL_CHARACTERS))
  .check(
    Schema.makeFilter((value) =>
      normalizeXPostSourceValue(value) === value
        ? undefined
        : { path: [], issue: "X post URLs must be canonical public status URLs" },
    ),
  )
  .pipe(Schema.brand("XPostUrl"));
export type XPostUrl = typeof XPostUrlSchema.Type;

export const XAuthorProfileUrlSchema = Schema.String.check(
  Schema.isPattern(/^https:\/\/(?:www\.)?x\.com\/[A-Za-z0-9_]{1,15}\/?$/i),
);
export const XAuthorNameSchema = Schema.String.check(
  Schema.isLengthBetween(1, MAX_X_AUTHOR_NAME_CHARACTERS),
)
  .check(
    Schema.makeFilter((value) =>
      cleanXSnapshotText(value, MAX_X_AUTHOR_NAME_CHARACTERS) === value
        ? undefined
        : { path: [], issue: "X author names must use normalized whitespace" },
    ),
  )
  .pipe(Schema.brand("XAuthorName"));
export type XAuthorName = typeof XAuthorNameSchema.Type;
export const XAuthorHandleSchema = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_]{1,15}$/))
  .check(
    Schema.makeFilter((value) =>
      cleanXSnapshotText(value, MAX_X_AUTHOR_HANDLE_CHARACTERS) === value
        ? undefined
        : { path: [], issue: "X author handles must use normalized whitespace" },
    ),
  )
  .pipe(Schema.brand("XAuthorHandle"));
export type XAuthorHandle = typeof XAuthorHandleSchema.Type;
export const XPostTextSchema = Schema.String.check(
  Schema.isLengthBetween(1, MAX_X_POST_TEXT_CHARACTERS),
)
  .check(
    Schema.makeFilter((value) =>
      cleanXSnapshotText(value, MAX_X_POST_TEXT_CHARACTERS) === value
        ? undefined
        : { path: [], issue: "X post text must use normalized whitespace" },
    ),
  )
  .pipe(Schema.brand("XPostText"));
export type XPostText = typeof XPostTextSchema.Type;
export const XPostDateSchema = Schema.String.check(
  Schema.makeFilter((value) =>
    isXSnapshotDate(value) ? undefined : { path: [], issue: "X post dates must be real ISO dates" },
  ),
).pipe(Schema.brand("XPostDate"));
export type XPostDate = typeof XPostDateSchema.Type;

export const XPostPreviewSchema = Schema.Struct({
  src: XPostUrlSchema,
  authorName: Schema.optional(XAuthorNameSchema),
  authorHandle: Schema.optional(XAuthorHandleSchema),
  text: Schema.optional(XPostTextSchema),
  date: Schema.optional(XPostDateSchema),
});

export type XPostPreview = typeof XPostPreviewSchema.Type;
