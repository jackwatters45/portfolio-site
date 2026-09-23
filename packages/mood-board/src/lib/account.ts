import { flow, Option, Schema } from 'effect';

export const AccountIdSchema = Schema.String.check(
  Schema.makeFilter((value) =>
    value.length > 0
      ? undefined
      : { path: [], issue: 'Account IDs cannot be empty' },
  ),
).pipe(Schema.brand('AccountId'));

export type AccountId = typeof AccountIdSchema.Type;

const decodeAccountIdOption = Schema.decodeUnknownOption(AccountIdSchema);

export const decodeAccountId = flow(decodeAccountIdOption, Option.getOrNull);
