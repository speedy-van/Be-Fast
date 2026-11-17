import { colors, type Palette } from "@be-fast/ui-tokens";
import { createContext, useContext, type ReactNode } from "react";

/** Font family names registered by each app with expo-font. */
export const fonts = {
  regular: "BeFastArabic",
  medium: "BeFastArabicMedium",
  semibold: "BeFastArabicSemiBold",
  bold: "BeFastArabicBold",
} as const;

export interface Theme {
  palette: Palette;
  dark: boolean;
}

const lightTheme: Theme = { palette: colors, dark: false };
const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme;
  children: ReactNode;
}) {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
