import type { NodeItem } from "../types/nodes";

export function getUniqueNodeName(baseName: string, nodes: Pick<NodeItem, "name">[]): string {
  const base = baseName.trim() || "Nodo";
  const used = new Set(nodes.map((node) => node.name.trim().toLocaleLowerCase()));
  if (!used.has(base.toLocaleLowerCase())) return base;

  let suffix = 2;
  while (used.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}
