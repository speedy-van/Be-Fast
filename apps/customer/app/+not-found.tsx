import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { messages } from "@be-fast/i18n";
import { colors } from "@be-fast/ui-tokens";

export default function NotFoundScreen() {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.surface, padding: 24 }}
    >
      <Text accessibilityRole="header" style={{ color: colors.ink }}>
        {messages.errors.pageNotFound}
      </Text>
    </SafeAreaView>
  );
}
