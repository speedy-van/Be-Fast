import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createGuardrails, generateSync, verify } from "otplib";

const deriveKey = promisify(argon2);
const memory = 65_536;
const passes = 3;
const parallelism = 1;
const tagLength = 32;
const saltLength = 16;
const phcPrefix = `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}`;
const encodedHashParts = /^([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/u;
const fallbackNonce = Buffer.alloc(saltLength);
const fallbackDigest = Buffer.alloc(tagLength);
const totpPeriodSeconds = 30;
// M2 accepted provisioned Base32 secrets of at least 16 characters.
const compatibleTotpGuardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });

function argon2id(password: string | Uint8Array, nonce: Uint8Array) {
  return deriveKey("argon2id", {
    message: password,
    nonce,
    memory,
    passes,
    parallelism,
    tagLength,
  });
}

function encodeBase64(bytes: Buffer) {
  return bytes.toString("base64").replace(/=+$/u, "");
}

export async function hashPassword(
  password: string | Uint8Array,
): Promise<string> {
  const nonce = randomBytes(saltLength);
  const digest = await argon2id(password, nonce);
  return `${phcPrefix}$${encodeBase64(nonce)}$${encodeBase64(digest)}`;
}

export async function verifyPassword(
  password: string,
  hash: string | undefined,
): Promise<boolean> {
  const prefix = `${phcPrefix}$`;
  const encoded = hash?.startsWith(prefix)
    ? encodedHashParts.exec(hash.slice(prefix.length))
    : null;
  const [, salt, digest] = encoded ?? [];
  const storedDigest =
    digest === undefined ? fallbackDigest : Buffer.from(digest, "base64");
  const nonce =
    salt === undefined ? fallbackNonce : Buffer.from(salt, "base64");
  // A missing account takes the same KDF work as a known account.
  const matches = timingSafeEqual(
    await argon2id(password, nonce),
    storedDigest,
  );
  return encoded !== null && matches;
}

export function isProvisioningTotpSecret(secret: string): boolean {
  if (!/^[A-Z2-7]{26,102}$/u.test(secret)) return false;
  try {
    generateSync({ secret, epoch: 0, strategy: "totp" });
    return true;
  } catch {
    return false;
  }
}

export async function findTotpTimeStep(
  secret: string,
  token: string,
  instant: Date,
): Promise<bigint | null> {
  try {
    const result = await verify({
      secret,
      token,
      strategy: "totp",
      period: totpPeriodSeconds,
      epoch: Math.floor(instant.getTime() / 1_000),
      epochTolerance: totpPeriodSeconds,
      guardrails: compatibleTotpGuardrails,
    });
    return result.valid && "timeStep" in result
      ? BigInt(result.timeStep)
      : null;
  } catch {
    return null;
  }
}
