import { useEffect, useMemo, useState } from "react";
import { getNodeDisplayLabel } from "../../defs/nodeTypes";
import { useLocale } from "../../i18n/LocaleContext";
import type { NodeItem } from "../../types/nodes";
import { inspectNode, formatBytes } from "./inspection";
import { buildInspectionReport } from "./report";
import { DiagnosticsSection, InspectorRow as Row, ResourcesSection, SpecificMetadataSection, StorageSection, StructureSection, TimingSection } from "./InspectorSections";
import { projectResourceExists } from "../../project/resourceRepository";
import "./styles.css";
import ImageMigrationPanel from "./ImageMigrationPanel";
import type { ImageMigrationPlan, ImageMigrationResult } from "../../project/imageMigration";

interface NodeInspectorViewProps { node: NodeItem; nodes: readonly NodeItem[]; onBack: () => void; onAnalyzeImageMigration?: () => Promise<ImageMigrationPlan>; onMigrateImages?: (plan: ImageMigrationPlan) => Promise<ImageMigrationResult> }
function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) { return <div className="node-inspector__metric"><strong>{value}</strong><span>{label}</span>{hint && <small>{hint}</small>}</div>; }

export default function NodeInspectorView({ node, nodes, onBack, onAnalyzeImageMigration, onMigrateImages }: NodeInspectorViewProps) {
  const { locale, t } = useLocale();
  const [copied, setCopied] = useState(false);
  const [imageResourceAvailable, setImageResourceAvailable] = useState<boolean | null>(null);
  const inspection = useMemo(() => inspectNode(node, nodes), [node, nodes]);
  const byId = useMemo(() => new Map(nodes.map((item) => [item.id, item])), [nodes]);
  const typeLabel = getNodeDisplayLabel(node.type, t);
  const outgoing = inspection.nodalMeta.relations;
  const incoming = inspection.incoming.map(({ sourceId, role }) => ({ source: byId.get(sourceId), role }));
  const problems = inspection.brokenMentionIds.length + inspection.brokenRelationIds.length + (node.parentId && !inspection.parent ? 1 : 0);
  const number = (value: number) => value.toLocaleString(locale);
  const yesNo = (value: boolean) => t(value ? "inspector.yes" : "inspector.no");
  const report = useMemo(() => buildInspectionReport(node, typeLabel, inspection, locale, t), [inspection, locale, node, t, typeLabel]);
  useEffect(() => {
    const resource = inspection.imageResource;
    let cancelled = false;
    setImageResourceAvailable(null);
    if (!resource || resource.storage !== "project-resource") return () => { cancelled = true; };
    void projectResourceExists("image", resource.resourceId, resource.extension)
      .then((available) => { if (!cancelled) setImageResourceAvailable(available); })
      .catch(() => { if (!cancelled) setImageResourceAvailable(false); });
    return () => { cancelled = true; };
  }, [inspection.imageResource]);
  const copyReport = async () => {
    if (!navigator.clipboard?.writeText) return;
    try { await navigator.clipboard.writeText(report); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* Read-only diagnostic remains available on screen. */ }
  };

  return <section className="node-inspector" aria-labelledby="node-inspector-title">
    <header className="node-inspector__header"><div><button type="button" className="node-inspector__back" onClick={onBack}>← {t("inspector.back")}</button><p>{t("inspector.eyebrow")}</p><h1 id="node-inspector-title">{node.name}</h1><span className="node-inspector__type">{typeLabel}</span></div><button type="button" className="node-inspector__copy" onClick={() => void copyReport()}>{copied ? t("inspector.copied") : t("inspector.copyReport")}</button></header>
    <div className="node-inspector__summary">
      <Metric label={t("inspector.words")} value={number(inspection.words)} /><Metric label={t("inspector.textCharacters")} value={number(inspection.textCharacters)} />
      <Metric label={t("inspector.editorBlocks")} value={number(inspection.structure.editorBlocks)} /><Metric label={t("inspector.storageSize")} value={formatBytes(inspection.storage.total.bytes, locale)} />
      <Metric label={t("inspector.inspectionTotalTime")} value={`${inspection.timings.totalMs.toLocaleString(locale, { maximumFractionDigits: 1 })} ms`} />
    </div>
    {problems > 0 && <section className="node-inspector__alert"><strong>{t("inspector.referencesNeedReview", { count: problems })}</strong><span>{t("inspector.referencesNeedReviewHint")}</span></section>}
    <div className="node-inspector__grid">
      {onAnalyzeImageMigration && onMigrateImages && <ImageMigrationPanel onAnalyze={onAnalyzeImageMigration} onMigrate={onMigrateImages} />}
      <section className="node-inspector__card"><h2>{t("inspector.content")}</h2><dl>
        <Row label={t("inspector.textCharacters")}>{number(inspection.textCharacters)}</Row><Row label={t("inspector.charactersNoSpaces")}>{number(inspection.textCharactersNoSpaces)}</Row>
        <Row label={t("inspector.words")}>{number(inspection.words)}</Row><Row label={t("inspector.readingTime")}>{t("inspector.minutes", { count: inspection.readingMinutes })}</Row>
        <Row label={t("inspector.estimatedPages")}>{number(inspection.estimatedPages)} <small>({t("inspector.pagesBasis")})</small></Row><Row label={t("inspector.serializedHtml")}>{number(inspection.htmlCharacters)} {t("inspector.characters")}</Row>
      </dl></section>
      <StructureSection inspection={inspection} />
      <StorageSection inspection={inspection} />
      <ResourcesSection inspection={inspection} />
      <DiagnosticsSection inspection={inspection} />
      <section className="node-inspector__card"><h2>{t("inspector.projectPosition")}</h2><dl>
        <Row label={t("inspector.parent")}>{inspection.parent?.name ?? (node.parentId ? t("inspector.missingNode") : t("inspector.root"))}</Row><Row label={t("inspector.depth")}>{number(inspection.depth)}</Row>
        <Row label={t("inspector.order")}>{number(node.order)}</Row><Row label={t("inspector.siblings")}>{number(inspection.siblings)}</Row><Row label={t("inspector.children")}>{number(inspection.children)}</Row>
        <Row label={t("inspector.descendants")}>{number(inspection.descendants)}</Row><Row label={t("inspector.visibleInLore")}>{yesNo(!node.loreHidden)}</Row>
      </dl></section>
      <section className="node-inspector__card"><h2>{t("inspector.references")}</h2><dl>
        <Row label={t("inspector.mentions")}>{number(inspection.mentions.length)}</Row><Row label={t("inspector.uniqueMentions")}>{number(inspection.uniqueMentions)}</Row>
        <Row label={t("inspector.repeatedMentions")}>{number(inspection.repeatedMentions)}</Row><Row label={t("inspector.brokenMentions")}>{number(inspection.brokenMentionIds.length)}</Row>
        <Row label={t("inspector.outgoingRelations")}>{number(inspection.outgoingRelations)}</Row><Row label={t("inspector.incomingRelations")}>{number(inspection.incomingRelations)}</Row>
      </dl>
        {(outgoing.length > 0 || incoming.length > 0) && <ul className="node-inspector__relations">{outgoing.map((relation, index) => <li key={`out-${relation.role}-${relation.targetId}-${index}`}><span>→ {relation.role}</span><strong>{byId.get(relation.targetId)?.name ?? t("inspector.missingNode")}</strong></li>)}{incoming.map(({ source, role }, index) => <li key={`in-${source?.id ?? "missing"}-${role}-${index}`}><span>← {role}</span><strong>{source?.name ?? t("inspector.missingNode")}</strong></li>)}</ul>}
        {inspection.mentions.filter((mention) => mention.broken).length > 0 && <div className="node-inspector__broken">{inspection.mentions.filter((mention) => mention.broken).map((mention, index) => <code key={`${mention.targetId}-${index}`}>{t("inspector.brokenMention")}: {mention.targetId}{mention.block ? ` · bloque ${mention.block}` : ""}{mention.fragment ? ` · “${mention.fragment}”` : ""}</code>)}</div>}
      </section>
      {inspection.pageMeta && <section className="node-inspector__card"><h2>{t("inspector.pageConfiguration")}</h2><dl><Row label={t("inspector.contentWidth")}>{inspection.pageMeta.blockWidth}%</Row><Row label={t("inspector.headerAlignment")}>{inspection.pageMeta.headerPosition}</Row><Row label={t("inspector.textAlignment")}>{inspection.pageMeta.textPosition}</Row><Row label={t("inspector.description")}>{inspection.pageMeta.description || t("inspector.none")}</Row></dl></section>}
      {inspection.pdfResource && <section className="node-inspector__card"><h2>{t("inspector.resource")}</h2><dl><Row label={t("inspector.fileName")}>{inspection.pdfResource.fileName}</Row><Row label={t("inspector.fileSize")}>{formatBytes(inspection.pdfResource.fileSize, locale)}</Row><Row label={t("inspector.resourceId")}><code>{inspection.pdfResource.resourceId}</code></Row></dl></section>}
      {inspection.imageResource && <section className="node-inspector__card"><h2>{t("inspector.resource")}</h2><dl>
        <Row label={t("inspector.storage")}>{inspection.imageResource.storage === "project-resource" ? t("inspector.projectResource") : inspection.imageResource.storage === "inline" ? t("inspector.legacyInline") : t("inspector.externalProvider")}</Row>
        <Row label={t("inspector.fileName")}>{inspection.imageResource.fileName}</Row>
        <Row label="MIME">{inspection.imageResource.storage === "project-resource" ? inspection.imageResource.mimeType : inspection.imageResource.src.startsWith("data:") ? inspection.imageResource.src.slice(5, inspection.imageResource.src.indexOf(";") > 0 ? inspection.imageResource.src.indexOf(";") : inspection.imageResource.src.indexOf(",")) : t("inspector.externalProvider")}</Row>
        {inspection.imageResource.fileSize !== null && <Row label={t("inspector.fileSize")}>{formatBytes(inspection.imageResource.fileSize, locale)}</Row>}
        {inspection.imageResource.storage === "project-resource" && <><Row label={t("inspector.resourceId")}><code>{inspection.imageResource.resourceId}</code></Row><Row label={t("inspector.resourceStatus")}>{imageResourceAvailable === null ? t("inspector.checking") : imageResourceAvailable ? t("inspector.available") : t("inspector.missing")}</Row></>}
      </dl></section>}
      <SpecificMetadataSection inspection={inspection} />
      <TimingSection inspection={inspection} />
      <section className="node-inspector__card node-inspector__card--technical"><h2>{t("inspector.technical")}</h2><dl><Row label="ID"><code>{node.id}</code></Row><Row label={t("inspector.internalType")}><code>{node.type}</code></Row><Row label="parentId"><code>{node.parentId ?? "null"}</code></Row><Row label={t("inspector.favorite")}>{yesNo(inspection.nodalMeta.favorite)}</Row><Row label={t("inspector.pinned")}>{yesNo(inspection.nodalMeta.pinned)}</Row><Row label={t("inspector.protected")}>{yesNo(inspection.nodalMeta.protected)}</Row></dl></section>
    </div>
  </section>;
}
