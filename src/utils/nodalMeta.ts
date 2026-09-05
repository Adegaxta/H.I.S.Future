import type { BaseNodeType, NodeItem } from "../types/nodes";
import { createCalendarContent, createTempoContent, DEFAULT_TEMPO_COLOR, localIsoDate, type TempoSubtype } from "./temporalMeta";

export const RELATION_ROLES = ["syllabus", "calendar", "class", "content", "course", "tempo", "material", "relatedWork", "cover"] as const;
export type RelationRole = typeof RELATION_ROLES[number];
export interface NodeRelation { role: RelationRole; targetId: string; order?: number; date?: string }
export interface NodalMeta {
  version: 1;
  relations: NodeRelation[];
  code: string;
  courseTitle: string;
  modality: string;
  description: string;
  url: string;
  roomLinks: { id: string; label: string; url: string }[];
  evaluation: boolean;
  status: "pending" | "progress" | "done";
  transcript: string;
  duration: number | null;
  size: number | null;
  mediaType: string;
}
const PATTERN = /<!--hisfuture-nodal-meta:([\s\S]*?)-->/;
const text = (value: unknown) => typeof value === "string" ? value : "";
const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
function rawMeta(content: string): Record<string, unknown> {
  try {
    const value = JSON.parse(PATTERN.exec(content)?.[1] ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function getNodalMeta(content: string): NodalMeta {
  const raw = rawMeta(content);
  const relations: NodeRelation[] = [];
  if (Array.isArray(raw.relations)) for (const value of raw.relations) {
    if (!value || !RELATION_ROLES.includes(value.role) || typeof value.targetId !== "string" || !value.targetId) continue;
    if (relations.some((item) => item.role === value.role && item.targetId === value.targetId)) continue;
    relations.push({ role: value.role, targetId: value.targetId,
      ...(positive(value.order) !== null ? { order: value.order } : {}),
      ...(typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? { date: value.date } : {}),
    });
  }
  return {
    version: 1, relations, code: text(raw.code), courseTitle: text(raw.courseTitle), modality: text(raw.modality), description: text(raw.description), url: text(raw.url),
    roomLinks: Array.isArray(raw.roomLinks) ? raw.roomLinks.filter((v) => v && typeof v.id === "string" && typeof v.url === "string").map((v) => ({ id: v.id, url: v.url, label: text(v.label) })) : [],
    evaluation: raw.evaluation === true, status: raw.status === "progress" || raw.status === "done" ? raw.status : "pending",
    transcript: text(raw.transcript), duration: positive(raw.duration), size: positive(raw.size), mediaType: text(raw.mediaType),
  };
}
export function setNodalMeta(content: string, patch: Partial<NodalMeta>): string {
  // Escaping angle brackets prevents titles/URLs/transcripts from closing the HTML comment.
  const json = JSON.stringify({ ...rawMeta(content), ...patch, version: 1 }).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return `<!--hisfuture-nodal-meta:${json}-->${content.replace(PATTERN, "")}`;
}
export const relationId = (node: NodeItem, role: RelationRole) => getNodalMeta(node.content).relations.find((r) => r.role === role)?.targetId;
export const relatedNode = (nodes: NodeItem[], node: NodeItem, role: RelationRole) => nodes.find((n) => n.id === relationId(node, role));
export const courseTasks = (nodes: NodeItem[], courseId: string, evaluationsOnly = false) => nodes.filter((n) => n.type === "tarea" && relationId(n, "course") === courseId && (!evaluationsOnly || getNodalMeta(n.content).evaluation));
export const courseNodeName = (code: string, title: string, modality: string) => {
  const cleanCode = code.trim();
  const cleanTitle = title.trim();
  const cleanModality = modality.trim();
  const identity = [cleanCode, cleanTitle].filter(Boolean).join(" - ");
  return cleanModality ? `${identity || cleanModality}${identity ? ` (${cleanModality})` : ""}` : identity;
};

const SINGLE_ROLES: RelationRole[] = ["syllabus", "calendar", "course", "tempo", "cover"];
export function canRelate(source: NodeItem, role: RelationRole, target: NodeItem): boolean {
  if (source.id === target.id) return false;
  if (source.type === "curso") return ({ syllabus: target.type === "pdf", calendar: target.type === "calendario", class: target.type === "video", cover: target.type === "imagen", content: true } as Partial<Record<RelationRole, boolean>>)[role] === true;
  if (source.type === "tarea") return ({ course: target.type === "curso", tempo: target.type === "tempo", material: true, relatedWork: true } as Partial<Record<RelationRole, boolean>>)[role] === true;
  return source.type === "tempo" && role === "calendar" && target.type === "calendario";
}
export function withRelation(nodes: NodeItem[], sourceId: string, role: RelationRole, targetId: string | null): NodeItem[] {
  const source = nodes.find((n) => n.id === sourceId);
  const target = nodes.find((n) => n.id === targetId);
  if (!source || (targetId !== null && (!target || !canRelate(source, role, target)))) return nodes;
  return nodes.map((n) => {
    if (n.id !== sourceId) return n;
    const previous = getNodalMeta(n.content).relations;
    const relations = previous.filter((r) => r.role !== role || (targetId !== null && !SINGLE_ROLES.includes(role)));
    if (targetId && !relations.some((r) => r.role === role && r.targetId === targetId)) relations.push({ role, targetId });
    return { ...n, content: setNodalMeta(n.content, { relations }) };
  });
}
export const withoutRelation = (nodes: NodeItem[], sourceId: string, role: RelationRole, targetId: string) => nodes.map((n) => n.id === sourceId ? { ...n, content: setNodalMeta(n.content, { relations: getNodalMeta(n.content).relations.filter((r) => r.role !== role || r.targetId !== targetId) }) } : n);
export const patchNodal = (nodes: NodeItem[], id: string, patch: Partial<NodalMeta>) => nodes.map((n) => n.id === id ? { ...n, content: setNodalMeta(n.content, patch) } : n);

export function calendarTempos(nodes: NodeItem[], calendarId: string): NodeItem[] {
  const courses = new Set(nodes.filter((n) => n.type === "curso" && relationId(n, "calendar") === calendarId).map((n) => n.id));
  const taskTempos = new Set(nodes.filter((n) => n.type === "tarea" && courses.has(relationId(n, "course") ?? "")).map((n) => relationId(n, "tempo")));
  return nodes.filter((n) => n.type === "tempo" && (relationId(n, "calendar") === calendarId || (!relationId(n, "calendar") && n.parentId === calendarId) || taskTempos.has(n.id)));
}
export function makeNode(nodes: NodeItem[], id: string, type: BaseNodeType, name: string, content = "<p><br></p>"): NodeItem {
  // Composition never assigns a Lore parent: deleting a source cannot cascade into its targets.
  return { id, type, name, parentId: null, order: nodes.filter((n) => !n.parentId).length, content };
}
export function ensureCourseCalendar(nodes: NodeItem[], courseId: string, id: string, name: string): NodeItem[] {
  const course = nodes.find((n) => n.id === courseId && n.type === "curso");
  if (!course || relationId(course, "calendar")) return nodes;
  return withRelation([...nodes, makeNode(nodes, id, "calendario", name, createCalendarContent())], courseId, "calendar", id);
}
export function scheduleTask(nodes: NodeItem[], taskId: string, tempoId: string, calendarId: string, calendarName: string, subtype: TempoSubtype): NodeItem[] {
  const task = nodes.find((n) => n.id === taskId && n.type === "tarea");
  if (!task || relationId(task, "tempo")) return nodes;
  const courseId = relationId(task, "course");
  const next = courseId ? ensureCourseCalendar(nodes, courseId, calendarId, calendarName) : nodes;
  const tempo = makeNode(next, tempoId, "tempo", task.name, createTempoContent({ date: localIsoDate(), startTime: null, endTime: null, subtype, endDate: null, color: DEFAULT_TEMPO_COLOR, weeklyVisualOrder: null, activeWeekdays: null }));
  return withRelation([...next, tempo], taskId, "tempo", tempoId);
}
