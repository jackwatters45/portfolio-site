import { Effect } from 'effect';

import {
  AccountArchive,
  AccountExportInput,
  AccountExportOutput,
  AccountPreviewInput,
  AccountPreviewOutput,
  AccountRestoreInput,
  AccountRestoreOutput,
} from './account-archive';
import { action } from './action';

export const accountArchiveActions = [
  action({
    name: 'export_account_board',
    description:
      'Download an account board and referenced managed media into a portable .moodboard archive in the approved output folder. Returns the exact checkpoint reference and captured revision. Remote URLs remain URLs. Also use before edits to create an undo checkpoint. Does not change the account board.',
    input: AccountExportInput,
    output: AccountExportOutput,
    readOnly: true,
    destructive: false,
    openWorld: true,
    handle: (input) =>
      Effect.gen(function* () {
        const archives = yield* AccountArchive;

        return { value: yield* archives.export(input) };
      }),
  }),
  action({
    name: 'preview_account_board',
    description:
      'Render an account board as a bounded static JPEG in the approved output folder, including managed media. Returns an image and placeholder warnings. Does not control browser presentation or play audio/video. Do not claim live embed review from this preview.',
    input: AccountPreviewInput,
    output: AccountPreviewOutput,
    readOnly: true,
    destructive: false,
    openWorld: true,
    handle: (input) =>
      Effect.gen(function* () {
        const archives = yield* AccountArchive;

        return yield* archives.preview(input);
      }),
  }),
  action({
    name: 'restore_account_board',
    description:
      'Replace account board content with a reviewed local .moodboard checkpoint as a NEW revision. Requires exact checkpoint digest, current revision, fresh mutation ID, account write permission, and confirm:true. Can remove items and change published content. Capture the current board first for redo. Restores content, not browser undo history, camera, or publication settings. Media uploads may remain after a partial failure; inspect before retrying.',
    input: AccountRestoreInput,
    output: AccountRestoreOutput,
    readOnly: false,
    destructive: true,
    openWorld: true,
    handle: (input) =>
      Effect.gen(function* () {
        const archives = yield* AccountArchive;

        return { value: yield* archives.restore(input) };
      }),
  }),
];
