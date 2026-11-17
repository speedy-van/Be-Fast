export function readDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return databaseUrl;
}

export function readAuthSecret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || !/^[A-Za-z0-9_-]{43,}$/u.test(value)) {
    throw new Error(
      "AUTH_SECRET must be a base64url key with at least 32 random bytes.",
    );
  }
  const secret = Buffer.from(value, "base64url");
  if (secret.length < 32 || secret.toString("base64url") !== value) {
    throw new Error(
      "AUTH_SECRET must be a base64url key with at least 32 random bytes.",
    );
  }
  return secret;
}
