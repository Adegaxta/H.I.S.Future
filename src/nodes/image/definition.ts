import { PALETTE } from "../../defs/palette";
import { defineNodeModule } from "../definition";
export const imageNodeModule = defineNodeModule({ type: "imagen", labelKey: "nodes.image.label", nodeNameKey: "nodes.image.nodeName", color: PALETTE.imagen, renderer: "image", capabilities: { openOnPrimaryAction: true }, creation: { available: false, selectAfterCreation: false }, typePanel: { visible: true }, concept: { id: "images", labelKey: "concepts.images" }, defaultContent: "<p><br></p>" });
export const imageNodeDefinition = imageNodeModule.definition;
