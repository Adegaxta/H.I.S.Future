import type { NodeItem } from "../../types/nodes";
import { relationId } from "../relations";

export function calendarTempos(nodes: NodeItem[], calendarId: string): NodeItem[] {
  const courses = new Set(nodes.filter((node) => node.type === "curso" && relationId(node, "calendar") === calendarId).map((node) => node.id));
  const taskTempos = new Set(nodes.filter((node) => node.type === "tarea" && courses.has(relationId(node, "course") ?? "")).map((node) => relationId(node, "tempo")));
  return nodes.filter((node) => node.type === "tempo" && (relationId(node, "calendar") === calendarId || (!relationId(node, "calendar") && node.parentId === calendarId) || taskTempos.has(node.id)));
}
