import { ApiClientError } from "@be-fast/api-client";
import type { OrderCreate } from "@be-fast/contracts";
import { describe, expect, test, vi } from "vitest";
import { submitOrderWithRetries } from "./submit.js";

const branchId = "00000000-0000-4000-8000-000000000001";
const menuItemId = "00000000-0000-4000-8000-000000000002";
const sizeId = "00000000-0000-4000-8000-000000000003";
const orderId = "00000000-0000-4000-8000-000000000004";
const key = "00000000-0000-4000-8000-000000000005";
const body: OrderCreate = {
  type: "PICKUP",
  branchId,
  expectedTotalMinor: 8_000,
  items: [{ menuItemId, sizeId, optionIds: [], quantity: 1 }],
};

const updatedQuote = {
  foodSubtotalMinor: 9_000,
  discountMinor: 0,
  deliveryFeeMinor: 0,
  totalMinor: 9_000,
  items: [{ ...body.items[0], unitPriceMinor: 9_000, totalMinor: 9_000 }],
};

type Request = Parameters<typeof submitOrderWithRetries>[0]["request"];

describe("submitOrderWithRetries", () => {
  test("retries three times with the same key and body after connection loss", async () => {
    const onUncertain = vi.fn();
    const request = vi.fn<Request>().mockImplementation(async () => {
      if (request.mock.calls.length > 1)
        expect(onUncertain).toHaveBeenCalledOnce();
      throw new TypeError("Network request failed");
    });

    await expect(
      submitOrderWithRetries({ body, key, request, onUncertain }),
    ).resolves.toEqual({ kind: "uncertain" });
    expect(request.mock.calls).toEqual(
      Array.from({ length: 4 }, () => [
        "/customer/orders",
        {
          method: "POST",
          body,
          headers: { "Idempotency-Key": key },
          signal: undefined,
        },
      ]),
    );
    expect(onUncertain).toHaveBeenCalledOnce();
  });

  test("reports creation only with a validated ID after a malformed success or timeout", async () => {
    const request = vi
      .fn<Request>()
      .mockResolvedValueOnce({ id: "invalid" })
      .mockRejectedValueOnce(
        new DOMException("Request timed out", "AbortError"),
      )
      .mockResolvedValueOnce({ id: orderId, status: "PENDING" });
    const onUncertain = vi.fn();

    await expect(
      submitOrderWithRetries({ body, key, request, onUncertain }),
    ).resolves.toEqual({ kind: "created", orderId });
    expect(request).toHaveBeenCalledTimes(3);
    expect(onUncertain).toHaveBeenCalledOnce();
  });

  test.each([408, 500, 503])("retries ambiguous HTTP %i", async (status) => {
    const request = vi
      .fn<Request>()
      .mockRejectedValueOnce(new ApiClientError(status))
      .mockResolvedValueOnce({ id: orderId });
    const onUncertain = vi.fn();

    await expect(
      submitOrderWithRetries({ body, key, request, onUncertain }),
    ).resolves.toEqual({ kind: "created", orderId });
    expect(request).toHaveBeenCalledTimes(2);
    expect(onUncertain).toHaveBeenCalledOnce();
  });

  test("returns the updated server quote to request another confirmation", async () => {
    const request = vi
      .fn<Request>()
      .mockRejectedValueOnce(
        new ApiClientError(409, undefined, "PRICE_CHANGED", updatedQuote),
      );
    const onUncertain = vi.fn();

    await expect(
      submitOrderWithRetries({ body, key, request, onUncertain }),
    ).resolves.toEqual({ kind: "priceChanged", details: updatedQuote });
    expect(request).toHaveBeenCalledOnce();
    expect(onUncertain).not.toHaveBeenCalled();
  });

  test.each([
    new ApiClientError(409, undefined, "RESTAURANT_CLOSED"),
    new ApiClientError(429, undefined, "RATE_LIMITED"),
    new ApiClientError(409, undefined, "PRICE_CHANGED", {
      ...updatedQuote,
      totalMinor: -9_000,
    }),
  ])("does not retry a definitive rejection", async (error) => {
    const request = vi.fn<Request>().mockRejectedValueOnce(error);
    const onUncertain = vi.fn();

    await expect(
      submitOrderWithRetries({ body, key, request, onUncertain }),
    ).resolves.toEqual({ kind: "failed", error });
    expect(request).toHaveBeenCalledOnce();
    expect(onUncertain).not.toHaveBeenCalled();
  });

  test.each([
    {
      first: () => Promise.reject(new TypeError("Network request failed")),
      status: 401,
    },
    { first: () => Promise.resolve({ id: "invalid" }), status: 429 },
  ])(
    "preserves uncertainty about the original request if retry returns HTTP $status",
    async ({ first, status }) => {
      const request = vi
        .fn<Request>()
        .mockImplementationOnce(first)
        .mockRejectedValueOnce(new ApiClientError(status));
      const onUncertain = vi.fn();

      await expect(
        submitOrderWithRetries({ body, key, request, onUncertain }),
      ).resolves.toEqual({ kind: "uncertain" });
      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.calls[0]).toEqual(request.mock.calls[1]);
      expect(onUncertain).toHaveBeenCalledOnce();
    },
  );

  test("does not retry or announce success if the caller cancels mid-request", async () => {
    const controller = new AbortController();
    const request = vi.fn<Request>().mockImplementation(async () => {
      controller.abort();
      return { id: orderId };
    });
    const onUncertain = vi.fn();

    await expect(
      submitOrderWithRetries({
        body,
        key,
        request,
        onUncertain,
        signal: controller.signal,
      }),
    ).resolves.toEqual({ kind: "aborted" });
    expect(request).toHaveBeenCalledOnce();
    expect(onUncertain).not.toHaveBeenCalled();
  });
});
