import { Effect } from 'effect';

import { AccountMedia } from './account-media';
import {
  AccountMediaPrepareInput,
  AccountMediaPrepared,
  AccountMediaUploadInput,
  AccountMediaUploadOutput,
  AccountMediaReadInput,
  AccountMediaReadOutput,
} from './account-media-contracts';
import { action } from './action';

export const accountMediaActions = [
  action({
    name: 'prepare_account_media',
    description:
      'Validate an approved local asset and prepare image or audio upload metadata. No account write. Upload checks the source hash again.',
    input: AccountMediaPrepareInput,
    output: AccountMediaPrepared,
    readOnly: true,
    destructive: false,
    openWorld: false,
    handle: (input) =>
      Effect.gen(function* () {
        const media = yield* AccountMedia;

        return { value: yield* media.prepare(input) };
      }),
  }),
  action({
    name: 'upload_account_media',
    description:
      'Upload prepared media and add an image/audio item or image background to an existing account board. Requires exact account, expected revision, mutation id, startup write approval, and confirm:true. Partial failures retain upload receipts; never retry or delete automatically.',
    input: AccountMediaUploadInput,
    output: AccountMediaUploadOutput,
    readOnly: false,
    destructive: false,
    openWorld: true,
    handle: (input) =>
      Effect.gen(function* () {
        const media = yield* AccountMedia;

        return { value: yield* media.upload(input) };
      }),
  }),
  action({
    name: 'read_account_media',
    description:
      'Download managed media referenced by an account board into the approved output folder. Checks ownership, kind, byte limits, and signature. Requests only pinned owner media paths.',
    input: AccountMediaReadInput,
    output: AccountMediaReadOutput,
    readOnly: false,
    destructive: false,
    openWorld: true,
    handle: (input) =>
      Effect.gen(function* () {
        const media = yield* AccountMedia;

        return { value: yield* media.read(input) };
      }),
  }),
];
