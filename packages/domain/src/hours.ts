export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface OpeningPeriod {
  readonly dayOfWeek: Weekday;
  readonly opensAt: string;
  readonly closesAt: string;
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const damascusClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Damascus",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function minuteOfDay(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function localMinuteOfDay(parts: Intl.DateTimeFormatPart[]): number {
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  return Number(hour) * 60 + Number(minute);
}

export function isWithinDamascusTimeWindow(
  opensAt: string | null,
  closesAt: string | null,
  instantUtc: Date,
): boolean {
  if (opensAt === null) {
    return (
      closesAt === null ||
      localMinuteOfDay(damascusClock.formatToParts(instantUtc)) <
        minuteOfDay(closesAt)
    );
  }
  const now = localMinuteOfDay(damascusClock.formatToParts(instantUtc));
  if (closesAt === null) return now >= minuteOfDay(opensAt);
  const opens = minuteOfDay(opensAt);
  const closes = minuteOfDay(closesAt);
  return closes > opens
    ? now >= opens && now < closes
    : now >= opens || now < closes;
}

export function isOpenAt(
  periods: readonly OpeningPeriod[],
  instantUtc: Date,
): boolean {
  const parts = damascusClock.formatToParts(instantUtc);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const today = weekdays.indexOf(weekday ?? "");
  const yesterday = (today + 6) % 7;
  const now = localMinuteOfDay(parts);

  return periods.some(({ dayOfWeek, opensAt, closesAt }) => {
    const opens = minuteOfDay(opensAt);
    const closes = minuteOfDay(closesAt);

    if (closes > opens) {
      return dayOfWeek === today && now >= opens && now < closes;
    }

    return (
      (dayOfWeek === today && now >= opens) ||
      (dayOfWeek === yesterday && now < closes)
    );
  });
}
