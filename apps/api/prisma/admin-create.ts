import { adminEmailSchema } from "@be-fast/contracts";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  hashPassword,
  isProvisioningTotpSecret,
} from "../src/auth/credentials.ts";
import { PrismaClient } from "../src/generated/prisma/client.ts";

interface AdminCredentials {
  email: string;
  password: string;
  totpSecret: string;
}

class AdminProvisioningError extends Error {}

function endpoint(url: URL | null): string {
  try {
    return decodeURIComponent(url?.hostname ?? "")
      .toLowerCase()
      .replace(/\.$/u, "");
  } catch {
    return "";
  }
}

export async function createAdmin(
  db: PrismaClient,
  input: AdminCredentials,
): Promise<void> {
  const email = adminEmailSchema.safeParse(input.email);
  if (!email.success)
    throw new AdminProvisioningError(
      "ADMIN_EMAIL must contain a valid email address.",
    );
  if (input.password.length < 8)
    throw new AdminProvisioningError(
      "ADMIN_PASSWORD must contain at least 8 characters.",
    );

  const totpSecret = input.totpSecret.trim().toUpperCase();
  if (!isProvisioningTotpSecret(totpSecret)) {
    throw new AdminProvisioningError(
      "ADMIN_TOTP_SECRET must contain a Base32-encoded authenticator secret with at least 16 bytes.",
    );
  }

  const result = await db.adminUser.createMany({
    data: [
      {
        email: email.data,
        passwordHash: await hashPassword(input.password),
        totpSecret,
        role: "SUPER_ADMIN",
      },
    ],
    skipDuplicates: true,
  });
  if (result.count !== 1)
    throw new AdminProvisioningError(
      "An admin with this email already exists.",
    );
}

if (import.meta.main) {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const totpSecret = process.env.ADMIN_TOTP_SECRET;
    if (!databaseUrl || !email || !password || !totpSecret) {
      throw new AdminProvisioningError(
        "DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_TOTP_SECRET are required.",
      );
    }

    const url = URL.parse(databaseUrl);
    const host = endpoint(url);
    if (
      !url ||
      !["postgresql:", "postgres:"].includes(url.protocol) ||
      !host ||
      host.includes("-pooler") ||
      url.searchParams.has("host") ||
      url.searchParams.getAll("sslmode").length !== 1 ||
      url.searchParams.get("sslmode") !== "verify-full"
    ) {
      throw new AdminProvisioningError(
        "DATABASE_URL must use a direct PostgreSQL endpoint with sslmode=verify-full.",
      );
    }
    if (host === endpoint(URL.parse(process.env.TEST_DATABASE_URL ?? ""))) {
      throw new AdminProvisioningError(
        "DATABASE_URL must use a different endpoint from TEST_DATABASE_URL.",
      );
    }
    const adapter = new PrismaPg(
      {
        connectionString: url.href,
        connectionTimeoutMillis: 10_000,
        query_timeout: 10_000,
      },
      { schema: url.searchParams.get("schema") ?? "public" },
    );
    const db = new PrismaClient({ adapter });
    try {
      await createAdmin(db, { email, password, totpSecret });
      console.log("Admin account created.");
    } finally {
      await db.$disconnect();
    }
  } catch (error) {
    console.error(
      error instanceof AdminProvisioningError
        ? error.message
        : "Could not create the admin account.",
    );
    process.exitCode = 1;
  }
}
