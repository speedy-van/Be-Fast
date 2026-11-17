export interface StoredObject {
  bytes: Buffer;
  contentType: string;
}

export interface StorageProvider {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

const validSegment = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const windowsDevice = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/u;

export function storageKeySegments(key: string): string[] {
  const segments = key.split("/");
  if (
    segments.some(
      (segment) =>
        segment !== segment.trim() ||
        !validSegment.test(segment) ||
        segment.endsWith(".") ||
        windowsDevice.test(segment),
    )
  ) {
    throw new Error("Invalid storage key.");
  }
  return segments;
}
