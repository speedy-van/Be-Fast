import { formatMoney, type DisplayMode } from "@be-fast/domain";

export function normalizeDigits(input: string) {
  return input.replace(/[\u0660-\u0669\u06f0-\u06f9]/gu, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

export function priceMinorFromInput(
  input: string,
  mode: DisplayMode,
): number | undefined {
  const value = normalizeDigits(input.trim())
    .replaceAll("\u066b", ".")
    .replaceAll("\u066c", ",");
  if (value.length > 30) return undefined;
  const pattern =
    mode === "OLD"
      ? /^(\d+|\d{1,3}(?:,\d{3})+)$/u
      : /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/u;
  const parts = pattern.exec(value);
  const integerPart = parts?.[1];
  if (integerPart === undefined) return undefined;
  const wholePart = BigInt(integerPart.replaceAll(",", ""));
  const amountMinor =
    mode === "OLD"
      ? wholePart
      : wholePart * 100n + BigInt((parts?.[2] ?? "").padEnd(2, "0"));
  return amountMinor <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(amountMinor)
    : undefined;
}

export function priceInput(amountMinor: number, mode: DisplayMode): string {
  return (
    formatMoney(amountMinor, mode).split(" ")[0]?.replaceAll(",", "") ?? ""
  );
}
