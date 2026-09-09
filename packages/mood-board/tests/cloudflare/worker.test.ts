import { describe, expect, it } from "vitest";

import worker, {
  type CloudflareEnv,
  runScheduledMediaMaintenance,
} from "../../src/cloudflare/worker";

const workspaceEnv = (status: number, capture: (request: Request) => void) => ({
  WORKSPACES: {
    idFromName: (name: string): unknown => name,
    get: () => ({
      fetch: async (request: Request): Promise<Response> => {
        capture(request);
        return new Response(null, { status });
      },
    }),
  },
});

describe("Cloudflare asset security", () => {
  const assetEnv = (isLocal: boolean): CloudflareEnv =>
    ({
      ASSETS: {
        fetch: async () =>
          new Response('<script type="module">window.__vite_react_refresh__ = true</script>', {
            headers: { "content-type": "text/html" },
          }),
      },
      IS_LOCAL: isLocal ? "true" : "",
    }) as unknown as CloudflareEnv;

  it("allows Vite's inline React Refresh preamble only during local development", async () => {
    const local = await worker.fetch(new Request("http://localhost:8787/"), assetEnv(true));
    const production = await worker.fetch(
      new Request("https://moodboard.jackwatters.dev/"),
      assetEnv(false),
    );

    expect(local.headers.get("content-security-policy")).toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(production.headers.get("content-security-policy")).not.toMatch(
      /script-src[^;]*'unsafe-inline'/,
    );
  });
});

describe("Cloudflare media maintenance schedule", () => {
  it("targets the singleton private Durable Object maintenance route", async () => {
    let forwarded: Request | undefined;
    await runScheduledMediaMaintenance(
      workspaceEnv(204, (request) => {
        forwarded = request;
      }),
    );
    expect(forwarded?.method).toBe("POST");
    expect(new URL(forwarded?.url ?? "https://invalid").pathname).toBe(
      "/_internal/media/maintenance",
    );
    expect(forwarded?.headers.get("x-mood-board-maintenance")).toBe("scheduled");
  });

  it("rejects unsuccessful maintenance dispatches", async () => {
    await expect(runScheduledMediaMaintenance(workspaceEnv(503, () => undefined))).rejects.toThrow(
      /status 503/,
    );
  });
});
