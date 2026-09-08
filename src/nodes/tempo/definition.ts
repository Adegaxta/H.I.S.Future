import { PALETTE } from "../../defs/palette";
import { defineNodeModule } from "../definition";
export const tempoNodeModule = defineNodeModule({ type: "tempo", labelKey: "nodes.tempo.label", nodeNameKey: "nodes.tempo.nodeName", color: PALETTE.tempo, renderer: "tempo", capabilities: { openOnPrimaryAction: true }, creation: { available: false, selectAfterCreation: false }, typePanel: { visible: true }, defaultContent: "<p><br></p>", relations: { calendar: { cardinality: "one", targetTypes: ["calendario"] } } });
export const tempoNodeDefinition = tempoNodeModule.definition;
