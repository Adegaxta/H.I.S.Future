import { PALETTE } from "../../defs/palette";
import { defineNodeModule } from "../definition";
export const calendarNodeModule = defineNodeModule({ type: "calendario", labelKey: "nodes.calendar.label", nodeNameKey: "nodes.calendar.nodeName", color: PALETTE.calendario, renderer: "calendar", capabilities: { containChildren: true, openOnPrimaryAction: true, navigateWithinView: true }, creation: { available: false, selectAfterCreation: false }, typePanel: { visible: true }, defaultContent: "<p><br></p>" });
export const calendarNodeDefinition = calendarNodeModule.definition;
