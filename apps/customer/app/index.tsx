import { StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { messages } from "@be-fast/i18n";
import { colors } from "@be-fast/ui-tokens";

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, padding: 24 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "bold" },
});

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        {messages.apps.customer}
      </Text>
    </SafeAreaView>
  );
}
