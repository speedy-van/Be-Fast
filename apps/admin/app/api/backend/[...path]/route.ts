import type { NextRequest } from "next/server";
import {
  backendFetch,
  forbiddenResponse,
  forwardResponse,
  isSameOrigin,
  proxyClientHeaders,
  unauthenticatedResponse,
  validationResponse,
} from "../../../../lib/backend";
import { accessCookie, bearer } from "../../../../lib/session";

interface Context {
  params: Promise<{ path: string[] }>;
}

async function proxy(request: NextRequest, { params }: Context) {
  const { path } = await params;
  if (path[0] !== "admin" || path.some((part) => !/^[a-z0-9_-]+$/iu.test(part)))
    return forbiddenResponse();
  const writing = request.method !== "GET";
  if (writing && !isSameOrigin(request)) return forbiddenResponse();
  const access = request.cookies.get(accessCookie)?.value;
  if (!access) return unauthenticatedResponse();

  const contentType = request.headers.get("content-type")?.split(";")[0];
  const body = writing && request.body ? await request.text() : undefined;
  if (body && contentType !== "application/json") return validationResponse();
  return forwardResponse(
    await backendFetch(`/${path.join("/")}${request.nextUrl.search}`, {
      method: request.method,
      body,
      headers: {
        ...bearer(access),
        ...proxyClientHeaders(request),
        ...(body ? { "content-type": "application/json" } : {}),
      },
    }),
  );
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as PUT,
  proxy as DELETE,
};
