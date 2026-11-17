import type { ResponseSchema } from "@be-fast/api-client";
import { useCallback, useEffect, useState } from "react";
import type { RestaurantRequest } from "../api";

const pollIntervalMs = 10_000;

interface Read<T> {
  path: string;
  data?: T;
  receivedAt?: number;
  failed: boolean;
}

export function useOrderPolling<T>(
  path: string | null,
  schema: ResponseSchema<T>,
  request: RestaurantRequest,
  enabled: boolean,
) {
  const [read, setRead] = useState<Read<T>>();
  const [generation, setGeneration] = useState(0);
  const refresh = useCallback(() => setGeneration((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || path === null) return;
    const controller = new AbortController();
    let pending = false;
    async function update(currentPath: string) {
      if (pending) return;
      pending = true;
      try {
        const data = await request(
          currentPath,
          { signal: controller.signal },
          schema,
        );
        if (!controller.signal.aborted)
          setRead({
            path: currentPath,
            data,
            receivedAt: Date.now(),
            failed: false,
          });
      } catch {
        if (!controller.signal.aborted) {
          setRead((previous) =>
            previous?.path === currentPath
              ? { ...previous, failed: true }
              : { path: currentPath, failed: true },
          );
        }
      } finally {
        pending = false;
      }
    }
    const poll = () => {
      void update(path);
    };
    const timer = setInterval(poll, pollIntervalMs);
    poll();
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [enabled, generation, path, request, schema]);

  const current = read?.path === path ? read : undefined;
  return {
    data: current?.data,
    receivedAt: current?.receivedAt,
    failed: current?.failed ?? false,
    loading: enabled && current === undefined,
    refresh,
  };
}
