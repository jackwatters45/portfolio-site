const HEIC_DECODE_TIMEOUT_MS = 30_000;

const abortError = () => new DOMException("Image processing was cancelled.", "AbortError");

const resizeOptions = (width: number, height: number, longestEdge: number) => {
  if (Math.max(width, height) <= longestEdge) return {};
  return width >= height ? { resizeWidth: longestEdge } : { resizeHeight: longestEdge };
};

let decodeTail: Promise<void> = Promise.resolve();

const waitForTurn = (turn: Promise<void>, signal?: AbortSignal): Promise<void> => {
  if (signal?.aborted) return Promise.reject(abortError());
  if (signal === undefined) return turn;
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(abortError());
    };
    signal.addEventListener("abort", abort, { once: true });
    void turn.then(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    });
  });
};

const withSingleNativeHeicDecoder = async <T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  const previous = decodeTail;
  let release: () => void = () => undefined;
  const ownTurn = new Promise<void>((resolve) => {
    release = resolve;
  });
  decodeTail = previous.catch(() => undefined).then(() => ownTurn);
  try {
    await waitForTurn(previous, signal);
    if (signal?.aborted) throw abortError();
    return await operation();
  } finally {
    release();
  }
};

const loadNativeHeic = (url: string, signal?: AbortSignal): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const image = new Image();
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    const fail = (error: Error | DOMException) => {
      if (settled) return;
      settled = true;
      cleanup();
      image.src = "";
      reject(error);
    };
    const abort = () => fail(abortError());
    const timeout = window.setTimeout(() => {
      fail(new Error("That HEIC image took too long to decode."));
    }, HEIC_DECODE_TIMEOUT_MS);
    signal?.addEventListener("abort", abort, { once: true });
    image.onload = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(image);
    };
    image.onerror = () => fail(new Error("This browser cannot decode HEIC photos natively."));
    image.src = url;
  });

const decodeNativeHeic = async (
  file: File,
  longestEdge: number,
  signal?: AbortSignal,
): Promise<ImageBitmap> => {
  const url = URL.createObjectURL(file);
  let image: HTMLImageElement | null = null;
  try {
    image = await loadNativeHeic(url, signal);
    if (signal?.aborted) throw abortError();
    return await createImageBitmap(image, {
      imageOrientation: "from-image",
      resizeQuality: "high",
      ...resizeOptions(image.naturalWidth, image.naturalHeight, longestEdge),
    });
  } finally {
    if (image !== null) image.src = "";
    URL.revokeObjectURL(url);
  }
};

const waitForFallbackBitmap = (
  operation: Promise<ImageBitmap>,
  signal?: AbortSignal,
): Promise<ImageBitmap> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    const fail = (error: Error | DOMException) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => fail(abortError());
    const timeout = window.setTimeout(
      () => fail(new Error("That HEIC image took too long to convert.")),
      HEIC_DECODE_TIMEOUT_MS,
    );
    signal?.addEventListener("abort", abort, { once: true });
    void operation.then(
      (bitmap) => {
        if (settled) {
          bitmap.close();
          return;
        }
        settled = true;
        cleanup();
        resolve(bitmap);
      },
      (cause: unknown) =>
        fail(
          new Error("This browser could not convert that HEIC photo.", {
            cause,
          }),
        ),
    );
  });

const decodeFallbackHeic = async (
  file: File,
  sourceWidth: number,
  sourceHeight: number,
  longestEdge: number,
  signal?: AbortSignal,
): Promise<ImageBitmap> => {
  const { heicTo } = await import("heic-to/csp");
  if (signal?.aborted) throw abortError();
  return waitForFallbackBitmap(
    heicTo({
      blob: file,
      type: "bitmap",
      options: {
        imageOrientation: "from-image",
        resizeQuality: "high",
        ...resizeOptions(sourceWidth, sourceHeight, longestEdge),
      },
    }),
    signal,
  );
};

export const decodeHeicBitmap = (
  file: File,
  sourceWidth: number,
  sourceHeight: number,
  longestEdge: number,
  signal?: AbortSignal,
): Promise<ImageBitmap> =>
  withSingleNativeHeicDecoder(async () => {
    if (typeof createImageBitmap !== "function") {
      throw new Error("This browser cannot convert HEIC photos.");
    }
    try {
      return await decodeNativeHeic(file, longestEdge, signal);
    } catch (nativeError) {
      if (
        signal?.aborted ||
        (nativeError instanceof DOMException && nativeError.name === "AbortError")
      ) {
        throw nativeError;
      }
      try {
        return await decodeFallbackHeic(file, sourceWidth, sourceHeight, longestEdge, signal);
      } catch (fallbackError) {
        if (
          signal?.aborted ||
          (fallbackError instanceof DOMException && fallbackError.name === "AbortError")
        ) {
          throw fallbackError;
        }
        throw new Error("That HEIC photo could not be decoded. Convert it to JPEG and try again.", {
          cause: fallbackError,
        });
      }
    }
  }, signal);
