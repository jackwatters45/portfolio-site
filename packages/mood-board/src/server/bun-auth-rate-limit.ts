import { Schema } from "effect";

import { NonNegativeIntegerSchema } from "../lib/schema";
import type { MagicLinkRateLimitEmail } from "./magic-link";

export const MagicLinkRateLimitTimestampSchema = NonNegativeIntegerSchema.pipe(
  Schema.brand("MagicLinkRateLimitTimestamp"),
);
export type MagicLinkRateLimitTimestamp = typeof MagicLinkRateLimitTimestampSchema.Type;

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

export class BunMagicLinkRateLimiter {
  readonly #buckets = new Map<string, MagicLinkRateLimitTimestamp[]>();

  allow(
    address: string,
    email: MagicLinkRateLimitEmail,
    now: MagicLinkRateLimitTimestamp,
  ): boolean {
    return this.#allow(`ip:${address}`, now) && this.#allow(`email:${email}`, now);
  }

  #allow(key: string, now: MagicLinkRateLimitTimestamp): boolean {
    const active = (this.#buckets.get(key) ?? []).filter(
      (timestamp) => timestamp > now - WINDOW_MS,
    );
    if (active.length >= MAX_REQUESTS) {
      this.#buckets.set(key, active);
      return false;
    }
    active.push(now);
    this.#buckets.set(key, active);
    if (this.#buckets.size > 10_000) {
      for (const [candidate, timestamps] of this.#buckets) {
        if (timestamps.every((timestamp) => timestamp <= now - WINDOW_MS)) {
          this.#buckets.delete(candidate);
        }
      }
    }
    return true;
  }
}
