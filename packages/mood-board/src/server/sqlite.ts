import { Schema } from "effect";

export const NullableSqliteBooleanSchema = Schema.NullOr(Schema.Literals([0, 1]));
