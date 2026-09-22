import * as ConfigProvider from 'effect/ConfigProvider';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';
import {
  COMMENT_LIMIT,
  type CommentMessage,
  type CommentTarget,
  type CommentThread,
  isRecord,
  validName,
  validTarget,
} from '../src/lib/comments';
import { commentToken } from './token';

const REPOSITORY = 'jackwatters45/portfolio-site';
const OWNER = 'jackwatters45';
const LABEL = 'nz-feedback';
const SITE = 'https://nz.jackwatters.dev';
const MARKER = 'nz-feedback:v1';
const MAX_REQUEST_BYTES = 16_384;

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface CommentsEnv {
  NZ_FEEDBACK_GITHUB_TOKEN: string;
  COMMENT_READ_LIMIT: RateLimit;
  COMMENT_WRITE_LIMIT: RateLimit;
}

interface GitHubComment {
  id: number;
  body: string | null;
  created_at: string;
  user: { login: string } | null;
}

interface GitHubIssue extends GitHubComment {
  number: number;
  state: string;
  locked: boolean;
  comments: number;
  labels: { name: string }[];
  pull_request?: unknown;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(status === 429 ? { 'Retry-After': '60' } : {}),
    },
  });
}

// Keep visitor text inside a code block so mentions, HTML and issue commands
// are not interpreted by GitHub. The header holds only thread/name metadata.
function formatMessage(name: string, body: string, target?: CommentTarget) {
  const metadata = encodeURIComponent(JSON.stringify({ name, ...target }));
  const runs = [...body.matchAll(/`+/g)].map((match) => match[0].length);
  const fence = '`'.repeat(Math.max(3, ...runs.map((length) => length + 1)));
  const nameFence = '`'.repeat(
    Math.max(
      1,
      ...[...name.matchAll(/`+/g)].map((match) => match[0].length + 1),
    ),
  );
  return [
    `<!-- ${MARKER} ${metadata} -->`,
    `**From:** ${nameFence} ${name} ${nameFence}`,
    `${fence}text\n${body}\n${fence}`,
    ...(target
      ? [`[View on the trip page](${SITE}/#comment=${target.anchor})`]
      : []),
  ].join('\n\n');
}

function metadata(body: string | null): Record<string, unknown> | null {
  const match = body?.match(/^<!-- nz-feedback:v1 (\S+) -->\n/);
  if (!match) return null;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(match[1]));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function message(comment: GitHubComment): CommentMessage {
  const meta = metadata(comment.body);
  const stored = comment.body?.match(/\n\n(`{3,})text\n([\s\S]*?)\n\1(?:\n|$)/);
  // Replies written directly in GitHub still appear on the site.
  const ours = comment.user?.login === OWNER && validName(meta?.name) && stored;
  return {
    id: comment.id,
    name: ours ? (meta.name as string) : (comment.user?.login ?? 'GitHub'),
    body: ours ? stored[2] : (comment.body ?? ''),
    createdAt: comment.created_at,
  };
}

function thread(issue: GitHubIssue): CommentThread | null {
  const meta = metadata(issue.body);
  if (
    issue.pull_request ||
    issue.user?.login !== OWNER ||
    !issue.labels.some((label) => label.name === LABEL) ||
    !validTarget(meta) ||
    !validName(meta.name)
  ) {
    return null;
  }
  return {
    id: issue.number,
    anchor: meta.anchor,
    quote: meta.quote,
    closed: issue.state === 'closed',
    locked: issue.locked,
    replyCount: issue.comments,
    message: message(issue),
  };
}

async function github<T>(
  token: Redacted.Redacted<string>,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ data: T; more: boolean }> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.github.com/repos/${REPOSITORY}${path}`,
      {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${Redacted.value(token)}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'nz-trip-comments',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12_000),
      },
    );
  } catch {
    throw new HttpError(
      502,
      body
        ? 'Could not confirm the comment was saved. Refresh before trying again.'
        : 'Could not load comments. Please try again.',
    );
  }
  if (!response.ok) {
    // Never return upstream bodies, repository data, or credentials to visitors.
    if (
      response.status === 429 ||
      response.headers.get('x-ratelimit-remaining') === '0'
    ) {
      throw new HttpError(
        429,
        'Comments are busy. Please try again in a minute.',
      );
    }
    if (response.status === 404) {
      throw new HttpError(
        404,
        'Comment thread not found, or GitHub is not configured.',
      );
    }
    throw new HttpError(
      502,
      'GitHub comments are unavailable. Please try again later.',
    );
  }
  return {
    data: (await response.json()) as T,
    more: response.headers.get('link')?.includes('rel="next"') ?? false,
  };
}

async function listAll<T>(
  token: Redacted.Redacted<string>,
  path: string,
): Promise<T[]> {
  const values: T[] = [];
  // Follow pagination; fail explicitly rather than silently losing old threads.
  for (let page = 1; page <= 20; page++) {
    const { data, more } = await github<T[]>(
      token,
      `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    values.push(...data);
    if (!more) return values;
  }
  throw new HttpError(
    503,
    'There are too many comments to load. Please contact Jack.',
  );
}

async function submission(request: Request) {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  ) {
    throw new HttpError(415, 'Send comments as JSON.');
  }
  // Count streamed bytes too: Content-Length alone can be omitted or forged.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A comment is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new HttpError(413, 'This comment is too long.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'Invalid comment.');
  }
  if (
    !isRecord(value) ||
    !validName(value.name) ||
    typeof value.body !== 'string' ||
    !value.body.trim() ||
    value.body.length > COMMENT_LIMIT
  ) {
    throw new HttpError(
      400,
      'Add your name and a comment of 2,000 characters or less.',
    );
  }
  return {
    name: value.name.trim(),
    body: value.body.trim(),
    target: value.target,
  };
}

export async function handleComments(request: Request, env: CommentsEnv) {
  try {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/comments(?:\/([1-9]\d{0,8}))?$/);
    if (!match) throw new HttpError(404, 'Not found.');
    if (!['GET', 'POST'].includes(request.method)) {
      return new Response(null, {
        status: 405,
        headers: { Allow: 'GET, POST' },
      });
    }
    const write = request.method === 'POST';
    if (
      request.headers.get('sec-fetch-site') === 'cross-site' ||
      (write && request.headers.get('origin') !== url.origin)
    ) {
      throw new HttpError(403, 'Use the comment form on the trip page.');
    }
    const token = await Effect.runPromise(
      commentToken.pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))),
      ),
    );
    if (!Redacted.value(token).trim()) {
      throw new HttpError(503, 'Comments are not connected to GitHub yet.');
    }
    const limiter = write ? env.COMMENT_WRITE_LIMIT : env.COMMENT_READ_LIMIT;
    const { success } = await limiter.limit({
      key: request.headers.get('cf-connecting-ip') ?? 'local',
    });
    if (!success) {
      throw new HttpError(429, 'Too many requests. Please wait a minute.');
    }

    const id = match[1];
    if (!id && !write) {
      const issues = await listAll<GitHubIssue>(
        token,
        `/issues?state=all&creator=${OWNER}&labels=${LABEL}&sort=created&direction=asc`,
      );
      return json({
        threads: issues.map(thread).filter((value) => value !== null),
      });
    }

    if (!id) {
      const value = await submission(request);
      if (!validTarget(value.target)) {
        throw new HttpError(400, 'Choose something on the page to comment on.');
      }
      const { data } = await github<GitHubIssue>(token, '/issues', {
        title: `[NZ feedback] ${value.target.quote.replace(/\s+/g, ' ').slice(0, 100)}`,
        body: formatMessage(value.name, value.body, value.target),
        labels: [LABEL],
      });
      const created = thread(data);
      if (!created) {
        throw new HttpError(
          502,
          'The issue was saved, but its feedback label is missing. Please contact Jack.',
        );
      }
      return json({ thread: created }, 201);
    }

    const { data: issue } = await github<GitHubIssue>(token, `/issues/${id}`);
    const current = thread(issue);
    // The public API must never expose or add replies to unrelated repo issues.
    if (!current) throw new HttpError(404, 'Comment thread not found.');
    if (!write) {
      const replies = await listAll<GitHubComment>(
        token,
        `/issues/${id}/comments`,
      );
      return json({ thread: current, replies: replies.map(message) });
    }
    if (current.closed || current.locked) {
      throw new HttpError(
        409,
        'This thread is closed. Start a new comment instead.',
      );
    }
    const value = await submission(request);
    const { data: reply } = await github<GitHubComment>(
      token,
      `/issues/${id}/comments`,
      {
        body: formatMessage(value.name, value.body),
      },
    );
    return json({ message: message(reply) }, 201);
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    return json(
      { error: 'Comments are unavailable. Please try again later.' },
      500,
    );
  }
}
