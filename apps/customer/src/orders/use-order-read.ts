import type { ResponseSchema } from "@be-fast/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { serviceError, shouldRetryRead, type CustomerRequest } from "../api";

interface OrderReadState<T> {
  data?: T;
  error?: string;
  loading: boolean;
  updatedAt?: number;
  receivedAt?: number;
}

function waitForRetry(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

export function useOrderRead<T>(
  request: CustomerRequest,
  path: string,
  schema: ResponseSchema<T>,
) {
  const [state, setState] = useState<OrderReadState<T>>({ loading: true });
  const running = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (running.current) return;
    const controller = new AbortController();
    running.current = controller;
    setState((previous) => ({ ...previous, loading: true }));
    try {
      for (let failures = 0; !controller.signal.aborted; failures++) {
        try {
          const data = await request(
            path,
            { signal: controller.signal },
            schema,
          );
          if (!controller.signal.aborted)
            setState({
              data,
              loading: false,
              updatedAt: Date.now(),
              receivedAt: performance.now(),
            });
          return;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (!shouldRetryRead(failures, error)) {
            setState((previous) => ({
              ...previous,
              error: serviceError(error),
              loading: false,
            }));
            return;
          }
          await waitForRetry(2 ** failures * 1_000, controller.signal);
        }
      }
    } finally {
      if (running.current === controller) running.current = null;
    }
  }, [path, request, schema]);

  const replace = useCallback((data: T) => {
    running.current?.abort();
    running.current = null;
    setState({
      data,
      loading: false,
      updatedAt: Date.now(),
      receivedAt: performance.now(),
    });
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      running.current?.abort();
      running.current = null;
    };
  }, [refresh]);

  return { ...state, refresh, replace };
}
