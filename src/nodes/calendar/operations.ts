import type { BaseNodeType, NodeItem } from "../../types/nodes";
import { createCalendarContent, createTempoContent, DEFAULT_TEMPO_COLOR, setTempoMeta, type TempoMeta, type TempoSubtype } from "../../utils/temporalMeta";

export interface CalendarOperationsHost {
  nodes: NodeItem[];
  createNode: (name: string, type: BaseNodeType, parentId: string | null, content?: string, selectCreated?: boolean) => string;
  selectNode: (id: string) => void;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  updateContent: (id: string, content: string) => void;
}

export function createCalendarNode(host: CalendarOperationsHost): string {
  const usedNumbers = new Set(host.nodes.filter((node) => node.type === "calendario").map((node) => /^Calendario (\d+)$/.exec(node.name)?.[1]).filter((value): value is string => Boolean(value)).map(Number));
  let number = 1;
  while (usedNumbers.has(number)) number += 1;
  const id = host.createNode(`Calendario ${number}`, "calendario", null, createCalendarContent());
  host.selectNode(id);
  return id;
}

export function handleCalendarSlashCommand(tag: string, host: CalendarOperationsHost): boolean {
  if (tag !== "CALENDARIO") return false;
  createCalendarNode(host);
  return true;
}

export function createTempoNode(host: CalendarOperationsHost, calendarId: string, date: string, startTime?: string, subtype: TempoSubtype = "daily", endDate: string | null = null, weeklyVisualOrder: number | null = null): string {
  const usedNumbers = new Set(host.nodes.filter((node) => node.type === "tempo" && node.parentId === calendarId).map((node) => /^Tempo (\d+)$/.exec(node.name)?.[1]).filter((value): value is string => Boolean(value)).map(Number));
  let number = 1;
  while (usedNumbers.has(number)) number += 1;
  const id = host.createNode(`Tempo ${number}`, "tempo", calendarId, createTempoContent({ date, startTime: startTime ?? null, endTime: null, subtype, endDate, color: DEFAULT_TEMPO_COLOR, weeklyVisualOrder, activeWeekdays: null }));
  host.setExpanded((current) => ({ ...current, [calendarId]: true }));
  return id;
}

export function moveTempoNode(host: Pick<CalendarOperationsHost, "nodes" | "updateContent">, id: string, meta: TempoMeta): void {
  const tempo = host.nodes.find((item) => item.id === id && item.type === "tempo");
  if (tempo) host.updateContent(id, setTempoMeta(tempo.content, meta));
}
