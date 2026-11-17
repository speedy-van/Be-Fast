"use client";

import type { ResponseSchema } from "@be-fast/api-client";
import { useCallback, useEffect, useState } from "react";
import { adminError, adminRequest } from "./client";

interface Resource<T> {
  path: string;
  data?: T;
  error: string | null;
}

export function useAdminResource<T>(
  path: string | null,
  schema: ResponseSchema<T>,
  pollMs?: number,
) {
  const [resource, setResource] = useState<Resource<T>>();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(
    () => setRevision((previous) => previous + 1),
    [],
  );

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function read(currentPath: string) {
      try {
        const data = await adminRequest(
          currentPath,
          { signal: controller.signal },
          schema,
        );
        if (!controller.signal.aborted)
          setResource({ path: currentPath, data, error: null });
      } catch (error) {
        if (!controller.signal.aborted) {
          setResource((previous) => ({
            path: currentPath,
            data: previous?.path === currentPath ? previous.data : undefined,
            error: adminError(error),
          }));
        }
      } finally {
        if (pollMs !== undefined && !controller.signal.aborted)
          timer = setTimeout(() => void read(currentPath), pollMs);
      }
    }
    void read(path);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, schema, revision, pollMs]);

  const current = path === resource?.path ? resource : undefined;
  return {
    data: current?.data,
    error: current?.error ?? null,
    loading: path !== null && current === undefined,
    stale: current?.error != null && current.data !== undefined,
    refresh,
  };
}
