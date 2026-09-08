import type { NodeItem } from "../../types/nodes";
import { createCalendarContent } from "../../utils/temporalMeta";
import { getNodalMeta } from "../metadata";
import { makeNode } from "../model";
import { relatedNode, relationId, withRelation } from "../relations";

export const courseTasks = (nodes: NodeItem[], courseId: string, evaluationsOnly = false) => nodes.filter((node) => node.type === "tarea" && relationId(node, "course") === courseId && (!evaluationsOnly || getNodalMeta(node.content).evaluation));

export const courseNodeName = (code: string, title: string, modality: string) => {
  const cleanCode = code.trim();
  const cleanTitle = title.trim();
  const cleanModality = modality.trim();
  const identity = [cleanCode, cleanTitle].filter(Boolean).join(" - ");
  return cleanModality ? `${identity || cleanModality}${identity ? ` (${cleanModality})` : ""}` : identity;
};

export function courseTitleFromName(course: NodeItem): string {
  const meta = getNodalMeta(course.content);
  let title = course.name.trim();
  if (meta.code && title.startsWith(`${meta.code} - `)) title = title.slice(meta.code.length + 3);
  if (meta.modality && title.endsWith(` (${meta.modality})`)) title = title.slice(0, -(meta.modality.length + 3));
  return title;
}

export function courseCalendarName(course: NodeItem, label = "Calendario"): string {
  return `${label} - ${getNodalMeta(course.content).courseTitle.trim() || courseTitleFromName(course)}`;
}

export function ensureCourseCalendar(nodes: NodeItem[], courseId: string, id: string, _name?: string): NodeItem[] {
  const course = nodes.find((node) => node.id === courseId && node.type === "curso");
  if (!course || relatedNode(nodes, course, "calendar")?.type === "calendario") return nodes;
  const calendar = { ...makeNode(nodes, id, "calendario", courseCalendarName(course), createCalendarContent()), loreHidden: true };
  return withRelation([...nodes, calendar], courseId, "calendar", id);
}

export function hasMissingCourseCalendar(nodes: NodeItem[]): boolean {
  return nodes.some((node) => node.type === "curso" && relatedNode(nodes, node, "calendar")?.type !== "calendario");
}

export function reconcileCourseCalendars(nodes: NodeItem[], deletedNodes: NodeItem[], label = "Calendario", newId = () => crypto.randomUUID()) {
  let next = nodes;
  let trash = deletedNodes;
  for (const original of nodes.filter((node) => node.type === "curso")) {
    let course = next.find((node) => node.id === original.id)!;
    const relations = getNodalMeta(course.content).relations.filter((relation) => relation.role === "calendar");
    let calendar = relations.map((relation) => [...next, ...trash].find((node) => node.id === relation.targetId && node.type === "calendario")).find(Boolean);
    if (calendar && !next.some((node) => node.id === calendar!.id)) {
      const recovering = synchronizedNodeIds(trash, [calendar.id]);
      const restored = trash.filter((node) => recovering.has(node.id) && !next.some((active) => active.id === node.id));
      const activeIds = new Set([...next, ...restored].map((node) => node.id));
      next = [...next, ...restored.map((node) => node.parentId && !activeIds.has(node.parentId) ? { ...node, parentId: null } : node)];
      trash = trash.filter((node) => !recovering.has(node.id));
    }
    if (!calendar) {
      next = ensureCourseCalendar(next, course.id, newId());
      course = next.find((node) => node.id === course.id)!;
      calendar = relatedNode(next, course, "calendar")!;
    }
    if (relations.length !== 1 || relations[0]?.targetId !== calendar.id) next = withRelation(next, course.id, "calendar", calendar.id);
    const name = courseCalendarName(course, label);
    if (calendar.name !== name) next = next.map((node) => node.id === calendar!.id ? { ...node, name } : node);
  }
  return { nodes: next, deletedNodes: trash };
}

export function synchronizedNodeIds(nodes: NodeItem[], selected: Iterable<string>): Set<string> {
  const ids = new Set(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      const calendarId = node.type === "curso" ? relationId(node, "calendar") : undefined;
      if (calendarId && ids.has(node.id) && !ids.has(calendarId)) { ids.add(calendarId); changed = true; }
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) { ids.add(node.id); changed = true; }
    }
  }
  return ids;
}

export function courseAwareDeletionIds(nodes: NodeItem[], selected: Iterable<string>): Set<string> {
  const ids = synchronizedNodeIds(nodes, selected);
  for (const course of nodes.filter((node) => node.type === "curso" && !ids.has(node.id))) {
    const calendar = relatedNode(nodes, course, "calendar");
    if (calendar?.type === "calendario") for (const id of synchronizedNodeIds(nodes, [calendar.id])) ids.delete(id);
  }
  return ids;
}
