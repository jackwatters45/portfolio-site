import { Option, Schema } from 'effect';

import { UnicodeCodePointSchema } from '../lib/schema';
import {
  cleanXSnapshotText,
  MAX_X_AUTHOR_NAME_CHARACTERS,
  MAX_X_POST_TEXT_CHARACTERS,
  parseXPostUrl,
  XAuthorHandleSchema,
  XAuthorNameSchema,
  XAuthorProfileUrlSchema,
  XPostDateSchema,
  type XPostDate,
  XPostTextSchema,
  type XPostPreview,
} from '../lib/x-post';

type XPostPreviewDraft = {
  -readonly [K in keyof XPostPreview]: XPostPreview[K];
};

const decodeUnicodeCodePoint = Schema.decodeUnknownOption(
  UnicodeCodePointSchema,
);

const decodeXPostDate = Schema.decodeUnknownOption(XPostDateSchema);

const decodeXAuthorHandle = Schema.decodeUnknownOption(XAuthorHandleSchema);

const decodeXAuthorName = Schema.decodeUnknownOption(XAuthorNameSchema);

const decodeXPostText = Schema.decodeUnknownOption(XPostTextSchema);

const decodeXAuthorProfileUrl = Schema.decodeUnknownOption(
  XAuthorProfileUrlSchema,
);

interface XHtmlEntities {
  readonly [name: string]: string;
}

interface CalendarMonths {
  readonly [month: string]: string;
}

const decodeEntity = (entity: string): string => {
  const named: XHtmlEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  if (/^#x[0-9a-f]+$/i.test(entity)) {
    const point = Number.parseInt(entity.slice(2), 16);
    const decoded = Option.getOrNull(decodeUnicodeCodePoint(point));

    return decoded === null ? '' : String.fromCodePoint(decoded);
  }

  if (/^#\d+$/.test(entity)) {
    const point = Number.parseInt(entity.slice(1), 10);
    const decoded = Option.getOrNull(decodeUnicodeCodePoint(point));

    return decoded === null ? '' : String.fromCodePoint(decoded);
  }

  return named[entity.toLowerCase()] ?? '';
};

const textFromHtml = (value: string, maximum: number): string | undefined =>
  cleanXSnapshotText(
    value
      .replace(
        /<(?:script|style|template)\b[^>]*>[\s\S]*?<\/(?:script|style|template)\s*>/gi,
        ' ',
      )
      .replace(/<[^>]*>/g, ' ')
      .replace(/&([^;\s]{1,16});/g, (_match, entity: string) =>
        decodeEntity(entity),
      ),
    maximum,
  );

const monthNumber: CalendarMonths = {
  January: '01',
  February: '02',
  March: '03',
  April: '04',
  May: '05',
  June: '06',
  July: '07',
  August: '08',
  September: '09',
  October: '10',
  November: '11',
  December: '12',
};

const XOEmbedSchema = Schema.Struct({
  provider_name: Schema.Literal('X'),
  html: Schema.String.check(Schema.isMaxLength(32_000)),
  url: Schema.String,
  author_name: Schema.optional(Schema.Unknown),
  author_url: Schema.optional(Schema.Unknown),
});

const decodeXOEmbed = Schema.decodeUnknownOption(
  Schema.fromJsonString(XOEmbedSchema),
);

const decodeAuthorNameInput = Schema.decodeUnknownOption(Schema.String);

const normalizeDate = (value: string | undefined): XPostDate | undefined => {
  if (value === undefined) return undefined;
  const match = value.trim().match(/^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/);

  if (match === null) return undefined;
  const month = monthNumber[match[1] ?? ''];

  if (month === undefined) return undefined;
  const day = Number(match[2]);
  const year = Number(match[3]);
  const iso = `${String(year).padStart(4, '0')}-${month}-${String(day).padStart(2, '0')}`;

  return Option.getOrUndefined(decodeXPostDate(iso));
};

export const parseXPostOEmbed = (
  body: Uint8Array,
  expectedSource: string,
): XPostPreview | null => {
  const decoded = decodeXOEmbed(new TextDecoder().decode(body));

  if (Option.isNone(decoded)) return null;
  const record = decoded.value;
  const returned = parseXPostUrl(record.url);
  const expected = parseXPostUrl(expectedSource);

  if (
    returned === null ||
    expected === null ||
    returned.postId !== expected.postId
  )
    return null;

  const paragraph = record.html.match(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/i)?.[1];

  const terminalDate = [
    ...record.html.matchAll(
      /<a\b[^>]*href=(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi,
    ),
  ]
    .map((match) => ({
      source: parseXPostUrl(match[1] ?? match[2] ?? ''),
      text: match[3],
    }))
    .find((entry) => entry.source?.postId === expected.postId)?.text;

  const authorName = Option.getOrUndefined(
    decodeXAuthorName(
      cleanXSnapshotText(
        Option.getOrUndefined(decodeAuthorNameInput(record.author_name)),
        MAX_X_AUTHOR_NAME_CHARACTERS,
      ),
    ),
  );

  const authorUrl = Option.getOrUndefined(
    decodeXAuthorProfileUrl(record.author_url),
  );

  const authorSource =
    authorUrl === undefined
      ? undefined
      : Option.getOrUndefined(
          decodeXAuthorHandle(new URL(authorUrl).pathname.split('/')[1]),
        );

  const text = Option.getOrUndefined(
    decodeXPostText(
      paragraph === undefined
        ? undefined
        : textFromHtml(paragraph, MAX_X_POST_TEXT_CHARACTERS),
    ),
  );

  const date = normalizeDate(textFromHtml(terminalDate ?? '', 40));
  const authorHandle = authorSource ?? expected.handle;

  const preview: XPostPreviewDraft = {
    src: expected.src,
    authorHandle,
  };

  if (authorName !== undefined) preview.authorName = authorName;

  if (text !== undefined) preview.text = text;

  if (date !== undefined) preview.date = date;

  return preview;
};
