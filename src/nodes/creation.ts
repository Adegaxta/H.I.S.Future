import type { BaseNodeType, NodeItem } from "../types/nodes";
import { getNodeDefinition, hasNodeCapability } from "./registry";
import { getNodalMeta, setNodalMeta } from "./metadata";
import { createCalendarContent } from "../utils/temporalMeta";
import { getPageMeta, setPageMeta } from "../utils/pageMeta";
import { isVaultPrimaryNode } from "./project/domain";
import { getChildren, reorderNodes, wouldCreateCycle } from "../utils/nodeTree";

export interface NodeCreationDraft {
  name: string; description: string; type: BaseNodeType; tagIds: string[];
  parentId: string | null; childId: string | null; confirmedChildParentId: string | null;
  destination: "lore" | "vault";
}
export function buildNodeCreation(nodes: NodeItem[], id: string, draft: NodeCreationDraft): NodeItem[] {
  if (!draft.name.trim() || !getNodeDefinition(draft.type).creation.available) throw new Error("Invalid node creation");
  if (draft.parentId && !nodes.some(node => node.id === draft.parentId)) throw new Error("Parent unavailable");
  if (draft.tagIds.length && !hasNodeCapability(draft.type, "tags")) throw new Error("Tags unavailable for this type");
  const child = nodes.find(node => node.id === draft.childId);
  if (draft.childId && (!child || isVaultPrimaryNode(child) || getNodalMeta(child.content).pinned || getNodalMeta(child.content).protected)) throw new Error("Child unavailable");
  if (child && child.parentId !== draft.confirmedChildParentId) throw new Error("Child parent changed; select it again");
  if (child && draft.parentId && wouldCreateCycle(nodes, child.id, draft.parentId)) throw new Error("Hierarchy cycle");
  const defaultContent = draft.type === "calendario" ? createCalendarContent() : getNodeDefinition(draft.type).defaultContent;
  const content = (draft.type === "pagina" || draft.type === "proyecto") ? setPageMeta(defaultContent, { ...getPageMeta(defaultContent), description: draft.description.trim() }) : setNodalMeta(defaultContent, { description: draft.description.trim() });
  let next: NodeItem[] = [...nodes, { id, name: draft.name.trim(), type: draft.type, parentId: draft.parentId,
    order: getChildren(nodes, draft.parentId).length, loreHidden: draft.destination === "vault",
    content }];
  if (child) next = reorderNodes(next, child.id, id, "inside");
  return next;
}
