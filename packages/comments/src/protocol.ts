import * as Schema from 'effect/Schema';

export const NAME_LIMIT = 40;

export const BODY_LIMIT = 2000;

export const OwnershipCredential = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/),
);

export const COLORS = [
  '#5268e8',
  '#bf4b72',
  '#208779',
  '#b17418',
  '#8b55cc',
  '#c25a36',
] as const;

const text = (max: number) =>
  Schema.String.check(Schema.isMaxLength(max), Schema.isPattern(/\S/));

export const Name = text(NAME_LIMIT).check(Schema.isPattern(/^\P{Cc}+$/u));

export const validName = Schema.is(Name);

const Id = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,80}$/));

const Fraction = Schema.Number.check(
  Schema.isBetween({ minimum: 0, maximum: 1 }),
);

export class Target extends Schema.Class<Target>('CommentTarget')({
  selector: Schema.String.check(Schema.isMaxLength(1000)),
  quote: text(180),
  x: Fraction,
  y: Fraction,
}) {}

export const GENERAL_TARGET: Target = {
  selector: '',
  quote: 'Page comment',
  x: 0.5,
  y: 0,
};

export class Author extends Schema.Class<Author>('CommentAuthor')({
  id: Id,
  name: Name,
  color: Schema.Literals(COLORS),
}) {}

export class Message extends Schema.Class<Message>('CommentMessage')({
  id: Id,
  author: Author,
  body: text(BODY_LIMIT),
  createdAt: Schema.String,
  ownerId: Schema.optional(OwnershipCredential),
  editedAt: Schema.optional(Schema.String),
  deletedAt: Schema.optional(Schema.String),
}) {}

export class Thread extends Schema.Class<Thread>('CommentThread')({
  id: Id,
  target: Target,
  messages: Schema.Array(Message),
  likes: Schema.Array(
    Schema.Struct({ messageId: Id, authorId: Id, authorName: Name }),
  ),
}) {}

export class Cursor extends Schema.Class<Cursor>('CommentCursor')({
  selector: Schema.String.check(Schema.isMaxLength(1000)),
  x: Fraction,
  y: Fraction,
}) {}

export class Peer extends Schema.Class<Peer>('CommentPeer')({
  id: Id,
  name: Name,
  color: Schema.Literals(COLORS),
  cursor: Schema.NullOr(Cursor),
  typing: Schema.NullOr(Schema.String.check(Schema.isMaxLength(1000))),
  updatedAt: Schema.Number,
}) {}

export class CreateComment extends Schema.Class<CreateComment>('CreateComment')(
  {
    type: Schema.Literal('create'),
    credential: OwnershipCredential,
    requestId: Id,
    author: Author,
    target: Target,
    body: text(BODY_LIMIT),
  },
) {}

export class Reply extends Schema.Class<Reply>('Reply')({
  type: Schema.Literal('reply'),
  credential: OwnershipCredential,
  requestId: Id,
  author: Author,
  threadId: Id,
  body: text(BODY_LIMIT),
}) {}

export class SetLike extends Schema.Class<SetLike>('SetLike')({
  type: Schema.Literal('like'),
  requestId: Id,
  author: Author,
  threadId: Id,
  messageId: Id,
  liked: Schema.Boolean,
}) {}

export class EditComment extends Schema.Class<EditComment>('EditComment')({
  type: Schema.Literal('edit'),
  requestId: Id,
  author: Author,
  credential: OwnershipCredential,
  threadId: Id,
  messageId: Id,
  body: text(BODY_LIMIT),
  expectedBody: text(BODY_LIMIT),
}) {}

export class DeleteComment extends Schema.Class<DeleteComment>('DeleteComment')(
  {
    type: Schema.Literal('delete'),
    requestId: Id,
    author: Author,
    credential: OwnershipCredential,
    threadId: Id,
    messageId: Id,
  },
) {}

export const Mutation = Schema.Union([
  CreateComment,
  Reply,
  SetLike,
  EditComment,
  DeleteComment,
]);

export type Mutation = typeof Mutation.Type;

export class PresenceUpdate extends Schema.Class<PresenceUpdate>(
  'PresenceUpdate',
)({
  type: Schema.Literal('presence'),
  name: Name,
  color: Schema.Literals(COLORS),
  cursor: Schema.NullOr(Cursor),
  typing: Schema.NullOr(Schema.String.check(Schema.isMaxLength(1000))),
}) {}

export class Ping extends Schema.Class<Ping>('Ping')({
  type: Schema.Literal('ping'),
}) {}

export const ClientEvent = Schema.Union([Mutation, PresenceUpdate, Ping]);

export type ClientEvent = typeof ClientEvent.Type;

export class Snapshot extends Schema.Class<Snapshot>('Snapshot')({
  type: Schema.Literal('snapshot'),
  selfId: Id,
  threads: Schema.Array(Thread),
  peers: Schema.Array(Peer),
}) {}

export class ThreadUpdate extends Schema.Class<ThreadUpdate>('ThreadUpdate')({
  type: Schema.Literal('thread'),
  thread: Thread,
}) {}

export class PresenceSnapshot extends Schema.Class<PresenceSnapshot>(
  'PresenceSnapshot',
)({ type: Schema.Literal('presence'), peers: Schema.Array(Peer) }) {}

export class Acknowledgement extends Schema.Class<Acknowledgement>(
  'Acknowledgement',
)({ type: Schema.Literal('ack'), requestId: Id, threadId: Id }) {}

export class ServerFailure extends Schema.Class<ServerFailure>('ServerFailure')(
  {
    type: Schema.Literal('error'),
    requestId: Schema.optional(Id),
    message: Schema.String,
  },
) {}

export class Pong extends Schema.Class<Pong>('Pong')({
  type: Schema.Literal('pong'),
}) {}

export const ServerEvent = Schema.Union([
  Snapshot,
  ThreadUpdate,
  PresenceSnapshot,
  Acknowledgement,
  ServerFailure,
  Pong,
]);

export type ServerEvent = typeof ServerEvent.Type;

export class CommentRequestError extends Schema.TaggedError<CommentRequestError>()(
  'CommentRequestError',
  { message: Schema.String },
) {}

export const decodeClient = Schema.decodeUnknownOption(
  Schema.fromJsonString(ClientEvent),
);

export const decodeServer = Schema.decodeUnknownOption(
  Schema.fromJsonString(ServerEvent),
);
