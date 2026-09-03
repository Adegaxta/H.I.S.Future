import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "../pdf/pdfjs";
import { getDocument, TextLayer } from "../pdf/pdfjs";
import { useLocale } from "../i18n/LocaleContext";

interface PdfViewerProps {
  data: Uint8Array;
}

function PdfPage({ document, pageNumber, scale }: {
  document: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}) {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;

    const render = async () => {
      page = await document.getPage(pageNumber);
      if (cancelled || !canvasRef.current || !textLayerRef.current) return;
      const viewport = page.getViewport({ scale });
      const outputScale = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const textContainer = textLayerRef.current;
      textContainer.replaceChildren();
      textContainer.style.width = `${viewport.width}px`;
      textContainer.style.height = `${viewport.height}px`;
      textContainer.style.setProperty("--scale-factor", String(viewport.scale));
      textContainer.style.setProperty("--total-scale-factor", String(viewport.scale));

      renderTask = page.render({
        canvas,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      textLayer = new TextLayer({
        textContentSource: page.streamTextContent({
          includeMarkedContent: true,
          disableNormalization: true,
        }),
        container: textContainer,
        viewport,
      });
      await Promise.all([renderTask.promise, textLayer.render()]);
    };

    void render().catch((error) => {
      if (!cancelled && error?.name !== "RenderingCancelledException") console.error(error);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      page?.cleanup();
    };
  }, [document, pageNumber, scale]);

  return (
    <section className="pdf-viewer__page" aria-label={t("pdf.pageLabel", { page: pageNumber })}>
      <canvas ref={canvasRef} />
      <div ref={textLayerRef} className="textLayer" />
    </section>
  );
}

export default function PdfViewer({ data }: PdfViewerProps) {
  const { t } = useLocale();
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [scale, setScale] = useState(1.25);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadingTask = getDocument({ data: data.slice() });
    setDocument(null);
    setError(null);
    void loadingTask.promise.then((loaded) => {
      if (active) setDocument(loaded);
      else void loadingTask.destroy();
    }).catch((reason) => {
      if (active) {
        console.error(reason);
        setError(t("pdf.loadError"));
      }
    });
    return () => {
      active = false;
      void loadingTask.destroy();
    };
  }, [data, t]);

  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer__toolbar">
        <button type="button" onClick={() => setScale((value) => Math.max(0.5, value - 0.25))} aria-label={t("pdf.zoomOut")}>
          −
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => setScale((value) => Math.min(3, value + 0.25))} aria-label={t("pdf.zoomIn")}>
          +
        </button>
      </div>
      <div className="pdf-viewer__document">
        {error ? (
          <div className="pdf-viewer__state is-error">{error}</div>
        ) : !document ? (
          <div className="pdf-viewer__state">{t("pdf.loading")}</div>
        ) : (
          Array.from({ length: document.numPages }, (_, index) => (
            <PdfPage key={index + 1} document={document} pageNumber={index + 1} scale={scale} />
          ))
        )}
      </div>
    </div>
  );
}
