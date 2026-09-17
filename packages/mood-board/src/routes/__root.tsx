import { createRootRoute, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const Agentation = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import("agentation")).Agentation }))
  : null;

function RootLayout() {
  return (
    <>
      <Outlet />
      {Agentation === null ? null : (
        <Suspense>
          <Agentation endpoint="http://localhost:4747" />
        </Suspense>
      )}
    </>
  );
}

function NotFoundPage() {
  return (
    <main className="public-state-page">
      <span className="public-mark">Moodboard</span>
      <h1>Page unavailable</h1>
      <p>This page is malformed, unavailable, or does not exist.</p>
    </main>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});
