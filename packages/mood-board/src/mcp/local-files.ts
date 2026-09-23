import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, opendir } from 'node:fs/promises';

import {
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';

import { MAX_BULK_FILES } from '../client/board/bulk-image-import';
import { MAX_ARCHIVE_BYTES } from '../lib/board-archive';
import { MAX_SOURCE_IMAGE_BYTES } from '../lib/image-preflight';
import { MAX_AUDIO_UPLOAD_BYTES } from '../lib/media';
import {
  ArchiveName,
  AssetPath,
  LocalBoardError,
  LocalConfigSchema,
  MAX_OPERATION_SOURCE_BYTES,
  MAX_PREVIEW_BYTES,
  MAX_SCAN_DEPTH,
  MAX_SCAN_ENTRIES,
  OutputName,
  type AssetFailure,
  type AssetKind,
  type BoardReference,
  type LocalConfig,
  type ScanRequest,
} from './contracts';

export const contentHash = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

export type SourceBudget = { used: number };

type ListedAssets = {
  paths: string[];
  failures: AssetFailure[];
  visited: number;
  truncated: boolean;
  limits: string[];
};

type FilePolicy = {
  readonly list: (
    input: ScanRequest,
  ) => Effect.Effect<ListedAssets, LocalBoardError>;
  readonly listBoards: () => Effect.Effect<
    { files: string[]; truncated: boolean },
    LocalBoardError
  >;
  readonly readAsset: (
    path: string,
    kind: AssetKind,
    budget: SourceBudget,
  ) => Effect.Effect<Uint8Array, LocalBoardError>;
  readonly readBoard: (
    file: string,
  ) => Effect.Effect<Uint8Array, LocalBoardError>;
  readonly deleteBoard: (
    board: BoardReference,
  ) => Effect.Effect<void, LocalBoardError>;
  readonly checkOutput: (
    name: string,
    extension: string,
    overwrite: boolean,
  ) => Effect.Effect<string, LocalBoardError>;
  readonly writeOutput: (
    name: string,
    extension: string,
    bytes: Uint8Array,
    overwrite: boolean,
  ) => Effect.Effect<string, LocalBoardError>;
};

const extensions = {
  image: /\.(jpe?g|png|gif|webp|hei[cf]|hif)$/i,
  audio: /\.(mp3|m4a|mp4|wav|ogg|oga|webm)$/i,
  archive: /\.moodboard$/i,
};

const byteLimits = {
  image: MAX_SOURCE_IMAGE_BYTES,
  audio: MAX_AUDIO_UPLOAD_BYTES,
  archive: MAX_ARCHIVE_BYTES,
};

export class LocalFiles extends Context.Service<LocalFiles, FilePolicy>()(
  'moodboard/mcp/LocalFiles',
) {
  static layer(config: LocalConfig) {
    return Layer.effect(
      LocalFiles,
      Effect.gen(function* () {
        if (process.platform !== 'darwin' && process.platform !== 'linux') {
          return yield* new LocalBoardError({
            code: 'Unsupported',
            message:
              'The local filesystem adapter supports macOS and Linux only.',
          });
        }

        yield* Schema.decodeUnknownEffect(LocalConfigSchema)(config).pipe(
          Effect.mapError(
            (error) =>
              new LocalBoardError({
                code: 'InvalidInput',
                message: error.message,
              }),
          ),
        );
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const ioError = (operation: string) =>
          new LocalBoardError({
            code: 'Io',
            message: `${operation} failed. Check paths and permissions.`,
          });

        if (
          !path.isAbsolute(config.assetRoot) ||
          !path.isAbsolute(config.outputDirectory)
        ) {
          return yield* new LocalBoardError({
            code: 'AccessDenied',
            message:
              'Asset root and output directory must be explicit absolute paths.',
          });
        }

        const root = yield* fs
          .realPath(config.assetRoot)
          .pipe(Effect.mapError(() => ioError('Opening asset root')));

        const outputRoot = yield* fs
          .realPath(config.outputDirectory)
          .pipe(Effect.mapError(() => ioError('Opening output directory')));

        const within = (parent: string, child: string) => {
          const relative = path.relative(parent, child);

          return (
            relative === '' ||
            (!path.isAbsolute(relative) &&
              relative !== '..' &&
              !relative.startsWith(`..${path.sep}`))
          );
        };

        if (within(root, outputRoot) || within(outputRoot, root)) {
          return yield* new LocalBoardError({
            code: 'AccessDenied',
            message:
              'Asset and output directories must be separate, non-nested directories.',
          });
        }

        for (const directory of [root, outputRoot]) {
          const info = yield* fs
            .stat(directory)
            .pipe(Effect.mapError(() => ioError('Reading directory')));

          if (info.type !== 'Directory')
            return yield* new LocalBoardError({
              code: 'AccessDenied',
              message: 'Both approved paths must be existing directories.',
            });
        }

        const resolve = Effect.fn('LocalFiles.resolve')(function* (
          base: string,
          relative: string,
        ) {
          yield* Schema.decodeUnknownEffect(AssetPath)(relative).pipe(
            Effect.mapError(
              (error) =>
                new LocalBoardError({
                  code: 'AccessDenied',
                  message: error.message,
                }),
            ),
          );
          const candidate = path.resolve(base, relative);

          if (!within(base, candidate))
            return yield* new LocalBoardError({
              code: 'AccessDenied',
              message: 'Path is outside its approved root.',
            });

          const canonical = yield* fs.realPath(candidate).pipe(
            Effect.mapError(
              () =>
                new LocalBoardError({
                  code: 'NotFound',
                  message: `Cannot resolve: ${relative}`,
                }),
            ),
          );

          if (!within(base, canonical) || canonical !== candidate) {
            return yield* new LocalBoardError({
              code: 'AccessDenied',
              message: 'Symlinked paths are not allowed.',
            });
          }

          return canonical;
        });

        const list = Effect.fn('LocalFiles.list')(function* (
          input: ScanRequest,
        ) {
          const result: ListedAssets = {
            paths: [],
            failures: [],
            visited: 0,
            truncated: false,
            limits: [],
          };

          const queue = [{ relative: input.directory ?? '.', depth: 0 }];

          while (queue.length > 0 && !result.truncated) {
            const next = queue.shift();

            if (next === undefined) break;

            const canonical = yield* resolve(root, next.relative);
            yield* Effect.scoped(
              Effect.gen(function* () {
                // The platform readDirectory materializes the whole directory. Stream entries instead.
                const directory = yield* Effect.acquireRelease(
                  Effect.tryPromise({
                    try: () => opendir(canonical),
                    catch: () => ioError('Opening scan directory'),
                  }),
                  (handle) =>
                    Effect.promise(() => handle.close()).pipe(
                      Effect.catchCause(Effect.logWarning),
                    ),
                );

                while (!result.truncated) {
                  const entry = yield* Effect.tryPromise({
                    try: () => directory.read(),
                    catch: () => ioError('Reading scan directory'),
                  });

                  if (entry === null) break;

                  result.visited += 1;
                  const relative = path.join(next.relative, entry.name);

                  if (result.visited >= MAX_SCAN_ENTRIES) {
                    result.truncated = true;
                    result.limits.push(
                      `Stopped at ${MAX_SCAN_ENTRIES} directory entries. Scan a smaller subfolder.`,
                    );
                    break;
                  }

                  if (entry.isSymbolicLink()) {
                    result.failures.push({
                      path: relative,
                      code: 'AccessDenied',
                      message: 'Symlinks are not scanned.',
                    });
                  } else if (entry.isDirectory() && input.recursive) {
                    if (next.depth < MAX_SCAN_DEPTH)
                      queue.push({ relative, depth: next.depth + 1 });
                    else result.limits.push(`Depth limit: ${relative}`);
                  } else if (
                    entry.isFile() &&
                    extensions[input.kind ?? 'image'].test(entry.name)
                  ) {
                    result.paths.push(relative);

                    if (result.paths.length >= MAX_BULK_FILES) {
                      result.truncated = true;
                      result.limits.push(
                        `Stopped at ${MAX_BULK_FILES} candidates. Scan a smaller subfolder.`,
                      );
                    }
                  }
                }
              }),
            );
          }

          result.paths.sort();

          return result;
        });

        const read = Effect.fn('LocalFiles.read')(function* (
          base: string,
          relative: string,
          limit: number,
          budget: SourceBudget,
        ) {
          const canonical = yield* resolve(base, relative);

          // Native open supplies O_NOFOLLOW and nonblocking rejection of special files.
          return yield* Effect.acquireUseRelease(
            Effect.tryPromise({
              try: () =>
                open(
                  canonical,
                  constants.O_RDONLY |
                    constants.O_NOFOLLOW |
                    constants.O_NONBLOCK,
                ),
              catch: () => ioError(`Opening ${relative}`),
            }),
            (handle) =>
              Effect.gen(function* () {
                const stat = yield* Effect.tryPromise({
                  try: () => handle.stat(),
                  catch: () => ioError('Reading file metadata'),
                });

                const currentPath = yield* resolve(base, relative);

                const currentStat = yield* fs
                  .stat(currentPath)
                  .pipe(Effect.mapError(() => ioError('Checking file path')));

                if (
                  !stat.isFile() ||
                  stat.nlink !== 1 ||
                  currentStat.dev !== stat.dev ||
                  !Option.contains(stat.ino)(currentStat.ino)
                ) {
                  return yield* new LocalBoardError({
                    code: 'AccessDenied',
                    message:
                      'Only regular files with one filesystem link are allowed. The path may have changed.',
                  });
                }

                if (
                  stat.size <= 0 ||
                  stat.size > limit ||
                  budget.used + stat.size > MAX_OPERATION_SOURCE_BYTES
                ) {
                  return yield* new LocalBoardError({
                    code: 'Limit',
                    message: `File is empty, exceeds ${limit} bytes, or exceeds the 512 MiB source budget.`,
                  });
                }

                budget.used += stat.size;
                const bytes = new Uint8Array(stat.size);
                let offset = 0;

                while (offset < bytes.length) {
                  const chunk = yield* Effect.tryPromise({
                    try: () =>
                      handle.read(
                        bytes,
                        offset,
                        Math.min(65536, bytes.length - offset),
                        offset,
                      ),
                    catch: () => ioError('Reading file'),
                  });

                  if (chunk.bytesRead === 0)
                    return yield* new LocalBoardError({
                      code: 'Changed',
                      message: 'File changed while reading. Inspect it again.',
                    });

                  offset += chunk.bytesRead;
                }

                const after = yield* Effect.tryPromise({
                  try: () => handle.stat(),
                  catch: () => ioError('Checking file'),
                });

                if (
                  after.size !== stat.size ||
                  after.mtimeMs !== stat.mtimeMs ||
                  after.ctimeMs !== stat.ctimeMs
                ) {
                  return yield* new LocalBoardError({
                    code: 'Changed',
                    message: 'File changed while reading. Inspect it again.',
                  });
                }

                return bytes;
              }),
            (handle) =>
              Effect.promise(() => handle.close()).pipe(
                Effect.catchCause(Effect.logWarning),
              ),
          );
        });

        const readAsset = Effect.fn('LocalFiles.readAsset')(
          (relative: string, kind: AssetKind, budget: SourceBudget) =>
            read(root, relative, byteLimits[kind], budget),
        );

        const readBoard = Effect.fn('LocalFiles.readBoard')(function* (
          file: string,
        ) {
          yield* Schema.decodeUnknownEffect(ArchiveName)(file).pipe(
            Effect.mapError(
              () =>
                new LocalBoardError({
                  code: 'AccessDenied',
                  message:
                    'Use a .moodboard filename from the output directory.',
                }),
            ),
          );

          return yield* read(outputRoot, file, MAX_ARCHIVE_BYTES, { used: 0 });
        });

        const listBoards = Effect.fn('LocalFiles.listBoards')(function* () {
          yield* resolve(outputRoot, '.');

          return yield* Effect.scoped(
            Effect.gen(function* () {
              const directory = yield* Effect.acquireRelease(
                Effect.tryPromise({
                  try: () => opendir(outputRoot),
                  catch: () => ioError('Opening output directory'),
                }),
                (handle) =>
                  Effect.promise(() => handle.close()).pipe(
                    Effect.catchCause(Effect.logWarning),
                  ),
              );

              const names: string[] = [];
              let visited = 0;

              while (visited < MAX_SCAN_ENTRIES && names.length < 100) {
                const entry = yield* Effect.tryPromise({
                  try: () => directory.read(),
                  catch: () => ioError('Listing boards'),
                });

                if (entry === null)
                  return { files: names.sort(), truncated: false };

                visited += 1;

                if (entry.isFile() && Schema.is(ArchiveName)(entry.name))
                  names.push(entry.name);
              }

              return { files: names.sort(), truncated: true };
            }),
          );
        });

        const checkOutput = Effect.fn('LocalFiles.checkOutput')(function* (
          name: string,
          extension: string,
          overwrite: boolean,
        ) {
          yield* Schema.decodeUnknownEffect(OutputName)(name).pipe(
            Effect.mapError(
              () =>
                new LocalBoardError({
                  code: 'AccessDenied',
                  message: 'Output must be a simple filename, not a path.',
                }),
            ),
          );

          if (!name.endsWith(extension))
            return yield* new LocalBoardError({
              code: 'InvalidInput',
              message: `Output must end in ${extension}.`,
            });

          if (overwrite && !config.allowOverwrite)
            return yield* new LocalBoardError({
              code: 'AccessDenied',
              message:
                'Overwrite was not approved at startup. Choose another output name.',
            });

          yield* resolve(outputRoot, '.');
          const target = path.join(outputRoot, name);

          const exists = yield* fs
            .exists(target)
            .pipe(Effect.mapError(() => ioError('Checking output')));

          if (exists && !overwrite)
            return yield* new LocalBoardError({
              code: 'Exists',
              message: 'Output exists. Choose a new name.',
            });

          if (exists) {
            yield* resolve(outputRoot, name);

            const info = yield* fs
              .stat(target)
              .pipe(Effect.mapError(() => ioError('Checking output file')));

            if (info.type !== 'File')
              return yield* new LocalBoardError({
                code: 'AccessDenied',
                message: 'Cannot replace a non-file output.',
              });
          }

          return target;
        });

        const writeOutput = Effect.fn('LocalFiles.writeOutput')(function* (
          name: string,
          extension: string,
          bytes: Uint8Array,
          overwrite: boolean,
        ) {
          if (
            bytes.length === 0 ||
            bytes.length >
              (extension === '.jpg' ? MAX_PREVIEW_BYTES : MAX_ARCHIVE_BYTES)
          ) {
            return yield* new LocalBoardError({
              code: 'Limit',
              message: 'Output exceeds its byte limit.',
            });
          }

          return yield* Effect.scoped(
            Effect.gen(function* () {
              const target = yield* checkOutput(name, extension, overwrite);

              const temporary = yield* fs.makeTempDirectoryScoped({
                directory: outputRoot,
                prefix: '.moodboard-',
              });

              yield* fs.chmod(temporary, 0o700);
              const staged = path.join(temporary, 'output');
              yield* fs.writeFile(staged, bytes, { mode: 0o600, flag: 'wx' });
              yield* checkOutput(name, extension, overwrite);
              // Hard links publish atomically without replacing a path. Rename is opt-in for exports/previews only.
              yield* overwrite
                ? fs.rename(staged, target)
                : fs.link(staged, target);

              return target;
            }),
          ).pipe(
            Effect.catchTag('PlatformError', () =>
              ioError('Writing output (it may already exist)'),
            ),
          );
        });

        const deleteBoard = Effect.fn('LocalFiles.deleteBoard')(function* (
          board: BoardReference,
        ) {
          if (!config.allowDelete)
            return yield* new LocalBoardError({
              code: 'AccessDenied',
              message:
                'Archive deletion was not approved with --allow-delete at startup.',
            });

          const bytes = yield* readBoard(board.file);

          if (contentHash(bytes) !== board.sha256)
            return yield* new LocalBoardError({
              code: 'Changed',
              message:
                'Archive changed. Inspect it before requesting deletion again.',
            });

          const target = yield* resolve(outputRoot, board.file);
          yield* fs
            .remove(target)
            .pipe(Effect.mapError(() => ioError('Deleting board archive')));
        });

        return LocalFiles.of({
          list,
          listBoards,
          readAsset,
          readBoard,
          deleteBoard,
          checkOutput,
          writeOutput,
        });
      }),
    );
  }
}
