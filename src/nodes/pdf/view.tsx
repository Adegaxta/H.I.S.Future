import { pdfFileImportModule } from "./fileImport";
import { getNodalMeta, setNodalMeta } from "../metadata";
import { useEffect, useState, useRef } from "react";
import type { NodeItem } from "../../types/nodes";
import { getPdfResourceInfo } from "../../utils/pdfResource";
import { readProjectResource } from "../../project/resourceRepository";
import { useLocale } from "../../i18n/LocaleContext";
import PdfViewer from "../../components/PdfViewer";
import NodeTypeLabel from "../../components/NodeTypeLabel";
import { measureLifecyclePhase } from "../../lifecycle/metrics";

export default function PdfNodeView({ node, onContentChange, onRename, onAttachFile }: { node: NodeItem; onContentChange?: (id: string, content: string) => void; onRename?: (id: string, name: string) => void; onAttachFile?: (id: string, name: string, content: string) => void }) {
  const { t } = useLocale();
  const resource = getPdfResourceInfo(node.content);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    if (!resource) {
      setError(null);
      return () => { active = false; };
    }
    const resourceId = resource.resourceId;
    void measureLifecyclePhase("pdf.read-resource", () => readProjectResource("pdf", resourceId))
      .then((bytes) => { if (active) setData(bytes); })
      .catch((reason) => {
        console.error("[pdf] resource read failed", { nodeId: node.id, resourceId, reason });
        if (active) setError(t("pdf.loadError"));
      });
    return () => { active = false; };
  }, [node.id, resource?.resourceId, t]);

  const upload = async (file: File) => {
    setUploading(true); setError(null);
    try {
      const prepared = await pdfFileImportModule.prepare(file, { nodes: [], createNode: () => "" });
      if ("draft" in prepared) {
        try {
          const content = setNodalMeta(prepared.draft.content, getNodalMeta(node.content));
          if (onAttachFile) onAttachFile(node.id, prepared.draft.name, content);
          else { onContentChange?.(node.id, content); onRename?.(node.id, prepared.draft.name); }
        } catch (reason) { await prepared.rollback?.(); throw reason; }
      }
    } catch { setError(t("fileImport.pdfInvalid")); }
    finally { setUploading(false); }
  };

  return <>
    <header className="pdf-node-view__header"><NodeTypeLabel type="pdf" node={node} /><h1 className="editor-page__title">{node.name}</h1></header>
    {!resource ? <div className="pdf-node-view__empty"><p>{t("nodeCreation.emptyPdf")}</p>{onContentChange && <><button type="button" disabled={uploading} onClick={() => uploadRef.current?.click()}>{t(uploading ? "nodeCreation.uploading" : "nodeCreation.uploadPdf")}</button><input ref={uploadRef} hidden disabled={uploading} type="file" accept="application/pdf,.pdf" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></>}{error && <p role="alert">{error}</p>}</div> : error ? <div className="pdf-node-view__error">{error}</div> : !data ? <div className="pdf-node-view__loading">{t("pdf.loading")}</div> : <PdfViewer data={data} resourceId={resource?.resourceId} />}
  </>;
}
