import { describe, expect, it } from "vitest";

import {
  BunMagicLinkRateLimiter,
  MagicLinkRateLimitTimestampSchema,
} from "../../src/server/bun-auth-rate-limit";
import { decodeMagicLinkEmail, type MagicLinkRateLimitEmail } from "../../src/server/magic-link";

const rateLimitEmail = (value: string): MagicLinkRateLimitEmail => {
  const email = decodeMagicLinkEmail({ email: value });
  if (email === null) throw new Error("Expected a valid rate-limit email");
  return email;
};
const rateLimitTimestamp = (value: number) => MagicLinkRateLimitTimestampSchema.make(value);

describe("Bun magic-link rate limiter", () => {
  it("isolates IP and normalized recipient buckets", () => {
    const limiter = new BunMagicLinkRateLimiter();
    for (let index = 0; index < 5; index += 1) {
      expect(
        limiter.allow("192.0.2.1", rateLimitEmail("Reader@Example.com"), rateLimitTimestamp(index)),
      ).toBe(true);
    }
    expect(
      limiter.allow("192.0.2.1", rateLimitEmail("reader@example.com"), rateLimitTimestamp(5)),
    ).toBe(false);
    expect(
      limiter.allow("192.0.2.2", rateLimitEmail("other@example.com"), rateLimitTimestamp(5)),
    ).toBe(true);
  });

  it("releases buckets after one minute", () => {
    const limiter = new BunMagicLinkRateLimiter();
    for (let index = 0; index < 5; index += 1) {
      expect(
        limiter.allow("192.0.2.1", rateLimitEmail("reader@example.com"), rateLimitTimestamp(index)),
      ).toBe(true);
    }
    expect(
      limiter.allow("192.0.2.1", rateLimitEmail("reader@example.com"), rateLimitTimestamp(60_001)),
    ).toBe(true);
  });
});
