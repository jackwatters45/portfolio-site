import { describe, expect, it } from "vitest";

import { safeReturnTo, signInPath } from "../../src/client/auth-route";

describe("auth routes", () => {
  it("keeps same-origin relative destinations", () => {
    expect(safeReturnTo("/boards/default?panel=menu#account")).toBe(
      "/boards/default?panel=menu#account",
    );
    expect(signInPath("/boards/default")).toBe("/login?returnTo=%2Fboards%2Fdefault");
  });

  it("rejects absolute and protocol-relative destinations", () => {
    expect(safeReturnTo("https://evil.example/boards/default")).toBe("/");
    expect(safeReturnTo("//evil.example/boards/default")).toBe("/");
    expect(safeReturnTo("javascript:alert(1)")).toBe("/");
    expect(signInPath("https://evil.example")).toBe("/login");
  });
});
