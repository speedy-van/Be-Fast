import { adminSessionSchema, type AuthTokens } from "@be-fast/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";
import { backendFetch } from "./backend";

export const accessCookie = "befast_admin_access";
export const refreshCookie = "befast_admin_refresh";
const accessSeconds = 15 * 60;
const refreshSeconds = 60 * 24 * 60 * 60;

export function bearer(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}

export function authJson(body: unknown): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  };
}

export function sessionCookies(request: NextRequest, tokens?: AuthTokens) {
  const response = new NextResponse(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
  const cookieOptions = {
    httpOnly: true,
    secure:
      request.nextUrl.protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https",
    sameSite: "strict" as const,
    path: "/",
  };
  response.cookies.set(accessCookie, tokens?.accessToken ?? "", {
    ...cookieOptions,
    maxAge: tokens ? accessSeconds : 0,
  });
  response.cookies.set(refreshCookie, tokens?.refreshToken ?? "", {
    ...cookieOptions,
    maxAge: tokens ? refreshSeconds : 0,
  });
  return response;
}

export async function requireAdminSession(path: string) {
  const jar = await cookies();
  const accessToken = jar.get(accessCookie)?.value;
  if (accessToken) {
    const response = await backendFetch("/admin/session", {
      headers: bearer(accessToken),
    });
    if (response.ok) return adminSessionSchema.parse(await response.json());
    if (response.status !== 401 && response.status !== 403)
      throw new Error("Could not verify the admin session.");
  }
  if (jar.get(refreshCookie)?.value)
    redirect(`/session?next=${encodeURIComponent(path)}`);
  redirect("/login");
}
