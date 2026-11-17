import type { customerProfileSchema } from "@be-fast/contracts";
import { customerAccountText as text } from "@be-fast/i18n";
import { useRef, useState } from "react";
import { Alert, View } from "react-native";
import type { z } from "zod";
import { serviceError, type CustomerRequest } from "../api";
import { AppText, Button, ScrollScreen, Status, styles } from "../ui";

export type CustomerProfile = z.infer<typeof customerProfileSchema>;

export interface AccountScreenProps {
  profile: CustomerProfile;
  request: CustomerRequest;
  onAddresses(): void;
  onClearSession(): void | Promise<void>;
  onSignOut(): void | Promise<void>;
}

export function AccountScreen({
  profile,
  request,
  onAddresses,
  onClearSession,
  onSignOut,
}: AccountScreenProps) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function run(action: () => void | Promise<void>) {
    if (running.current) return;
    running.current = true;
    setError(undefined);
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(serviceError(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function confirmDeletion() {
    Alert.alert(text.deleteAccount, text.deleteWarning, [
      { text: text.cancel, style: "cancel" },
      {
        text: text.deleteAccount,
        style: "destructive",
        onPress: () =>
          void run(async () => {
            await request("/customer/me", { method: "DELETE" });
            await onClearSession();
          }),
      },
    ]);
  }

  return (
    <ScrollScreen>
      <AppText title accessibilityRole="header">
        {text.account}
      </AppText>
      <View style={styles.card}>
        {profile.name && (
          <>
            <AppText muted>{text.name}</AppText>
            <AppText>{profile.name}</AppText>
          </>
        )}
        {profile.phone && (
          <>
            <AppText muted>{text.phone}</AppText>
            <AppText style={styles.numeric}>{profile.phone}</AppText>
          </>
        )}
        <Button label={text.addresses} disabled={busy} onPress={onAddresses} />
        <Button
          label={text.signOut}
          disabled={busy}
          onPress={() => void run(onSignOut)}
        />
        <Button
          label={text.deleteAccount}
          disabled={busy}
          onPress={confirmDeletion}
        />
        <Status busy={busy} error={error} />
      </View>
    </ScrollScreen>
  );
}
