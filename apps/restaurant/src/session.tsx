import { ApiClientError, type ResponseSchema } from "@be-fast/api-client";
import { authTokensSchema, restaurantSessionSchema, type AuthTokens, type RestaurantSession } from "@be-fast/contracts";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { sendRestaurantRequest, type RequestOptions, type RestaurantRequest } from "./api";

const storageKey = "befast.restaurant.tokens";
type Credentials = RestaurantSession & { serverOffsetMs: number };
type State = { phase: "loading" | "anonymous" } | { phase: "error"; error: unknown } | { phase: "ready"; credentials: Credentials };

interface Controller {
  state: State;
  request: RestaurantRequest;
  signIn: (pair: AuthTokens) => Promise<void>;
  signOut: () => Promise<void>;
  restore: () => void;
}

const RestaurantAuth = createContext<Controller | null>(null);

async function readCredentials(access: string): Promise<Credentials> {
  const started = Date.now();
  const session = await sendRestaurantRequest("/restaurant/session", {}, access, restaurantSessionSchema);
  return { ...session, serverOffsetMs: Date.parse(session.serverTime) - Math.floor((started + Date.now()) / 2) };
}

export function RestaurantSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const tokens = useRef<AuthTokens | null>(null);
  const rotation = useRef<Promise<AuthTokens> | null>(null);
  const restoring = useRef(false);

  const saveTokens = useCallback(async (pair: AuthTokens) => {
    await SecureStore.setItemAsync(storageKey, JSON.stringify(pair));
    tokens.current = pair;
  }, []);

  const clear = useCallback(async () => {
    await SecureStore.deleteItemAsync(storageKey);
    tokens.current = null;
    setState({ phase: "anonymous" });
  }, []);

  const rotate = useCallback((access: string) => {
    if (rotation.current) return rotation.current;
    rotation.current = (async () => {
      if (!tokens.current) throw new ApiClientError(401);
      if (tokens.current.accessToken !== access) return tokens.current;
      try {
        const pair = await sendRestaurantRequest("/auth/refresh", { method: "POST", body: { refreshToken: tokens.current.refreshToken } }, undefined, authTokensSchema);
        await saveTokens(pair);
        return pair;
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) await clear();
        throw error;
      }
    })().finally(() => { rotation.current = null; });
    return rotation.current;
  }, [clear, saveTokens]);

  const restore = useCallback(() => {
    if (restoring.current) return;
    restoring.current = true;
    setState({ phase: "loading" });
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(storageKey);
        if (!stored) {
          setState({ phase: "anonymous" });
          return;
        }
        const pair = authTokensSchema.parse(JSON.parse(stored));
        tokens.current = pair;
        let credentials: Credentials;
        try {
          credentials = await readCredentials(pair.accessToken);
        } catch (error) {
          if (!(error instanceof ApiClientError) || error.status !== 401) throw error;
          credentials = await readCredentials((await rotate(pair.accessToken)).accessToken);
        }
        setState({ phase: "ready", credentials });
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401 && tokens.current === null) return;
        if (error instanceof SyntaxError) await clear();
        else setState({ phase: "error", error });
      } finally {
        restoring.current = false;
      }
    })();
  }, [clear, rotate]);

  useEffect(() => { restore(); }, [restore]);

  const signIn = useCallback(async (pair: AuthTokens) => {
    const credentials = await readCredentials(pair.accessToken);
    await saveTokens(pair);
    setState({ phase: "ready", credentials });
  }, [saveTokens]);

  const signOut = useCallback(async () => {
    await rotation.current?.catch(() => undefined);
    const refreshToken = tokens.current?.refreshToken;
    if (refreshToken) await sendRestaurantRequest("/auth/logout", { method: "POST", body: { refreshToken } });
    await clear();
  }, [clear]);

  const request: RestaurantRequest = useCallback(async <T,>(path: string, options?: RequestOptions, schema?: ResponseSchema<T>) => {
    const current = tokens.current;
    if (!current) throw new ApiClientError(401);
    const send = (access: string) => schema ? sendRestaurantRequest(path, options, access, schema) : sendRestaurantRequest(path, options, access);
    try {
      return await send(current.accessToken);
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 401 || options?.signal?.aborted) throw error;
      const refreshed = await rotate(current.accessToken);
      const credentials = await readCredentials(refreshed.accessToken);
      if (tokens.current === refreshed) setState({ phase: "ready", credentials });
      if (options?.method && options.method !== "GET") throw error;
      return send(refreshed.accessToken);
    }
  }, [rotate]) as RestaurantRequest;

  return <RestaurantAuth.Provider value={{ state, signIn, signOut, restore, request }}>{children}</RestaurantAuth.Provider>;
}

export function useRestaurantAuth() {
  const context = useContext(RestaurantAuth);
  if (!context) throw new Error("Restaurant session provider is missing.");
  return context;
}

export function useRestaurantSession() {
  const { state, request } = useRestaurantAuth();
  if (state.phase !== "ready") throw new Error("Restaurant session is required.");
  return { ...state.credentials, request };
}
