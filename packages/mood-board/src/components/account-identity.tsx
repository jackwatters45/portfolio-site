import { SignIn, UserCircle } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { accountDisplayName, accountInitials } from "../client/account-profile";
import type { AccountUser } from "../client/auth-client";

function AccountAvatar({ user }: { readonly user: AccountUser }) {
  return <span aria-hidden="true">{accountInitials(user)}</span>;
}

export function HomeAccountIdentity({
  user,
  pending,
  error,
  onRetry,
}: {
  readonly user: AccountUser | undefined;
  readonly pending: boolean;
  readonly error: boolean;
  readonly onRetry: () => void;
}) {
  if (pending) {
    return <span className="home-account-loading" aria-label="Loading profile" aria-busy="true" />;
  }
  if (error) {
    return (
      <button className="home-account-error" type="button" onClick={onRetry}>
        Profile unavailable · retry
      </button>
    );
  }
  if (user === undefined) {
    return (
      <Link className="home-sign-in" to="/login" search={{ returnTo: "/" }}>
        Sign in
      </Link>
    );
  }
  return (
    <Link
      className="home-account"
      to="/profile"
      aria-label={`Open profile for ${accountDisplayName(user)}`}
    >
      <span className="account-avatar">
        <AccountAvatar user={user} />
      </span>
      <span>{accountDisplayName(user)}</span>
    </Link>
  );
}

export function MenuAccountIdentity({
  user,
  pending,
  error,
  returnTo,
  onRetry,
}: {
  readonly user: AccountUser | undefined;
  readonly pending: boolean;
  readonly error: boolean;
  readonly returnTo: string;
  readonly onRetry: () => void;
}) {
  if (pending) {
    return (
      <section
        className="menu-account-card is-loading"
        aria-label="Loading profile"
        aria-busy="true"
      >
        <span className="menu-account-skeleton" />
        <span className="menu-account-skeleton" />
      </section>
    );
  }
  if (error) {
    return (
      <section className="menu-account-card is-error" aria-label="Account unavailable">
        <UserCircle size={28} weight="thin" aria-hidden="true" />
        <div>
          <strong>Profile unavailable</strong>
          <p>Retry to verify access to your private boards.</p>
        </div>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    );
  }
  if (user === undefined) {
    return (
      <section className="menu-account-card is-guest" aria-label="Account">
        <UserCircle size={28} weight="thin" aria-hidden="true" />
        <div>
          <strong>Keep a profile here</strong>
          <p>Sign in to open your private boards.</p>
        </div>
        <Link to="/login" search={{ returnTo }}>
          <SignIn size={15} weight="bold" aria-hidden="true" />
          Sign in
        </Link>
      </section>
    );
  }
  return (
    <Link className="menu-account-card is-member" to="/profile" aria-label="Open your profile">
      <span className="account-avatar">
        <AccountAvatar user={user} />
      </span>
      <span>
        <small>Signed in as</small>
        <strong>{accountDisplayName(user)}</strong>
        <em>{user.email}</em>
      </span>
      <span className="menu-account-edit">Profile</span>
    </Link>
  );
}
