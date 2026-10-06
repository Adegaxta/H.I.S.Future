import { useEffect, useState } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import type { ImageMigrationPlan, ImageMigrationProgress, ImageMigrationResult } from "../../project/imageMigration";
import { cancelLegacyImageMigration, listenImageMigrationProgress } from "../../project/imageMigration";
import { formatBytes } from "./inspection";

interface ImageMigrationPanelProps {
  onAnalyze: () => Promise<ImageMigrationPlan>;
  onMigrate: (plan: ImageMigrationPlan) => Promise<ImageMigrationResult>;
}

export default function ImageMigrationPanel({ onAnalyze, onMigrate }: ImageMigrationPanelProps) {
  const { locale, t } = useLocale();
  const [plan, setPlan] = useState<ImageMigrationPlan | null>(null);
  const [result, setResult] = useState<ImageMigrationResult | null>(null);
  const [progress, setProgress] = useState<ImageMigrationProgress | null>(null);
  const [status, setStatus] = useState<"idle" | "analyzing" | "ready" | "migrating" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [cancellationRequested, setCancellationRequested] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenImageMigrationProgress(setProgress).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, []);

  const analyze = async () => {
    setStatus("analyzing"); setError(""); setResult(null);
    try { setPlan(await onAnalyze()); setStatus("ready"); }
    catch (reason) { setError(String(reason)); setStatus("error"); }
  };
  const migrate = async () => {
    if (!plan) return;
    setStatus("migrating"); setError(""); setCancellationRequested(false); setProgress({ phase: "backup", current: 0, total: plan.images.length, imageName: "" });
    try { setResult(await onMigrate(plan)); setStatus("done"); }
    catch (reason) { setError(String(reason)); setStatus("error"); }
  };
  const omitted = plan ? plan.ambiguous.length + plan.corrupt.length + plan.unknown.length : 0;
  const phaseLabel = progress?.phase === "resource" ? t("migration.phase.resource")
    : progress?.phase === "commit" ? t("migration.phase.commit")
      : progress?.phase === "done" ? t("migration.phase.done")
        : t("migration.phase.backup");

  return <section className="node-inspector__card node-inspector__migration">
    <h2>{t("migration.title")}</h2>
    {status === "idle" && <><p>{t("migration.intro")}</p><button type="button" onClick={() => void analyze()}>{t("migration.analyze")}</button></>}
    {status === "analyzing" && <p>{t("migration.analyzing")}</p>}
    {plan && status === "ready" && <>
      {plan.images.length > 0 ? <p>{t("migration.found", { count: plan.images.length })}</p> : <p>{t("migration.none")}</p>}
      <dl>
        <dt>{t("migration.images")}</dt><dd>{plan.images.length.toLocaleString(locale)}</dd>
        <dt>{t("migration.pages")}</dt><dd>{plan.affectedPages.toLocaleString(locale)}</dd>
        <dt>{t("migration.mentions")}</dt><dd>{plan.affectedMentions.toLocaleString(locale)}</dd>
        <dt>{t("migration.currentSize")}</dt><dd>{formatBytes(plan.estimate.legacyBase64Characters, locale)}</dd>
        <dt>{t("migration.estimatedAfter")}</dt><dd>{formatBytes(plan.estimate.estimatedReferenceBytesAfter, locale)}</dd>
        <dt>{t("migration.alreadyModern")}</dt><dd>{plan.alreadyModern.toLocaleString(locale)}</dd>
        <dt>{t("migration.omitted")}</dt><dd>{omitted.toLocaleString(locale)}</dd>
      </dl>
      {omitted > 0 && <details><summary>{t("migration.reviewIssues")}</summary>{[...plan.ambiguous, ...plan.corrupt, ...plan.unknown].map((issue) => <div key={`${issue.classification}:${issue.imageNodeId}`} className="node-inspector__migration-issue"><strong>{issue.imageNodeName}</strong><span>{issue.reason}</span>{issue.details.map((detail) => <small key={detail}>{detail}</small>)}</div>)}</details>}
      <p>{t("migration.backupNotice")}</p>
      <div className="node-inspector__migration-actions"><button type="button" onClick={() => { setPlan(null); setStatus("idle"); }}>{t("common.actions.cancel")}</button><button type="button" disabled={!plan.images.length} onClick={() => void migrate()}>{t("migration.migrate")}</button></div>
    </>}
    {status === "migrating" && <div aria-live="polite"><p>{phaseLabel}</p><progress max={Math.max(1, progress?.total ?? 1)} value={progress?.current ?? 0} /><strong>{progress?.current ?? 0}/{progress?.total ?? plan?.images.length ?? 0}</strong>{progress?.imageName && <span>{progress.imageName}</span>}<button type="button" disabled={cancellationRequested || progress?.phase === "commit"} onClick={() => { setCancellationRequested(true); void cancelLegacyImageMigration(); }}>{cancellationRequested ? t("migration.cancelling") : t("common.actions.cancel")}</button></div>}
    {status === "done" && result && <><p>{t("migration.complete")}</p><dl><dt>{t("migration.migrated")}</dt><dd>{result.migrated}</dd><dt>{t("migration.resourcesCreated")}</dt><dd>{result.resourcesCreated}</dd><dt>{t("migration.resourcesReused")}</dt><dd>{result.resourcesReused}</dd><dt>{t("migration.removed")}</dt><dd>{formatBytes(result.base64CharactersRemoved, locale)}</dd><dt>{t("migration.backup")}</dt><dd><code>{result.backupPath}</code></dd><dt>{t("migration.time")}</dt><dd>{result.totalMs.toLocaleString(locale, { maximumFractionDigits: 1 })} ms</dd></dl><button type="button" onClick={() => void analyze()}>{t("migration.analyzeAgain")}</button></>}
    {status === "error" && <><p className="node-inspector__migration-error">{error}</p><button type="button" onClick={() => void analyze()}>{t("migration.retry")}</button></>}
  </section>;
}
