import { useEffect, useMemo, useRef } from "react";
import type { NodeItem } from "../types/nodes";
import type { NodeViewHost } from "../nodes/rendering";
import type { PdfExportSettings } from "./NodeActionDialog";
import RegisteredNodeView from "./RegisteredNodeView";
import "../export/print.css";

interface PrintDocumentProps {
  node: NodeItem;
  host: NodeViewHost;
  settings: PdfExportSettings;
  onReady: (editor: HTMLDivElement) => void;
}

const PAGE_SIZES = { a3: "A3", a4: "A4", letter: "Letter" } as const;

export default function PrintDocument({ node, host, settings, onReady }: PrintDocumentProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const notifiedRef = useRef(false);
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
        onReady(editorRef.current);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [node.id, onReady]);

  const pageSize = PAGE_SIZES[settings.pageSize];
  return <><style>{`@page { size: ${pageSize} ${settings.orientation}; margin: 12mm; }`}</style><div className="his-print-document" aria-hidden="true"><RegisteredNodeView node={node} host={printHost} mode="print" /></div></>;
}