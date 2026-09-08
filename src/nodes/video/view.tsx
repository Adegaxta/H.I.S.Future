import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import { getNodalMeta } from "../metadata";
import { patchNodal } from "../relations";
import { resolveVideoSource } from "../../utils/videoSource";
import NodeTypeLabel from "../../components/NodeTypeLabel";
import { NodalIcon, type NodalViewProps } from "../../components/NodeReferences";
import { NodeNameInput, NodeSearchAction, isWebUrl, openWebUrl } from "../viewPrimitives";

export function VideoNodeView({ node, onMutate, onRename, onOpen: _onOpen, nodes: _nodes, onImport: _onImport, onDelete }: NodalViewProps & { onDelete: (id: string) => void }) {
  const { t } = useLocale(); const meta = getNodalMeta(node.content); const source = useMemo(() => resolveVideoSource(meta.url),[meta.url]);
  const [query,setQuery] = useState(""); const [error,setError] = useState(false); const videoRef = useRef<HTMLVideoElement>(null);
  const patch = (value: Parameters<typeof patchNodal>[2]) => onMutate((c) => patchNodal(c,node.id,value));
  useEffect(() => setError(false),[meta.url]);
  const matches = query ? (meta.transcript.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi")) ?? []).length : 0;
  return <section className="video-node-view"><NodeTypeLabel type="video" /><NodeNameInput node={node} onRename={onRename} className="nodal-title" />
    <div className="video-layout"><div><div className="video-player">{source.kind === "direct" ? <video ref={videoRef} controls src={source.url} onLoadedMetadata={(e) => patch({ duration: Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null, mediaType: e.currentTarget.currentSrc.split("?")[0].split(".").pop() ?? "" })} onError={() => setError(true)} /> : source.kind === "embed" ? <iframe src={source.url} title={node.name} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={() => setError(true)} /> : <span>{source.kind === "empty" ? t("video.noSource") : t("video.unsupported")}</span>}{error && <p role="alert">{t("video.playError")}</p>}</div><label className="video-url"><NodalIcon name="link_1" />{t("nodal.url")}<input type="url" value={meta.url} onChange={(e) => patch({ url: e.target.value })} /></label></div>
      <aside><div className="video-actions"><a className={source.kind === "direct" ? "" : "is-disabled"} href={source.kind === "direct" ? source.url : undefined} download><NodalIcon name="download" />{t("video.download")}</a><button onClick={() => { if (confirm(t("video.deleteConfirm"))) onDelete(node.id); }}><NodalIcon name="delete" />{t("nodal.remove")}</button></div><dl><dt><NodalIcon name="link_1" />{t("nodal.url")}</dt><dd>{meta.url || t("video.unknown")}</dd><dt><NodalIcon name="extension" />{t("video.extension")}</dt><dd>{source.kind === "direct" ? source.extension.toUpperCase() : meta.mediaType || t("video.unknown")}</dd><dt><NodalIcon name="storage" />{t("video.size")}</dt><dd>{meta.size === null ? t("video.unknown") : `${(meta.size/1024/1024).toFixed(1)} MB`}</dd></dl>{source.kind === "external" && isWebUrl(source.url) && <button onClick={() => void openWebUrl(source.url)}>{t("nodal.openLink")}</button>}</aside></div>
    <div className="video-transcript"><header><h2><NodalIcon name="audio_capture" />{t("video.transcript")}</h2><NodeSearchAction value={query} onChange={setQuery} /></header>{query && <small>{t("video.matches",{count:matches})}</small>}<textarea value={meta.transcript} placeholder={t("video.transcriptHint")} onChange={(e) => patch({ transcript:e.target.value })} /></div>
  </section>;
}
