import type { Metadata } from "next";
import type { ReactNode } from "react";
import { messages } from "@be-fast/i18n";
import { colors } from "@be-fast/ui-tokens";
import "./globals.css";

export const metadata: Metadata = { title: messages.apps.admin };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ backgroundColor: colors.surface, color: colors.ink }}>
        {children}
      </body>
    </html>
  );
}
