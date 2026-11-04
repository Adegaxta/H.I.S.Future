import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { NodeItem } from "../types/nodes";
import { isDesktopRuntime } from "../project/runtime";
import { nodeToMarkdown } from "./nodeMarkdown";
import { nodeToHtml } from "./nodeHtml";
import { DEFAULT_PDF_SETTINGS, type ExportFormat, type PdfExportSettings } from "../components/NodeActionDialog";

export interface ExportServiceState {
  printNode: NodeItem | null;
  printSettings: PdfExportSettings;
  isExporting: boolean;
  exportError: string | null;
}

export interface UseExportServiceResult {
  printNode: NodeItem | null;
  printSettings: PdfExportSettings;
  isExporting: boolean;
  exportError: string | null;
  printReadyRef: React.MutableRefObject<((editor?: HTMLDivElement, error?: Error) => void) | null>;
  exportNode: (actionNode: NodeItem, format: ExportFormat, settings: PdfExportSettings) => Promise<void>;
  clearExportError: () => void;
}

export function useExportService(): UseExportServiceResult {
  const [printNode, setPrintNode] = useState<NodeItem | null>(null);
  const [printSettings, setPrintSettings] = useState<PdfExportSettings>(DEFAULT_PDF_SETTINGS);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const printReadyRef = useRef<((editor?: HTMLDivElement, error?: Error) => void) | null>(null);

  const clearExportError = useCallback(() => {
    setExportError(null);
  }, []);

  const exportNode = useCallback(
    async (actionNode: NodeItem, format: ExportFormat, settings: PdfExportSettings) => {
      const started = performance.now();
      const logPdf = (message: string) =>
        console.info(`[PDF][+${Math.round(performance.now() - started)}ms] ${message}`);

      setIsExporting(true);
      setExportError(null);
      logPdf(`export requested: format=${format}, node=${actionNode.id}`);

      const filename =
        actionNode.name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-") || "nodo";

      try {
        if (!isDesktopRuntime()) {
          throw new Error("La exportación en H.I.S. está habilitada para la aplicación de escritorio.");
        }

        if (format === "pdf") {
          try {
            const data = await new Promise<number[]>((resolve, reject) => {
              let phase = "PrintDocument";
              const timeout = window.setTimeout(() => {
                printReadyRef.current = null;
                reject(new Error(`[PDF] timeout durante la preparación de ${phase}`));
              }, 30_000);

              printReadyRef.current = async (_printEditor, hydrationError) => {
                try {
                  if (hydrationError) throw hydrationError;
                  logPdf("PrintDocument montado");

                  phase = "fonts";
                  await document.fonts.ready;
                  logPdf("fuentes cargadas");

                  phase = "images";
                  const images = Array.from(
                    document.querySelectorAll<HTMLImageElement>(".his-print-document img"),
                  );

                  await Promise.all(
                    images.map((image, index) => {
                      if (image.complete) {
                        if (image.naturalWidth === 0) {
                          console.warn(
                            `[PDF] Imagen ${index + 1} no tiene dimensiones válidas o falló, aplicando sustituto graceful`,
                          );
                          image.classList.add("his-print-image-fallback");
                        }
                        return Promise.resolve();
                      }
                      return new Promise<void>((resolveImage) => {
                        const imgTimer = window.setTimeout(() => {
                          console.warn(`[PDF] Timeout esperando imagen ${index + 1}`);
                          image.classList.add("his-print-image-fallback");
                          resolveImage();
                        }, 3000);

                        image.addEventListener(
                          "load",
                          () => {
                            window.clearTimeout(imgTimer);
                            resolveImage();
                          },
                          { once: true },
                        );

                        image.addEventListener(
                          "error",
                          () => {
                            window.clearTimeout(imgTimer);
                            console.warn(
                              `[PDF] Error cargando imagen ${index + 1}, aplicando sustituto graceful`,
                            );
                            image.classList.add("his-print-image-fallback");
                            resolveImage();
                          },
                          { once: true },
                        );
                      });
                    }),
                  );

                  logPdf("imágenes verificadas y listas");

                  phase = "WebView2 PrintToPdfStream";
                  logPdf("invocación nativa iniciada");
                  const result = await invoke<number[]>("print_webview_to_pdf", { settings });
                  window.clearTimeout(timeout);
                  logPdf(`resultado nativo recibido: ${result.length} bytes`);
                  resolve(result);
                } catch (error) {
                  window.clearTimeout(timeout);
                  console.error("[PDF] exportación fallida", error);
                  reject(error instanceof Error ? error : new Error(String(error)));
                }
              };

              setPrintSettings(settings);
              setPrintNode(actionNode);
            });

            logPdf("abriendo diálogo Guardar como");
            const path = await save({
              defaultPath: `${filename}.pdf`,
              title: `Exportar ${actionNode.name}`,
              filters: [{ name: "PDF", extensions: ["pdf"] }],
            });

            if (path) {
              await invoke("save_image_file", { path, data });
              logPdf("archivo PDF guardado exitosamente");
            }
          } finally {
            printReadyRef.current = null;
            setPrintNode(null);
          }
        } else if (format === "markdown") {
          const mdContent = nodeToMarkdown(actionNode, {
            includeTitle: settings.includeTitle,
            includeFrontmatter: settings.includeFrontmatter ?? true,
          });
          const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
          const path = await save({
            defaultPath: `${filename}.md`,
            title: `Exportar ${actionNode.name}`,
            filters: [{ name: "Markdown", extensions: ["md"] }],
          });
          if (path) {
            await invoke("save_image_file", {
              path,
              data: Array.from(new Uint8Array(await blob.arrayBuffer())),
            });
            logPdf("archivo Markdown guardado");
          }
        } else if (format === "html") {
          const htmlContent = nodeToHtml(actionNode, {
            includeTitle: settings.includeTitle,
            includeDescription: settings.includeDescription,
            theme: settings.theme,
          });
          const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
          const path = await save({
            defaultPath: `${filename}.html`,
            title: `Exportar ${actionNode.name}`,
            filters: [{ name: "HTML", extensions: ["html", "htm"] }],
          });
          if (path) {
            await invoke("save_image_file", {
              path,
              data: Array.from(new Uint8Array(await blob.arrayBuffer())),
            });
            logPdf("archivo HTML guardado");
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setExportError(message);
        throw err;
      } finally {
        setIsExporting(false);
      }
    },
    [],
  );

  return {
    printNode,
    printSettings,
    isExporting,
    exportError,
    printReadyRef,
    exportNode,
    clearExportError,
  };
}
