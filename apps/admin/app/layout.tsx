import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { messages } from "@be-fast/i18n";
import { colors } from "@be-fast/ui-tokens";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";

export const metadata: Metadata = { title: messages.apps.admin };

const theme = {
  "--brand": colors.brand,
  "--accent": colors.brandText,
  "--surface": colors.surface,
  "--ink": colors.ink,
  "--panel": colors.panel,
  "--muted": colors.mutedInk,
  "--border": colors.border,
  "--subtle-border": colors.subtleBorder,
  "--highlight": colors.highlight,
} as CSSProperties;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={theme}>{children}</body>
    </html>
  );
}
