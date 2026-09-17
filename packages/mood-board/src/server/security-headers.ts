export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://open.spotify.com https://embed-cdn.spotifycdn.com https://platform.x.com https://platform.twitter.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "frame-src https://open.spotify.com https://www.youtube-nocookie.com https://platform.x.com https://platform.twitter.com https://syndication.x.com https://syndication.twitter.com",
  "connect-src 'self' ws: wss: https://open.spotify.com https://platform.x.com https://platform.twitter.com https://syndication.x.com https://syndication.twitter.com https://cdn.syndication.twimg.com",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

const VITE_DEVELOPMENT_CONTENT_SECURITY_POLICY = CONTENT_SECURITY_POLICY.replace(
  "script-src 'self'",
  "script-src 'self' 'unsafe-inline'",
);

type SecurityHeaderOptions = {
  readonly allowViteDevelopmentScripts?: boolean;
};

export function withSecurityHeaders(
  response: Response,
  options: SecurityHeaderOptions = {},
): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  if (options.allowViteDevelopmentScripts) {
    headers.set("Content-Security-Policy", VITE_DEVELOPMENT_CONTENT_SECURITY_POLICY);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
