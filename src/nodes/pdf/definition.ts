import { PALETTE } from "../../defs/palette";
import { defineNodeModule } from "../definition";
export const pdfNodeModule = defineNodeModule({ type: "pdf", labelKey: "nodes.pdf.label", nodeNameKey: "nodes.pdf.nodeName", color: PALETTE.pdf, renderer: "pdf", capabilities: { openOnPrimaryAction: true }, creation: { available: false, selectAfterCreation: false }, typePanel: { visible: true }, concept: { id: "pdf", labelKey: "concepts.pdf", categoryId: "documents" }, defaultContent: "<p><br></p>" });
export const pdfNodeDefinition = pdfNodeModule.definition;
