import { getImageResourceInfo } from "../../utils/imageResource";
import type { NodeRuntimeContribution } from "../runtimeTypes";

export const imageRuntime = {
  graphImageSource: (node) => getImageResourceInfo(node.content, node.name)?.src,
} satisfies NodeRuntimeContribution;
