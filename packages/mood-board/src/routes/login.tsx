import { ArrowLeft, EnvelopeSimple, GoogleLogo } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { authClient } from "../client/auth-client";
import { safeReturnTo } from "../client/auth-route";

type LoginSearch = {
  readonly returnTo: string;
  readonly error?: string;
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const returnTo = safeReturnTo(typeof search.returnTo === "string" ? search.returnTo : null);
    return typeof search.error === "string" ? { returnTo, error: search.error } : { returnTo };
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const session = authClient.useSession();
  const [email, setEmail] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [pending, setPending] = useState<"google" | "email" | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState(() =>
    search.error === undefined ? "" : "That sign-in link could not be used. Please try again.",
  );
  const returnTo = search.returnTo;

  useEffect(() => {
    document.title = "Sign in — Moodboard";
    let active = true;
    void fetch("/api/auth/providers", {
      headers: { accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) return;
        const value: unknown = await response.json();
        if (
          active &&
          typeof value === "object" &&
          value !== null &&
          "google" in value &&
          value.google === true
        ) {
          setGoogleEnabled(true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (session.data !== null && session.data !== undefined) {
      void navigate({ href: returnTo, replace: true });
    }
  }, [navigate, returnTo, session.data]);

  const signInWithGoogle = async () => {
    setPending("google");
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: returnTo,
        errorCallbackURL: `/login?returnTo=${encodeURIComponent(returnTo)}`,
      });
      if (result.error) {
        setError(result.error.message ?? "Google sign in could not be started.");
        setPending(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google sign in could not be started.");
      setPending(null);
    }
  };

  const sendMagicLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const address = email.trim();
    if (!address || pending !== null) return;
    setPending("email");
    setError("");
    setSentTo("");
    try {
      const result = await authClient.signIn.magicLink({
        email: address,
        callbackURL: returnTo,
        errorCallbackURL: `/login?returnTo=${encodeURIComponent(returnTo)}`,
      });
      if (result.error) {
        setError(result.error.message ?? "The magic link could not be sent.");
        setPending(null);
        return;
      }
      setSentTo(address);
      setPending(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The magic link could not be sent.");
      setPending(null);
    }
  };

  if (session.isPending || session.data) {
    return <main className="login-page" aria-label="Loading profile" aria-busy="true" />;
  }

  return (
    <main className="login-page">
      <Link className="login-back" to={returnTo}>
        <ArrowLeft size={15} />
        Back to Moodboard
      </Link>
      <section className="login-card" aria-labelledby="login-title">
        <span className="login-mark" aria-hidden="true" />
        <p className="login-kicker">Your quiet corner</p>
        <h1 id="login-title">Sign in.</h1>
        <p className="login-intro">
          {googleEnabled
            ? "Continue with Google or ask for a one-time link. No password to remember."
            : "Ask for a one-time sign-in link. No password to remember."}
        </p>

        {googleEnabled && (
          <>
            <button
              className="login-google"
              type="button"
              disabled={pending !== null}
              onClick={() => void signInWithGoogle()}
            >
              <GoogleLogo size={18} weight="bold" />
              {pending === "google" ? "Opening Google…" : "Continue with Google"}
            </button>
            <div className="login-divider">
              <span>or</span>
            </div>
          </>
        )}

        <form className="login-email-form" onSubmit={(event) => void sendMagicLink(event)}>
          <label htmlFor="login-email">Email address</label>
          <div>
            <EnvelopeSimple size={17} aria-hidden="true" />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button type="submit" disabled={pending !== null}>
            {pending === "email"
              ? "Sending…"
              : sentTo
                ? "Send another link"
                : "Email me a magic link"}
          </button>
        </form>

        {sentTo && (
          <p className="login-notice" role="status">
            Check <strong>{sentTo}</strong>. The link expires in 15 minutes.
          </p>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        {session.error != null && (
          <p className="login-error" role="alert">
            The current account state could not be checked. You can retry sign-in below.
          </p>
        )}

        <p className="login-footnote">Sign in to open your private workspace.</p>
      </section>
    </main>
  );
}
