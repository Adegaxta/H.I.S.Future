import { PALETTE } from "../../defs/palette";
import { defineNodeModule } from "../definition";
export const videoNodeModule = defineNodeModule({ type: "video", labelKey: "nodes.video.label", nodeNameKey: "nodes.video.nodeName", color: PALETTE.video, renderer: "video", capabilities: { openOnPrimaryAction: true }, creation: { available: true, selectAfterCreation: true }, typePanel: { visible: true }, defaultContent: "<p><br></p>" });
export const videoNodeDefinition = videoNodeModule.definition;
