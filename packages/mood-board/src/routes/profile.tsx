import { ArrowLeft, SignOut, UserCircle } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { accountDisplayName, accountInitials } from "../client/account-profile";
import { authClient, type AccountUser } from "../client/auth-client";
import { DEFAULT_BOARD_ID } from "../lib/board-rpc";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function SignedInProfile({
  user,
  refresh,
}: {
  readonly user: AccountUser;
  readonly refresh: () => Promise<unknown>;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(user.name);
  const [pending, setPending] = useState<"saving" | "signing-out" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || pending !== null) return;
    setPending("saving");
    setNotice("");
    setError("");
    try {
      const result = await authClient.updateUser({ name: nextName });
      if (result.error) {
        setError(result.error.message ?? "Your profile could not be updated.");
      } else {
        await refresh();
        setNotice("Profile updated.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your profile could not be updated.");
    } finally {
      setPending(null);
    }
  };

  const signOut = async () => {
    setPending("signing-out");
    setNotice("");
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(result.error.message ?? "You could not be signed out.");
        setPending(null);
        return;
      }
      await navigate({ to: "/" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "You could not be signed out.");
      setPending(null);
    }
  };

  return (
    <section className="profile-card" aria-labelledby="profile-title">
      <div className="profile-portrait" aria-hidden="true">
        <span>{accountInitials(user)}</span>
      </div>
      <p className="profile-kicker">Account profile</p>
      <h1 id="profile-title">{accountDisplayName(user)}</h1>
      <p className="profile-email">{user.email}</p>

      <form className="profile-form" onSubmit={(event) => void save(event)}>
        <label htmlFor="profile-name">Display name</label>
        <input
          id="profile-name"
          value={name}
          maxLength={80}
          required
          autoComplete="name"
          onChange={(event) => {
            setName(event.target.value);
            setNotice("");
            setError("");
          }}
        />
        <button type="submit" disabled={pending !== null || name.trim() === user.name.trim()}>
          {pending === "saving" ? "Saving…" : "Save profile"}
        </button>
      </form>

      {notice && (
        <p className="profile-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="profile-error" role="alert">
          {error}
        </p>
      )}

      <div className="profile-actions">
        <Link to="/boards/$boardId" params={{ boardId: DEFAULT_BOARD_ID }}>
          Open canvas
        </Link>
        <button type="button" disabled={pending !== null} onClick={() => void signOut()}>
          <SignOut size={15} />
          {pending === "signing-out" ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </section>
  );
}

function ProfilePage() {
  const navigate = useNavigate();
  const session = authClient.useSession();
  const user = session.data?.user;
  const checking = session.isPending || session.isRefetching;

  useEffect(() => {
    document.title = "Your profile — Moodboard";
  }, []);

  useEffect(() => {
    if (!checking && session.error == null && user === undefined) {
      void navigate({ to: "/login", search: { returnTo: "/profile" }, replace: true });
    }
  }, [checking, navigate, session.error, user]);

  if (checking) {
    return <main className="profile-page" aria-label="Loading profile" aria-busy="true" />;
  }

  if (session.error != null) {
    return (
      <main className="profile-page">
        <Link className="profile-back" to="/">
          <ArrowLeft size={15} /> Moodboard
        </Link>
        <section className="profile-card profile-card--guest">
          <UserCircle size={48} weight="thin" aria-hidden="true" />
          <p className="profile-kicker">Account profile</p>
          <h1>Profile unavailable.</h1>
          <p>We could not verify access to your profile.</p>
          <button className="profile-sign-in" type="button" onClick={() => void session.refetch()}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (user === undefined) {
    return <main className="profile-page" aria-label="Opening sign in" aria-busy="true" />;
  }

  return (
    <main className="profile-page">
      <Link className="profile-back" to="/">
        <ArrowLeft size={15} /> Moodboard
      </Link>
      <SignedInProfile user={user} refresh={() => session.refetch()} />
    </main>
  );
}
