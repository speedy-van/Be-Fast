import { Stack } from "expo-router";
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from "@expo-google-fonts/ibm-plex-sans-arabic";
import { messages } from "@be-fast/i18n";
import { AnimatedSplash, ThemeProvider } from "@be-fast/ui-native";
import { colors as light, darkColors as colors } from "@be-fast/ui-tokens";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { RestaurantSessionProvider } from "../src/session";
import { nativeFont } from "../src/ui";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void SystemUI.setBackgroundColorAsync(colors.surface).catch(() => undefined);

const theme = { palette: colors, dark: true };
const fontAssets = {
  [nativeFont.regular]: IBMPlexSansArabic_400Regular,
  [nativeFont.medium]: IBMPlexSansArabic_500Medium,
  [nativeFont.semibold]: IBMPlexSansArabic_600SemiBold,
  [nativeFont.bold]: IBMPlexSansArabic_700Bold,
};

export default function RootLayout() {
  const [loaded, error] = useFonts(fontAssets);
  const [splashDone, setSplashDone] = useState(false);
  const hideNative = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  const finish = useCallback(() => setSplashDone(true), []);
  if (!loaded && !error) return null;
  return (
    <ThemeProvider theme={theme}>
      <RestaurantSessionProvider>
        <View style={{ flex: 1, backgroundColor: colors.surface }}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.surface },
            }}
          />
          {!splashDone && (
            <AnimatedSplash
              background={colors.surface}
              gradientTo={colors.raised}
              colors={{ body: light.brand, bolt: colors.surface, gap: colors.surface }}
              title={messages.brand.name}
              tagline={messages.brand.restaurantTagline}
              textColor={colors.ink}
              onReady={hideNative}
              onFinish={finish}
            />
          )}
        </View>
      </RestaurantSessionProvider>
    </ThemeProvider>
  );
}
