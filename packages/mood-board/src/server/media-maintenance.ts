import { Effect, Layer, Schedule } from "effect";

import { MediaService } from "./media-service";

export const MediaMaintenanceScheduler = Layer.effectDiscard(
  Effect.gen(function* () {
    const media = yield* MediaService;
    const run = Effect.fn("MediaMaintenanceScheduler.run")(() =>
      media.maintain().pipe(
        Effect.tap((removed) => Effect.logInfo(`Media maintenance removed ${removed} objects`)),
        Effect.catch((error) => Effect.logError("Media maintenance failed", error)),
      ),
    );
    yield* Effect.forkScoped(
      Effect.sleep("1 hour").pipe(
        Effect.andThen(Effect.repeat(run(), Schedule.spaced("24 hours"))),
      ),
    );
  }),
);
