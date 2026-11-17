// Inert stand-in for expo-haptics in unit tests (see vitest.config.ts).
export const impactAsync = async () => undefined;
export const selectionAsync = async () => undefined;
export const notificationAsync = async () => undefined;
export const ImpactFeedbackStyle = { Light: "light", Medium: "medium", Heavy: "heavy" } as const;
export const NotificationFeedbackType = {
  Success: "success",
  Warning: "warning",
  Error: "error",
} as const;
