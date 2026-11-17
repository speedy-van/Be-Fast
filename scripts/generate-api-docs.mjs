import { error } from "node:console";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";
import { renderApiDocs } from "../packages/contracts/dist/api-docs.js";

const file = new URL("../docs/API.md", import.meta.url);
const expected = renderApiDocs();
const args = process.argv.slice(2);
if (args.length === 0) {
  await writeFile(file, expected, "utf8");
} else if (args.length === 1 && args[0] === "--check") {
  const actual = (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
  if (actual !== expected) {
    error(
      "docs/API.md differs from its contracts. Run corepack pnpm docs:api.",
    );
    process.exitCode = 1;
  }
} else {
  error("Use corepack pnpm docs:api or corepack pnpm docs:api --check.");
  process.exitCode = 1;
}
