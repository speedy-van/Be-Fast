import type { customerProfileSchema } from "@be-fast/contracts";
import { customerAccountText as text } from "@be-fast/i18n";
import { useRef, useState } from "react";
import { GradientFill, Icon } from "@be-fast/ui-native";
import { colors, radius, spacing } from "@be-fast/ui-tokens";
import { Alert, StyleSheet, View } from "react-native";
import type { z } from "zod";
import { serviceError, type CustomerRequest } from "../api";
import {
  AppText,
  Button,
  Card,
  Divider,
  ScreenHeader,
  ScrollScreen,
  Status,
  styles,
} from "../ui";

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

  const initial = profile.name?.trim().charAt(0) ?? "";
  return (
    <ScrollScreen>
      <ScreenHeader title={text.account} />
      <Card style={local.profile}>
        <View style={local.avatar}>
          <GradientFill from={colors.brand} to={colors.brandDeep} id="avatar" />
          {initial ? (
            <AppText variant="headline" tone="onBrand">
              {initial}
            </AppText>
          ) : (
            <Icon name="user" size={30} color={colors.onBrand} />
          )}
        </View>
        <View style={styles.flex}>
          {profile.name && (
            <>
              <AppText variant="caption" muted>
                {text.name}
              </AppText>
              <AppText variant="title">{profile.name}</AppText>
            </>
          )}
          {profile.phone && (
            <>
              <AppText variant="caption" muted>
                {text.phone}
              </AppText>
              <AppText weight="semibold" style={styles.numeric}>
                {profile.phone}
              </AppText>
            </>
          )}
        </View>
      </Card>
      <Card style={local.menu}>
        <Button
          label={text.addresses}
          icon="pin"
          variant="ghost"
          disabled={busy}
          onPress={onAddresses}
          trailing={<Icon name="forward" size={18} color={colors.mutedInk} />}
        />
        <Divider />
        <Button
          label={text.signOut}
          icon="logout"
          variant="ghost"
          disabled={busy}
          onPress={() => void run(onSignOut)}
        />
      </Card>
      <Button
        label={text.deleteAccount}
        icon="trash"
        variant="danger"
        disabled={busy}
        onPress={confirmDeletion}
      />
      <Status busy={busy} error={error} />
    </ScrollScreen>
  );
}

const local = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  menu: { paddingVertical: spacing.xs, gap: 0 },
});
