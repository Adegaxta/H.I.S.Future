import { PALETTE } from "../../defs/palette";
import { defineNodeModule } from "../definition";
export const taskNodeModule = defineNodeModule({ type: "tarea", labelKey: "nodes.task.label", nodeNameKey: "nodes.task.nodeName", color: PALETTE.tarea, renderer: "task", capabilities: { openOnPrimaryAction: true }, creation: { available: true, selectAfterCreation: true }, typePanel: { visible: true }, concept: { id: "tasks", labelKey: "concepts.tasks" }, defaultContent: "<p><br></p>", relations: { course: { cardinality: "one", targetTypes: ["curso"] }, tempo: { cardinality: "one", targetTypes: ["tempo"] }, material: { cardinality: "many" }, relatedWork: { cardinality: "many" } } });
export const taskNodeDefinition = taskNodeModule.definition;
