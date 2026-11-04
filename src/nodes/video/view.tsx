import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import { getNodalMeta } from "../metadata";
import { patchNodal } from "../relations";
import { resolveVideoSource } from "../../utils/videoSource";
import NodeTypeLabel from "../../components/NodeTypeLabel";
import { NodalIcon, type NodalViewProps } from "../../components/NodeReferences";
import { NodeNameInput, NodeSearchAction, isWebUrl, openWebUrl } from "../viewPrimitives";

function formatTimestamp(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remMin = m % 60;
    return `${String(h).padStart(2, "0")}:${String(remMin).padStart(2, "0")}:${String(remSec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(remSec).padStart(2, "0")}`;
}

function parseTimestamp(raw: string): number {
  const parts = raw.replace(/[\[\]]/g, "").split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

export function VideoNodeView({ node, onMutate, onRename, onOpen: _onOpen, nodes: _nodes, onImport: _onImport, onDelete }: NodalViewProps & { onDelete: (id: string) => void }) {
  const { t } = useLocale();
  const meta = getNodalMeta(node.content);
  const source = useMemo(() => resolveVideoSource(meta.url), [meta.url]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const patch = (value: Parameters<typeof patchNodal>[2]) => onMutate((c) => patchNodal(c, node.id, value));
  useEffect(() => setError(false), [meta.url]);
  const matches = query ? (meta.transcript.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) ?? []).length : 0;

  const seekTo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  };

  const insertCurrentTimestamp = () => {
    const current = videoRef.current?.currentTime ?? 0;
    const stamp = `[${formatTimestamp(current)}]`;
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = meta.transcript || "";
      const prefix = val.slice(0, start);
      const suffix = val.slice(end);
      const spacer = prefix && !prefix.endsWith("\n") && !prefix.endsWith(" ") ? " " : "";
      const updated = `${prefix}${spacer}${stamp} ${suffix}`;
      patch({ transcript: updated });
      requestAnimationFrame(() => {
        const nextPos = start + spacer.length + stamp.length + 1;
        textarea.selectionStart = nextPos;
        textarea.selectionEnd = nextPos;
        textarea.focus();
      });
    } else {
      patch({ transcript: (meta.transcript ? `${meta.transcript}\n` : "") + stamp + " " });
    }
  };

  const timestamps = useMemo(() => {
    if (!meta.transcript) return [];
    const matches = Array.from(meta.transcript.matchAll(/\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?/g));
    const unique = new Map<string, number>();
    for (const m of matches) {
      const label = m[1];
      if (!unique.has(label)) {
        unique.set(label, parseTimestamp(label));
      }
    }
    return Array.from(unique.entries()).map(([label, seconds]) => ({ label, seconds }));
  }, [meta.transcript]);

  return (
    <section className="video-node-view">
      <NodeTypeLabel type="video" node={node} />
      <NodeNameInput node={node} onRename={onRename} className="nodal-title" />
      <div className="video-layout">
        <div>
          <div className="video-player">
            {source.kind === "direct" ? (
              <video
                ref={videoRef}
                controls
                src={source.url}
                onLoadedMetadata={(e) => patch({ duration: Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null, mediaType: e.currentTarget.currentSrc.split("?")[0].split(".").pop() ?? "" })}
                onError={() => setError(true)}
              />
            ) : source.kind === "embed" ? (
              <iframe
                src={source.url}
                title={node.name}
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                onError={() => setError(true)}
              />
            ) : (
              <span>{source.kind === "empty" ? t("video.noSource") : t("video.unsupported")}</span>
            )}
            {error && <p role="alert">{t("video.playError")}</p>}
          </div>
          <label className="video-url">
            <NodalIcon name="link_1" />
            {t("nodal.url")}
            <input type="url" value={meta.url} onChange={(e) => patch({ url: e.target.value })} />
          </label>
        </div>
        <aside>
          <div className="video-actions">
            <a className={source.kind === "direct" ? "" : "is-disabled"} href={source.kind === "direct" ? source.url : undefined} download>
              <NodalIcon name="download" />
              {t("video.download")}
            </a>
            <button onClick={() => { if (confirm(t("video.deleteConfirm"))) onDelete(node.id); }}>
              <NodalIcon name="delete" />
              {t("nodal.remove")}
            </button>
          </div>
          <dl>
            <dt><NodalIcon name="link_1" />{t("nodal.url")}</dt>
            <dd>{meta.url || t("video.unknown")}</dd>
            <dt><NodalIcon name="extension" />{t("video.extension")}</dt>
            <dd>{source.kind === "direct" ? source.extension.toUpperCase() : meta.mediaType || t("video.unknown")}</dd>
            <dt><NodalIcon name="storage" />{t("video.size")}</dt>
            <dd>{meta.size === null ? t("video.unknown") : `${(meta.size / 1024 / 1024).toFixed(1)} MB`}</dd>
          </dl>
          {source.kind === "external" && isWebUrl(source.url) && (
            <button onClick={() => void openWebUrl(source.url)}>{t("nodal.openLink")}</button>
          )}
        </aside>
      </div>
      <div className="video-transcript">
        <header>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2><NodalIcon name="audio_capture" />{t("video.transcript")}</h2>
            {source.kind === "direct" && (
              <button
                type="button"
                className="video-timestamp-insert-btn"
                onClick={insertCurrentTimestamp}
                title={t("video.addTimestamp")}
              >
                + {t("video.addTimestamp")}
              </button>
            )}
          </div>
          <NodeSearchAction value={query} onChange={setQuery} />
        </header>
        {timestamps.length > 0 && (
          <div className="video-timestamps-bar">
            {timestamps.map(({ label, seconds }) => (
              <button
                key={label}
                type="button"
                className="video-timestamp-pill"
                onClick={() => seekTo(seconds)}
                title={t("video.timestampJump", { time: label })}
              >
                ⏱ {label}
              </button>
            ))}
          </div>
        )}
        {query && <small>{t("video.matches", { count: matches })}</small>}
        <textarea
          ref={textareaRef}
          value={meta.transcript}
          placeholder={t("video.transcriptHint")}
          onChange={(e) => patch({ transcript: e.target.value })}
        />
      </div>
    </section>
  );
}
