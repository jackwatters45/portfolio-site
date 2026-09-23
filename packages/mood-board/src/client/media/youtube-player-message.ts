import { Option, Schema } from 'effect';

export const YOUTUBE_PLAYER_ORIGIN = 'https://www.youtube-nocookie.com';

const PlayingMessageSchema = Schema.Union([
  Schema.Struct({
    event: Schema.Literal('onStateChange'),
    info: Schema.Literal(1),
  }),
  Schema.Struct({
    event: Schema.Literal('infoDelivery'),
    info: Schema.Struct({ playerState: Schema.Literal(1) }),
  }),
]);

const decodePlayingMessage = Schema.decodeUnknownOption(
  Schema.Union([
    PlayingMessageSchema,
    Schema.fromJsonString(PlayingMessageSchema),
  ]),
);

export const isYouTubePlayingMessage = (
  event: Pick<MessageEvent, 'data' | 'origin' | 'source'>,
  source: MessageEventSource | null,
): boolean => {
  if (
    event.origin !== YOUTUBE_PLAYER_ORIGIN ||
    event.source !== source ||
    source === null
  ) {
    return false;
  }

  return Option.isSome(decodePlayingMessage(event.data));
};
