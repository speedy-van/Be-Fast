import {
  ApiClientError,
  requestJson,
  type ResponseSchema,
} from "@be-fast/api-client";
import { messages } from "@be-fast/i18n";

export interface AdminRequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

let restoringSession = false;

export async function adminRequest<T>(
  path: string,
  options: AdminRequestOptions | undefined,
  schema: ResponseSchema<T>,
): Promise<T>;
export async function adminRequest(
  path: string,
  options?: AdminRequestOptions,
): Promise<unknown>;
export async function adminRequest<T>(
  path: string,
  { method = "GET", body, signal }: AdminRequestOptions = {},
  schema?: ResponseSchema<T>,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(20_000);
  const init: RequestInit = {
    method,
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
  };
  const url = `/api/backend${path}`;
  try {
    return await (schema
      ? requestJson(url, init, schema)
      : requestJson(url, init));
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      error.status === 401 &&
      !restoringSession
    ) {
      restoringSession = true;
      window.location.assign(
        `/session?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
    }
    throw error;
  }
}

export function browserSessionRequest(
  action: "login" | "refresh" | "logout",
  body?: unknown,
) {
  const send = () =>
    requestJson(`/api/session/${action}`, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          }),
    });
  return navigator.locks
    ? navigator.locks.request("befast-admin-session", send)
    : send();
}

export function adminError(error: unknown) {
  return error instanceof ApiClientError && error.publicMessage
    ? error.publicMessage
    : messages.errors.internalError;
}
