import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import {
  AuthCleanupTimestampSchema,
  configuredGoogle,
  createAuth,
  deliverMagicLink,
  parseTrustedOrigins,
  validateAuthBaseURL,
  validateAuthSecret,
} from "./auth";
import { AUTH_SCHEMA_SQL } from "./auth-schema";

const LOCAL_AUTH_SECRET = "moodboard-local-auth-secret-change-me-2026";

export const makeBunAuth = (config: {
  readonly databasePath: string;
  readonly baseURL: string;
}) => {
  const directory = dirname(config.databasePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const database = new Database(config.databasePath, { create: true });
  chmodSync(config.databasePath, 0o600);
  database.exec(AUTH_SCHEMA_SQL);
  const now = AuthCleanupTimestampSchema.make(Date.now());
  database.run('DELETE FROM "verification" WHERE "expiresAt" < ?', [now]);
  database.run('DELETE FROM "session" WHERE "expiresAt" < ?', [now]);

  const local = process.env.NODE_ENV !== "production";
  const configuredBaseURL = process.env.BETTER_AUTH_URL?.trim();
  if (!local && !configuredBaseURL) {
    throw new Error("BETTER_AUTH_URL is required in production.");
  }
  const baseURL = validateAuthBaseURL(configuredBaseURL || config.baseURL, local);
  const secret = validateAuthSecret(
    process.env.BETTER_AUTH_SECRET || (local ? LOCAL_AUTH_SECRET : ""),
    local,
  );

  const google = configuredGoogle(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  return {
    auth: createAuth({
      database,
      secret,
      baseURL,
      trustedOrigins: Array.from(
        new Set([
          baseURL,
          ...(local ? ["http://localhost:5173", "http://127.0.0.1:5173"] : []),
          ...parseTrustedOrigins(process.env.TRUSTED_ORIGINS),
        ]),
      ),
      useSecureCookies: !baseURL.startsWith("http://"),
      builtInRateLimit: false,
      magicLinkRateLimit: 100,
      google,
      sendMagicLink: (input) =>
        deliverMagicLink(
          {
            apiKey: process.env.RESEND_API_KEY,
            sender: process.env.EMAIL_SENDER,
            local,
          },
          input,
        ),
    }),
    googleEnabled: google !== undefined,
    close: () => database.close(),
  };
};
