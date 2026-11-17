import { ApiClientError } from "@be-fast/api-client";
import type { OrderCreate } from "@be-fast/contracts";
import { z } from "zod";
import type { CustomerRequestOptions } from "../api.js";

const amountMinor = z.int().nonnegative();
const createdOrder = z.object({ id: z.uuid() });
const priceChangeDetails = z.object({
  foodSubtotalMinor: amountMinor,
  discountMinor: amountMinor,
  deliveryFeeMinor: amountMinor,
  totalMinor: amountMinor,
  items: z
    .array(
      z.object({
        menuItemId: z.uuid(),
        sizeId: z.uuid(),
        optionIds: z.array(z.uuid()),
        quantity: z.int().min(1).max(50),
        unitPriceMinor: amountMinor,
        totalMinor: amountMinor,
      }),
    )
    .min(1),
});

export type PriceChangeDetails = z.infer<typeof priceChangeDetails>;

export type OrderSubmission =
  | { kind: "created"; orderId: string }
  | { kind: "priceChanged"; details: PriceChangeDetails }
  | { kind: "uncertain" }
  | { kind: "failed"; error: unknown }
  | { kind: "aborted" };

type SubmissionOptions = {
  body: OrderCreate;
  key: string;
  request: (path: string, options: CustomerRequestOptions) => Promise<unknown>;
  onUncertain: () => void;
  signal?: AbortSignal;
};

const maxAttempts = 4;

function retryable(error: unknown) {
  if (error instanceof ApiClientError)
    return error.status === 408 || error.status >= 500;
  if (error instanceof TypeError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

export async function submitOrderWithRetries({
  body,
  key,
  request,
  onUncertain,
  signal,
}: SubmissionOptions): Promise<OrderSubmission> {
  let uncertain = false;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) return { kind: "aborted" };
    try {
      const response = await request("/customer/orders", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": key },
        signal,
      });
      if (signal?.aborted) return { kind: "aborted" };
      const parsed = createdOrder.safeParse(response);
      if (parsed.success) return { kind: "created", orderId: parsed.data.id };
    } catch (error) {
      if (signal?.aborted) return { kind: "aborted" };
      if (
        error instanceof ApiClientError &&
        error.status === 409 &&
        error.code === "PRICE_CHANGED"
      ) {
        const parsed = priceChangeDetails.safeParse(error.details);
        if (parsed.success)
          return { kind: "priceChanged", details: parsed.data };
      }
      if (!retryable(error)) {
        return uncertain ? { kind: "uncertain" } : { kind: "failed", error };
      }
    }
    if (!uncertain) {
      uncertain = true;
      onUncertain();
    }
  }
  return { kind: "uncertain" };
}
