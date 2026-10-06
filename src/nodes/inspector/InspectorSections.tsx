import type { ReactNode } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import { formatBytes } from "./inspection";
import { formatDiagnostic } from "./report";
import type { NodeInspection } from "./types";

export function InspectorRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="node-inspector__row"><dt>{label}</dt><dd>{children}</dd></div>;
}

export function StorageSection({ inspection }: { inspection: NodeInspection }) {
  const { locale, t } = useLocale();
  const storage = inspection.storage;
  const value = (bytes: number, percent = true, isExact = true) => <>{isExact ? "" : "≈ "}{formatBytes(bytes, locale)}{percent && storage.total.bytes > 0 && <small> · {(bytes / storage.total.bytes * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%</small>}</>;
  return <section className="node-inspector__card node-inspector__card--wide">
    <h2>{t("inspector.storage")}</h2>
    <p className="node-inspector__legend">{t("inspector.storageExclusiveHint")}</p>
    <dl>
      <InspectorRow label={t("inspector.storageSize")}>{value(storage.total.bytes, false)}</InspectorRow>
      <InspectorRow label={t("inspector.htmlSourceText")}>{value(storage.htmlSourceText.bytes)}</InspectorRow>
      <InspectorRow label={t("inspector.htmlSyntax")}>{value(storage.htmlSyntax.bytes)}</InspectorRow>
      <InspectorRow label={t("inspector.hisMetadata")}>{value(storage.hisMetadata.bytes)}</InspectorRow>
      {storage.unclassified.bytes > 0 && <InspectorRow label={t("inspector.unclassified")}>{value(storage.unclassified.bytes)}</InspectorRow>}
    </dl>
    <h3>{t("inspector.derivedMetrics")}</h3>
    <p className="node-inspector__legend">{t("inspector.derivedHint")}</p>
    <dl>
      <InspectorRow label={t("inspector.visibleTextBytes")}>{value(storage.visibleText.bytes)}</InspectorRow>
      <InspectorRow label={t("inspector.attributes")}>{value(storage.attributes.bytes)}</InspectorRow>
      <InspectorRow label="Data URLs">{value(storage.dataUrls.bytes)}</InspectorRow>
      <InspectorRow label={t("inspector.base64Stored")}>{value(storage.base64Source.bytes)}</InspectorRow>
      <InspectorRow label={t("inspector.embeddedPayload")}>{value(storage.base64Payload.bytes, false, storage.base64Payload.exact)}</InspectorRow>
      <InspectorRow label={t("inspector.inlineStyles")}>{value(storage.inlineStyles.bytes)}</InspectorRow>
      <InspectorRow label="SVG inline">{value(storage.inlineSvg.bytes)}</InspectorRow>
    </dl>
  </section>;
}

export function ResourcesSection({ inspection }: { inspection: NodeInspection }) {
  const { locale, t } = useLocale();
  const byId = new Map(inspection.resources.map((resource) => [resource.id, resource]));
  return <section className="node-inspector__card node-inspector__card--wide">
    <h2>{t("inspector.heaviestElements")}</h2>
    <div className="node-inspector__resource-summary">
      <span>{t("inspector.resourcesTotal")}: <strong>{inspection.resources.length.toLocaleString(locale)}</strong></span>
      <span>{t("inspector.resourcesUnique")}: <strong>{inspection.uniqueResources.toLocaleString(locale)}</strong></span>
      <span>{t("inspector.embedded")}: <strong>{inspection.embeddedResources.toLocaleString(locale)}</strong></span>
      <span>{t("inspector.referenced")}: <strong>{inspection.referencedResources.toLocaleString(locale)}</strong></span>
    </div>
    {inspection.topResources.length ? <ol className="node-inspector__heavy-list">
      {inspection.topResources.map((resource) => <li key={resource.id}>
        <strong>{resource.type} · {resource.mime ?? resource.representation}</strong>
        <span>{formatBytes(resource.storedBytes, locale)}{resource.payloadBytes !== null && <> · payload {resource.payloadExact ? "" : "≈ "}{formatBytes(resource.payloadBytes, locale)}</>}</span>
        <small>{resource.name ?? resource.internalId ?? resource.location} · {resource.representation}{resource.width || resource.height ? ` · ${resource.width ?? "?"}×${resource.height ?? "?"}` : ""}</small>
      </li>)}
    </ol> : <p className="node-inspector__empty">{t("inspector.noResources")}</p>}
    <h3>{t("inspector.duplicates")}</h3>
    {inspection.duplicateGroups.length ? <ul className="node-inspector__duplicate-list">{inspection.duplicateGroups.map((group) => {
      const resource = byId.get(group.resourceId);
      return <li key={group.resourceId}><strong>{resource?.name ?? resource?.location ?? group.resourceId}</strong><span>{t("inspector.duplicateDetail", { count: group.occurrences, each: formatBytes(group.storedBytesEach, locale), total: formatBytes(group.duplicatedBytes, locale) })}</span></li>;
    })}</ul> : <p className="node-inspector__empty">{t("inspector.noDuplicates")}</p>}
  </section>;
}

export function StructureSection({ inspection }: { inspection: NodeInspection }) {
  const { locale, t } = useLocale(); const s = inspection.structure; const n = (value: number) => value.toLocaleString(locale);
  return <section className="node-inspector__card"><h2>{t("inspector.structure")}</h2><dl>
    <InspectorRow label={t("inspector.editorBlocks")}>{n(s.editorBlocks)}</InspectorRow><InspectorRow label={t("inspector.rootElements")}>{n(s.rootElements)}</InspectorRow>
    <InspectorRow label={t("inspector.domElements")}>{n(s.domElements)}</InspectorRow><InspectorRow label={t("inspector.textNodes")}>{n(s.textNodes)}</InspectorRow>
    <InspectorRow label={t("inspector.domDepth")}>{n(s.maxDomDepth)} max · {s.averageDomDepth.toLocaleString(locale, { maximumFractionDigits: 1 })} media</InspectorRow>
    <InspectorRow label="contenteditable">{n(s.contentEditableElements)}</InspectorRow><InspectorRow label={t("inspector.headings")}>{n(s.headings)}</InspectorRow>
    <InspectorRow label={t("inspector.paragraphs")}>{n(s.paragraphs)}</InspectorRow><InspectorRow label={t("inspector.listItems")}>{n(s.listItems)} · {n(s.lists)} listas</InspectorRow>
    <InspectorRow label={t("inspector.tables")}>{n(s.tables)} · {n(s.tableRows)} {t("inspector.rows")} · {n(s.tableCells)} {t("inspector.cells")}</InspectorRow>
    <InspectorRow label={t("inspector.media")}>{n(s.images)} {t("inspector.images")} · {n(s.links)} {t("inspector.links")} · {n(s.embeds)} embeds</InspectorRow>
    <InspectorRow label={t("inspector.columns")}>{n(s.columnLayouts)} layouts · {n(s.columns)} columnas</InspectorRow>
    <InspectorRow label={t("inspector.specialBlocks")}>{n(s.globes)} {t("inspector.globes")} · {n(s.pageIndexes)} {t("inspector.indexes")} · {n(s.syncedBlocks)} {t("inspector.synced")}</InspectorRow>
    <InspectorRow label="[data-editor-ui]">{n(s.editorUiElements)}</InspectorRow><InspectorRow label={t("inspector.transientAttributes")}>{n(s.transientEditorAttributes)}</InspectorRow>
  </dl></section>;
}

export function DiagnosticsSection({ inspection }: { inspection: NodeInspection }) {
  const { locale, t } = useLocale();
  return <section className="node-inspector__card node-inspector__card--wide"><h2>{t("inspector.diagnostics")}</h2>{inspection.diagnostics.length ? <ul className="node-inspector__diagnostics">{inspection.diagnostics.map((fact, index) => <li key={`${fact.code}-${index}`}>{formatDiagnostic(fact, locale, t)}</li>)}</ul> : <p className="node-inspector__empty">{t("inspector.noDiagnosticFacts")}</p>}</section>;
}

export function TimingSection({ inspection }: { inspection: NodeInspection }) {
  const { locale, t } = useLocale(); const ms = (value: number) => `${value.toLocaleString(locale, { maximumFractionDigits: 2 })} ms`;
  return <section className="node-inspector__card"><h2>{t("inspector.performance")}</h2><dl>
    <InspectorRow label={t("inspector.storageResourcesTime")}>{ms(inspection.timings.storageAndResourcesMs)}</InspectorRow><InspectorRow label={t("inspector.parseHtmlTime")}>{ms(inspection.timings.parseHtmlMs)}</InspectorRow>
    <InspectorRow label={t("inspector.domAnalysisTime")}>{ms(inspection.timings.domAnalysisMs)}</InspectorRow><InspectorRow label={t("inspector.relationsTime")}>{ms(inspection.timings.relationsMs)}</InspectorRow>
    <InspectorRow label={t("inspector.inspectionTotalTime")}><strong>{ms(inspection.timings.totalMs)}</strong></InspectorRow>
    {!inspection.performance && <InspectorRow label={t("inspector.editorMetrics")}>{t("inspector.notAvailable")}</InspectorRow>}
  </dl></section>;
}

export function SpecificMetadataSection({ inspection }: { inspection: NodeInspection }) {
  const { locale, t } = useLocale(); const meta = inspection.nodalMeta;
  const hasNodal = Boolean(meta.code || meta.courseTitle || meta.modality || meta.description || meta.url || meta.transcript || meta.duration !== null || meta.size !== null || meta.mediaType || meta.evaluation || meta.roomLinks.length);
  if (!inspection.calendarMeta && !inspection.tempoMeta && !hasNodal) return null;
  return <section className="node-inspector__card"><h2>{t("inspector.nodeMetadata")}</h2><dl>
    {inspection.calendarMeta && <><InspectorRow label={t("inspector.currentDate")}>{inspection.calendarMeta.currentDate}</InspectorRow><InspectorRow label={t("inspector.calendarView")}>{inspection.calendarMeta.view}</InspectorRow></>}
    {inspection.tempoMeta && <><InspectorRow label={t("inspector.date")}>{inspection.tempoMeta.date}</InspectorRow><InspectorRow label={t("inspector.endDate")}>{inspection.tempoMeta.endDate ?? t("inspector.none")}</InspectorRow><InspectorRow label={t("inspector.time")}>{[inspection.tempoMeta.startTime, inspection.tempoMeta.endTime].filter(Boolean).join(" – ") || t("inspector.none")}</InspectorRow><InspectorRow label={t("inspector.recurrence")}>{inspection.tempoMeta.subtype}</InspectorRow></>}
    {meta.code && <InspectorRow label={t("inspector.code")}>{meta.code}</InspectorRow>}{meta.courseTitle && <InspectorRow label={t("inspector.courseTitle")}>{meta.courseTitle}</InspectorRow>}{meta.modality && <InspectorRow label={t("inspector.modality")}>{meta.modality}</InspectorRow>}
    {meta.description && <InspectorRow label={t("inspector.description")}>{meta.description}</InspectorRow>}{meta.url && <InspectorRow label="URL"><code>{meta.url}</code></InspectorRow>}
    {hasNodal && <InspectorRow label={t("inspector.status")}>{meta.status}</InspectorRow>}{meta.evaluation && <InspectorRow label={t("inspector.evaluation")}>{t("inspector.yes")}</InspectorRow>}
    {meta.transcript && <InspectorRow label={t("inspector.transcript")}>{meta.transcript.length.toLocaleString(locale)} {t("inspector.characters")}</InspectorRow>}{meta.duration !== null && <InspectorRow label={t("inspector.duration")}>{Math.round(meta.duration).toLocaleString(locale)} s</InspectorRow>}
    {meta.size !== null && <InspectorRow label={t("inspector.fileSize")}>{formatBytes(meta.size, locale)}</InspectorRow>}{meta.mediaType && <InspectorRow label={t("inspector.format")}>{meta.mediaType}</InspectorRow>}{meta.roomLinks.length > 0 && <InspectorRow label={t("inspector.roomLinks")}>{meta.roomLinks.length.toLocaleString(locale)}</InspectorRow>}
  </dl></section>;
}
