import type { TranslationKey } from "../i18n/translations";
import { getNodalMeta } from "../nodes/metadata";
import { getNodeGraphImageSource, getNodeGraphRelationIds } from "../nodes/runtime";
import { NODE_REGISTRY, getNodeDefinition } from "../defs/nodeTypes";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import type { RelationRole } from "../nodes/relationTypes";

export type GraphVertexKind = "node" | "type-hub";
export type GraphVertexProvenance = "nodal-node" | "node-registry";

export interface GraphVertex {
  id: string;
  label: string;
  kind: GraphVertexKind;
  provenance: GraphVertexProvenance;
  color: string;
  nodeType?: BaseNodeType;
  typeId?: BaseNodeType;
  imageSrc?: string;
}

export type GraphEdgeKind =
  | "nodal-relation"
  | "mention-reference"
  | "grouping"
  | "legacy-runtime-derived";

export type GraphEdgeProvenance =
  | "nodal-metadata"
  | "editor-content"
  | "node-registry"
  | "runtime-contribution";

export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
  provenance: GraphEdgeProvenance;
  role?: RelationRole;
  derived: boolean;
  targetMissing: boolean;
  occurrence?: number;
}

export interface GraphDiagnostic {
  code: "missing-target";
  kind: GraphEdgeKind;
  provenance: GraphEdgeProvenance;
  sourceId: string;
  targetId: string;
  role?: RelationRole;
}

export interface GraphProjection {
  vertices: GraphVertex[];
  edges: GraphEdge[];
  diagnostics: GraphDiagnostic[];
}

export interface GraphProjectionOptions {
  showTypes: boolean;
  translate: (key: TranslationKey) => string;
}

function mentionTargets(node: NodeItem): string[] {
  const source = new DOMParser().parseFromString(node.content, "text/html");
  return Array.from(source.querySelectorAll<HTMLElement>("[data-mention-id]"))
    .map((element) => element.dataset.mentionId)
    .filter((id): id is string => Boolean(id && id !== node.id));
}

export function buildGraphProjection(
  nodes: readonly NodeItem[],
  { showTypes, translate }: GraphProjectionOptions,
): GraphProjection {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const vertices: GraphVertex[] = nodes.map((node) => ({
    id: node.id,
    label: node.name,
    kind: "node",
    provenance: "nodal-node",
    color: getNodeDefinition(node.type).color,
    nodeType: node.type,
    imageSrc: getNodeGraphImageSource(node),
  }));
  const edges: GraphEdge[] = [];
  const diagnostics: GraphDiagnostic[] = [];
  const explicitTargets = new Set(
    nodes.flatMap((node) =>
      getNodalMeta(node.content).relations.map((relation) => `${node.id}\u0000${relation.targetId}`),
    ),
  );

  if (showTypes) {
    const definitions = NODE_REGISTRY.all();
    vertices.push(
      ...definitions.map((definition) => ({
        id: `type-hub-${definition.type}`,
        label: translate(definition.labelKey),
        kind: "type-hub" as const,
        provenance: "node-registry" as const,
        color: definition.color,
        nodeType: definition.type,
        typeId: definition.type,
      })),
    );
    nodes.forEach((node) => {
      if (NODE_REGISTRY.find(node.type)) {
        edges.push({
          from: `type-hub-${node.type}`,
          to: node.id,
          kind: "grouping",
          provenance: "node-registry",
          derived: true,
          targetMissing: false,
        });
      }
    });
  }

  const addEdge = (edge: Omit<GraphEdge, "targetMissing">) => {
    const targetMissing = !nodesById.has(edge.to);
    edges.push({ ...edge, targetMissing });
    if (targetMissing) {
      diagnostics.push({
        code: "missing-target",
        kind: edge.kind,
        provenance: edge.provenance,
        sourceId: edge.from,
        targetId: edge.to,
        ...(edge.role ? { role: edge.role } : {}),
      });
    }
  };

  nodes.forEach((node) => {
    getNodeGraphRelationIds(node, nodesById).forEach((targetId) => {
      if (explicitTargets.has(`${node.id}\u0000${targetId}`)) return;
      addEdge({
        from: targetId,
        to: node.id,
        kind: "legacy-runtime-derived",
        provenance: "runtime-contribution",
        derived: true,
      });
    });
  });

  nodes.forEach((node) => {
    mentionTargets(node).forEach((targetId, occurrence) => {
      addEdge({
        from: node.id,
        to: targetId,
        kind: "mention-reference",
        provenance: "editor-content",
        derived: false,
        occurrence,
      });
    });

    getNodalMeta(node.content).relations.forEach((relation) => {
      if (relation.targetId === node.id) return;
      addEdge({
        from: node.id,
        to: relation.targetId,
        kind: "nodal-relation",
        provenance: "nodal-metadata",
        role: relation.role,
        derived: false,
      });
    });
  });

  return { vertices, edges, diagnostics };
}
