export const safeReturnTo = (value: string | null | undefined): string => {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://moodboard.invalid");
    return url.origin === "https://moodboard.invalid"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
};

export const signInPath = (returnTo = "/"): string => {
  const path = safeReturnTo(returnTo);
  return path === "/" ? "/login" : `/login?returnTo=${encodeURIComponent(path)}`;
};
