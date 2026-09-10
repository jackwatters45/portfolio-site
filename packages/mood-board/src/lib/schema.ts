import { Schema } from "effect";

export const NonNegativeIntegerSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const PositiveIntegerSchema = Schema.Int.check(Schema.isGreaterThan(0));
export const HttpStatusCodeSchema = Schema.Int.check(
  Schema.isBetween({ minimum: 100, maximum: 599 }),
).pipe(Schema.brand("HttpStatusCode"));
export type HttpStatusCode = typeof HttpStatusCodeSchema.Type;
export const UnicodeCodePointSchema = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 0x10ffff }),
);
export const Sha256HexSchema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/));
export const LowercaseHex32Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{32}$/));
export const OptionalErrorCauseSchema = Schema.optional(Schema.Defect());
