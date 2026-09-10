import { Option, Schema } from "effect";

import { AccountIdSchema, type AccountId } from "../lib/account";

const CatalogRouteRowSchema = Schema.Struct({ userId: AccountIdSchema });
const decodeCatalogRouteRow = Schema.decodeUnknownOption(CatalogRouteRowSchema);

export const decodeCatalogRouteUserId = (value: unknown): AccountId | null =>
  Option.getOrNull(decodeCatalogRouteRow(value))?.userId ?? null;
