import { describe, expect, it } from "vitest";
import { colors, darkColors, gradients } from "../src/index.js";

function linearChannel(pair: string): number {
  const channel = Number.parseInt(pair, 16) / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  // WCAG 2.2 relative luminance for sRGB.
  const red = linearChannel(hex.slice(1, 3));
  const green = linearChannel(hex.slice(3, 5));
  const blue = linearChannel(hex.slice(5, 7));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const bright = Math.max(foregroundLuminance, backgroundLuminance);
  const dark = Math.min(foregroundLuminance, backgroundLuminance);
  return (bright + 0.05) / (dark + 0.05);
}

describe("Be Fast text color contrast", () => {
  it.each([
    ["primary text", colors.ink, colors.surface],
    ["orange text on light backgrounds", colors.brandText, colors.surface],
    ["white text on the primary button start", colors.onBrand, colors.brandStrong],
    ["white text on the primary button end", colors.onBrand, colors.brandDeep],
    ["white text at the customer hero start", colors.onBrand, gradients.brand[0]],
    ["white text at the customer hero end", colors.onBrand, gradients.brand[1]],
    ["white text at the customer splash start", colors.onBrand, gradients.splash[0]],
    ["white text at the customer splash end", colors.onBrand, gradients.splash[1]],
    ["muted text on cards", colors.mutedInk, colors.panel],
    ["muted text on unavailable items", colors.mutedInk, colors.surface],
    ["success text on its tint", colors.success, colors.successSoft],
    ["danger text on its tint", colors.danger, colors.dangerSoft],
    ["warning text on its tint", colors.warning, colors.warningSoft],
    ["dark theme text", darkColors.ink, darkColors.panel],
    ["text at the restaurant splash start", darkColors.ink, darkColors.surface],
    ["text at the restaurant splash end", darkColors.ink, darkColors.raised],
    ["dark theme muted text", darkColors.mutedInk, darkColors.raised],
    ["dark theme orange text", darkColors.brandText, darkColors.panel],
    ["dark theme orange text on its tint", darkColors.brandText, darkColors.brandSoft],
    ["dark theme success text", darkColors.success, darkColors.successSoft],
    ["dark theme warning text", darkColors.warning, darkColors.warningSoft],
    ["dark theme danger text", darkColors.danger, darkColors.dangerSoft],
  ])("meets WCAG AA for %s", (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});

it.each([
  ["orange icons on light backgrounds", colors.brandText, colors.surface],
  ["orange section marker on restaurant menu", colors.brandText, colors.panel],
  ["order success mark", colors.onBrand, colors.success],
])("meets WCAG AA for %s", (_name, foreground, background) => {
  expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(3);
});
