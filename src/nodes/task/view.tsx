import { useState } from "react";
import type { NodeItem } from "../../types/nodes";
import { ensureCourseCalendar } from "../course/domain";
import { getNodalMeta } from "../metadata";
import { patchNodal, relatedNode, withRelation, withoutRelation } from "../relations";
import { scheduleTask } from "./domain";
import type { TimeFormat } from "../../utils/temporalMeta";
import { useLocale } from "../../i18n/LocaleContext";
import NodeTypeLabel from "../../components/NodeTypeLabel";
import TempoInspector from "../tempo/view";
import { NodalIcon, NodePicker, NodeReference, NodeReferenceList, type NodalViewProps } from "../../components/NodeReferences";
import { NodeNameInput } from "../viewPrimitives";

export function TaskNodeView(props: NodalViewProps & { deletedNodes: NodeItem[]; timeFormat: TimeFormat; setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; onDelete: (id: string) => void }) {
  const { node, nodes, onMutate, onOpen, onRename, onImport, deletedNodes, timeFormat, setExpanded } = props;
  const { t } = useLocale(); const [picker, setPicker] = useState<"course"|"material"|"relatedWork"|null>(null);
  const meta = getNodalMeta(node.content); const course = relatedNode(nodes,node,"course"); const tempo = relatedNode(nodes,node,"tempo");
  const patch = (value: Parameters<typeof patchNodal>[2]) => onMutate((c) => patchNodal(c,node.id,value));
  const remove = (role: "material"|"relatedWork", id: string) => onMutate((c) => withoutRelation(c,node.id,role,id));
  const addTempo = (subtype: "daily"|"weekly") => onMutate((c) => scheduleTask(c,node.id,crypto.randomUUID(),crypto.randomUUID(),`${node.name} · Calendar`,subtype));
  return <section className="task-node-view"><NodeTypeLabel type="tarea" /><NodeNameInput node={node} onRename={onRename} className="nodal-title" />
    <div className="task-summary">{course ? <NodeReference node={course} nodes={nodes} onOpen={onOpen} /> : <button onClick={() => setPicker("course")}>{t("task.course")}</button>}<label><NodalIcon name="state" />{t("task.status")}<select value={meta.status} onChange={(e) => patch({ status: e.target.value as typeof meta.status })}><option value="pending">{t("task.pending")}</option><option value="progress">{t("task.progress")}</option><option value="done">{t("task.done")}</option></select></label><label><NodalIcon name="Evaluation" />{t("task.evaluation")}<input type="checkbox" checked={meta.evaluation} onChange={(e) => patch({ evaluation: e.target.checked })} /></label></div>
    <div className="task-body"><aside><h2><NodalIcon name="material" />{t("task.material")}</h2><button className="nodal-add" onClick={() => setPicker("material")}>＋</button><NodeReferenceList source={node} role="material" nodes={nodes} onOpen={onOpen} onRemove={(id) => remove("material",id)} /><h2><NodalIcon name="task" />{t("task.work")}</h2><button className="nodal-add" onClick={() => setPicker("relatedWork")}>＋</button><NodeReferenceList source={node} role="relatedWork" nodes={nodes} onOpen={onOpen} onRemove={(id) => remove("relatedWork",id)} /></aside><main>{tempo ? <TempoInspector tempo={tempo} nodes={nodes} deletedNodes={deletedNodes} timeFormat={timeFormat} variant="standalone" onRename={onRename} onContentChange={(id,content) => onMutate((c) => c.map((n) => n.id === id ? {...n,content}:n))} setExpanded={setExpanded} onOpenDeletedNode={() => undefined} onOpenNodeView={(id) => onOpen(id)} onFileImport={(file) => onImport(file)} /> : <div className="task-tempo-empty"><span><NodalIcon name="undated" />{t("task.undated")}</span><button onClick={() => addTempo("daily")}>{t("task.daily")}</button><button onClick={() => addTempo("weekly")}>{t("task.weekly")}</button></div>}</main></div>
    {picker && <NodePicker nodes={nodes.filter((n) => n.id !== node.id)} types={picker === "course" ? ["curso"] : undefined} onChoose={(id) => onMutate((current) => {
      const related = withRelation(current,node.id,picker,id);
      return picker === "course" && tempo ? ensureCourseCalendar(related,id,crypto.randomUUID(),`${nodes.find((n) => n.id === id)?.name ?? node.name} · Calendar`) : related;
    })} onImport={picker !== "course" ? onImport : undefined} onClose={() => setPicker(null)} />}
  </section>;
}
