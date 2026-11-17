import { adminLoginSchema, authTokensSchema } from "@be-fast/contracts";
import { messages } from "@be-fast/i18n";
import type { NextRequest } from "next/server";
import {
  backendFetch,
  forbiddenResponse,
  forwardResponse,
  isSameOrigin,
  responseError,
  validationResponse,
} from "../../../../lib/backend";
import {
  accessCookie,
  authJson,
  bearer,
  refreshCookie,
  sessionCookies,
} from "../../../../lib/session";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ action: string }> },
) {
  if (!isSameOrigin(request)) return forbiddenResponse();
  const { action } = await context.params;

  if (action === "login") {
    const input = adminLoginSchema.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!input.success) return validationResponse();
    const response = await backendFetch(
      "/auth/admin/login",
      authJson(input.data),
    );
    if (!response.ok) return forwardResponse(response);
    return sessionCookies(
      request,
      authTokensSchema.parse(await response.json()),
    );
  }

  const refreshToken = request.cookies.get(refreshCookie)?.value;
  if (action === "logout") {
    if (refreshToken) {
      const response = await backendFetch(
        "/auth/logout",
        authJson({ refreshToken }),
      );
      if (!response.ok) return forwardResponse(response);
    }
    return sessionCookies(request);
  }

  if (action === "refresh") {
    const access = request.cookies.get(accessCookie)?.value;
    if (access) {
      const session = await backendFetch("/admin/session", {
        headers: bearer(access),
      });
      if (session.ok) return new Response(null, { status: 204 });
      if (session.status !== 401 && session.status !== 403)
        return forwardResponse(session);
    }
    if (refreshToken) {
      const response = await backendFetch(
        "/auth/refresh",
        authJson({ refreshToken }),
      );
      if (response.ok)
        return sessionCookies(
          request,
          authTokensSchema.parse(await response.json()),
        );
      if (response.status !== 401) return forwardResponse(response);
    }
    const response = sessionCookies(request);
    return new Response(null, { status: 401, headers: response.headers });
  }

  return responseError(404, "NOT_FOUND", messages.errors.pageNotFound);
}
