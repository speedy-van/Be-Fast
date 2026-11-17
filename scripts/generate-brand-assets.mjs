// Generates the Be Fast logo, launcher icons and splash images from the
// brand mark geometry in @be-fast/ui-tokens. Run after building ui-tokens:
//   node scripts/generate-brand-assets.mjs
import { Buffer } from "node:buffer";
import { log } from "node:console";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { brandMark, colors, darkColors, gradients } from "../packages/ui-tokens/dist/index.js";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(join(workspace, "apps", "api", "package.json"));
const sharp = require("sharp");

// Visual centre and size of the composed mark inside its 512 viewBox.
const markCenter = { x: 273, y: 271 };

/** The mark as SVG elements, centred on (cx, cy) at the given scale. */
function mark({ cx, cy, scale, body, bolt, wing = body, gap = "none" }) {
  const tx = cx - markCenter.x * scale;
  const ty = cy - markCenter.y * scale;
  // Feathers are painted bottom-up with a background-coloured outline so
  // each one reads separately; the bag is painted last, over their roots.
  const feathers = [...brandMark.wing]
    .reverse()
    .map(
      (d) =>
        `<path d="${d}" fill="${wing}" stroke="${gap}" stroke-width="10" stroke-linejoin="round" paint-order="stroke"/>`,
    )
    .join("");
  return `<g transform="translate(${tx} ${ty}) scale(${scale})">
    ${feathers}
    <path d="${brandMark.handle}" fill="none" stroke="${body}" stroke-width="${brandMark.handleWidth}" stroke-linecap="round"/>
    <path d="${brandMark.bag}" fill="${body}"/>
    <path d="${brandMark.bolt}" fill="${bolt}"/>
  </g>`;
}

function svg(size, content, defs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs>${defs}</defs>${content}</svg>`;
}

const gradient = (id, from, to) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
const glow = (id, color) =>
  `<radialGradient id="${id}" cx="0.3" cy="0.22" r="0.75"><stop offset="0" stop-color="${color}" stop-opacity="0.2"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;

const themes = {
  customer: {
    background: `<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#glow)"/>`,
    defs: gradient("bg", colors.brand, colors.brandDeep) + glow("glow", colors.onBrand),
    adaptiveBackground: colors.brand,
    body: colors.onBrand,
    bolt: colors.brandStrong,
    wing: colors.onBrand,
    gap: colors.brandStrong,
    splashBackground: gradients.splash[0],
    splashBody: colors.onBrand,
    splashBolt: colors.brandStrong,
  },
  restaurant: {
    background: `<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#glow)"/>`,
    defs: gradient("bg", darkColors.raised, darkColors.surface) + glow("glow", colors.brand),
    adaptiveBackground: darkColors.surface,
    body: colors.brand,
    bolt: darkColors.surface,
    wing: colors.brand,
    gap: darkColors.panel,
    splashBackground: darkColors.surface,
    splashBody: colors.brand,
    splashBolt: darkColors.surface,
  },
};

async function png(path, markup, size) {
  await sharp(Buffer.from(markup)).resize(size, size).png().toFile(path);
}

for (const [app, theme] of Object.entries(themes)) {
  const out = join(workspace, "apps", app, "assets");
  mkdirSync(out, { recursive: true });

  // Legacy launcher icon and store icon: full-bleed square.
  await png(
    join(out, "icon.png"),
    svg(1024, theme.background + mark({ cx: 512, cy: 520, scale: 1.9, body: theme.body, bolt: theme.bolt, wing: theme.wing, gap: theme.gap }), theme.defs),
    1024,
  );

  // Adaptive icon layers: the mark stays inside the 66% safe circle.
  await png(
    join(out, "adaptive-foreground.png"),
    svg(1024, mark({ cx: 512, cy: 516, scale: 1.42, body: theme.body, bolt: theme.bolt, wing: theme.wing, gap: theme.gap })),
    1024,
  );
  await png(
    join(out, "adaptive-background.png"),
    svg(1024, theme.background, theme.defs),
    1024,
  );
  await png(
    join(out, "adaptive-monochrome.png"),
    svg(1024, mark({ cx: 512, cy: 516, scale: 1.42, body: "#000000", bolt: "none", wing: "#000000" })),
    1024,
  );

  // Splash image: the mark alone, shown centred on the splash background.
  await png(
    join(out, "splash-icon.png"),
    svg(1024, mark({ cx: 512, cy: 512, scale: 2.6, body: theme.splashBody, bolt: theme.splashBolt, gap: theme.splashBackground })),
    1024,
  );

  writeFileSync(
    join(out, "logo.svg"),
    svg(1024, theme.background + mark({ cx: 512, cy: 520, scale: 1.9, body: theme.body, bolt: theme.bolt, wing: theme.wing, gap: theme.gap }), theme.defs),
  );
}

// A preview sheet for review.
const preview = join(workspace, ".storage", "brand-preview.png");
mkdirSync(join(workspace, ".storage"), { recursive: true });
const sheet = await sharp({
  create: { width: 2200, height: 1100, channels: 4, background: colors.surface },
})
  .composite([
    { input: join(workspace, "apps", "customer", "assets", "icon.png"), left: 50, top: 50 },
    { input: join(workspace, "apps", "restaurant", "assets", "icon.png"), left: 1126, top: 50 },
  ])
  .png()
  .toFile(preview);
log(`Brand assets written (${sheet.width}px preview): ${preview}`);
