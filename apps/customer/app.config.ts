import type { ExpoConfig } from "expo/config";
import { messages } from "@be-fast/i18n";
import { colors, gradients } from "@be-fast/ui-tokens";

const config: ExpoConfig = {
  name: messages.brand.customerLauncher,
  slug: "be-fast-customer",
  scheme: "befast-customer",
  version: "1.1.0",
  platforms: ["android"],
  orientation: "portrait",
  userInterfaceStyle: "light",
  backgroundColor: colors.surface,
  icon: "./assets/icon.png",
  android: {
    package: "com.befast.customer",
    versionCode: 2,
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-foreground.png",
      backgroundImage: "./assets/adaptive-background.png",
      monochromeImage: "./assets/adaptive-monochrome.png",
    },
  },
  plugins: [
    "expo-router",
    ["expo-localization", { forcesRTL: true, supportedLocales: ["ar"] }],
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        backgroundColor: gradients.splash[0],
        image: "./assets/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
      },
    ],
  ],
};

export default config;
