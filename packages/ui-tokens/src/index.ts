/**
 * Be Fast design tokens. Every color used by the apps lives here.
 * Contrast pairs are verified in test/contrast.test.ts.
 */
export const colors = {
  /** Vivid flame orange: fills, splash, icons background. Never text on light. */
  brand: "#F04E14",
  /** Primary button gradient. White bold text passes WCAG AA on both stops. */
  brandStrong: "#D4420C",
  brandDeep: "#B5300A",
  /** Orange text, icons and borders on light backgrounds. */
  brandText: "#B8480C",
  brandSoft: "#FFE8DC",
  brandTint: "#FFF1E9",
  onBrand: "#FFFFFF",

  surface: "#FFF8F3",
  panel: "#FFFFFF",
  ink: "#1C1410",
  mutedInk: "#6B5D55",
  border: "#8A7062",
  subtleBorder: "#F0E2D8",
  highlight: "#FFE5D2",

  success: "#17794C",
  successSoft: "#E3F5EC",
  warning: "#8A5A00",
  warningSoft: "#FFF3D6",
  danger: "#C0262D",
  dangerSoft: "#FDE7E7",
  info: "#1F5FA8",
  infoSoft: "#E4EFFB",

  skeleton: "#F3E6DC",
  skeletonShine: "#FFF6F0",
  shadow: "#4A1A05",
  scrim: "#1C1410",
  transparent: "transparent",
} as const;

/** Restaurant app: same identity on a warm dark canvas. */
export const darkColors = {
  brand: "#F04E14",
  brandStrong: "#D4420C",
  brandDeep: "#B5300A",
  brandText: "#FF8A4F",
  brandSoft: "#3A2014",
  brandTint: "#2A1A12",
  onBrand: "#FFFFFF",

  surface: "#14100E",
  panel: "#1F1916",
  raised: "#2A221E",
  ink: "#F8F1EC",
  mutedInk: "#BFAFA5",
  border: "#6E5C51",
  subtleBorder: "#3A302A",
  highlight: "#3A2A21",

  success: "#4CC38A",
  successSoft: "#15301F",
  warning: "#F5B83D",
  warningSoft: "#33280F",
  danger: "#FF6B6B",
  dangerSoft: "#3A1717",
  info: "#6CB4FF",
  infoSoft: "#14263A",

  skeleton: "#2A221E",
  skeletonShine: "#3A302A",
  shadow: "#000000",
  scrim: "#000000",
  transparent: "transparent",
} as const;

export type Palette = { readonly [K in keyof typeof colors]: string };
export type DarkPalette = { readonly [K in keyof typeof darkColors]: string };

/** Gradient stops, top-start to bottom-end. */
export const gradients = {
  brand: [colors.brandStrong, colors.brandDeep],
  button: [colors.brandStrong, colors.brandDeep],
  splash: [colors.brandStrong, colors.brandDeep],
  darkSplash: ["#2A1A12", darkColors.surface],
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const fontSize = {
  caption: 12,
  small: 14,
  body: 16,
  large: 18,
  title: 22,
  headline: 28,
  display: 34,
} as const;

/** Durations in milliseconds. */
export const motion = {
  fast: 160,
  base: 240,
  slow: 380,
  stagger: 45,
  splash: 1500,
} as const;

/** Brand mark geometry shared by the SVG logo, generated icons and splash. */
export const brandMark = {
  viewBox: 512,
  bag: "M136 200H280Q300 200 302 220L314 380Q316 404 292 404H124Q100 404 102 380L114 220Q116 200 136 200Z",
  handle: "M162 206V178Q162 138 208 138Q254 138 254 178V206",
  handleWidth: 22,
  bolt: "M230 234L170 316H204L186 374L248 288H214L240 234Z",
  wing: [
    "M300 232C340 194 392 168 446 164C432 204 382 244 306 270Z",
    "M304 274C350 246 398 230 440 232C420 268 370 294 308 306Z",
    "M308 312C344 294 378 286 410 290C392 318 356 334 312 340Z",
  ],
} as const;
