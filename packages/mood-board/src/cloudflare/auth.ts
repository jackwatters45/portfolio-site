import type { D1Database } from '@cloudflare/workers-types';
import { Context, Effect, Layer } from 'effect';

import {
  configuredGoogle,
  createAuth,
  deliverMagicLink,
  parseTrustedOrigins,
  validateAuthBaseURL,
  validateAuthSecret,
  type Auth,
  type AuthCleanupTimestamp,
} from '../server/auth';

import {
  resolveAuthenticatedAccountEffect,
  type AuthenticatedAccount,
  type AuthResolutionError,
} from '../server/request-auth';

export interface CloudflareAuthEnv {
  readonly CATALOG: D1Database;
  readonly BETTER_AUTH_SECRET: string;
  readonly BETTER_AUTH_URL?: string;
  readonly TRUSTED_ORIGINS?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly RESEND_API_KEY?: string;
  readonly EMAIL_SENDER?: string;
  readonly IS_LOCAL?: string;
}

const authCache = new WeakMap<object, Map<string, Auth>>();

export const cloudflareGoogleEnabled = (env: CloudflareAuthEnv): boolean =>
  configuredGoogle(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET) !==
  undefined;

const makeCloudflareAuth = (
  env: CloudflareAuthEnv,
  requestOrigin: string,
): Auth => {
  const local = env.IS_LOCAL === 'true';
  const secret = validateAuthSecret(env.BETTER_AUTH_SECRET, local);

  const baseURL = validateAuthBaseURL(
    env.BETTER_AUTH_URL?.trim() || requestOrigin,
    local,
  );

  let byOrigin = authCache.get(env.CATALOG);

  if (byOrigin === undefined) {
    byOrigin = new Map();
    authCache.set(env.CATALOG, byOrigin);
  }

  const cached = byOrigin.get(baseURL);

  if (cached !== undefined) return cached;

  const trustedOrigins = Array.from(
    new Set([baseURL, ...parseTrustedOrigins(env.TRUSTED_ORIGINS)]),
  );

  const auth = createAuth({
    database: env.CATALOG,
    secret,
    baseURL,
    trustedOrigins,
    useSecureCookies: !baseURL.startsWith('http://'),
    builtInRateLimit: false,
    magicLinkRateLimit: 100,
    google: configuredGoogle(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    sendMagicLink: (input) =>
      deliverMagicLink(
        {
          apiKey: env.RESEND_API_KEY,
          sender: env.EMAIL_SENDER,
          local,
        },
        input,
      ),
  });

  byOrigin.set(baseURL, auth);

  return auth;
};

interface CloudflareAuthRequests {
  readonly handle: (request: Request) => Effect.Effect<Response>;
  readonly account: (
    request: Request,
  ) => Effect.Effect<AuthenticatedAccount | null, AuthResolutionError>;
}

export class CloudflareAuth extends Context.Service<
  CloudflareAuth,
  CloudflareAuthRequests
>()('mood-board/CloudflareAuth') {
  static readonly layerFor = (env: CloudflareAuthEnv, requestOrigin: string) =>
    Layer.sync(this, () => {
      const auth = makeCloudflareAuth(env, requestOrigin);

      return CloudflareAuth.of({
        handle: Effect.fn('CloudflareAuth.handle')((request: Request) =>
          Effect.promise(() => auth.handler(request)),
        ),
        account: Effect.fn('CloudflareAuth.account')((request: Request) =>
          resolveAuthenticatedAccountEffect(auth, request),
        ),
      });
    });
}

export const pruneExpiredCloudflareAuth = async (
  database: D1Database,
  now: AuthCleanupTimestamp,
): Promise<void> => {
  await database.batch([
    database
      .prepare('DELETE FROM "verification" WHERE "expiresAt" < ?')
      .bind(now),
    database.prepare('DELETE FROM "session" WHERE "expiresAt" < ?').bind(now),
  ]);
};
