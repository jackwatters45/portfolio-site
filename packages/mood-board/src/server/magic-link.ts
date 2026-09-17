import { Option, Schema } from "effect";

const MagicLinkRequestSchema = Schema.Struct({ email: Schema.String });
export const MagicLinkRateLimitEmailSchema = Schema.String.check(
  Schema.makeFilter((value) =>
    value.trim().toLowerCase() === value
      ? undefined
      : { path: [], issue: "Magic-link rate-limit emails must be normalized" },
  ),
).pipe(Schema.brand("MagicLinkRateLimitEmail"));
export type MagicLinkRateLimitEmail = typeof MagicLinkRateLimitEmailSchema.Type;
export const MISSING_MAGIC_LINK_EMAIL = MagicLinkRateLimitEmailSchema.make("");

const decodeMagicLinkRequest = Schema.decodeUnknownOption(MagicLinkRequestSchema);
const decodeMagicLinkRateLimitEmail = Schema.decodeUnknownOption(MagicLinkRateLimitEmailSchema);

export const decodeMagicLinkEmail = (value: unknown): MagicLinkRateLimitEmail | null => {
  const decoded = decodeMagicLinkRequest(value);
  return Option.isSome(decoded)
    ? Option.getOrNull(decodeMagicLinkRateLimitEmail(decoded.value.email.trim().toLowerCase()))
    : null;
};
