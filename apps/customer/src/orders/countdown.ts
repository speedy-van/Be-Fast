export function responseRemainingSeconds(
  serverTime: string,
  expiresAt: string,
  elapsedMs: number,
) {
  return Math.max(
    0,
    Math.ceil(
      (Date.parse(expiresAt) - Date.parse(serverTime) - elapsedMs) / 1_000,
    ),
  );
}
