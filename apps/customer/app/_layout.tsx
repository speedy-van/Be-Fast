import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_700Bold,
} from "@expo-google-fonts/ibm-plex-sans-arabic";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useFonts } from "expo-font";
import { addNetworkStateListener } from "expo-network";
import { useEffect } from "react";
import { shouldRetryRead } from "../src/api";
import { CustomerSessionProvider } from "../src/session";
import { nativeFont } from "../src/ui";

const fontAssets = {
  [nativeFont.regular]: IBMPlexSansArabic_400Regular,
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
  useEffect(() => {
    const listener = addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false)
        void queryClient.invalidateQueries({ queryKey: ["public"] });
    });
    return () => listener.remove();
  }, []);
  if (!loaded && !error) return null;
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      <CustomerSessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </CustomerSessionProvider>
    </PersistQueryClientProvider>
  );
}
