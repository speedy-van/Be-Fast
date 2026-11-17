import { errorEnvelopeSchema, type ErrorCode } from "@be-fast/contracts";

export interface ResponseSchema<Output> {
  parse(value: unknown): Output;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage?: string,
    readonly code?: ErrorCode,
  ) {
    super(`API request failed (${status}).`);
  }
}

export async function requestJson<Output>(
  url: string,
  init: RequestInit,
  schema: ResponseSchema<Output>,
): Promise<Output>;
export async function requestJson(
  url: string,
  init?: RequestInit,
): Promise<unknown>;
export async function requestJson<Output>(
  url: string,
  init: RequestInit = {},
  schema?: ResponseSchema<Output>,
): Promise<unknown> {
  const response = await fetch(url, init);
  const value: unknown =
    response.status === 204
      ? undefined
      : await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = errorEnvelopeSchema.safeParse(value);
    throw new ApiClientError(
      response.status,
      error.success ? error.data.error.message : undefined,
      error.success ? error.data.error.code : undefined,
    );
  }
  return schema ? schema.parse(value) : value;
}
