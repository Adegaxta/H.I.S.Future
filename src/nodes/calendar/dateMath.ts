import type { IsoWeekday } from "../../utils/temporalMeta";

export function dateFromIso(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}

const calendarDayNumber = (date: Date): number =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;

export function dayIndex(date: Date, origin: Date): number {
  return calendarDayNumber(date) - calendarDayNumber(origin);
}

export function isoWeekday(date: Date): IsoWeekday {
  return (date.getDay() === 0 ? 7 : date.getDay()) as IsoWeekday;
}

export function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function timeFromMinutes(value: number): string {
  const safe = Math.max(0, Math.min(1439, Math.round(value)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function timeRangeDurationMinutes(startTime: string, endTime: string | null, fallback = 60): number {
  if (!endTime) return fallback;
  const duration = minutesFromTime(endTime) - minutesFromTime(startTime);
  return duration > 0 ? duration : fallback;
}

export const hourTime = (hour: number): string =>
  `${String(hour).padStart(2, "0")}:00`;
