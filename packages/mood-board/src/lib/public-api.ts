import { Option, Schema } from "effect";

import {
  BoardBackgroundFields,
  BoardItemCollectionLengthCheck,
  BoardItemPayloadSchema,
  BoardListLengthCheck,
  BoardSummaryFields,
  BoardTimestampSchema,
  makeBoardDocumentSchema,
} from "./board-rpc";
import { LowercaseHex32Schema } from "./schema";
export const PROFILE_HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,28}[a-z0-9])?$/;
export const MAX_PROFILE_NAME_CHARACTERS = 80;
export const MAX_PROFILE_BIO_CHARACTERS = 280;

export const PublicIdSchema = LowercaseHex32Schema.pipe(Schema.brand("PublicId"));
export type PublicId = typeof PublicIdSchema.Type;

const PublicBoardPublicationFields = {
  publicId: PublicIdSchema,
  publishedAt: BoardTimestampSchema,
};

export const ProfileHandleSchema = Schema.String.check(
  Schema.isPattern(PROFILE_HANDLE_PATTERN),
).pipe(Schema.brand("ProfileHandle"));
export type ProfileHandle = typeof ProfileHandleSchema.Type;
export const ProfileDisplayNameSchema = Schema.String.check(
  Schema.isLengthBetween(1, MAX_PROFILE_NAME_CHARACTERS),
).pipe(Schema.brand("ProfileDisplayName"));
export type ProfileDisplayName = typeof ProfileDisplayNameSchema.Type;
export const ProfileBioSchema = Schema.String.check(
  Schema.isMaxLength(MAX_PROFILE_BIO_CHARACTERS),
).pipe(Schema.brand("ProfileBio"));
export type ProfileBio = typeof ProfileBioSchema.Type;

export const PublicBoardItemSchema = BoardItemPayloadSchema;
export type PublicBoardItem = typeof PublicBoardItemSchema.Type;

export const PublicOwnerSchema = Schema.Struct({
  handle: ProfileHandleSchema,
  displayName: ProfileDisplayNameSchema,
  bio: ProfileBioSchema,
});
export type PublicOwner = typeof PublicOwnerSchema.Type;

export const PublicBoardSummarySchema = Schema.Struct({
  ...PublicBoardPublicationFields,
  ...BoardSummaryFields,
  ...BoardBackgroundFields,
});
export type PublicBoardSummary = typeof PublicBoardSummarySchema.Type;

export const PublicProfileSchema = Schema.Struct({
  owner: PublicOwnerSchema,
  boards: Schema.Array(PublicBoardSummarySchema).check(BoardListLengthCheck),
});
export type PublicProfile = typeof PublicProfileSchema.Type;

export const PublicBoardSchema = Schema.Struct({
  ...PublicBoardPublicationFields,
  owner: PublicOwnerSchema,
  board: makeBoardDocumentSchema(
    Schema.Array(PublicBoardItemSchema).check(BoardItemCollectionLengthCheck),
  ),
});
export type PublicBoard = typeof PublicBoardSchema.Type;

const decodeProfileHandle = Schema.decodeUnknownOption(ProfileHandleSchema);
const decodeProfileDisplayName = Schema.decodeUnknownOption(ProfileDisplayNameSchema);
const decodeProfileBio = Schema.decodeUnknownOption(ProfileBioSchema);

export const normalizeProfileHandle = (value: string): ProfileHandle | null =>
  Option.getOrNull(decodeProfileHandle(value.trim().toLowerCase()));

export const normalizeDisplayName = (value: string): ProfileDisplayName | null =>
  Option.getOrNull(decodeProfileDisplayName(value.trim()));

export const normalizeProfileBio = (value: string): ProfileBio | null =>
  Option.getOrNull(decodeProfileBio(value.trim()));
