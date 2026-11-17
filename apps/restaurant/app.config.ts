import type { ExpoConfig } from "expo/config";
import { messages } from "@be-fast/i18n";

const config: ExpoConfig = {
  name: messages.apps.restaurant,
  slug: "be-fast-restaurant",
  scheme: "befast-restaurant",
  platforms: ["android"],
  android: { package: "com.befast.restaurant" },
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
  ],
};

export default config;
