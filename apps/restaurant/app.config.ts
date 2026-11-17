import type { ExpoConfig } from "expo/config";
import { messages } from "@be-fast/i18n";
import { darkColors } from "@be-fast/ui-tokens";

const config: ExpoConfig = {
  name: messages.brand.restaurantLauncher,
  slug: "be-fast-restaurant",
  scheme: "befast-restaurant",
  version: "1.1.0",
  platforms: ["android"],
  orientation: "portrait",
  userInterfaceStyle: "dark",
  backgroundColor: darkColors.surface,
  icon: "./assets/icon.png",
  android: {
    package: "com.befast.restaurant",
    versionCode: 2,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-foreground.png",
      backgroundImage: "./assets/adaptive-background.png",
      monochromeImage: "./assets/adaptive-monochrome.png",
    },
  },
  plugins: [
    "expo-router",
    ["expo-localization", { forcesRTL: true, supportedLocales: ["ar"] }],
    [
      "expo-audio",
      {
        recordAudioAndroid: false,
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
      },
    ],
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        backgroundColor: darkColors.surface,
        image: "./assets/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
      },
    ],
  ],
};

export default config;
