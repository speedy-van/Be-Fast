import type { ResponseSchema } from "@be-fast/api-client";
import { useQuery } from "@tanstack/react-query";
import type { CustomerRequest } from "../api";

export function publicQueryOptions<T>(
  path: string,
  schema: ResponseSchema<T>,
  request: CustomerRequest,
) {
  return {
    queryKey: ["public", path] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      request(path, { signal }, schema),
    networkMode: "always" as const,
  };
}

export function usePublicQuery<T>(
  path: string,
  schema: ResponseSchema<T>,
  request: CustomerRequest,
) {
  return useQuery(publicQueryOptions(path, schema, request));
}
