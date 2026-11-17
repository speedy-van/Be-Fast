import sharp from "sharp";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const variantWidths = [320, 640] as const;
const jpegMagic = Buffer.from([0xff, 0xd8, 0xff]);
const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const riffMagic = Buffer.from("RIFF");
const webpMagic = Buffer.from("WEBP");

export interface ImageVariant {
  width: (typeof variantWidths)[number];
  bytes: Buffer;
  contentType: "image/webp";
}

export class ImageInputError extends Error {
  constructor(readonly code: "IMAGE_TOO_LARGE" | "INVALID_IMAGE") {
    super(code);
  }
}

function inputFormat(bytes: Buffer): "jpeg" | "png" | "webp" | undefined {
  if (bytes.subarray(0, jpegMagic.length).equals(jpegMagic)) return "jpeg";
  if (bytes.subarray(0, pngMagic.length).equals(pngMagic)) return "png";
  if (
    bytes.subarray(0, 4).equals(riffMagic) &&
    bytes.subarray(8, 12).equals(webpMagic)
  )
    return "webp";
  return undefined;
}

async function inspectImage(bytes: Buffer) {
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new ImageInputError("IMAGE_TOO_LARGE");
  const format = inputFormat(bytes);
  if (!format) throw new ImageInputError("INVALID_IMAGE");

  try {
    const image = sharp(bytes, { autoOrient: true });
    if ((await image.metadata()).format === format) return image;
  } catch {
    // Normalize decoder failures for untrusted input.
  }
  throw new ImageInputError("INVALID_IMAGE");
}

export async function createImageVariants(
  bytes: Buffer,
): Promise<ImageVariant[]> {
  const image = await inspectImage(bytes);

  try {
    const variants: ImageVariant[] = [];
    for (const width of variantWidths) {
      const variant = await image.clone().resize({ width }).webp().toBuffer();
      variants.push({ width, bytes: variant, contentType: "image/webp" });
    }
    return variants;
  } catch {
    throw new ImageInputError("INVALID_IMAGE");
  }
}

export async function reencodeDocumentImage(bytes: Buffer): Promise<{
  bytes: Buffer;
  contentType: "image/webp";
}> {
  const image = await inspectImage(bytes);
  try {
    return {
      bytes: await image
        .resize({ width: 1800, withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer(),
      contentType: "image/webp",
    };
  } catch {
    throw new ImageInputError("INVALID_IMAGE");
  }
}
