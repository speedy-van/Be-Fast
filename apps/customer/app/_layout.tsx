import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from "@expo-google-fonts/ibm-plex-sans-arabic";
import { messages } from "@be-fast/i18n";
import { AnimatedSplash, ThemeProvider } from "@be-fast/ui-native";
import { colors, gradients } from "@be-fast/ui-tokens";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useFonts } from "expo-font";
import { addNetworkStateListener } from "expo-network";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { shouldRetryRead } from "../src/api";
import { CustomerSessionProvider } from "../src/session";
import { nativeFont } from "../src/ui";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void SystemUI.setBackgroundColorAsync(colors.surface).catch(() => undefined);

const theme = { palette: colors, dark: false };
const fontAssets = {
  [nativeFont.regular]: IBMPlexSansArabic_400Regular,
  [nativeFont.medium]: IBMPlexSansArabic_500Medium,
  [nativeFont.semibold]: IBMPlexSansArabic_600SemiBold,
  [nativeFont.bold]: IBMPlexSansArabic_700Bold,
};
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryRead,
      retryDelay: (index) => 1000 * 2 ** index,
      networkMode: "always",
      staleTime: 0,
      gcTime: Infinity,
    },
  },
});
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "befast-customer-public-v1",
});
const persistOptions = {
  persister,
  maxAge: Infinity,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: {
      queryKey: readonly unknown[];
      state: { data: unknown };
    }) => query.queryKey[0] === "public" && query.state.data !== undefined,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts(fontAssets);
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => {
    const listener = addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false)
        void queryClient.invalidateQueries({ queryKey: ["public"] });
    });
    return () => listener.remove();
  }, []);
  const hideNative = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  const finish = useCallback(() => setSplashDone(true), []);
  if (!loaded && !error) return null;
  return (
    <ThemeProvider theme={theme}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
      >
        <CustomerSessionProvider>
          <View style={{ flex: 1, backgroundColor: colors.surface }}>
            <StatusBar style={splashDone ? "auto" : "light"} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.surface },
                animation: "fade",
              }}
            />
            {!splashDone && (
              <AnimatedSplash
                background={gradients.splash[0]}
                gradientTo={gradients.splash[1]}
                colors={{ body: colors.onBrand, bolt: colors.brandStrong, gap: gradients.splash[0] }}
                title={messages.brand.name}
                tagline={messages.brand.customerTagline}
                textColor={colors.onBrand}
                onReady={hideNative}
                onFinish={finish}
              />
            )}
          </View>
        </CustomerSessionProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}
