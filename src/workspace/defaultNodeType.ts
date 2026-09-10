import { NODE_REGISTRY } from "../defs/nodeTypes";
import type { BaseNodeType } from "../types/nodes";

export function readDefaultNodeType(projectKey: string): BaseNodeType {
  const stored = localStorage.getItem(`hisfuture.settings.default-node-type.${projectKey}`);
  return NODE_REGISTRY.availableForCreation().some((definition) => definition.type === stored)
    ? stored as BaseNodeType
    : "pagina";
}