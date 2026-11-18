import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";

export function useAndroidBack(handle: (() => void) | undefined) {
  useEffect(() => {
    if (Platform.OS !== "android" || !handle) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handle();
      return true;
    });
    return () => subscription.remove();
  }, [handle]);
}
