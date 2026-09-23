import { Effect } from 'effect';

import { AccountStatusOutput } from './account-contracts';
import {
  AccountOwner,
  AccountUserProfileInput,
  AccountOwnerInput,
  AccountOwnerOutput,
  AccountProfileInput,
  AccountPublicationInput,
  AccountReconcileInput,
} from './account-owner';
import { action } from './action';

export const accountOwnerActions = [
  action({
    name: 'update_account_profile',
    description:
      'Change the signed-in account display name, matching the profile UI. Requires account write permission and explicit confirmation. Does not change publisher handle, email, password, or publication settings.',
    input: AccountUserProfileInput,
    output: AccountStatusOutput,
    readOnly: false,
    destructive: false,
    openWorld: true,
    handle: (input) =>
      Effect.gen(function* () {
        const owner = yield* AccountOwner;

        return { value: yield* owner.updateUser(input) };
      }),
  }),
  action({
    name: 'get_account_publishing',
    description:
      'Read the publisher profile, publications, and version guards for this account. No changes. Use these versions before changing profile or publication state.',
    input: AccountOwnerInput,
    output: AccountOwnerOutput,
    readOnly: true,
    destructive: false,
    openWorld: true,
    handle: (input) =>
      Effect.gen(function* () {
        const owner = yield* AccountOwner;

        return { value: yield* owner.read(input) };
      }),
  }),
  action({
    name: 'configure_account_publisher',
    description:
      'Change the public publisher handle, display name, and bio. Requires account write permission, current profile version, and confirm:true after explicit user approval. This changes public profile information, not the login account name.',
    input: AccountProfileInput,
    output: AccountOwnerOutput,
    readOnly: false,
    destructive: true,
    openWorld: true,
    handle: (input) =>
      Effect.gen(function* () {
        const owner = yield* AccountOwner;

        return { value: yield* owner.configure(input) };
      }),
  }),
  action({
    name: 'publish_account_board',
    description:
      'Make this account board and its referenced media public. Requires explicit user approval with confirm:true, account write permission, current board revision, publisher version, and publication version. Do not infer publication approval from board content. Published boards reflect future content edits.',
    input: AccountPublicationInput,
    output: AccountOwnerOutput,
    readOnly: false,
    destructive: true,
    openWorld: true,
    handle: (input) =>
      Effect.gen(function* () {
        const owner = yield* AccountOwner;

        return { value: yield* owner.publication(input, true) };
      }),
  }),
  action({
    name: 'unpublish_account_board',
    description:
      'Revoke public access to this board and its publication-scoped media. Requires explicit confirmation and current board, profile, and publication versions. Does not delete the private board.',
    input: AccountPublicationInput,
    output: AccountOwnerOutput,
    readOnly: false,
    destructive: true,
    openWorld: true,
    handle: (input) =>
      Effect.gen(function* () {
        const owner = yield* AccountOwner;

        return { value: yield* owner.publication(input, false) };
      }),
  }),
  action({
    name: 'reconcile_account_publishing',
    description:
      'Repair public routing after a partial profile or publication update. Uses authoritative account state; does not select new boards for publication. Requires explicit confirmation and account write permission.',
    input: AccountReconcileInput,
    output: AccountOwnerOutput,
    readOnly: false,
    destructive: true,
    openWorld: true,
    handle: (input) =>
      Effect.gen(function* () {
        const owner = yield* AccountOwner;

        return { value: yield* owner.reconcile(input) };
      }),
  }),
];
