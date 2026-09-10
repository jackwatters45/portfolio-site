import { describe, expect, it } from "vitest";

import { isSameOriginMutation } from "../../src/server/request-auth";

describe("private request origin checks", () => {
  it("accepts safe requests and same-origin mutations", () => {
    expect(isSameOriginMutation(new Request("https://board.example/rpc"))).toBe(true);
    expect(
      isSameOriginMutation(
        new Request("https://board.example/rpc", {
          method: "POST",
          headers: { origin: "https://board.example", "sec-fetch-site": "same-origin" },
        }),
      ),
    ).toBe(true);
  });

  it("rejects cross-origin and originless cookie-bearing mutations", () => {
    expect(
      isSameOriginMutation(
        new Request("https://board.example/rpc", {
          method: "POST",
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutation(
        new Request("https://board.example/rpc", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutation(
        new Request("https://board.example/rpc", {
          method: "POST",
          headers: { "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toBe(false);
  });
});
