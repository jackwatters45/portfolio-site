import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AccountUser } from "../src/client/auth-client";
import { HomeAccountIdentity, MenuAccountIdentity } from "../src/components/account-identity";

const user = {
  id: "user-1",
  name: "Avery Stone",
  email: "avery@example.com",
  emailVerified: true,
  image: null,
  createdAt: new Date(1),
  updatedAt: new Date(1),
} as AccountUser;

const retry = () => undefined;
const router = createRouter({
  routeTree: createRootRoute(),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
const renderWithRouter = (children: ReactNode) =>
  renderToStaticMarkup(<RouterContextProvider router={router}>{children}</RouterContextProvider>);

describe("account identity", () => {
  it("offers sign in from the homepage and board menu", () => {
    const home = renderWithRouter(
      <HomeAccountIdentity user={undefined} pending={false} error={false} onRetry={retry} />,
    );
    const menu = renderWithRouter(
      <MenuAccountIdentity
        user={undefined}
        pending={false}
        error={false}
        returnTo="/boards/default"
        onRetry={retry}
      />,
    );
    expect(home).toContain('href="/login?returnTo=%2F"');
    expect(menu).toContain("Keep a profile here");
    expect(menu).toContain("Sign in to open your private boards");
    expect(menu).toContain("returnTo=%2Fboards%2Fdefault");
  });

  it("links a signed-in identity to profile settings", () => {
    const home = renderWithRouter(
      <HomeAccountIdentity user={user} pending={false} error={false} onRetry={retry} />,
    );
    const menu = renderWithRouter(
      <MenuAccountIdentity
        user={user}
        pending={false}
        error={false}
        returnTo="/boards/default"
        onRetry={retry}
      />,
    );
    expect(home).toContain('href="/profile"');
    expect(home).toContain("Avery Stone");
    expect(menu).toContain("avery@example.com");
    expect(menu).toContain("Signed in as");
    expect(home).not.toContain("https://");
  });

  it("does not misreport an account outage as signed out", () => {
    const menu = renderWithRouter(
      <MenuAccountIdentity
        user={undefined}
        pending={false}
        error={true}
        returnTo="/boards/default"
        onRetry={retry}
      />,
    );
    expect(menu).toContain("Profile unavailable");
    expect(menu).toContain("Try again");
    expect(menu).not.toContain('href="/login');
  });
});
