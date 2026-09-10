import { ArrowLeft, UserCircle } from "@phosphor-icons/react";
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { Option, Schema } from "effect";
import { useCallback, useEffect, useState } from "react";

import { AUTHENTICATION_REQUIRED_EVENT, authClient } from "../client/auth-client";
import { parseBoardId } from "../client/board-route";
import BoardEditor from "../components/board-editor";
import { AccountIdSchema } from "../lib/account";

const decodeAccountId = Schema.decodeUnknownOption(AccountIdSchema);

export const Route = createFileRoute("/boards/$boardId")({
  params: {
    parse: ({ boardId }) => {
      const parsed = parseBoardId(boardId);
      if (parsed === null) throw notFound();
      return { boardId: parsed };
    },
    stringify: ({ boardId }) => ({ boardId }),
  },
  component: PrivateApp,
});

function PrivateApp() {
  const { boardId } = Route.useParams();
  const navigate = useNavigate();
  const returnTo = useRouterState({ select: (state) => state.location.href });
  const session = authClient.useSession();
  const user = session.data?.user;
  const accountId = user === undefined ? null : Option.getOrNull(decodeAccountId(user.id));
  const [revalidating, setRevalidating] = useState(false);
  const checking = session.isPending || session.isRefetching || revalidating;
  const revalidate = useCallback(() => {
    setRevalidating(true);
    void session.refetch().finally(() => setRevalidating(false));
  }, [session]);

  useEffect(() => {
    if (!checking && session.error == null && user === undefined) {
      void navigate({ to: "/login", search: { returnTo }, replace: true });
    }
  }, [checking, navigate, returnTo, session.error, user]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    window.addEventListener(AUTHENTICATION_REQUIRED_EVENT, revalidate);
    window.addEventListener("focus", revalidate);
    window.addEventListener("pageshow", revalidate);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener(AUTHENTICATION_REQUIRED_EVENT, revalidate);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("pageshow", revalidate);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [revalidate]);

  if (checking || (user === undefined && session.error == null)) {
    return <main className="profile-page" aria-label="Checking account" aria-busy="true" />;
  }

  if (session.error != null || (user !== undefined && accountId === null)) {
    return (
      <main className="profile-page">
        <Link className="profile-back" to="/">
          <ArrowLeft size={15} /> Moodboard
        </Link>
        <section className="profile-card profile-card--guest">
          <UserCircle size={48} weight="thin" aria-hidden="true" />
          <p className="profile-kicker">Private workspace</p>
          <h1>Account unavailable.</h1>
          <p>We could not verify access to this workspace.</p>
          <button className="profile-sign-in" type="button" onClick={revalidate}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (user === undefined || accountId === null) return null;
  return <BoardEditor key={`${accountId}:${boardId}`} accountId={accountId} boardId={boardId} />;
}
