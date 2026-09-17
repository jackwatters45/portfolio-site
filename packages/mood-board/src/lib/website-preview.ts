import { Option, Schema } from "effect";

import { NonNegativeIntegerSchema } from "./schema";

export const MIN_WEBSITE_CARD_WIDTH = 320;
export const MIN_WEBSITE_CARD_HEIGHT = 280;
export const MAX_WEBSITE_URL_CHARACTERS = 2_048;
export const MAX_WEBSITE_IMAGE_URL_CHARACTERS = 4_096;
export const MAX_WEBSITE_TITLE_CHARACTERS = 120;
export const MAX_WEBSITE_DESCRIPTION_CHARACTERS = 500;
export const MAX_WEBSITE_SITE_LABEL_CHARACTERS = 80;
export const WebsiteHtmlByteCountSchema = NonNegativeIntegerSchema.pipe(
  Schema.brand("WebsiteHtmlByteCount"),
);
export type WebsiteHtmlByteCount = typeof WebsiteHtmlByteCountSchema.Type;
export const WebsiteHtmlByteOffsetSchema = NonNegativeIntegerSchema.pipe(
  Schema.brand("WebsiteHtmlByteOffset"),
);
export type WebsiteHtmlByteOffset = typeof WebsiteHtmlByteOffsetSchema.Type;
export const MAX_WEBSITE_HTML_BYTES: WebsiteHtmlByteCount = WebsiteHtmlByteCountSchema.make(
  512 * 1_024,
);
export const WebsiteRedirectCountSchema = NonNegativeIntegerSchema.check(
  Schema.isLessThanOrEqualTo(3),
).pipe(Schema.brand("WebsiteRedirectCount"));
export type WebsiteRedirectCount = typeof WebsiteRedirectCountSchema.Type;
export const MAX_WEBSITE_REDIRECTS: WebsiteRedirectCount = WebsiteRedirectCountSchema.make(3);

const Ipv4OctetSchema = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 }));
const Ipv4AddressSchema = Schema.Tuple([
  Ipv4OctetSchema,
  Ipv4OctetSchema,
  Ipv4OctetSchema,
  Ipv4OctetSchema,
]);
const decodeIpv4Address = Schema.decodeUnknownOption(Ipv4AddressSchema);
const Ipv6SegmentSchema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{1,4}$/i));
const Ipv6PrefixSchema = Schema.Tuple([Ipv6SegmentSchema, Ipv6SegmentSchema]);
const decodeIpv6Prefix = Schema.decodeUnknownOption(Ipv6PrefixSchema);

const parseIpv4 = (hostname: string): readonly number[] | null =>
  Option.getOrNull(decodeIpv4Address(hostname.split(".").map(Number)));

export const isBlockedWebsiteAddress = (address: string): boolean => {
  const normalized =
    address
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .split("%", 1)[0] ?? "";
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = parseIpv4(mappedIpv4 ?? normalized);
  if (ipv4 !== null) {
    const [first = 0, second = 0, third = 0] = ipv4;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 192 && second === 88 && third === 99) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224
    );
  }
  if (!normalized.includes(":")) return false;
  const parts = normalized.split(":");
  const prefix = Option.getOrNull(decodeIpv6Prefix([parts[0] || "0", parts[1] || "0"]));
  if (prefix === null) return true;
  const first = Number.parseInt(prefix[0], 16);
  const second = Number.parseInt(prefix[1], 16);
  return (
    normalized.startsWith("::") ||
    first === 0 ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (first === 0x64 && second === 0xff9b) ||
    first === 0x100 ||
    (first === 0x2001 && (second <= 0x1ff || second === 0xdb8)) ||
    first === 0x2002 ||
    first === 0x3ffe ||
    first === 0x3fff ||
    first < 0x2000 ||
    first > 0x3fff
  );
};

export const isBlockedWebsiteHostname = (hostname: string): boolean => {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  return (
    normalized.length === 0 ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".home.arpa") ||
    (!normalized.includes(".") && !normalized.includes(":")) ||
    isBlockedWebsiteAddress(normalized)
  );
};

const normalizeWebsiteUrlValue = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_WEBSITE_URL_CHARACTERS) return null;
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      (url.port !== "" && url.port !== "443") ||
      isBlockedWebsiteHostname(url.hostname)
    )
      return null;
    url.port = "";
    url.hash = "";
    return url.href.length <= MAX_WEBSITE_URL_CHARACTERS ? url.href : null;
  } catch {
    return null;
  }
};

const normalizeWebsiteImageUrlValue = (value: string, baseUrl?: string): string | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_WEBSITE_IMAGE_URL_CHARACTERS) return null;
  try {
    const url = new URL(trimmed, baseUrl);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      (url.port !== "" && url.port !== "443") ||
      isBlockedWebsiteHostname(url.hostname)
    )
      return null;
    url.port = "";
    url.hash = "";
    return url.href.length <= MAX_WEBSITE_IMAGE_URL_CHARACTERS ? url.href : null;
  } catch {
    return null;
  }
};

export const WebsiteUrlSchema = Schema.String.check(Schema.isMaxLength(MAX_WEBSITE_URL_CHARACTERS))
  .check(
    Schema.makeFilter((value) =>
      normalizeWebsiteUrlValue(value) === value
        ? undefined
        : { path: [], issue: "Website URLs must be normalized public HTTPS URLs" },
    ),
  )
  .pipe(Schema.brand("WebsiteUrl"));
export type WebsiteUrl = typeof WebsiteUrlSchema.Type;

export const WebsiteImageUrlSchema = Schema.String.check(
  Schema.isMaxLength(MAX_WEBSITE_IMAGE_URL_CHARACTERS),
)
  .check(
    Schema.makeFilter((value) =>
      normalizeWebsiteImageUrlValue(value) === value
        ? undefined
        : { path: [], issue: "Website preview images must be normalized public HTTPS URLs" },
    ),
  )
  .pipe(Schema.brand("WebsiteImageUrl"));
export type WebsiteImageUrl = typeof WebsiteImageUrlSchema.Type;

export const normalizeWebsiteUrl = (value: string): WebsiteUrl | null => {
  const normalized = normalizeWebsiteUrlValue(value);
  return normalized === null ? null : WebsiteUrlSchema.make(normalized);
};

export const normalizeWebsiteImageUrl = (
  value: string,
  baseUrl?: string,
): WebsiteImageUrl | null => {
  const normalized = normalizeWebsiteImageUrlValue(value, baseUrl);
  return normalized === null ? null : WebsiteImageUrlSchema.make(normalized);
};

export const WebsiteTitleSchema = Schema.String.check(
  Schema.isLengthBetween(1, MAX_WEBSITE_TITLE_CHARACTERS),
).pipe(Schema.brand("WebsiteTitle"));
export type WebsiteTitle = typeof WebsiteTitleSchema.Type;
export const WebsiteDescriptionSchema = Schema.String.check(
  Schema.isLengthBetween(1, MAX_WEBSITE_DESCRIPTION_CHARACTERS),
).pipe(Schema.brand("WebsiteDescription"));
export type WebsiteDescription = typeof WebsiteDescriptionSchema.Type;
export const WebsiteSiteLabelSchema = Schema.String.check(
  Schema.isLengthBetween(1, MAX_WEBSITE_SITE_LABEL_CHARACTERS),
).pipe(Schema.brand("WebsiteSiteLabel"));
export type WebsiteSiteLabel = typeof WebsiteSiteLabelSchema.Type;

export const WebsitePreviewSchema = Schema.Struct({
  url: WebsiteUrlSchema,
  imageUrl: Schema.optional(WebsiteImageUrlSchema),
  preferredLayout: Schema.optional(Schema.Literals(["card", "image"])),
  title: WebsiteTitleSchema,
  description: Schema.optional(WebsiteDescriptionSchema),
  siteLabel: WebsiteSiteLabelSchema,
});

export type WebsitePreview = typeof WebsitePreviewSchema.Type;
