import { Effect, Schema } from "effect";

import { AccountIdSchema, type AccountId } from "../lib/account";
import type { Auth } from "./auth";

export const AuthenticatedAccountSchema = Schema.Struct({
  id: AccountIdSchema,
  email: Schema.String,
  name: Schema.String,
});
export type AuthenticatedAccount = typeof AuthenticatedAccountSchema.Type;

export class AuthResolutionError extends Schema.Error<AuthResolutionError>("AuthResolutionError")({
  _tag: Schema.tag("AuthResolutionError"),
  cause: Schema.Defect(),
}) {}

export const resolveAuthenticatedAccountEffect = Effect.fn("Auth.resolveAuthenticatedAccount")(
  function* (auth: Auth, request: Request) {
    const result = yield* Effect.tryPromise({
      try: () => auth.api.getSession({ headers: request.headers }),
      catch: (cause) => new AuthResolutionError({ cause }),
    });
    const user = result?.user;
    if (user === undefined || user === null) return null;
    return yield* Schema.decodeUnknownEffect(AuthenticatedAccountSchema)(user).pipe(
      Effect.mapError((cause) => new AuthResolutionError({ cause })),
    );
  },
);

export const resolveAuthenticatedAccount = (auth: Auth, request: Request) =>
  Effect.runPromise(resolveAuthenticatedAccountEffect(auth, request));

export const isSameOriginMutation = (request: Request): boolean => {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return true;
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
};

export const accountWorkspaceName = (accountId: AccountId): string => `account:${accountId}`;
