import { useEffect, useState } from "react";
import type { NodeItem } from "../../types/nodes";
import { getPdfResourceInfo } from "../../utils/pdfResource";
import { readProjectResource } from "../../project/resourceRepository";
import { useLocale } from "../../i18n/LocaleContext";
import PdfViewer from "../../components/PdfViewer";
import NodeTypeLabel from "../../components/NodeTypeLabel";
import { measureLifecyclePhase } from "../../lifecycle/metrics";

export default function PdfNodeView({ node }: { node: NodeItem }) {
  const { t } = useLocale();
  const resource = getPdfResourceInfo(node.content);
  const [data, setData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    if (!resource) {
      setError(t("pdf.invalidResource"));
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

  return <>
    <header className="pdf-node-view__header"><NodeTypeLabel type="pdf" /><h1 className="editor-page__title">{node.name}</h1></header>
    {error ? <div className="pdf-node-view__error">{error}</div> : !data ? <div className="pdf-node-view__loading">{t("pdf.loading")}</div> : <PdfViewer data={data} resourceId={resource?.resourceId} />}
  </>;
}
