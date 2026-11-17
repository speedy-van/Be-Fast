import { isIP } from "node:net";
import { messages } from "@be-fast/i18n";

const localApiOrigin = "http://127.0.0.1:3001";
const timeoutMs = 20_000;

export function responseError(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message, details: {} } },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
}

export const forbiddenResponse = () =>
  responseError(403, "FORBIDDEN", messages.errors.forbidden);
export const unauthenticatedResponse = () =>
  responseError(401, "UNAUTHENTICATED", messages.errors.unauthenticated);
export const validationResponse = () =>
  responseError(400, "VALIDATION_ERROR", messages.errors.validationError);

export function isSameOrigin(request: Request) {
  const origin = URL.parse(request.headers.get("origin") ?? "");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (
    origin !== null &&
    origin.host === request.headers.get("host") &&
    (fetchSite === null || fetchSite === "same-origin")
  );
}

export function proxyClientHeaders(request: Request): Record<string, string> {
  const address = request.headers.get("x-forwarded-for")?.trim();
  if (process.env.ADMIN_TRUST_LOCAL_PROXY === "1" && address && isIP(address))
    return { "x-forwarded-for": address };
  return {};
}

export async function backendFetch(path: string, init: RequestInit = {}) {
  try {
    const origin = new URL(process.env.ADMIN_API_ORIGIN ?? localApiOrigin);
    const url = new URL(path, origin);
    if (url.origin !== origin.origin) return forbiddenResponse();
    return await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return responseError(
      503,
      "DATABASE_UNAVAILABLE",
      messages.errors.databaseUnavailable,
    );
  }
}

export function forwardResponse(response: Response) {
  const headers = new Headers({
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  const contentType = response.headers.get("content-type");
  if (contentType !== null) headers.set("content-type", contentType);
  return new Response(response.body, { status: response.status, headers });
}
