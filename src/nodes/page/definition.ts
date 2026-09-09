import { PALETTE } from "../../defs/palette";
import { defineNodeModule } from "../definition";
export const pageNodeModule = defineNodeModule({ type: "pagina", labelKey: "nodes.page.label", nodeNameKey: "nodes.page.nodeName", color: PALETTE.pagina, renderer: "page", capabilities: { openOnPrimaryAction: true }, creation: { available: true, selectAfterCreation: true }, typePanel: { visible: true }, defaultContent: "<p><br></p>" });
export const pageNodeDefinition = pageNodeModule.definition;
export const pageFolderNodeModule = defineNodeModule({ ...pageNodeDefinition, type: "pagina-carpeta", renderer: "page", labelKey: "nodes.pageFolder.label", nodeNameKey: "nodes.pageFolder.nodeName", color: PALETTE.paginaCarpeta, capabilities: { containChildren: true, openOnPrimaryAction: true } });
export const pageFolderNodeDefinition = pageFolderNodeModule.definition;
