import { PALETTE } from "../../defs/palette";
import { defineNodeModule } from "../definition";
export const categoryNodeModule = defineNodeModule({ type: "categoria", labelKey: "nodes.category.label", nodeNameKey: "nodes.category.nodeName", color: PALETTE.categoria, renderer: "folder", capabilities: { containChildren: true }, creation: { available: true, selectAfterCreation: false }, typePanel: { visible: true }, defaultContent: "<p><br></p>" });
export const categoryNodeDefinition = categoryNodeModule.definition;
