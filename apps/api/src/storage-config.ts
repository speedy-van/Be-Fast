import { fileURLToPath } from "node:url";
import { S3Client } from "@aws-sdk/client-s3";
import { LocalDiskStorageProvider } from "./storage/local.js";
import type { StorageProvider } from "./storage/provider.js";
import { S3StorageProvider } from "./storage/s3.js";

export function createLocalStorage(): StorageProvider {
  const rootDirectory = fileURLToPath(
    new URL("../../../.storage/", import.meta.url),
  );
  return new LocalDiskStorageProvider(rootDirectory);
}

export function createConfiguredStorage(
  env: Readonly<Record<string, string | undefined>>,
): StorageProvider {
  const driver = env.STORAGE_DRIVER ?? "local";
  if (driver === "local") return createLocalStorage();
  if (driver !== "s3") throw new Error("STORAGE_DRIVER must be local or s3.");

  const bucket = env.S3_BUCKET;
  const endpoint = env.S3_ENDPOINT || undefined;
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (!bucket) throw new Error("S3_BUCKET is required for S3 storage.");
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error(
      "Configure both S3 credential variables or use the SDK credential chain.",
    );
  }

  return new S3StorageProvider(
    new S3Client({
      region: env.S3_REGION || "us-east-1",
      endpoint,
      forcePathStyle: Boolean(endpoint),
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    }),
    bucket,
  );
}
