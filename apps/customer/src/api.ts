import {
  ApiClientError,
  requestJson,
  type ResponseSchema,
} from "@be-fast/api-client";
import { messages } from "@be-fast/i18n";

const origin = (
  process.env.EXPO_PUBLIC_API_ORIGIN ?? "http://10.0.2.2:3001"
).replace(/\/$/u, "");

export interface CustomerRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface CustomerRequest {
  <T>(
    path: string,
    options: CustomerRequestOptions | undefined,
    schema: ResponseSchema<T>,
  ): Promise<T>;
  (path: string, options?: CustomerRequestOptions): Promise<unknown>;
}

export function publicRequest<T>(
  path: string,
  options: CustomerRequestOptions | undefined,
  schema: ResponseSchema<T>,
): Promise<T>;
export function publicRequest(
  path: string,
  options?: CustomerRequestOptions,
): Promise<unknown>;
export function publicRequest<T>(
  path: string,
  options?: CustomerRequestOptions,
  schema?: ResponseSchema<T>,
) {
  return sendCustomerRequest(path, options, undefined, schema);
}

export function customerAssetUrl(path: string) {
  return `${origin}${path}`;
}

export function sendCustomerRequest<T>(
  path: string,
  options: CustomerRequestOptions | undefined,
  token: string | undefined,
  schema: ResponseSchema<T>,
): Promise<T>;
export function sendCustomerRequest(
  path: string,
  options?: CustomerRequestOptions,
  token?: string,
): Promise<unknown>;
export function sendCustomerRequest<T>(
  path: string,
  options: CustomerRequestOptions | undefined,
  token: string | undefined,
  schema: ResponseSchema<T> | undefined,
): Promise<unknown>;
export async function sendCustomerRequest<T>(
  path: string,
  options: CustomerRequestOptions = {},
  token?: string,
  schema?: ResponseSchema<T>,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 20_000);
  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.body !== undefined
      ? { "Content-Type": "application/json" }
      : {}),
  };
  try {
    const init = {
      method: options.method ?? "GET",
      headers,
      signal: controller.signal,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    };
    const url = customerAssetUrl(path);
    return await (schema
      ? requestJson(url, init, schema)
      : requestJson(url, init));
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export function serviceError(cause: unknown) {
  return cause instanceof ApiClientError
    ? (cause.publicMessage ?? messages.errors.internalError)
    : messages.errors.internalError;
}

export function shouldRetryRead(failures: number, error: unknown) {
  return (
    failures < 3 &&
    (!(error instanceof ApiClientError) ||
      error.status === 408 ||
      error.status >= 500)
  );
}
