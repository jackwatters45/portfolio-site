import type { AccountUser } from "./auth-client";

export const accountDisplayName = (user: AccountUser): string =>
  user.name.trim() || user.email.split("@")[0] || "Moodboard member";

export const accountInitials = (user: AccountUser): string =>
  accountDisplayName(user)
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "M";
