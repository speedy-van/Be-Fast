import { Stack } from "expo-router";
import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_700Bold } from "@expo-google-fonts/ibm-plex-sans-arabic";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { RestaurantSessionProvider } from "../src/session";
import { nativeFont } from "../src/ui";

const fontAssets = {
  [nativeFont.regular]: IBMPlexSansArabic_400Regular,
  [nativeFont.bold]: IBMPlexSansArabic_700Bold,
};

export default function RootLayout() {
  const [loaded, error] = useFonts(fontAssets);
  if (!loaded && !error) return null;
  return (
    <RestaurantSessionProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </RestaurantSessionProvider>
  );
}
