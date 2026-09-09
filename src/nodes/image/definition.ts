import { PALETTE } from "../../defs/palette";
import { defineNodeModule } from "../definition";
export const imageNodeModule = defineNodeModule({ type: "imagen", labelKey: "nodes.image.label", nodeNameKey: "nodes.image.nodeName", color: PALETTE.imagen, renderer: "image", capabilities: { openOnPrimaryAction: true }, creation: { available: false, selectAfterCreation: false }, typePanel: { visible: true }, defaultContent: "<p><br></p>" });
export const imageNodeDefinition = imageNodeModule.definition;
