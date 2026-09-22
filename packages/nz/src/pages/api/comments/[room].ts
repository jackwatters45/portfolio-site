import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

export const prerender = false;

// Astro owns the public URL. The comments package owns the protocol and storage.
export const GET: APIRoute = ({ request, url }) => {
  if (import.meta.env.DEV) {
    const target = import.meta.env.COMMENTS_DEV_URL;
    if (!target)
      return new Response(
        'Start development with bun run dev from the repository root.',
        { status: 503 },
      );
    // Native fetch preserves Cloudflare's 101 response and WebSocket handle.
    return fetch(
      new Request(new URL(url.pathname + url.search, target), request),
    );
  }
  return env.COMMENTS.fetch(request);
};
