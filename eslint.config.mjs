import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import tseslint from "typescript-eslint";

const workspaceRoot = fileURLToPath(new URL(".", import.meta.url));
const applicationNames = new Set(["admin", "api", "customer", "restaurant"]);

function workspacePath(filename) {
  return relative(workspaceRoot, filename).replaceAll("\\", "/");
}

function applicationDirectory(filename) {
  return /^apps\/([^/]+)(?:\/|$)/u.exec(workspacePath(filename))?.[1];
}

function importedApplication(source, filename) {
  const specifier = source.replaceAll("\\", "/");

  if (specifier.startsWith(".")) {
    return applicationDirectory(resolve(filename, "..", specifier));
  }
  if (isAbsolute(specifier)) {
    return applicationDirectory(specifier);
  }

  const application = /^(?:@be-fast\/|apps\/)?([^/]+)/u.exec(specifier)?.[1];
  return applicationNames.has(application) ? application : undefined;
}

const noApplicationImports = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      boundary:
        "Application '{{application}}' is outside this package boundary. Move shared code into a workspace package.",
    },
  },
  create(context) {
    const owningApplication = applicationDirectory(context.filename);

    function check(source) {
      const specifier =
        source?.type === "TemplateLiteral" && source.expressions.length === 0
          ? source.quasis[0].value.cooked
          : source?.value;

      if (typeof specifier !== "string") {
        return;
      }

      const application = importedApplication(specifier, context.filename);
      if (application && application !== owningApplication) {
        context.report({
          node: source,
          messageId: "boundary",
          data: { application },
        });
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
      TSExternalModuleReference: (node) => check(node.expression),
      TSImportType: (node) => check(node.source),
      "CallExpression[callee.name='require']": (node) =>
        check(node.arguments[0]),
    };
  },
};

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/.next/",
    "**/.expo/",
    "**/.turbo/",
    "**/coverage/",
    "apps/api/src/generated/prisma/",
    "**/next-env.d.ts",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["{apps,packages}/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}"],
    plugins: {
      workspace: { rules: { "no-application-imports": noApplicationImports } },
    },
    rules: { "workspace/no-application-imports": "error" },
  },
);
