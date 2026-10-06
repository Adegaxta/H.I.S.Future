import { useEffect, useMemo, useRef } from "react";
import type { NodeItem } from "../types/nodes";
import type { NodeViewHost } from "../nodes/rendering";
import type { PdfExportSettings } from "./NodeActionDialog";
import RegisteredNodeView from "./RegisteredNodeView";
import "../export/print.css";
import { acquireImageSource, hydrateEditorImageMentions, type ResolvedImageLease } from "../utils/imageRuntimeResolver";
import { getPageMeta } from "../utils/pageMeta";
import { getNodalMeta } from "../nodes/metadata";

interface PrintDocumentProps {
  node: NodeItem;
  host: NodeViewHost;
  settings: PdfExportSettings;
  onReady: (editor: HTMLDivElement) => void;
  onError: (error: Error) => void;
}

const PAGE_SIZES = { a3: "A3", a4: "A4", letter: "Letter" } as const;
const waitForImageSource = (source: string) => new Promise<void>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve();
  image.onerror = () => reject(new Error("No se pudo cargar un recurso de imagen para imprimir."));
  image.src = source;
});

export default function PrintDocument({ node, host, settings, onReady, onError }: PrintDocumentProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const notifiedRef = useRef(false);
  const printLeasesRef = useRef<ResolvedImageLease[]>([]);
  const printHost = useMemo<NodeViewHost>(() => ({
    ...host,
    editor: { ...host.editor, ref: editorRef, pendingNodeDrop: null },
  }), [host]);

  useEffect(() => {
    notifiedRef.current = false;
    console.info("[PDF] PrintDocument mounted");
    const frame = requestAnimationFrame(() => {
      if (editorRef.current && !notifiedRef.current) {
        notifiedRef.current = true;
        const editor = editorRef.current;
        const pageMeta = getPageMeta(node.content);
        const referencedIds = new Set([
          ...(node.type === "imagen" ? [node.id] : []),
          ...[pageMeta.iconNodeId, pageMeta.coverNodeId].filter((id): id is string => Boolean(id)),
          ...getNodalMeta(node.content).relations.filter((relation) => relation.role === "cover").map((relation) => relation.targetId),
        ]);
        const referencedImages = host.data.nodes.filter((candidate) => referencedIds.has(candidate.id) && candidate.type === "imagen");
        void Promise.all([
          hydrateEditorImageMentions(editor, host.data.nodes, { strict: true }),
          ...referencedImages.map((imageNode) => acquireImageSource(imageNode).then(async (lease) => {
            printLeasesRef.current.push(lease);
            await waitForImageSource(lease.src);
          })),
        ])
          .then(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
          .then(() => onReady(editor))
          .catch((reason) => onError(reason instanceof Error ? reason : new Error(String(reason))));
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      printLeasesRef.current.splice(0).forEach((lease) => lease.release());
    };
  }, [host.data.nodes, node.id, onError, onReady]);

  const pageSize = PAGE_SIZES[settings.pageSize];
  return <><style>{`@page { size: ${pageSize} ${settings.orientation}; margin: 12mm; }`}</style><div className="his-print-document" aria-hidden="true"><RegisteredNodeView node={node} host={printHost} mode="print" /></div></>;
}
