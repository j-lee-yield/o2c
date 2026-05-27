export const OPERATOR_TIME_ZONE = "Asia/Manila";

export function formatOperatorToday(now: Date = new Date()) {
  return formatOperatorDate(now, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatOperatorDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions,
  timeZone = OPERATOR_TIME_ZONE,
) {
  return new Intl.DateTimeFormat("en-PH", {
    ...options,
    timeZone,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatOperatorDateKey(value: string | Date = new Date(), timeZone = OPERATOR_TIME_ZONE) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

export function normalizeOperatorDateKey(value?: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return undefined;
  }

  const [year, month, day] = trimmed.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return undefined;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return trimmed;
}

export function addOperatorCalendarDays(dateKey: string, days: number) {
  const { year, month, day } = parseOperatorDateKeyParts(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return formatUtcDateKey(date);
}

export function diffOperatorCalendarDays(startDateKey: string, endDateKey: string) {
  const start = parseOperatorDateKeyAsUtc(startDateKey);
  const end = parseOperatorDateKeyAsUtc(endDateKey);

  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function operatorDateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+08:00`);
}

export function operatorMonthKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

function parseOperatorDateKeyAsUtc(dateKey: string) {
  const { year, month, day } = parseOperatorDateKeyParts(dateKey);

  return new Date(Date.UTC(year, month - 1, day));
}

function parseOperatorDateKeyParts(dateKey: string) {
  const [year = 1970, month = 1, day = 1] = dateKey.split("-").map((part) => Number(part));

  return { year, month, day };
}

function formatUtcDateKey(date: Date) {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
