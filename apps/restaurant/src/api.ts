import { ApiClientError, requestJson, type ResponseSchema } from "@be-fast/api-client";
import { messages } from "@be-fast/i18n";

const baseUrl = (process.env.EXPO_PUBLIC_API_ORIGIN ?? "http://10.0.2.2:3001").replace(/\/$/u, "");

export type RequestOptions = { method?: string; body?: unknown; signal?: AbortSignal };
export interface RestaurantRequest {
  <T>(path: string, options: RequestOptions | undefined, schema: ResponseSchema<T>): Promise<T>;
  (path: string, options?: RequestOptions): Promise<unknown>;
}

export function sendRestaurantRequest<T>(path: string, options: RequestOptions | undefined, access: string | undefined, schema: ResponseSchema<T>): Promise<T>;
export function sendRestaurantRequest(path: string, options?: RequestOptions, access?: string): Promise<unknown>;
export async function sendRestaurantRequest<T>(path: string, { method = "GET", body, signal }: RequestOptions = {}, access?: string, schema?: ResponseSchema<T>): Promise<unknown> {
  const controller = new AbortController();
  signal?.throwIfAborted?.();
  if (signal?.aborted) controller.abort();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 20_000);
  const headers: Record<string, string> = {};
  if (access) headers.Authorization = `Bearer ${access}`;
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const init: RequestInit = {
    method,
    headers,
    signal: controller.signal,
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
  };
  try {
    const url = `${baseUrl}${path}`;
    return await (schema ? requestJson(url, init, schema) : requestJson(url, init));
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

export function serviceError(error: unknown) {
  return error instanceof ApiClientError && error.publicMessage ? error.publicMessage : messages.errors.internalError;
}
