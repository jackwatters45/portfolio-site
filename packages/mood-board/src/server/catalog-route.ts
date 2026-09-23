import { flow, Option, Schema } from 'effect';

import { AccountIdSchema } from '../lib/account';

const CatalogRouteRowSchema = Schema.Struct({ userId: AccountIdSchema });

const decodeCatalogRouteRow = Schema.decodeUnknownOption(CatalogRouteRowSchema);

export const decodeCatalogRouteUserId = flow(
  decodeCatalogRouteRow,
  Option.map((row) => row.userId),
  Option.getOrNull,
);
