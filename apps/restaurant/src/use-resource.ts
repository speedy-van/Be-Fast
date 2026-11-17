import type { ResponseSchema } from "@be-fast/api-client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { serviceError } from "./api";
import { useRestaurantSession } from "./session";

export function useRestaurantResource<T>(
  path: string,
  schema: ResponseSchema<T>,
) {
  const { request, restaurantId, role } = useRestaurantSession();
  const key = `${restaurantId}\0${role}\0${path}`;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    revision: number;
    data?: T;
    error?: string;
  }>();
  const [revision, setRevision] = useState(0);
  const read = useRef<{
    key: string;
    revision: number;
    controller: AbortController;
  } | null>(null);
  const reload = useCallback(() => setRevision((current) => current + 1), []);
  const setData = useCallback(
    (update: SetStateAction<T | undefined>) => {
      const active = read.current;
      if (active?.key !== key) return;
      active.controller.abort();
      setSnapshot((previous) => ({
        key,
        revision: active.revision,
        data:
          typeof update === "function"
            ? (update as (data: T | undefined) => T | undefined)(
                previous?.key === key ? previous.data : undefined,
              )
            : update,
      }));
    },
    [key],
  );
  useEffect(() => {
    const controller = new AbortController();
    read.current = { key, revision, controller };
    void request(path, { signal: controller.signal }, schema).then(
      (value) => {
        if (!controller.signal.aborted)
          setSnapshot({ key, revision, data: value });
      },
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setSnapshot((previous) => ({
            key,
            revision,
            data: previous?.key === key ? previous.data : undefined,
            error: serviceError(cause),
          }));
      },
    );
    return () => {
      controller.abort();
      if (read.current?.controller === controller) read.current = null;
    };
  }, [key, path, request, revision, schema]);
  const current = snapshot?.key === key ? snapshot : undefined;
  return {
    data: current?.data,
    setData,
    error: current?.error,
    reload,
    loading: current?.revision !== revision,
  };
}
