import { ApiClientError } from "@be-fast/api-client";
import {
  authTokensSchema,
  customerOtpRequestSchema,
  restaurantLoginSchema,
  restaurantRegisterSchema,
} from "@be-fast/contracts";
import { messages, restaurantApp as text } from "@be-fast/i18n";
import { useRef, useState } from "react";
import { View } from "react-native";
import { sendRestaurantRequest, serviceError } from "./api";
import { useRestaurantAuth } from "./session";
import { AppText, Button, Field, ScrollScreen, Status, styles } from "./ui";

type Mode = "login" | "register" | "change-password";

export function LoginScreen() {
  const { signIn } = useRestaurantAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);

  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      if (
        cause instanceof ApiClientError &&
        cause.code === "PASSWORD_CHANGE_REQUIRED"
      )
        setMode("change-password");
      else setError(serviceError(cause));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  function login() {
    const parsed = restaurantLoginSchema.safeParse({
      phone,
      password,
      newPassword: mode === "change-password" ? newPassword : undefined,
    });
    if (!parsed.success) return setError(messages.errors.validationError);
    void run(async () => {
      const pair = await sendRestaurantRequest(
        "/auth/restaurant/login",
        { method: "POST", body: parsed.data },
        undefined,
        authTokensSchema,
      );
      await signIn(pair);
    });
  }

  function sendCode() {
    const parsed = customerOtpRequestSchema.safeParse({ phone });
    if (!parsed.success) return setError(messages.errors.validationError);
    void run(async () => {
      await sendRestaurantRequest("/auth/restaurant/otp/request", {
        method: "POST",
        body: parsed.data,
      });
      setCodeSent(true);
    });
  }

  function register() {
    const parsed = restaurantRegisterSchema.safeParse({
      phone,
      code,
      password,
    });
    if (!parsed.success) return setError(messages.errors.validationError);
    void run(async () => {
      const pair = await sendRestaurantRequest(
        "/auth/restaurant/register",
        { method: "POST", body: parsed.data },
        undefined,
        authTokensSchema,
      );
      await signIn(pair);
    });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setPassword("");
    setCode("");
    setNewPassword("");
    setError(undefined);
    setCodeSent(false);
  }

  return (
    <ScrollScreen>
      <AppText title>{text.brand}</AppText>
      <View style={styles.card}>
        <AppText title>
          {mode === "register"
            ? text.register
            : mode === "change-password"
              ? text.setPassword
              : text.login}
        </AppText>
        <Field
          label={text.phone}
          value={phone}
          onChangeText={(value) => {
            setPhone(value);
            setCodeSent(false);
          }}
          editable={!busy && mode !== "change-password"}
          keyboardType="phone-pad"
          autoComplete="tel"
          style={styles.numeric}
        />
        {mode === "register" && (
          <Button label={text.sendCode} onPress={sendCode} disabled={busy} />
        )}
        {mode === "register" && codeSent && (
          <Field
            label={text.otp}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            maxLength={6}
            style={styles.numeric}
          />
        )}
        {(mode !== "register" || codeSent) && (
          <Field
            label={text.password}
            value={password}
            onChangeText={setPassword}
            editable={!busy && mode !== "change-password"}
            secureTextEntry
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
          />
        )}
        {mode === "change-password" && (
          <Field
            label={text.newPassword}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoComplete="new-password"
          />
        )}
        {(mode !== "register" || codeSent) && (
          <Button
            label={
              mode === "register"
                ? text.register
                : mode === "change-password"
                  ? text.setPassword
                  : text.login
            }
            primary
            onPress={mode === "register" ? register : login}
            disabled={busy}
          />
        )}
        <Button
          label={mode === "login" ? text.register : text.back}
          onPress={() => switchMode(mode === "login" ? "register" : "login")}
          disabled={busy}
        />
        <Status busy={busy} error={error} />
      </View>
    </ScrollScreen>
  );
}
