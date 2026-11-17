import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import multipart from "@fastify/multipart";
import {
  adminDocumentPathSchema,
  documentIdPathSchema,
  menuItemIdSchema,
  publicImagePathSchema,
  restaurantDocumentPathSchema,
  restaurantImagePathSchema,
  signedDocumentQuerySchema,
} from "@be-fast/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  requireAdminRole,
  requireRestaurant,
  requireRestaurantRole,
} from "../auth/access.js";
import { ApiError } from "../errors.js";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { lockMenu, menuEditors, menuItemScope } from "../menu/shared.js";
import {
  createImageVariants,
  ImageInputError,
  MAX_IMAGE_BYTES,
  reencodeDocumentImage,
} from "../storage/images.js";
import type { StorageProvider } from "../storage/provider.js";

const mediaTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const documentLifetimeMs = 300_000;
const documentMetadata = { id: true, type: true, createdAt: true } as const;

interface MediaRoutesOptions {
  db: PrismaClient;
  storage: StorageProvider;
  secret: Uint8Array;
  now: () => Date;
}

async function readImage(request: FastifyRequest): Promise<Buffer> {
  if (!request.isMultipart()) throw new ApiError(415, "VALIDATION_ERROR");
  let bytes: Buffer | undefined;
  for await (const part of request.parts({
    limits: { fileSize: MAX_IMAGE_BYTES + 1, files: 1, fields: 0, parts: 2 },
  })) {
    if (part.type !== "file" || bytes !== undefined) {
      throw new ApiError(400, "VALIDATION_ERROR");
    }
    bytes = await part.toBuffer();
    if (!mediaTypes.has(part.mimetype)) {
      throw new ApiError(415, "VALIDATION_ERROR");
    }
  }
  if (bytes === undefined) throw new ApiError(400, "VALIDATION_ERROR");
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new ApiError(413, "VALIDATION_ERROR");
  return bytes;
}

async function prepareImage<T>(transform: () => Promise<T>): Promise<T> {
  try {
    return await transform();
  } catch (error) {
    if (error instanceof ImageInputError) {
      const status = error.code === "IMAGE_TOO_LARGE" ? 413 : 415;
      throw new ApiError(status, "VALIDATION_ERROR");
    }
    throw error;
  }
}

async function saveRestaurantImage(
  request: FastifyRequest,
  storage: StorageProvider,
  restaurantId: string,
  saveKey: (key: string) => Promise<unknown>,
) {
  const bytes = await readImage(request);
  const variants = await prepareImage(() => createImageVariants(bytes));
  const assetId = randomUUID();
  const key = `restaurants/${restaurantId}/${assetId}`;
  const storedKeys = variants.map(({ width }) => `${key}/${width}.webp`);
  try {
    for (const variant of variants) {
      await storage.put(
        `${key}/${variant.width}.webp`,
        variant.bytes,
        variant.contentType,
      );
    }
    await saveKey(key);
  } catch (error) {
    await Promise.allSettled(
      storedKeys.map((storedKey) => storage.delete(storedKey)),
    );
    throw error;
  }

  const path = `/public/images/${restaurantId}/${assetId}`;
  return { key, images: { 320: `${path}/320`, 640: `${path}/640` } };
}

function privateDocumentPath(restaurantId: string, documentId: string) {
  return `/admin/restaurants/${restaurantId}/documents/${documentId}`;
}

function signatureFor(
  secret: Uint8Array,
  restaurantId: string,
  documentId: string,
  expires: number,
) {
  return createHmac("sha256", secret)
    .update(`document\0${restaurantId}\0${documentId}\0${expires}`)
    .digest("base64url");
}

export function registerMediaRoutes(
  api: FastifyInstance,
  { db, storage, secret, now }: MediaRoutesOptions,
) {
  api.register(multipart);
  const ownerOnly = { preHandler: requireRestaurantRole("OWNER") };
  const reviewTeamOnly = {
    preHandler: requireAdminRole("OPERATIONS", "SUPER_ADMIN"),
  };

  api.post(
    "/restaurant/profile/images/:kind",
    ownerOnly,
    async (request, reply) => {
      const { restaurantId } = requireRestaurant(request);
      const { kind } = restaurantImagePathSchema.parse(request.params);
      const image = await saveRestaurantImage(
        request,
        storage,
        restaurantId,
        (key) =>
          db.restaurant.update({
            where: { id: restaurantId },
            data: kind === "logo" ? { logoKey: key } : { coverImageKey: key },
            select: { id: true },
          }),
      );
      return reply.code(201).send(image);
    },
  );

  api.post(
    "/restaurant/menu/items/:itemId/image",
    menuEditors,
    async (request, reply) => {
      const { restaurantId } = requireRestaurant(request);
      const { itemId } = menuItemIdSchema.parse(request.params);
      const where = { id: itemId, ...menuItemScope(restaurantId) };
      if (!(await db.menuItem.findFirst({ where, select: { id: true } }))) {
        throw new ApiError(404, "NOT_FOUND");
      }
      const image = await saveRestaurantImage(
        request,
        storage,
        restaurantId,
        (key) =>
          db.$transaction(async (tx) => {
            await lockMenu(tx, restaurantId);
            const result = await tx.menuItem.updateMany({
              where,
              data: { imageKey: key },
            });
            if (!result.count) throw new ApiError(404, "NOT_FOUND");
          }),
      );
      return reply.code(201).send(image);
    },
  );

  api.get(
    "/public/images/:restaurantId/:assetId/:width",
    async (request, reply) => {
      const { restaurantId, assetId, width } = publicImagePathSchema.parse(
        request.params,
      );
      const key = `restaurants/${restaurantId}/${assetId}`;
      const restaurant = await db.restaurant.findFirst({
        where: {
          id: restaurantId,
          status: "APPROVED",
          OR: [
            { logoKey: key },
            { coverImageKey: key },
            {
              menuSections: {
                some: {
                  deletedAt: null,
                  items: { some: { imageKey: key, deletedAt: null } },
                },
              },
            },
          ],
        },
        select: { id: true },
      });
      if (!restaurant) throw new ApiError(404, "NOT_FOUND");
      const image = await storage.get(`${key}/${width}.webp`);
      if (!image) throw new ApiError(404, "NOT_FOUND");
      return reply
        .header("Cache-Control", "public, no-cache")
        .type("image/webp")
        .send(image.bytes);
    },
  );

  api.post("/restaurant/documents/:type", ownerOnly, async (request, reply) => {
    const { restaurantId } = requireRestaurant(request);
    const { type } = restaurantDocumentPathSchema.parse(request.params);
    const bytes = await readImage(request);
    const image = await prepareImage(() => reencodeDocumentImage(bytes));
    const id = randomUUID();
    const storageKey = `documents/${restaurantId}/${id}.webp`;
    try {
      await storage.put(storageKey, image.bytes, image.contentType);
      const document = await db.restaurantDocument.create({
        data: { id, restaurantId, type, storageKey },
        select: documentMetadata,
      });
      return reply.code(201).send(document);
    } catch (error) {
      await storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  });

  api.get("/restaurant/documents", ownerOnly, async (request) => {
    const { restaurantId } = requireRestaurant(request);
    return db.restaurantDocument.findMany({
      where: { restaurantId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: documentMetadata,
    });
  });

  api.get("/restaurant/documents/:documentId", ownerOnly, async (request) => {
    const { restaurantId } = requireRestaurant(request);
    const { documentId } = documentIdPathSchema.parse(request.params);
    const document = await db.restaurantDocument.findFirst({
      where: { id: documentId, restaurantId },
      select: documentMetadata,
    });
    if (!document) throw new ApiError(404, "NOT_FOUND");
    return document;
  });

  api.get(
    "/admin/restaurants/:restaurantId/documents/:documentId/link",
    reviewTeamOnly,
    async (request, reply) => {
      const { restaurantId, documentId } = adminDocumentPathSchema.parse(
        request.params,
      );
      const existed = await db.restaurantDocument.findFirst({
        where: { restaurantId, id: documentId },
        select: { id: true },
      });
      if (!existed) throw new ApiError(404, "NOT_FOUND");
      const expires = now().getTime() + documentLifetimeMs;
      const signature = signatureFor(secret, restaurantId, documentId, expires);
      const query = new URLSearchParams({
        expires: String(expires),
        signature,
      });
      return reply.header("Cache-Control", "no-store").send({
        url: `${privateDocumentPath(restaurantId, documentId)}?${query}`,
        expiresAt: new Date(expires).toISOString(),
      });
    },
  );

  api.get(
    "/admin/restaurants/:restaurantId/documents/:documentId",
    reviewTeamOnly,
    async (request, reply) => {
      const { restaurantId, documentId } = adminDocumentPathSchema.parse(
        request.params,
      );
      const parsed = signedDocumentQuerySchema.safeParse(request.query);
      if (!parsed.success || parsed.data.expires <= now().getTime())
        throw new ApiError(404, "NOT_FOUND");
      const expected = signatureFor(
        secret,
        restaurantId,
        documentId,
        parsed.data.expires,
      );
      if (
        !timingSafeEqual(
          Buffer.from(expected),
          Buffer.from(parsed.data.signature),
        )
      ) {
        throw new ApiError(404, "NOT_FOUND");
      }
      const document = await db.restaurantDocument.findFirst({
        where: { restaurantId, id: documentId },
        select: { storageKey: true },
      });
      if (!document) throw new ApiError(404, "NOT_FOUND");
      const image = await storage.get(document.storageKey);
      if (!image) throw new ApiError(404, "NOT_FOUND");
      return reply
        .header("Cache-Control", "private, no-store")
        .type("image/webp")
        .send(image.bytes);
    },
  );
}
