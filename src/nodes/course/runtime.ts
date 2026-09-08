import type { NodeRuntimeContribution } from "../runtimeTypes";
import { setNodalMeta } from "../metadata";
import { courseTitleFromName } from "./domain";

export const courseRuntime = {
  rename: (renamedNode) => ({
    ...renamedNode,
    content: setNodalMeta(renamedNode.content, {
      courseTitle: courseTitleFromName(renamedNode),
    }),
  }),
} satisfies NodeRuntimeContribution;
