import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { createAuth, validateAuthBaseURL, validateAuthSecret } from "../../src/server/auth";
import { AUTH_SCHEMA_SQL } from "../../src/server/auth-schema";

const databases: DatabaseSync[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("Better Auth", () => {
  it("creates a profile and session from a one-use magic link", async () => {
    const database = new DatabaseSync(":memory:");
    databases.push(database);
    database.exec(AUTH_SCHEMA_SQL);
    let magicLink = "";
    const auth = createAuth({
      database,
      secret: validateAuthSecret("test-secret-that-is-at-least-thirty-two-characters", true),
      baseURL: validateAuthBaseURL("http://localhost:3000", true),
      trustedOrigins: ["http://localhost:5173"],
      useSecureCookies: false,
      sendMagicLink: ({ url }) => {
        magicLink = url;
      },
    });

    const start = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
        },
        body: JSON.stringify({
          email: "reader@example.com",
          callbackURL: "/profile",
        }),
      }),
    );
    expect(start.status).toBe(200);
    expect(magicLink).toContain("/api/auth/magic-link/verify?");
    const rawToken = new URL(magicLink).searchParams.get("token");
    const stored = database.prepare('SELECT identifier FROM "verification"').get() as {
      identifier: string;
    };
    expect(stored.identifier).not.toBe(rawToken);

    const verified = await auth.handler(
      new Request(magicLink, {
        headers: { origin: "http://localhost:5173" },
        redirect: "manual",
      }),
    );
    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toBe("http://localhost:3000/profile");
    expect(verified.headers.get("set-cookie")).toContain("better-auth.session_token=");

    const users = database.prepare('SELECT email, emailVerified FROM "user"').all() as Array<{
      email: string;
      emailVerified: number;
    }>;
    expect(users).toEqual([{ email: "reader@example.com", emailVerified: 1 }]);

    const reused = await auth.handler(
      new Request(magicLink, {
        headers: { origin: "http://localhost:5173" },
        redirect: "manual",
      }),
    );
    expect(reused.status).toBe(302);
    expect(reused.headers.get("location")).toContain("error=INVALID_TOKEN");
  });

  it("rejects weak production secrets and non-HTTPS public origins", () => {
    expect(() => validateAuthSecret("short", false)).toThrow(/high-entropy/);
    expect(() => validateAuthSecret("x".repeat(32), false)).toThrow(/high-entropy/);
    const strong = "G7v!q2L#n9P$r4T@w8Y%x3C&k6M*z1DF";
    expect(validateAuthSecret(strong, false)).toBe(strong);
    expect(() => validateAuthBaseURL("http://board.example.com", false)).toThrow(/HTTPS/);
    expect(validateAuthBaseURL("https://board.example.com/path", false)).toBe(
      "https://board.example.com",
    );
    expect(validateAuthBaseURL("http://127.0.0.1:3000", false)).toBe("http://127.0.0.1:3000");
  });
});
