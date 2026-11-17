import type { TestProject } from "vitest/node";
import { openTestDatabase } from "./test-database.ts";

declare module "vitest" {
  interface ProvidedContext {
    testDatabase: { url: string; schema: string };
  }
}

export default async function setup(project: TestProject) {
  const { url, schema, close } = await openTestDatabase();
  try {
    project.provide("testDatabase", { url, schema });
    return close;
  } catch (error) {
    await close();
    throw error;
  }
}
