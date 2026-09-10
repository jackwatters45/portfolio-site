import { betterAuth, type BetterAuthOptions } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { Effect, Schema } from "effect";

import {
  HttpStatusCodeSchema,
  NonNegativeIntegerSchema,
  OptionalErrorCauseSchema,
} from "../lib/schema";

export const AuthCleanupTimestampSchema = NonNegativeIntegerSchema.pipe(
  Schema.brand("AuthCleanupTimestamp"),
);
export type AuthCleanupTimestamp = typeof AuthCleanupTimestampSchema.Type;

export const AuthBaseUrlSchema = Schema.String.check(
  Schema.makeFilter((value) => {
    try {
      return new URL(value).origin === value
        ? undefined
        : { path: [], issue: "Authentication base URLs must be canonical origins" };
    } catch {
      return { path: [], issue: "Authentication base URLs must be absolute origins" };
    }
  }),
).pipe(Schema.brand("AuthBaseUrl"));
export type AuthBaseUrl = typeof AuthBaseUrlSchema.Type;

export const AuthSecretSchema = Schema.String.check(Schema.isMinLength(1)).pipe(
  Schema.brand("AuthSecret"),
);
export type AuthSecret = typeof AuthSecretSchema.Type;

export type AuthDatabase = NonNullable<BetterAuthOptions["database"]>;

export interface AuthConfig {
  readonly database: AuthDatabase;
  readonly secret: AuthSecret;
  readonly baseURL: AuthBaseUrl;
  readonly trustedOrigins?: ReadonlyArray<string>;
  readonly useSecureCookies?: boolean;
  readonly builtInRateLimit?: boolean;
  readonly magicLinkRateLimit?: number;
  readonly google?: {
    readonly clientId: string;
    readonly clientSecret: string;
  };
  readonly sendMagicLink: (input: {
    readonly email: string;
    readonly url: string;
  }) => Promise<void> | void;
}

export const createAuth = (config: AuthConfig) =>
  betterAuth({
    database: config.database,
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: [...(config.trustedOrigins ?? [])],
    advanced: {
      useSecureCookies: config.useSecureCookies ?? true,
    },
    emailAndPassword: { enabled: false },
    account: { encryptOAuthTokens: true },
    rateLimit: {
      enabled: config.builtInRateLimit ?? true,
      window: 60,
      max: 100,
    },
    socialProviders: config.google === undefined ? {} : { google: config.google },
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        storeToken: "hashed",
        rateLimit: { window: 60, max: config.magicLinkRateLimit ?? 5 },
        sendMagicLink: ({ email, url }) => config.sendMagicLink({ email, url }),
      }),
    ],
  });

export type Auth = ReturnType<typeof createAuth>;

export const parseTrustedOrigins = (value: string | undefined): ReadonlyArray<string> =>
  value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

export const validateAuthSecret = (secret: string, local: boolean): AuthSecret => {
  const value = secret.trim();
  if (!value) throw new Error("BETTER_AUTH_SECRET is required.");
  if (!local) {
    const normalized = value.toLowerCase();
    const looksLikeDefault =
      normalized.includes("change-me") ||
      normalized.includes("moodboard-local") ||
      normalized.includes("mood-board-local");
    if (value.length < 32 || new Set(value).size < 12 || looksLikeDefault) {
      throw new Error(
        "BETTER_AUTH_SECRET must be a high-entropy random value of at least 32 characters.",
      );
    }
  }
  return AuthSecretSchema.make(value);
};

export const validateAuthBaseURL = (value: string, local: boolean): AuthBaseUrl => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("BETTER_AUTH_URL must be an absolute URL.");
  }
  const loopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (!local && url.protocol !== "https:" && !loopback) {
    throw new Error("BETTER_AUTH_URL must use HTTPS outside local development.");
  }
  return AuthBaseUrlSchema.make(url.origin);
};

export const configuredGoogle = (
  clientId: string | undefined,
  clientSecret: string | undefined,
): AuthConfig["google"] => {
  const id = clientId?.trim();
  const secret = clientSecret?.trim();
  return id && secret ? { clientId: id, clientSecret: secret } : undefined;
};

export class MagicLinkDeliveryError extends Schema.Error<MagicLinkDeliveryError>(
  "MagicLinkDeliveryError",
)({
  reason: Schema.Literals(["Configuration", "Transport", "Http"]),
  message: Schema.String,
  status: Schema.optional(HttpStatusCodeSchema),
  cause: OptionalErrorCauseSchema,
}) {}

interface MagicLinkDeliveryConfig {
  readonly apiKey?: string;
  readonly sender?: string;
  readonly local: boolean;
}

interface MagicLinkDeliveryInput {
  readonly email: string;
  readonly url: string;
}

const deliverMagicLinkEffect = Effect.fn("Auth.deliverMagicLink")(function* (
  config: MagicLinkDeliveryConfig,
  input: MagicLinkDeliveryInput,
) {
  const apiKey = config.apiKey?.trim();
  const sender = config.sender?.trim();
  if (config.local) {
    yield* Effect.sync(() => console.log(`[auth:magic-link] to=${input.email} url=${input.url}`));
    return;
  }
  if (!apiKey || !sender) {
    return yield* new MagicLinkDeliveryError({
      reason: "Configuration",
      message: "RESEND_API_KEY and EMAIL_SENDER are required for magic-link delivery.",
    });
  }

  const response = yield* Effect.tryPromise({
    try: (signal) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: sender,
          to: [input.email],
          subject: "Sign in to Moodboard",
          text: `Use this link to sign in to Moodboard. It expires in 15 minutes.\n\n${input.url}\n\nIf you were not expecting this email, you can ignore it.`,
          html: [
            "<p>Use the link below to sign in to Moodboard. It expires in 15 minutes.</p>",
            `<p><a href="${escapeHtml(input.url)}">Sign in to Moodboard</a></p>`,
            '<p style="color:#777;font-size:0.85em">If you were not expecting this email, you can ignore it.</p>',
          ].join("\n"),
        }),
      }),
    catch: (cause) =>
      new MagicLinkDeliveryError({
        reason: "Transport",
        message: "Magic-link email delivery could not reach the provider.",
        cause,
      }),
  });

  if (!response.ok) {
    return yield* new MagicLinkDeliveryError({
      reason: "Http",
      message: `Magic-link email delivery failed with status ${response.status}.`,
      status: HttpStatusCodeSchema.make(response.status),
    });
  }
});

export const deliverMagicLink = (
  config: MagicLinkDeliveryConfig,
  input: MagicLinkDeliveryInput,
): Promise<void> => Effect.runPromise(deliverMagicLinkEffect(config, input));

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
