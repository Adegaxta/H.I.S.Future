import { stringifyHtmlMetadata } from "./htmlMetadata";
export type CalendarView = "month" | "week" | "day";
export type TimeFormat = "12h" | "24h";
export type TempoSubtype = "daily" | "weekly" | "monthly" | "annual";
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const DEFAULT_TEMPO_COLOR = "#D88F5A";

export interface CalendarMeta {
  currentDate: string;
  view: CalendarView;
}

export interface TempoMeta {
  date: string;
  startTime: string | null;
  endTime: string | null;
  subtype: TempoSubtype;
  endDate: string | null;
  color: string;
  weeklyVisualOrder: number | null;
  activeWeekdays: IsoWeekday[] | null;
}

const CALENDAR_PREFIX = "<!--hisfuture-calendar-meta:";
const TEMPO_PREFIX = "<!--hisfuture-tempo-meta:";
const META_SUFFIX = "-->";

const localIsoDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(year, month - 1, day);
  return year >= 1 &&
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day;
};

export const isTime = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
};

const isColor = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

const readActiveWeekdays = (value: unknown): IsoWeekday[] | null => {
  if (!Array.isArray(value)) return null;
  const weekdays = value.filter((day): day is IsoWeekday => Number.isInteger(day) && day >= 1 && day <= 7);
  return [...new Set(weekdays)].sort((a, b) => a - b);
};

function readMeta<T>(content: string, prefix: string): Partial<T> | null {
  const start = content.indexOf(prefix);
  if (start < 0) return null;
  const end = content.indexOf(META_SUFFIX, start + prefix.length);
  if (end < 0) return null;
  try {
    return JSON.parse(content.slice(start + prefix.length, end)) as Partial<T>;
  } catch {
    return null;
  }
}

function writeMeta(content: string, prefix: string, meta: object): string {
  const serialized = `${prefix}${stringifyHtmlMetadata(meta)}${META_SUFFIX}`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}[\\s\\S]*?${META_SUFFIX}`);
  return pattern.test(content)
    ? content.replace(pattern, () => serialized)
    : `${serialized}${content}`;
}

export function createCalendarContent(date = new Date()): string {
  return setCalendarMeta("<p><br></p>", {
    currentDate: localIsoDate(date),
    view: "month",
  });
}

export function getCalendarMeta(content: string): CalendarMeta {
  const parsed = readMeta<CalendarMeta>(content, CALENDAR_PREFIX);
  return normalizeCalendarMeta(parsed);
}

export function normalizeCalendarMeta(meta: Partial<CalendarMeta> | null): CalendarMeta {
  return {
    currentDate: isIsoDate(meta?.currentDate)
      ? meta.currentDate
      : localIsoDate(),
    view:
      meta?.view === "week" || meta?.view === "day"
        ? meta.view
        : "month",
  };
}

export function setCalendarMeta(content: string, meta: CalendarMeta): string {
  return writeMeta(content, CALENDAR_PREFIX, normalizeCalendarMeta(meta));
}

export function createTempoContent(meta: TempoMeta): string {
  return setTempoMeta("<p><br></p>", meta);
}

export function getTempoMeta(content: string): TempoMeta {
  const parsed = readMeta<TempoMeta>(content, TEMPO_PREFIX);
  return normalizeTempoMeta(parsed);
}

export function normalizeTempoMeta(meta: Partial<TempoMeta> | null): TempoMeta {
  const date = isIsoDate(meta?.date) ? meta.date : localIsoDate();
  const rawEndDate = isIsoDate(meta?.endDate) ? meta.endDate : null;
  return {
    date,
    startTime: isTime(meta?.startTime) ? meta.startTime : null,
    endTime: isTime(meta?.endTime) ? meta.endTime : null,
    subtype: meta?.subtype === "weekly" || meta?.subtype === "monthly" || meta?.subtype === "annual"
      ? meta.subtype
      : "daily",
    endDate: rawEndDate && rawEndDate < date ? date : rawEndDate,
    color: isColor(meta?.color) ? meta.color : DEFAULT_TEMPO_COLOR,
    weeklyVisualOrder: typeof meta?.weeklyVisualOrder === "number" && Number.isFinite(meta.weeklyVisualOrder)
      ? meta.weeklyVisualOrder
      : null,
    activeWeekdays: readActiveWeekdays(meta?.activeWeekdays),
  };
}

export function setTempoMeta(content: string, meta: TempoMeta): string {
  return writeMeta(content, TEMPO_PREFIX, normalizeTempoMeta(meta));
}

export function stripTemporalMeta(content: string): string {
  return content
    .replace(/<!--hisfuture-calendar-meta:[\s\S]*?-->/g, "")
    .replace(/<!--hisfuture-tempo-meta:[\s\S]*?-->/g, "");
}

export function formatTime(value: string, format: TimeFormat): string {
  if (!isTime(value)) return value;
  const [hours, minutes] = value.split(":").map(Number);
  if (format === "24h") return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function formatTempoTime(meta: TempoMeta, format: TimeFormat): string | null {
  const values = [meta.startTime, meta.endTime]
    .filter((value): value is string => Boolean(value))
    .map((value) => formatTime(value, format));
  return values.length ? values.join(" ") : null;
}

export function getTempoDescription(content: string): string {
  const source = stripTemporalMeta(content);
  const document = new DOMParser().parseFromString(source, "text/html");
  return (document.body.textContent || "").replace(/\s+/g, " ").trim();
}

export { localIsoDate };
