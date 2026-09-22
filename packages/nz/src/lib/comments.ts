import * as Schema from 'effect/Schema';

export const NAME_LIMIT = 60;
export const COMMENT_LIMIT = 2000;
export const QUOTE_LIMIT = 180;
export const NAME_STORAGE_KEY = 'nz-comment-name';

const text = (limit: number) =>
  Schema.String.check(Schema.isMaxLength(limit), Schema.isPattern(/\S/));

export const CommentName = text(NAME_LIMIT).check(
  Schema.isPattern(/^\P{Cc}+$/u),
);
export const validName = Schema.is(CommentName);

export class CommentTarget extends Schema.Class<CommentTarget>('CommentTarget')(
  {
    anchor: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,79}$/)),
    quote: text(QUOTE_LIMIT),
  },
) {}

export const GENERAL_COMMENT_TARGET: CommentTarget = {
  anchor: 'general',
  quote: 'General comment',
};

export class CommentMessage extends Schema.Class<CommentMessage>(
  'CommentMessage',
)({
  id: Schema.Number,
  name: Schema.String,
  body: Schema.String,
  createdAt: Schema.String,
}) {}

export class CommentThread extends Schema.Class<CommentThread>('CommentThread')(
  {
    ...CommentTarget.fields,
    id: Schema.Number,
    closed: Schema.Boolean,
    locked: Schema.Boolean,
    replyCount: Schema.Number,
    message: CommentMessage,
  },
) {}

export class ThreadDetail extends Schema.Class<ThreadDetail>('ThreadDetail')({
  thread: CommentThread,
  replies: Schema.Array(CommentMessage),
}) {}

export const CommentSubmission = Schema.Struct({
  name: CommentName,
  body: text(COMMENT_LIMIT),
});
export const ThreadSubmission = Schema.Struct({
  ...CommentSubmission.fields,
  target: CommentTarget,
});
export const ThreadList = Schema.Struct({
  threads: Schema.Array(CommentThread),
});
export const CreatedThread = Schema.Struct({ thread: CommentThread });
export const CreatedReply = Schema.Struct({ message: CommentMessage });

export class CommentError extends Schema.TaggedError<CommentError>()(
  'CommentError',
  {
    status: Schema.Number,
    message: Schema.String,
  },
) {}
