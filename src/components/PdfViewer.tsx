import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "../pdf/pdfjs";
import { getDocument, TextLayer } from "../pdf/pdfjs";
import { useLocale } from "../i18n/LocaleContext";
import { measureLifecyclePhase } from "../lifecycle/metrics";
import { getActiveCloseProjectTraceId, recordCloseProjectPhase } from "../lifecycle/metrics";
import { PdfDocumentSession } from "../pdf/PdfDocumentSession";

interface PdfViewerProps {
  data: Uint8Array;
  resourceId?: string;
}

let nextViewerInstance = 0;

function pdfFailureDetails(error: unknown, data: Uint8Array, instanceId: string, resourceId?: string) {
  const reason = error instanceof Error ? error : new Error(String(error));
  return {
    instanceId,
    resourceId,
    name: reason.name,
    message: reason.message,
    cause: "cause" in reason ? (reason as Error & { cause?: unknown }).cause : undefined,
    stack: reason.stack,
    byteLength: data.byteLength,
    bufferByteLength: data.buffer.byteLength,
  };
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
      await measureLifecyclePhase(`pdf.page-${pageNumber}.render`, () =>
        Promise.all([renderTask!.promise, textLayer!.render()]).then(() => undefined),
      );
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

function LazyPdfPage({ document, pageNumber, scale }: {
  document: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}) {
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(pageNumber === 1);

  useEffect(() => {
    if (shouldRender || !placeholderRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldRender(true);
        observer.disconnect();
      }
    }, { rootMargin: "900px 0px" });
    observer.observe(placeholderRef.current);
    return () => observer.disconnect();
  }, [shouldRender]);

  if (shouldRender) {
    return <PdfPage document={document} pageNumber={pageNumber} scale={scale} />;
  }
  return <div ref={placeholderRef} className="pdf-viewer__page pdf-viewer__page--placeholder" aria-hidden="true" />;
}

export default function PdfViewer({ data, resourceId }: PdfViewerProps) {
  const { t } = useLocale();
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [scale, setScale] = useState(1.25);
  const [error, setError] = useState<string | null>(null);
  const instanceIdRef = useRef(`pdf-viewer-${++nextViewerInstance}`);
  const sessionRef = useRef<PdfDocumentSession<PDFDocumentProxy> | null>(null);

  useEffect(() => {
    let active = true;
    const instanceId = instanceIdRef.current;
    let session = sessionRef.current;
    if (!session || session.data !== data || session.isDestroyed()) {
      const loadingTask = getDocument({ data });
      session = new PdfDocumentSession(data, loadingTask);
      sessionRef.current = session;
      console.info(`[pdf][${instanceId}] loading task created`, {
        resourceId,
        byteLength: data.byteLength,
        bufferByteLength: data.buffer.byteLength,
      });
    }
    const lease = session.acquire();
    setDocument(null);
    setError(null);
    void measureLifecyclePhase("pdf.decode-document", () => lease.promise).then((loaded) => {
      if (active) setDocument(loaded);
    }).catch((reason) => {
      if (active) {
        console.error(`[pdf][${instanceId}] document load failed`, pdfFailureDetails(reason, data, instanceId, resourceId));
        setError(t("pdf.loadError"));
      }
    });
    return () => {
      active = false;
      const cleanupTraceId = getActiveCloseProjectTraceId();
      lease.release((durationMs) => {
        recordCloseProjectPhase(cleanupTraceId, "PDF cleanup", durationMs);
        console.info(`[pdf][${instanceId}] loading task destroyed in ${durationMs.toFixed(1)} ms`);
      });
    };
  }, [data, resourceId, t]);

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
            <LazyPdfPage key={index + 1} document={document} pageNumber={index + 1} scale={scale} />
          ))
        )}
      </div>
    </div>
  );
}
