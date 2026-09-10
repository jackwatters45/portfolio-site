import { Option, Schema } from "effect";

import { UnicodeCodePointSchema } from "../lib/schema";
import {
  MAX_WEBSITE_DESCRIPTION_CHARACTERS,
  MAX_WEBSITE_SITE_LABEL_CHARACTERS,
  MAX_WEBSITE_TITLE_CHARACTERS,
  normalizeWebsiteImageUrl,
  WebsiteDescriptionSchema,
  type WebsitePreview,
  WebsiteSiteLabelSchema,
  WebsiteTitleSchema,
  type WebsiteUrl,
} from "../lib/website-preview";

const decodeUnicodeCodePoint = Schema.decodeUnknownOption(UnicodeCodePointSchema);

const decodeEntity = (entity: string): string => {
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  if (entity.startsWith("#x") || entity.startsWith("#X")) {
    const point = Number.parseInt(entity.slice(2), 16);
    const decoded = Option.getOrNull(decodeUnicodeCodePoint(point));
    return decoded === null ? `&${entity};` : String.fromCodePoint(decoded);
  }
  if (entity.startsWith("#")) {
    const point = Number.parseInt(entity.slice(1), 10);
    const decoded = Option.getOrNull(decodeUnicodeCodePoint(point));
    return decoded === null ? `&${entity};` : String.fromCodePoint(decoded);
  }
  return named[entity.toLowerCase()] ?? `&${entity};`;
};

const decodeEntities = (value: string): string =>
  value.replace(/&([^;\s]{1,16});/g, (_match, entity: string) => decodeEntity(entity));

const cleanText = (value: string | undefined, maximum: number): string | undefined => {
  if (value === undefined) return undefined;
  const cleaned = decodeEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length === 0 ? undefined : cleaned.slice(0, maximum);
};

const prefersImageLayout = (url: URL): boolean => {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname !== "instagram.com") return false;
  return /^\/(?:p|reel|tv)\/[^/]+/i.test(url.pathname);
};

const attributes = (tag: string): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4];
    if (name !== undefined && value !== undefined) result[name] = value;
  }
  return result;
};

export const parseWebsitePreview = (html: string, finalUrl: WebsiteUrl): WebsitePreview => {
  const metadata = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const values = attributes(match[0]);
    const key = (values.property ?? values.name)?.trim().toLowerCase();
    if (key !== undefined && values.content !== undefined && !metadata.has(key)) {
      metadata.set(key, values.content);
    }
  }

  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  const url = new URL(finalUrl);
  const rawSiteLabel =
    cleanText(
      metadata.get("og:site_name") ?? url.hostname.replace(/^www\./i, ""),
      MAX_WEBSITE_SITE_LABEL_CHARACTERS,
    ) ?? url.hostname;
  const siteLabel = WebsiteSiteLabelSchema.make(rawSiteLabel);
  const rawTitle =
    cleanText(
      metadata.get("og:title") ?? metadata.get("twitter:title") ?? titleTag ?? siteLabel,
      MAX_WEBSITE_TITLE_CHARACTERS,
    ) ?? siteLabel;
  const title = WebsiteTitleSchema.make(rawTitle);
  const rawDescription = cleanText(
    metadata.get("og:description") ??
      metadata.get("twitter:description") ??
      metadata.get("description"),
    MAX_WEBSITE_DESCRIPTION_CHARACTERS,
  );
  const description =
    rawDescription === undefined ? undefined : WebsiteDescriptionSchema.make(rawDescription);
  const rawImage =
    metadata.get("og:image:secure_url") ??
    metadata.get("og:image") ??
    metadata.get("twitter:image") ??
    metadata.get("twitter:image:src");
  const imageUrl =
    rawImage === undefined
      ? undefined
      : (normalizeWebsiteImageUrl(decodeEntities(rawImage).trim(), finalUrl) ?? undefined);

  return {
    url: finalUrl,
    ...(imageUrl === undefined ? {} : { imageUrl }),
    preferredLayout: imageUrl !== undefined && prefersImageLayout(url) ? "image" : "card",
    title,
    ...(description === undefined ? {} : { description }),
    siteLabel,
  };
};
