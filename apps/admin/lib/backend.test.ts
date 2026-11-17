import { expect, it, vi } from "vitest";
import { proxyClientHeaders } from "./backend";

it("forwards one validated client address only in local proxy mode", () => {
  const request = (address?: string) =>
    new Request("https://admin.example.test", {
      headers: address ? { "x-forwarded-for": address } : undefined,
    });
  try {
    vi.stubEnv("ADMIN_TRUST_LOCAL_PROXY", "0");
    expect(proxyClientHeaders(request("192.0.2.31"))).toEqual({});
    vi.stubEnv("ADMIN_TRUST_LOCAL_PROXY", "1");
    expect(proxyClientHeaders(request("192.0.2.31"))).toEqual({
      "x-forwarded-for": "192.0.2.31",
    });
    expect(proxyClientHeaders(request("2001:db8::31"))).toEqual({
      "x-forwarded-for": "2001:db8::31",
    });
    expect(proxyClientHeaders(request("192.0.2.31, 192.0.2.32"))).toEqual({});
    expect(proxyClientHeaders(request())).toEqual({});
  } finally {
    vi.unstubAllEnvs();
  }
});
