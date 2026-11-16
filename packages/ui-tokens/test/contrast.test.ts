import { describe, expect, it } from "vitest";
import { colors } from "../src/index.js";

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

describe("Be Fast text color contrast", () => {
  it.each([
    ["primary text", colors.ink, colors.surface],
    ["text on primary buttons", colors.ink, colors.brand],
    ["orange text on light backgrounds", colors.brandText, colors.surface],
  ])("meets WCAG AA for %s", (_name, foreground, background) => {
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    const bright = Math.max(foregroundLuminance, backgroundLuminance);
    const dark = Math.min(foregroundLuminance, backgroundLuminance);

    expect((bright + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
