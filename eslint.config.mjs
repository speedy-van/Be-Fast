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

const arabicText = /\p{Script_Extensions=Arabic}/u;
const colorNotation =
  /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(.+\))$/iu;
const colorProperty = /^(?:colors?|fill|stroke|[a-z][a-zA-Z]*Colors?)$/u;

function isColorPropertyValue(node) {
  const parent = node.parent;
  if (
    parent.type === "JSXExpressionContainer" ||
    parent.type === "TSAsExpression" ||
    parent.type === "ArrayExpression"
  )
    return isColorPropertyValue(parent);
  if (
    parent.type === "ConditionalExpression" &&
    (parent.consequent === node || parent.alternate === node)
  )
    return isColorPropertyValue(parent);
  if (parent.type === "JSXAttribute")
    return colorProperty.test(parent.name.name);
  if (parent.type !== "Property" || parent.value !== node) return false;
  const key =
    parent.key.type === "Identifier" ? parent.key.name : parent.key.value;
  return typeof key === "string" && colorProperty.test(key);
}

const noCustomerUiLiterals = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      arabic: "Use the Arabic text from @be-fast/i18n.",
      color: "Use a color from @be-fast/ui-tokens.",
    },
  },
  create(context) {
    function check(node, value) {
      if (typeof value === "string" && arabicText.test(value)) {
        context.report({ node, messageId: "arabic" });
        return;
      }
      const isColor =
        (typeof value === "string" &&
          (colorNotation.test(value.trim()) || isColorPropertyValue(node))) ||
        (typeof value === "number" && isColorPropertyValue(node));
      if (isColor) context.report({ node, messageId: "color" });
    }

    return {
      Literal: (node) => check(node, node.value),
      JSXText: (node) => check(node, node.value),
      TemplateLiteral: (node) => {
        const segments = node.quasis.map(
          ({ value }) => value.cooked ?? value.raw,
        );
        if (segments.some(Boolean)) check(node, segments.join("…"));
      },
    };
  },
};

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/.next/",
    "**/.expo/",
    "**/.turbo/",
    "**/.android-gradle/",
    "apps/{customer,restaurant}/android/",
    "**/coverage/",
    "apps/api/src/generated/prisma/",
    "**/next-env.d.ts",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["{apps,packages}/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}"],
    plugins: {
      workspace: {
        rules: {
          "no-application-imports": noApplicationImports,
          "no-customer-ui-literals": noCustomerUiLiterals,
        },
      },
    },
    rules: { "workspace/no-application-imports": "error" },
  },
  {
    files: ["apps/customer/**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}"],
    rules: { "workspace/no-customer-ui-literals": "error" },
  },
);
