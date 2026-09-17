import { BrowserHttpClient } from "@effect/platform-browser";
import { Context, Layer, ManagedRuntime } from "effect";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";

import { BoardRpcs, ClientIdSchema, MutationIdSchema } from "../lib/board-rpc";
import { signalAuthenticationRequired } from "./auth-client";

const authenticatedFetch = (async (input, init) => {
  const response = await globalThis.fetch(input, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401) signalAuthenticationRequired();
  return response;
}) as typeof globalThis.fetch;

const BrowserHttp = BrowserHttpClient.layerFetch.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      Layer.succeed(BrowserHttpClient.Fetch, authenticatedFetch),
      Layer.succeed(BrowserHttpClient.RequestInit, {
        credentials: "same-origin",
        cache: "no-store",
      }),
    ),
  ),
);

export class BoardRpcClient extends Context.Service<
  BoardRpcClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof BoardRpcs>, RpcClientError>
>()("mood-board/BoardRpcClient") {
  static httpLayer(url: string) {
    return Layer.effect(BoardRpcClient, RpcClient.make(BoardRpcs)).pipe(
      Layer.provide(RpcClient.layerProtocolHttp({ url })),
      Layer.provide(BrowserHttp),
      Layer.provide(RpcSerialization.layerNdjson),
    );
  }
}

const makeId = () =>
  typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const makeClientId = () => ClientIdSchema.make(makeId());
export const makeMutationId = () => MutationIdSchema.make(makeId());

const rpcUrl = () => {
  const url = new URL(import.meta.env.VITE_RPC_URL ?? "/rpc", window.location.href);
  if (url.origin !== window.location.origin) {
    throw new Error("Authenticated RPC must use the application origin.");
  }
  return url.toString();
};

export const makeBoardRpcRuntime = () => ManagedRuntime.make(BoardRpcClient.httpLayer(rpcUrl()));
