import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createImageVariants,
  MAX_IMAGE_BYTES,
  reencodeDocumentImage,
} from "../src/storage/images.js";
import { LocalDiskStorageProvider } from "../src/storage/local.js";
import type { StorageProvider } from "../src/storage/provider.js";
import { S3StorageProvider } from "../src/storage/s3.js";

const localEnvironment = existsSync(".env")
  ? parseEnv(readFileSync(".env", "utf8"))
  : {};
const environment = { ...localEnvironment, ...process.env };
const s3Endpoint = environment.S3_ENDPOINT;

async function withTemporaryDirectory(
  run: (directory: string) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "be-fast-storage-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function assertStorageContract(provider: StorageProvider) {
  const key = `contract/${randomUUID()}/object.webp`;
  try {
    expect(await provider.get(key)).toBeNull();

    const original = {
      bytes: Buffer.from([0, 10, 255]),
      contentType: "image/webp",
    };
    await provider.put(key, original.bytes, original.contentType);
    expect(await provider.get(key)).toEqual(original);

    const replacement = {
      bytes: Buffer.from([9, 8, 7]),
      contentType: "image/png",
    };
    await provider.put(key, replacement.bytes, replacement.contentType);
    expect(await provider.get(key)).toEqual(replacement);

    await provider.delete(key);
    await provider.delete(key);
    expect(await provider.get(key)).toBeNull();
  } finally {
    await provider.delete(key);
  }
}

describe("object storage", () => {
  it("satisfies the storage contract on the local filesystem", () =>
    withTemporaryDirectory(async (directory) => {
      await assertStorageContract(
        new LocalDiskStorageProvider(join(directory, ".storage")),
      );
    }));

  it.skipIf(!s3Endpoint)(
    "satisfies the storage contract on the configured S3 endpoint",
    async () => {
      const { S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } =
        environment;
      if (!S3_BUCKET)
        throw new Error("S3_BUCKET is required for the S3 storage contract.");
      if (Boolean(S3_ACCESS_KEY_ID) !== Boolean(S3_SECRET_ACCESS_KEY)) {
        throw new Error(
          "Configure both S3 access-key fields for the S3 storage contract.",
        );
      }

      const client = new S3Client({
        endpoint: s3Endpoint,
        region: S3_REGION ?? "us-east-1",
        forcePathStyle: true,
        credentials:
          S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY
            ? {
                accessKeyId: S3_ACCESS_KEY_ID,
                secretAccessKey: S3_SECRET_ACCESS_KEY,
              }
            : undefined,
      });
      try {
        await assertStorageContract(new S3StorageProvider(client, S3_BUCKET));
      } finally {
        client.destroy();
      }
    },
    30_000,
  );

  it("rejects unsafe path components and Windows device names", () =>
    withTemporaryDirectory(async (directory) => {
      const provider = new LocalDiskStorageProvider(
        join(directory, ".storage"),
      );
      const invalidKeys = [
        "../outside.webp",
        "folder/../outside.webp",
        "folder\\object.webp",
        "c:/object.webp",
        "/object.webp",
        "folder//object.webp",
        "folder/aux.webp",
        "folder/prn",
        "folder/object.",
        "folder/object.webp\n",
      ];
      for (const key of invalidKeys) {
        await expect(provider.get(key)).rejects.toThrow("Invalid storage key.");
        await expect(
          provider.put(key, Buffer.from("input"), "image/webp"),
        ).rejects.toThrow("Invalid storage key.");
        await expect(provider.delete(key)).rejects.toThrow(
          "Invalid storage key.",
        );
      }
      expect(await readdir(directory)).toEqual([]);
    }));

  it("rejects a linked parent directory before creating any child", () =>
    withTemporaryDirectory(async (directory) => {
      const storageRoot = join(directory, ".storage");
      const outside = join(directory, "outside");
      await Promise.all([mkdir(storageRoot), mkdir(outside)]);
      await symlink(outside, join(storageRoot, "linked"), "junction");

      const provider = new LocalDiskStorageProvider(storageRoot);
      const key = "linked/folder/object.webp";
      await expect(
        provider.put(key, Buffer.from("input"), "image/webp"),
      ).rejects.toThrow("Invalid storage directory.");
      expect(await readdir(outside)).toEqual([]);
    }));
});

function sampleImage(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 100, g: 30, b: 20 },
    },
  });
}

describe("image uploads", () => {
  it.each(["jpeg", "png", "webp"] as const)(
    "re-encodes %s into 320px and 640px WebP",
    async (format) => {
      const input = await sampleImage(120, 60).toFormat(format).toBuffer();
      const variants = await createImageVariants(input);
      expect(variants.map(({ width }) => width)).toEqual([320, 640]);
      for (const { width, bytes, contentType } of variants) {
        expect(contentType).toBe("image/webp");
        expect(await sharp(bytes).metadata()).toMatchObject({
          format: "webp",
          width,
          height: width / 2,
        });
      }
    },
  );

  it("orients the output and removes EXIF metadata", async () => {
    const input = await sampleImage(120, 60)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const variants = await createImageVariants(input);
    for (const { width, bytes } of variants) {
      const info = await sharp(bytes).metadata();
      expect(info).toMatchObject({ width, height: width * 2 });
      expect(info.exif).toBeUndefined();
    }
  });

  it("rejects unsupported and corrupt images", async () => {
    const gif = await sampleImage(8, 8).gif().toBuffer();
    const brokenPng = Buffer.from("89504e470d0a1a0a", "hex");
    for (const payload of [Buffer.from("not an image"), gif, brokenPng]) {
      await expect(createImageVariants(payload)).rejects.toMatchObject({
        code: "INVALID_IMAGE",
      });
      await expect(reencodeDocumentImage(payload)).rejects.toMatchObject({
        code: "INVALID_IMAGE",
      });
    }
  });

  it("rejects uploads over 5 MiB before decoding", async () => {
    const oversized = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    await expect(createImageVariants(oversized)).rejects.toMatchObject({
      code: "IMAGE_TOO_LARGE",
    });
    await expect(reencodeDocumentImage(oversized)).rejects.toMatchObject({
      code: "IMAGE_TOO_LARGE",
    });
  });

  it.each([
    [480, 480],
    [2000, 1800],
  ])(
    "re-encodes a private document of width %i to width %i",
    async (width, outputWidth) => {
      const input = await sampleImage(width, width / 2)
        .png()
        .toBuffer();
      const document = await reencodeDocumentImage(input);
      expect(document.contentType).toBe("image/webp");
      expect(await sharp(document.bytes).metadata()).toMatchObject({
        format: "webp",
        width: outputWidth,
        height: outputWidth / 2,
      });
    },
  );
});
