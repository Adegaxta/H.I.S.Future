import { PALETTE } from "../../defs/palette";
import { defineNodeModule } from "../definition";
export const pdfNodeModule = defineNodeModule({ type: "pdf", labelKey: "nodes.pdf.label", nodeNameKey: "nodes.pdf.nodeName", color: PALETTE.pdf, renderer: "pdf", capabilities: { openOnPrimaryAction: true }, creation: { available: true, selectAfterCreation: true }, typePanel: { visible: true }, defaultContent: "<p><br></p>" });
export const pdfNodeDefinition = pdfNodeModule.definition;
