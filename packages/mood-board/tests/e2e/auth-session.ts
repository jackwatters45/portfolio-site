import { makeBunAuth } from "../../src/server/bun-auth";

export const createBunTestSession = async (config: {
  readonly authDatabasePath: string;
  readonly origin: string;
  readonly email: string;
}): Promise<{ readonly cookie: string; readonly accountId: string }> => {
  const instance = makeBunAuth({
    databasePath: config.authDatabasePath,
    baseURL: config.origin,
  });
  const messages: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => {
    messages.push(values.map(String).join(" "));
  };
  try {
    const response = await instance.auth.handler(
      new Request(`${config.origin}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: config.origin },
        body: JSON.stringify({ email: config.email, callbackURL: "/" }),
      }),
    );
    if (!response.ok) throw new Error(`Magic-link setup failed: ${response.status}`);
  } finally {
    console.log = originalLog;
  }

  const message = messages.find((value) => value.includes("[auth:magic-link]"));
  const magicLink = message === undefined ? undefined : /\burl=(\S+)/.exec(message)?.[1];
  if (magicLink === undefined) throw new Error("The local magic link was not captured.");
  const verified = await instance.auth.handler(
    new Request(magicLink, {
      headers: { origin: config.origin },
      redirect: "manual",
    }),
  );
  const setCookie = verified.headers.get("set-cookie");
  if (verified.status !== 302 || setCookie === null) {
    instance.close();
    throw new Error(`Magic-link verification failed: ${verified.status}`);
  }
  const cookie = setCookie.split(";", 1)[0] ?? "";
  const session = await instance.auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  instance.close();
  if (session?.user.id === undefined) throw new Error("The test session was not created.");
  return { cookie, accountId: session.user.id };
};
