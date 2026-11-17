import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { renderApiDocs } from "../packages/contracts/dist/api-docs.js";

it("keeps the checked-in API reference synchronized with the route contracts", async () => {
  const path = new URL("../docs/API.md", import.meta.url);
  const checkedIn = (await readFile(path, "utf8")).replaceAll("\r\n", "\n");
  expect(checkedIn).toBe(renderApiDocs());
});
