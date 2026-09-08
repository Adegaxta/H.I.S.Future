import type { NodeItem } from "../../types/nodes";
import { createTempoContent, DEFAULT_TEMPO_COLOR, localIsoDate, type TempoSubtype } from "../../utils/temporalMeta";
import { ensureCourseCalendar } from "../course/domain";
import { makeNode } from "../model";
import { relationId, withRelation } from "../relations";

export function scheduleTask(nodes: NodeItem[], taskId: string, tempoId: string, calendarId: string, calendarName: string, subtype: TempoSubtype): NodeItem[] {
  const task = nodes.find((node) => node.id === taskId && node.type === "tarea");
  if (!task || relationId(task, "tempo")) return nodes;
  const courseId = relationId(task, "course");
  const next = courseId ? ensureCourseCalendar(nodes, courseId, calendarId, calendarName) : nodes;
  const tempo = makeNode(next, tempoId, "tempo", task.name, createTempoContent({ date: localIsoDate(), startTime: null, endTime: null, subtype, endDate: null, color: DEFAULT_TEMPO_COLOR, weeklyVisualOrder: null, activeWeekdays: null }));
  return withRelation([...next, tempo], taskId, "tempo", tempoId);
}
