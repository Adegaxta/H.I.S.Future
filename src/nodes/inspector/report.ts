import type { Translate } from "../../i18n/LocaleContext";
import type { NodeItem } from "../../types/nodes";
import { formatBytes } from "./inspection";
import type { DiagnosticFact, NodeInspection } from "./types";

export function formatDiagnostic(fact: DiagnosticFact, locale: string, t: Translate): string {
  const bytes = (value = 0) => formatBytes(value, locale);
  switch (fact.code) {
    case "data-url-share": return t("inspector.diagnostic.dataUrlShare", { percent: fact.value.toLocaleString(locale, { maximumFractionDigits: 1 }), size: bytes(fact.secondary) });
    case "duplicate-resource": return t("inspector.diagnostic.duplicate", { count: fact.value, size: bytes(fact.secondary) });
    case "persisted-editor-ui": return t("inspector.diagnostic.editorUi", { count: fact.value });
    case "persisted-transient-state": return t("inspector.diagnostic.transient", { count: fact.value });
    case "persisted-runtime-url": return t("inspector.diagnostic.runtimeUrl", { count: fact.value });
    case "storage-vs-text": return t("inspector.diagnostic.storageVsText", { stored: bytes(fact.value), text: bytes(fact.secondary) });
    case "broken-mentions": return t("inspector.diagnostic.brokenMentions", { count: fact.value });
    case "broken-relations": return t("inspector.diagnostic.brokenRelations", { count: fact.value });
  }
}

export function buildInspectionReport(node: NodeItem, typeLabel: string, inspection: NodeInspection, locale: string, t: Translate): string {
  const n = (value: number) => value.toLocaleString(locale);
  const b = (value: number) => formatBytes(value, locale);
  const s = inspection.structure;
  const storage = inspection.storage;
  const lines = [
    "NODO", `Nombre: ${node.name}`, `Tipo: ${typeLabel}`, `ID: ${node.id}`, "",
    "CONTENIDO", `Palabras: ${n(inspection.words)}`, `Caracteres visibles: ${n(inspection.textCharacters)}`, `Bloques: ${n(s.editorBlocks)}`, `Elementos DOM: ${n(s.domElements)}`, "",
    "ALMACENAMIENTO", `HTML caracteres: ${n(inspection.htmlCharacters)}`, `Bytes almacenados: ${b(storage.total.bytes)}`,
    `Partición exclusiva — texto fuente HTML: ${b(storage.htmlSourceText.bytes)}; sintaxis HTML: ${b(storage.htmlSyntax.bytes)}; metadata HIS: ${b(storage.hisMetadata.bytes)}; no clasificado: ${b(storage.unclassified.bytes)}`,
    `Métricas derivadas — texto visible: ${b(storage.visibleText.bytes)}; atributos: ${b(storage.attributes.bytes)}; data URLs: ${b(storage.dataUrls.bytes)}; Base64 almacenado: ${b(storage.base64Source.bytes)}; payload Base64: ${b(storage.base64Payload.bytes)}; estilos inline: ${b(storage.inlineStyles.bytes)}; SVG inline: ${b(storage.inlineSvg.bytes)}`, "",
    "RECURSOS", `Total: ${n(inspection.resources.length)}`, `Únicos: ${n(inspection.uniqueResources)}`, `Embebidos: ${n(inspection.embeddedResources)}`, `Referenciados: ${n(inspection.referencedResources)}`, `Grupos duplicados: ${n(inspection.duplicateGroups.length)}`, `Bytes duplicados: ${b(inspection.duplicatedResourceBytes)}`,
    ...inspection.topResources.map((resource, index) => `${index + 1}. ${resource.type} | ${resource.representation} | ${resource.mime ?? "—"} | almacenado ${b(resource.storedBytes)}${resource.payloadBytes === null ? "" : ` | payload ${b(resource.payloadBytes)}`} | ${resource.name ?? resource.location}`), "",
    "ESTRUCTURA", `DOM: ${n(s.domElements)}; profundidad máxima: ${n(s.maxDomDepth)}; profundidad media: ${s.averageDomDepth.toLocaleString(locale, { maximumFractionDigits: 1 })}; nodos de texto: ${n(s.textNodes)}`,
    `Tablas: ${n(s.tables)}; filas: ${n(s.tableRows)}; celdas: ${n(s.tableCells)}; columnas: ${n(s.columns)}; imágenes: ${n(s.images)}; enlaces: ${n(s.links)}; embeds: ${n(s.embeds)}`,
    `UI editorial persistida: ${n(s.editorUiElements)}; atributos transitorios: ${n(s.transientEditorAttributes)}`, "",
    "RELACIONES", `Menciones: ${n(inspection.mentions.length)}; únicas: ${n(inspection.uniqueMentions)}; repetidas: ${n(inspection.repeatedMentions)}; rotas: ${n(inspection.brokenMentionIds.length)}`, `Relaciones salientes: ${n(inspection.outgoingRelations)}; entrantes: ${n(inspection.incomingRelations)}; rotas: ${n(inspection.brokenRelationIds.length)}`, "",
    "DIAGNÓSTICO", ...(inspection.diagnostics.length ? inspection.diagnostics.map((fact) => `- ${formatDiagnostic(fact, locale, t)}`) : ["- Sin hechos anómalos medidos."]), "",
    "RENDIMIENTO", ...(inspection.performance ? Object.entries(inspection.performance).map(([key, value]) => `${key}: ${value.toLocaleString(locale, { maximumFractionDigits: 2 })} ms`) : ["Sin métricas reutilizables del editor disponibles."]), "",
    "INSPECTOR", `Almacenamiento/recursos: ${inspection.timings.storageAndResourcesMs.toLocaleString(locale, { maximumFractionDigits: 2 })} ms`, `Parse HTML: ${inspection.timings.parseHtmlMs.toLocaleString(locale, { maximumFractionDigits: 2 })} ms`, `Análisis DOM: ${inspection.timings.domAnalysisMs.toLocaleString(locale, { maximumFractionDigits: 2 })} ms`, `Relaciones: ${inspection.timings.relationsMs.toLocaleString(locale, { maximumFractionDigits: 2 })} ms`, `Total: ${inspection.timings.totalMs.toLocaleString(locale, { maximumFractionDigits: 2 })} ms`,
  ];
  return lines.join("\n");
}
