import { ApiClientError, type ResponseSchema } from "@be-fast/api-client";
import {
  authTokensSchema,
  customerProfileSchema,
  type AuthTokens,
} from "@be-fast/contracts";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  sendCustomerRequest,
  type CustomerRequest,
  type CustomerRequestOptions,
} from "./api";
import {
  customerStorageReady,
  customerStore,
  flushCustomerStore,
} from "./storage";

const tokenKey = "befast.customer.tokens";

interface Session {
  ready: boolean;
  request: CustomerRequest;
  signIn(pair: AuthTokens): Promise<void>;
  signOut(): Promise<void>;
  clear(): Promise<void>;
}

const AuthContext = createContext<Session | null>(null);

export function CustomerSessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const tokens = useRef<AuthTokens | null>(null);
  const rotation = useRef<Promise<AuthTokens> | null>(null);
  const writes = useRef(Promise.resolve());

  const write = useCallback((action: () => Promise<void>) => {
    const result = writes.current.then(action);
    writes.current = result.catch(() => undefined);
    return result;
  }, []);

  const clear = useCallback(async () => {
    tokens.current = null;
    customerStore.getState().clearAccount();
    await Promise.all([
      write(() => SecureStore.deleteItemAsync(tokenKey)),
      flushCustomerStore(),
    ]);
  }, [write]);

  const refresh = useCallback(
    (current: AuthTokens) => {
      if (tokens.current !== current) {
        if (tokens.current) return Promise.resolve(tokens.current);
        return Promise.reject(new ApiClientError(401));
      }
      if (rotation.current) return rotation.current;
      rotation.current = (async () => {
        try {
          const pair = await sendCustomerRequest(
            "/auth/refresh",
            {
              method: "POST",
              body: { refreshToken: current.refreshToken },
            },
            undefined,
            authTokensSchema,
          );
          if (tokens.current !== current) throw new ApiClientError(401);
          await write(() =>
            SecureStore.setItemAsync(tokenKey, JSON.stringify(pair)),
          );
          if (tokens.current !== current) throw new ApiClientError(401);
          tokens.current = pair;
          return pair;
        } catch (error) {
          if (
            tokens.current === current &&
            error instanceof ApiClientError &&
            error.status === 401
          )
            await clear();
          throw error;
        }
      })().finally(() => {
        rotation.current = null;
      });
      return rotation.current;
    },
    [clear, write],
  );

  const request = useCallback(
    async <T,>(
      path: string,
      options?: CustomerRequestOptions,
      schema?: ResponseSchema<T>,
    ) => {
      const pair = tokens.current;
      if (!pair) throw new ApiClientError(401);
      const send = (accessToken: string) =>
        sendCustomerRequest(path, options, accessToken, schema);
      try {
        return await send(pair.accessToken);
      } catch (error) {
        if (
          !(error instanceof ApiClientError) ||
          error.status !== 401 ||
          options?.signal?.aborted
        )
          throw error;
        const rotated = await refresh(pair);
        if (options?.method && options.method !== "GET") throw error;
        return send(rotated.accessToken);
      }
    },
    [refresh],
  ) as CustomerRequest;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await customerStorageReady;
        const stored = await SecureStore.getItemAsync(tokenKey);
        const parsed = authTokensSchema.safeParse(
          stored === null ? null : JSON.parse(stored),
        );
        if (!active) return;
        if (!parsed.success) {
          if (stored !== null || customerStore.getState().profile)
            await clear();
          return;
        }
        tokens.current = parsed.data;
        if (active) setReady(true);
        const profile = await request(
          "/customer/me",
          undefined,
          customerProfileSchema,
        );
        if (active && tokens.current)
          customerStore.getState().setProfile(profile);
      } catch (error) {
        if (
          active &&
          (error instanceof SyntaxError || tokens.current === null)
        ) {
          await clear().catch(() => undefined);
        }
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [clear, request]);

  const signIn = useCallback(
    async (pair: AuthTokens) => {
      await write(() =>
        SecureStore.setItemAsync(tokenKey, JSON.stringify(pair)),
      );
      tokens.current = pair;
      const profile = await sendCustomerRequest(
        "/customer/me",
        undefined,
        pair.accessToken,
        customerProfileSchema,
      );
      if (tokens.current === pair) {
        customerStore.getState().setProfile(profile);
        await flushCustomerStore();
      }
    },
    [write],
  );

  const signOut = useCallback(async () => {
    await rotation.current?.catch(() => undefined);
    if (tokens.current) {
      await sendCustomerRequest("/auth/logout", {
        method: "POST",
        body: { refreshToken: tokens.current.refreshToken },
      });
    }
    await clear();
  }, [clear]);

  return (
    <AuthContext.Provider value={{ ready, request, signIn, signOut, clear }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useCustomerSession() {
  const session = useContext(AuthContext);
  if (!session) throw new Error("Customer session provider is missing.");
  return session;
}
