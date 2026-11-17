import type { ExpoConfig } from "expo/config";
import { messages } from "@be-fast/i18n";

const config: ExpoConfig = {
  name: messages.apps.customer,
  slug: "be-fast-customer",
  scheme: "befast-customer",
  platforms: ["android"],
  android: { package: "com.befast.customer", allowBackup: false },
  plugins: [
    "expo-router",
    ["expo-localization", { forcesRTL: true, supportedLocales: ["ar"] }],
    "expo-secure-store",
  ],
};

export default config;
