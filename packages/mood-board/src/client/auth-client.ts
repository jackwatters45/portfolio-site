import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [magicLinkClient()],
});

export const AUTHENTICATION_REQUIRED_EVENT = "moodboard:authentication-required";

export const signalAuthenticationRequired = (): void => {
  window.dispatchEvent(new Event(AUTHENTICATION_REQUIRED_EVENT));
};

export type AuthSession = typeof authClient.$Infer.Session;
export type AccountUser = AuthSession["user"];
