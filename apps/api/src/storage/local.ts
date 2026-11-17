import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  storageKeySegments,
  type StorageProvider,
  type StoredObject,
} from "./provider.js";

function errno(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function readObject(file: Buffer): StoredObject {
  const headerEnd = file.indexOf(10);
  if (headerEnd === -1) throw new Error("Stored object metadata is invalid.");

  const contentType: unknown = JSON.parse(file.toString("utf8", 0, headerEnd));
  if (typeof contentType !== "string")
    throw new Error("Stored object metadata is invalid.");
  return { contentType, bytes: file.subarray(headerEnd + 1) };
}

export class LocalDiskStorageProvider implements StorageProvider {
  private readonly rootDirectory: string;

  constructor(rootDirectory: string) {
    this.rootDirectory = resolve(rootDirectory);
  }

  private async objectPath(
    key: string,
    createParents: boolean,
  ): Promise<string> {
    const parentNames = storageKeySegments(key);
    const objectName = parentNames.pop();
    if (!objectName) throw new Error("Invalid storage key.");

    if (createParents)
      await mkdir(this.rootDirectory, { recursive: true, mode: 0o700 });
    let directory = await realpath(this.rootDirectory);
    for (const parentName of parentNames) {
      directory = join(directory, parentName);
      if (createParents) {
        try {
          await mkdir(directory, { mode: 0o700 });
        } catch (error) {
          if (!errno(error, "EEXIST")) throw error;
        }
      }
      if (!(await lstat(directory)).isDirectory()) {
        throw new Error("Invalid storage directory.");
      }
    }
    return join(directory, objectName);
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    const target = await this.objectPath(key, true);
    const temporary = join(dirname(target), `.object-${randomUUID()}.tmp`);
    const file = await open(temporary, "wx", 0o600);
    try {
      try {
        // Store the type in the same file so readers see one consistent version.
        const header = Buffer.from(`${JSON.stringify(contentType)}\n`, "utf8");
        await file.writeFile(Buffer.concat([header, bytes]));
      } finally {
        await file.close();
      }
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const path = await this.objectPath(key, false);
      if (!(await lstat(path)).isFile())
        throw new Error("Invalid stored object.");
      return readObject(await readFile(path));
    } catch (error) {
      if (errno(error, "ENOENT")) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const path = await this.objectPath(key, false);
      if (!(await lstat(path)).isFile())
        throw new Error("Invalid stored object.");
      await unlink(path);
    } catch (error) {
      if (!errno(error, "ENOENT")) throw error;
    }
  }
}
