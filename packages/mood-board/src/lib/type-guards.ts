import { Predicate, Schema } from 'effect';

const RecordSchema = Schema.Record(
  Schema.String,
  Schema.Unknown.pipe(Schema.mutableKey),
);

// Preserve the shallow object boundary without reading metadata properties or getters.
const RecordBoundarySchema = Schema.declare<typeof RecordSchema.Type>(
  Predicate.isObject,
);

export const isRecord = Schema.is(RecordBoundarySchema);
