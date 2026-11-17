import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3ServiceException,
  type S3Client,
} from "@aws-sdk/client-s3";
import {
  storageKeySegments,
  type StorageProvider,
  type StoredObject,
} from "./provider.js";

function storageError(
  operation: "write" | "read" | "delete",
  error: unknown,
): Error {
  const statusCode =
    error instanceof S3ServiceException
      ? error.$metadata.httpStatusCode
      : undefined;
  return new Error(
    `S3 object ${operation} failed${statusCode ? ` (HTTP ${statusCode})` : ""}.`,
  );
}

export class S3StorageProvider implements StorageProvider {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    storageKeySegments(key);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      throw storageError("write", error);
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    storageKeySegments(key);
    try {
      const { Body, ContentType } = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      if (!Body || !ContentType)
        throw new Error("Stored object metadata is invalid.");
      return {
        bytes: Buffer.from(await Body.transformToByteArray()),
        contentType: ContentType,
      };
    } catch (error) {
      if (
        error instanceof NoSuchKey ||
        (error instanceof S3ServiceException &&
          error.$metadata.httpStatusCode === 404 &&
          error.name !== "NoSuchBucket")
      ) {
        return null;
      }
      throw storageError("read", error);
    }
  }

  async delete(key: string): Promise<void> {
    storageKeySegments(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      throw storageError("delete", error);
    }
  }
}
