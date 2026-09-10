import { PALETTE } from "../../defs/palette";
import { RICH_TEXT_CAPABILITY } from "../capabilities/definition";
import { defineNodeModule } from "../definition";

export const projectNodeModule = defineNodeModule({
  type: "proyecto",
  labelKey: "nodes.project.label",
  nodeNameKey: "nodes.project.nodeName",
  color: PALETTE.proyecto,
  renderer: "project",
  capabilities: { openOnPrimaryAction: true },
  composition: { capabilities: [RICH_TEXT_CAPABILITY] },
  creation: { available: false, selectAfterCreation: false },
  typePanel: { visible: true },
  defaultContent: "<p><br></p>",
});
