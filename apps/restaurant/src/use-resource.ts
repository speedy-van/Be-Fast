import type { ResponseSchema } from "@be-fast/api-client";
import { useCallback, useEffect, useState } from "react";
import { serviceError } from "./api";
import { useRestaurantSession } from "./session";

export function useRestaurantResource<T>(path: string, schema: ResponseSchema<T>) {
  const { request } = useRestaurantSession();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((current) => current + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    void request(path, { signal: controller.signal }, schema).then((value) => {
      if (!controller.signal.aborted) { setData(value); setError(undefined); }
    }, (cause: unknown) => {
      if (!controller.signal.aborted) setError(serviceError(cause));
    });
    return () => controller.abort();
  }, [path, request, revision, schema]);
  return { data, setData, error, reload, loading: data === undefined && error === undefined };
}
