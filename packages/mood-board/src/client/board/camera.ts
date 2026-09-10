import { Schema } from "effect";

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 3;

export const CameraSchema = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  z: Schema.Finite.check(Schema.isBetween({ minimum: MIN_ZOOM, maximum: MAX_ZOOM })),
});
export type Camera = typeof CameraSchema.Type;
