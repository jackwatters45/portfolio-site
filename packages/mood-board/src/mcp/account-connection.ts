import {
  Cause,
  Clock,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Redacted,
  Schema,
  Stream,
  type Scope,
} from 'effect';
import {
  FetchHttpClient,
  Headers,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  type HttpClientResponse,
} from 'effect/unstable/http';

import {
  AGENT_CLIENT_ID,
  AGENT_CONNECT_PATH,
  AGENT_USER_CODE,
} from '../lib/agent-auth';
import {
  AccountError,
  AccountIdentity,
  type AccountConfig,
  type AccountReference,
} from './account-contracts';

import {
  accountRequestError,
  accountTransportError,
} from './account-diagnostics';

const Secret = Schema.RedactedFromValue(
  Schema.String.check(Schema.isLengthBetween(1, 4096)),
);

const Pending = Schema.TaggedStruct('Pending', {
  origin: Schema.String,
  deviceCode: Secret,
  userCode: AGENT_USER_CODE,
  expiresAt: Schema.Number,
  interval: Schema.Number,
  nextPollAt: Schema.Number,
});

const Connected = Schema.TaggedStruct('Connected', {
  origin: Schema.String,
  token: Secret,
  account: AccountIdentity,
  expiresAt: Schema.Number,
});

const Stored = Schema.Union([Pending, Connected]);

const StoredJson = Schema.fromJsonString(Stored);

const DeviceResponse = Schema.Struct({
  device_code: Secret,
  user_code: AGENT_USER_CODE,
  expires_in: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 600 })),
  interval: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 60 })),
});

const TokenResponse = Schema.Struct({
  access_token: Secret,
  token_type: Schema.Literal('Bearer'),
  expires_in: Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: 31_536_000 }),
  ),
});

const SessionResponse = Schema.NullOr(Schema.Struct({ user: AccountIdentity }));

const DeviceFailure = Schema.Struct({ error: Schema.String });

const problem = (code: typeof AccountError.fields.code.Type, message: string) =>
  new AccountError({ code, message });

// Expose only safe diagnostics: authentication responses contain secrets.
const readJson = Effect.fn('AccountConnection.readJson')(
  function* <A, I>(
    response: HttpClientResponse.HttpClientResponse,
    schema: Schema.Codec<A, I>,
  ) {
    let length = 0;

    const chunks = yield* response.stream.pipe(
      Stream.mapEffect((chunk) => {
        length += chunk.length;

        return length > 16384
          ? Effect.fail(problem('Remote', 'Account response is too large.'))
          : Effect.succeed(chunk);
      }),
      Stream.runCollect,
      Effect.mapError((error) =>
        accountRequestError(
          Predicate.isTagged(error, 'AccountError')
            ? 'ResponseTooLarge'
            : 'ResponseRead',
          'Cannot read the account response.',
          response.request,
          response,
        ),
      ),
    );

    const bytes = new Uint8Array(length);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(
      new TextDecoder().decode(bytes),
    ).pipe(
      Effect.mapError(() =>
        accountRequestError(
          'InvalidResponse',
          'The account server returned an invalid response.',
          response.request,
          response,
        ),
      ),
    );
  },
  (effect, response) =>
    effect.pipe(
      Effect.timeout('30 seconds'),
      Effect.mapError((error) =>
        Cause.isTimeoutError(error)
          ? accountRequestError(
              'ResponseTimeout',
              'Account response timed out after 30 seconds.',
              response.request,
              response,
            )
          : error,
      ),
    ),
);

const make = (config: AccountConfig) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const redactedHeaders = yield* Headers.CurrentRedactedNames;

    const http = (yield* HttpClient.HttpClient).pipe(
      HttpClient.transformResponse((request) =>
        request.pipe(
          Effect.provideService(FetchHttpClient.RequestInit, {
            redirect: 'error',
            credentials: 'omit',
            cache: 'no-store',
          }),
          // Auth request bodies can contain a device secret. Do not record HTTP error spans.
          Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
          Effect.provideService(Headers.CurrentRedactedNames, [
            ...redactedHeaders,
            'set-auth-token',
          ]),
        ),
      ),
    );

    const directory = config.accountSessionDirectory;
    const filename = path.join(directory, 'session.json');
    const lockfile = path.join(directory, 'session.lock');
    const origin = config.accountOrigin;

    const configured = Effect.fn('AccountConnection.configured')(
      function* () {
        if (!origin || !directory)
          return yield* problem(
            'NotConfigured',
            'Start with --account-origin and --account-session-dir. Local tools do not require account access.',
          );

        const url = yield* Effect.try({
          try: () => new URL(origin),
          catch: () =>
            problem('NotConfigured', 'Use a canonical account origin.'),
        });

        if (
          url.origin !== origin ||
          (url.protocol !== 'https:' &&
            !(
              url.protocol === 'http:' &&
              ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
            ))
        ) {
          return yield* problem(
            'NotConfigured',
            'Use an HTTPS origin, or HTTP on localhost for development.',
          );
        }

        if (
          !path.isAbsolute(directory) ||
          (yield* fs.realPath(directory)) !== path.normalize(directory)
        )
          return yield* problem(
            'Credentials',
            'The session directory must be an existing absolute path without symlinks.',
          );
        const info = yield* fs.stat(directory);

        if (
          info.type !== 'Directory' ||
          (info.mode & 0o077) !== 0 ||
          Option.getOrUndefined(info.uid) !== process.getuid?.()
        )
          return yield* problem(
            'Credentials',
            'The session directory must belong to you and have mode 0700.',
          );

        for (const root of [config.assetRoot, config.outputDirectory]) {
          const canonical = yield* fs.realPath(root);
          const relative = path.relative(canonical, directory);

          if (
            relative === '' ||
            (!relative.startsWith(`..${path.sep}`) &&
              relative !== '..' &&
              !path.isAbsolute(relative))
          )
            return yield* problem(
              'Credentials',
              'Keep the session directory outside approved asset and output folders.',
            );
        }
      },
      Effect.mapError((error) =>
        error instanceof AccountError
          ? error
          : problem(
              'Credentials',
              'Cannot access the private session directory. Use an existing owner-only directory outside approved folders.',
            ),
      ),
    );

    const load = Effect.fn('AccountConnection.load')(
      function* () {
        yield* configured();

        if (!(yield* fs.exists(filename)))
          return Option.none<typeof Stored.Type>();

        if ((yield* fs.realPath(filename)) !== filename)
          return yield* problem(
            'Credentials',
            'Session files must not be symlinks.',
          );

        const infoBeforeOpen = yield* fs.stat(filename);

        if (infoBeforeOpen.type !== 'File')
          return yield* problem(
            'Credentials',
            'The session path must be a regular file.',
          );

        return yield* Effect.scoped(
          Effect.gen(function* () {
            const file = yield* fs.open(filename, { flag: 'r' });
            const info = yield* file.stat;

            if (
              info.type !== 'File' ||
              (info.mode & 0o077) !== 0 ||
              Option.getOrUndefined(info.uid) !== process.getuid?.() ||
              Option.getOrUndefined(info.nlink) !== 1 ||
              info.size > 8192
            )
              return yield* problem(
                'Credentials',
                'Session files require mode 0600, one hard link, and your ownership.',
              );
            const bytes = yield* file.readAlloc(8193);

            if (Option.isNone(bytes) || bytes.value.length > 8192)
              return yield* problem('Credentials', 'Invalid session file.');

            const stored = yield* Schema.decodeUnknownEffect(StoredJson)(
              new TextDecoder().decode(bytes.value),
            );

            if (stored.origin !== origin)
              return yield* problem(
                'Credentials',
                'This session belongs to another origin. Use a separate session directory.',
              );

            return Option.some(stored);
          }),
        );
      },
      Effect.mapError((error) =>
        error instanceof AccountError
          ? error
          : problem(
              'Credentials',
              'Cannot read the private session. Check directory permissions and the configured origin.',
            ),
      ),
    );

    const store = Effect.fn('AccountConnection.store')(
      function* (value: typeof Stored.Type) {
        const json = yield* Schema.encodeEffect(StoredJson)(value);

        const temporary = path.join(
          directory,
          `.session-${crypto.randomUUID()}.tmp`,
        );

        const bytes = new TextEncoder().encode(json);

        if (bytes.length > 8192)
          return yield* problem(
            'Credentials',
            'Account credentials exceed the private file limit.',
          );
        yield* Effect.scoped(
          Effect.gen(function* () {
            const file = yield* fs.open(temporary, { flag: 'wx', mode: 0o600 });
            yield* Effect.addFinalizer(() =>
              fs.remove(temporary, { force: true }).pipe(Effect.orDie),
            );
            yield* file.writeAll(bytes);
            yield* file.sync;
            yield* fs.rename(temporary, filename);
          }),
        ).pipe(Effect.uninterruptible);
      },
      Effect.mapError(() =>
        problem('Credentials', 'Cannot save the private account session.'),
      ),
    );

    const locked = <A>(work: Effect.Effect<A, AccountError, Scope.Scope>) =>
      Effect.scoped(
        Effect.gen(function* () {
          yield* configured();
          yield* Effect.acquireRelease(
            fs
              .open(lockfile, { flag: 'wx', mode: 0o600 })
              .pipe(
                Effect.mapError(() =>
                  problem(
                    'Busy',
                    'Another account connection action is running. Remove session.lock only after all agent processes have stopped.',
                  ),
                ),
              ),
            () => fs.remove(lockfile).pipe(Effect.orDie),
          );

          return yield* work;
        }),
      );

    const request = (input: HttpClientRequest.HttpClientRequest) =>
      HttpClient.withScope(http)
        .execute(input)
        .pipe(
          Effect.timeout('30 seconds'),
          Effect.mapError((error) => accountTransportError(error, input)),
        );

    const post = (endpoint: string, payload: Schema.JsonObject) =>
      HttpClientRequest.post(`${origin}${endpoint}`).pipe(
        HttpClientRequest.setHeader('origin', origin),
        HttpClientRequest.bodyJson(payload),
        Effect.mapError(() =>
          problem('Remote', 'Cannot encode account request.'),
        ),
        Effect.flatMap(request),
      );

    const authenticatedHttp = (token: Redacted.Redacted<string>) =>
      http.pipe(
        HttpClient.mapRequestEffect((input) =>
          Effect.gen(function* () {
            const url = yield* Effect.try({
              try: () => new URL(input.url),
              catch: () =>
                new HttpClientError.HttpClientError({
                  reason: new HttpClientError.InvalidUrlError({
                    request: input,
                  }),
                }),
            });

            if (
              url.origin !== origin ||
              url.username !== '' ||
              url.password !== ''
            )
              return yield* new HttpClientError.HttpClientError({
                reason: new HttpClientError.InvalidUrlError({
                  request: input,
                  description:
                    'Authenticated requests must use the configured origin.',
                }),
              });

            return input.pipe(
              HttpClientRequest.bearerToken(token),
              HttpClientRequest.setHeader('origin', origin),
            );
          }),
        ),
      );

    const identity = (token: Redacted.Redacted<string>) =>
      Effect.gen(function* () {
        const response = yield* request(
          HttpClientRequest.get(`${origin}/api/auth/get-session`).pipe(
            HttpClientRequest.bearerToken(token),
          ),
        );

        if (response.status !== 200)
          return yield* accountRequestError(
            'HttpStatus',
            response.status === 401 || response.status === 403
              ? 'Account access was rejected. Connect again if the session expired or was revoked.'
              : 'Account session check returned an unexpected HTTP status.',
            response.request,
            response,
            response.status === 401 || response.status === 403
              ? 'Authentication'
              : 'Remote',
          );

        const session = yield* readJson(response, SessionResponse);

        if (session === null)
          return yield* problem(
            'Authentication',
            'Account access was revoked or expired. Disconnect the stored session, then connect again.',
          );

        return session.user;
      });

    const connected = Effect.fn('AccountConnection.connected')(function* (
      expected?: typeof AccountReference.Type,
    ) {
      const stored = yield* load();
      const now = yield* Clock.currentTimeMillis;

      if (
        Option.isNone(stored) ||
        !Predicate.isTagged(stored.value, 'Connected') ||
        stored.value.expiresAt <= now
      )
        return yield* problem(
          'Authentication',
          'Connect your account with connect_account, approve in your browser, then call complete_account_connection.',
        );
      const session = stored.value;

      if (
        expected !== undefined &&
        (expected.origin !== origin || expected.id !== session.account.id)
      )
        return yield* problem(
          'Authentication',
          'The requested account differs from this connection. Check account_status.',
        );
      const account = yield* identity(session.token).pipe(Effect.scoped);

      if (account.id !== session.account.id)
        return yield* problem(
          'Authentication',
          'The connected account changed. Connect again.',
        );

      return {
        account,
        reference: { origin, id: account.id },
        http: authenticatedHttp(session.token),
      };
    });

    const begin = Effect.fn('AccountConnection.begin')(() =>
      locked(
        Effect.gen(function* () {
          const saved = yield* load();
          const now = yield* Clock.currentTimeMillis;

          if (
            Option.isSome(saved) &&
            Predicate.isTagged(saved.value, 'Connected') &&
            saved.value.expiresAt > now
          )
            return yield* problem(
              'Authentication',
              'An account session is already stored. Disconnect it before starting a different connection.',
            );

          if (
            Option.isSome(saved) &&
            Predicate.isTagged(saved.value, 'Connected')
          ) {
            const response = yield* request(
              HttpClientRequest.post(`${origin}/api/auth/sign-out`).pipe(
                HttpClientRequest.bearerToken(saved.value.token),
                HttpClientRequest.setHeader('origin', origin),
              ),
            );

            if (response.status !== 200 && response.status !== 401)
              return yield* accountRequestError(
                'HttpStatus',
                'Cannot revoke the expired stored session. Retry before replacing it.',
                response.request,
                response,
              );
            yield* fs
              .remove(filename)
              .pipe(
                Effect.mapError(() =>
                  problem('Credentials', 'Cannot remove the expired session.'),
                ),
              );
          }

          let pending =
            Option.isSome(saved) &&
            Predicate.isTagged(saved.value, 'Pending') &&
            saved.value.expiresAt > now
              ? saved.value
              : undefined;

          if (pending === undefined) {
            const response = yield* post('/api/auth/device/code', {
              client_id: AGENT_CLIENT_ID,
            });

            if (response.status !== 200)
              return yield* accountRequestError(
                'HttpStatus',
                'Cannot start account approval. The server must include device authentication. Wait if rate limited.',
                response.request,
                response,
              );
            const code = yield* readJson(response, DeviceResponse);
            pending = Pending.make({
              origin,
              deviceCode: code.device_code,
              userCode: code.user_code,
              expiresAt: now + code.expires_in * 1000,
              interval: Math.max(15, code.interval),
              nextPollAt: now + Math.max(15, code.interval) * 1000,
            });
            yield* store(pending);
          }

          return {
            userCode: pending.userCode,
            verificationUrl: `${origin}${AGENT_CONNECT_PATH}?user_code=${pending.userCode}`,
            expiresAt: pending.expiresAt,
          };
        }),
      ),
    );

    const complete = Effect.fn('AccountConnection.complete')(
      (userCode: string) =>
        locked(
          Effect.interruptible(
            Effect.gen(function* () {
              const saved = yield* load();
              const now = yield* Clock.currentTimeMillis;

              if (
                Option.isNone(saved) ||
                !Predicate.isTagged(saved.value, 'Pending') ||
                saved.value.userCode !== userCode ||
                saved.value.expiresAt <= now
              )
                return yield* problem(
                  'Authentication',
                  'No matching active connection. Call connect_account again.',
                );
              const pending = saved.value;

              if (now < pending.nextPollAt)
                return {
                  status: 'pending' as const,
                  origin,
                  retryAfterSeconds: Math.ceil(
                    (pending.nextPollAt - now) / 1000,
                  ),
                };
              yield* store({
                ...pending,
                nextPollAt: now + pending.interval * 1000,
              });

              const response = yield* post('/api/auth/device/token', {
                client_id: AGENT_CLIENT_ID,
                device_code: Redacted.value(pending.deviceCode),
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
              });

              const polledAt = yield* Clock.currentTimeMillis;

              if (response.status !== 200) {
                if (response.status === 429) {
                  yield* store({ ...pending, nextPollAt: polledAt + 60_000 });

                  return {
                    status: 'pending' as const,
                    origin,
                    retryAfterSeconds: 60,
                  };
                }

                const failure = yield* readJson(response, DeviceFailure);

                if (
                  failure.error === 'authorization_pending' ||
                  failure.error === 'slow_down'
                ) {
                  const interval =
                    failure.error === 'slow_down'
                      ? pending.interval + 5
                      : pending.interval;

                  yield* store({
                    ...pending,
                    interval,
                    nextPollAt: polledAt + interval * 1000,
                  });

                  return {
                    status: 'pending' as const,
                    origin,
                    retryAfterSeconds: interval,
                  };
                }

                yield* fs
                  .remove(filename)
                  .pipe(
                    Effect.mapError(() =>
                      problem(
                        'Credentials',
                        'Cannot clear the expired connection.',
                      ),
                    ),
                  );

                return yield* accountRequestError(
                  'HttpStatus',
                  'Connection denied or expired. Start a new connection if needed.',
                  response.request,
                  response,
                  'Authentication',
                );
              }

              const token = yield* readJson(response, TokenResponse);

              const account = yield* Effect.gen(function* () {
                const account = yield* identity(token.access_token);
                yield* store(
                  Connected.make({
                    origin,
                    token: token.access_token,
                    account,
                    expiresAt: now + token.expires_in * 1000,
                  }),
                );

                return account;
              }).pipe(
                Effect.onError(() =>
                  request(
                    HttpClientRequest.post(`${origin}/api/auth/sign-out`).pipe(
                      HttpClientRequest.bearerToken(token.access_token),
                      HttpClientRequest.setHeader('origin', origin),
                    ),
                  ).pipe(Effect.ignore),
                ),
              );

              return { status: 'connected' as const, origin, account };
            }),
          ),
        ),
    );

    const disconnect = Effect.fn('AccountConnection.disconnect')(
      (expected: typeof AccountReference.Type) =>
        locked(
          Effect.gen(function* () {
            const stored = yield* load();

            if (
              Option.isNone(stored) ||
              !Predicate.isTagged(stored.value, 'Connected')
            )
              return yield* problem(
                'Authentication',
                'No connected account session is stored.',
              );
            const session = stored.value;

            if (
              expected.origin !== origin ||
              expected.id !== session.account.id
            )
              return yield* problem(
                'Authentication',
                'The requested account differs from this connection.',
              );

            const response = yield* request(
              HttpClientRequest.post(`${origin}/api/auth/sign-out`).pipe(
                HttpClientRequest.bearerToken(session.token),
                HttpClientRequest.setHeader('origin', origin),
              ),
            );

            if (response.status !== 200 && response.status !== 401)
              return yield* accountRequestError(
                'HttpStatus',
                'Could not revoke the session. The local credential was retained so you can retry.',
                response.request,
                response,
              );
            yield* fs
              .remove(filename)
              .pipe(
                Effect.mapError(() =>
                  problem(
                    'Credentials',
                    'Session revoked, but the local credential could not be removed.',
                  ),
                ),
              );

            return { disconnected: true as const };
          }),
        ),
    );

    return {
      begin,
      complete,
      connected,
      disconnect,
      readJson,
      writesAllowed: config.allowAccountWrite,
    };
  });

export class AccountConnection extends Context.Service<
  AccountConnection,
  Effect.Success<ReturnType<typeof make>>
>()('moodboard/mcp/AccountConnection') {
  static readonly layer = (config: AccountConfig) =>
    Layer.effect(this, make(config));
}
