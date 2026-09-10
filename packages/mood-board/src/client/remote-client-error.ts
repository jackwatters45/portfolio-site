import { Schema } from "effect";

import { HttpStatusCodeSchema, OptionalErrorCauseSchema } from "../lib/schema";

export const RemoteClientFailureReasonSchema = Schema.Literals([
  "Transport",
  "Http",
  "InvalidPayload",
]);

export const RemoteClientErrorFields = {
  message: Schema.String,
  status: Schema.NullOr(HttpStatusCodeSchema),
  cause: OptionalErrorCauseSchema,
};
