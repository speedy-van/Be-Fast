import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  documentLinkSchema,
  restaurantDocumentSchema,
  restaurantImageUploadSchema,
} from "@be-fast/contracts";
import sharp from "sharp";
import { expect, it } from "vitest";
import { MAX_IMAGE_BYTES } from "../src/storage/images.js";
import { LocalDiskStorageProvider } from "../src/storage/local.js";
import { openAuthTest } from "./auth-test-support.js";

const testTimeoutMs = 25_000;

function multipartImage(bytes: Buffer, contentType = "image/png") {
  const boundary = `be-fast-test-${randomUUID()}`;
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="example"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  return {
    payload: Buffer.concat([
      prefix,
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

async function pngFixture() {
  return sharp({
    create: { width: 900, height: 480, channels: 3, background: "navy" },
  })
    .png()
    .toBuffer();
}

async function mediaTest() {
  const directory = await mkdtemp(join(tmpdir(), "be-fast-media-test-"));
  const context = openAuthTest({
    storage: new LocalDiskStorageProvider(directory),
  });
  const { api, db, tokens } = context;

  const owner = async (phone: string) => {
    const restaurant = await db.restaurant.create({
      data: { commissionRateBps: 1_000 },
      select: { id: true },
    });
    const user = await db.restaurantUser.create({
      data: {
        restaurantId: restaurant.id,
        phone,
        role: "OWNER",
        passwordHash: "unused-fixture",
      },
      select: { id: true },
    });
    const session = await tokens.issue({
      aud: "restaurant",
      sub: user.id,
      role: "OWNER",
      restaurantId: restaurant.id,
    });
    return {
      restaurantId: restaurant.id,
      authorization: `Bearer ${session.accessToken}`,
    };
  };

  const admin = async (role: "OPERATIONS" | "SUPPORT") => {
    const user = await db.adminUser.create({
      data: {
        email: `media-${randomUUID()}@be-fast.example`,
        passwordHash: "unused-fixture",
        totpSecret: "unused-fixture",
        role,
      },
      select: { id: true },
    });
    const session = await tokens.issue({ aud: "admin", sub: user.id, role });
    return `Bearer ${session.accessToken}`;
  };

  async function close() {
    try {
      await api.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  return { ...context, admin, owner, close };
}

it(
  "publishes the image variants only while the restaurant is approved",
  async () => {
    const { api, db, owner, close } = await mediaTest();
    try {
      const { restaurantId, authorization } = await owner("+963900420001");
      const { payload, headers } = multipartImage(await pngFixture());
      const uploaded = await api.inject({
        method: "POST",
        url: "/restaurant/profile/images/logo",
        payload,
        headers: { ...headers, authorization },
      });
      expect(uploaded.statusCode).toBe(201);
      const { images } = restaurantImageUploadSchema.parse(uploaded.json());

      for (const status of [
        "DRAFT",
        "PENDING_REVIEW",
        "REJECTED",
        "SUSPENDED",
      ] as const) {
        await db.restaurant.update({
          where: { id: restaurantId },
          data: { status },
        });
        expect((await api.inject({ url: images[320] })).statusCode).toBe(404);
      }

      await db.restaurant.update({
        where: { id: restaurantId },
        data: { status: "APPROVED" },
      });
      for (const width of [320, 640] as const) {
        const response = await api.inject({ url: images[width] });
        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toBe("image/webp");
        const info = await sharp(response.rawPayload).metadata();
        expect(info.width).toBe(width);
        expect(info.format).toBe("webp");
      }

      await db.restaurant.update({
        where: { id: restaurantId },
        data: { status: "SUSPENDED" },
      });
      expect((await api.inject({ url: images[640] })).statusCode).toBe(404);
    } finally {
      await close();
    }
  },
  testTimeoutMs,
);

it(
  "checks tenant ownership and every signature on private five-minute document URLs",
  async () => {
    const { api, clock, admin, owner, close } = await mediaTest();
    try {
      const seller = await owner("+963900420002");
      const other = await owner("+963900420003");
      const opsAuth = await admin("OPERATIONS");
      const supportAuth = await admin("SUPPORT");
      const { payload, headers } = multipartImage(await pngFixture());
      const uploaded = await api.inject({
        method: "POST",
        url: "/restaurant/documents/LICENSE",
        payload,
        headers: { ...headers, authorization: seller.authorization },
      });
      expect(uploaded.statusCode).toBe(201);
      expect(Object.hasOwn(uploaded.json(), "storageKey")).toBe(false);
      const document = restaurantDocumentSchema.parse(uploaded.json());

      const ownDocument = `/restaurant/documents/${document.id}`;
      expect(
        (
          await api.inject({
            url: ownDocument,
            headers: { authorization: seller.authorization },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await api.inject({
            url: ownDocument,
            headers: { authorization: other.authorization },
          })
        ).statusCode,
      ).toBe(404);

      const privatePath = `/admin/restaurants/${seller.restaurantId}/documents/${document.id}`;
      const linkPath = `${privatePath}/link`;
      expect(
        (
          await api.inject({
            url: linkPath,
            headers: { authorization: supportAuth },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await api.inject({
            url: privatePath,
            headers: { authorization: opsAuth },
          })
        ).statusCode,
      ).toBe(404);

      const linkResponse = await api.inject({
        url: linkPath,
        headers: { authorization: opsAuth },
      });
      expect(linkResponse.statusCode).toBe(200);
      const link = documentLinkSchema.parse(linkResponse.json());
      expect(Date.parse(link.expiresAt) - clock.now.getTime()).toBe(300_000);
      expect((await api.inject({ url: link.url })).statusCode).toBe(401);
      expect(
        (
          await api.inject({
            url: link.url,
            headers: { authorization: seller.authorization },
          })
        ).statusCode,
      ).toBe(403);

      const valid = await api.inject({
        url: link.url,
        headers: { authorization: opsAuth },
      });
      expect(valid.statusCode).toBe(200);
      expect(valid.headers["cache-control"]).toBe("private, no-store");
      expect((await sharp(valid.rawPayload).metadata()).format).toBe("webp");

      const tampered = link.url.replace(
        /(signature=)[A-Za-z0-9_-]/u,
        (value, prefix: string) =>
          `${prefix}${value.endsWith("A") ? "B" : "A"}`,
      );
      expect(
        (
          await api.inject({
            url: tampered,
            headers: { authorization: opsAuth },
          })
        ).statusCode,
      ).toBe(404);
      clock.now = new Date(Date.parse(link.expiresAt) - 1);
      expect(
        (
          await api.inject({
            url: link.url,
            headers: { authorization: opsAuth },
          })
        ).statusCode,
      ).toBe(200);
      clock.now = new Date(Date.parse(link.expiresAt));
      expect(
        (
          await api.inject({
            url: link.url,
            headers: { authorization: opsAuth },
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await close();
    }
  },
  testTimeoutMs,
);

it(
  "rejects invalid image bytes and uploads larger than 5 MiB",
  async () => {
    const { api, db, owner, close } = await mediaTest();
    try {
      const { restaurantId, authorization } = await owner("+963900420004");
      const send = async (bytes: Buffer) => {
        const { payload, headers } = multipartImage(bytes);
        return api.inject({
          method: "POST",
          url: "/restaurant/documents/LICENSE",
          payload,
          headers: { ...headers, authorization },
        });
      };

      expect((await send(Buffer.from("not an image"))).statusCode).toBe(415);
      expect((await send(Buffer.alloc(MAX_IMAGE_BYTES + 1))).statusCode).toBe(
        413,
      );
      expect(
        await db.restaurantDocument.count({ where: { restaurantId } }),
      ).toBe(0);
    } finally {
      await close();
    }
  },
  testTimeoutMs,
);
