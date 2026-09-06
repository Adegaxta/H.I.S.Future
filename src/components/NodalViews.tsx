import { useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useLocale } from "../i18n/LocaleContext";
import type { BaseNodeType, NodeItem } from "../types/nodes";
import { calendarTempos, courseNodeName, courseTasks, ensureCourseCalendar, getNodalMeta, patchNodal, relatedNode, scheduleTask, withRelation, withoutRelation } from "../utils/nodalMeta";
import { getCalendarMeta, getTempoMeta, type TimeFormat } from "../utils/temporalMeta";
import { resolveVideoSource } from "../utils/videoSource";
import { getImageResourceInfo } from "../utils/imageResource";
import { normalizeWebUrl } from "../utils/webUrl";
import NodeTypeLabel from "./NodeTypeLabel";
import PdfNodeView from "./PdfNodeView";
import TempoInspector from "./TempoInspector";
import { NodalIcon, NodePicker, NodeReference, NodeReferenceList, type NodalViewProps } from "./NodeReferences";
import { NodeIcon, SidebarIcon } from "./SidebarIcon";

const isWebUrl = (value: string) => Boolean(normalizeWebUrl(value));
const openWebUrl = async (value: string) => {
  const url = normalizeWebUrl(value);
  if (!url) return;
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};
const formatDate = (iso: string) => iso ? new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${iso}T12:00:00`)) : "";
function NameInput({ node, onRename, className = "", placeholder = "" }: { node: NodeItem; onRename: (id: string, name: string) => void; className?: string; placeholder?: string }) {
  const [value, setValue] = useState(node.name);
  useEffect(() => setValue(node.name), [node.id, node.name]);
  const commit = () => value.trim() ? onRename(node.id, value) : setValue(node.name);
  return <input className={className} value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setValue(node.name); }} />;
}
function SearchAction({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useLocale();
  return <label className="nodal-inline-search" title={t("nodal.search")}><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={t("nodal.search")} aria-label={t("nodal.search")} /><SidebarIcon name="search" /></label>;
}
function CourseNav({ tab, setTab }: { tab: string; setTab: (tab: "syllabus" | "room" | "classes" | "content" | "evaluations") => void }) {
  const { t } = useLocale();
  const items = [["syllabus","syllable","course.syllabus"],["room","classroom","course.room"],["classes","classes_video","course.classes"],["content","content","course.content"],["evaluations","Evaluation","course.evaluations"]] as const;
  return <nav className="course-nav">{items.map(([id, icon, key]) => <button key={id} type="button" className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}><NodalIcon name={icon} />{t(key)}</button>)}</nav>;
}
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function CourseCalendarPreview({ calendar, tempos, locale, onOpen }: { calendar: NodeItem | undefined; tempos: NodeItem[]; locale: string; onOpen: (id: string) => void }) {
  const anchor = calendar ? new Date(`${getCalendarMeta(calendar.content).currentDate}T12:00:00`) : new Date();
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setDate(monday.getDate() + index); return date; });
  const hours = Array.from({ length: 11 }, (_, index) => index + 8);
  const entriesFor = (date: Date) => tempos.filter((tempo) => {
    const meta = getTempoMeta(tempo.content);
    const day = isoDate(date);
    if (meta.subtype !== "weekly") return meta.date === day;
    const weekday = ((date.getDay() + 6) % 7 + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
    return day >= meta.date && (!meta.endDate || day <= meta.endDate) && (!meta.activeWeekdays || meta.activeWeekdays.includes(weekday));
  });
  return <div className="course-calendar-preview" aria-label={calendar?.name}>
    <div className="course-calendar-preview__heading"><span />{days.map((date) => <time key={isoDate(date)}><small>{new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date).replace(".", "")}</small><b>{date.getDate()}</b></time>)}</div>
    <div className="course-calendar-preview__body"><div className="course-calendar-preview__hours">{hours.map((hour) => <span key={hour}>{hour}:00</span>)}</div>{days.map((date) => <div className="course-calendar-preview__day" key={isoDate(date)}>{hours.map((hour) => <i key={hour} />)}{entriesFor(date).map((tempo) => { const meta = getTempoMeta(tempo.content); const hour = meta.startTime ? Number(meta.startTime.slice(0, 2)) : 8; return <button key={tempo.id} style={{ gridRow: `${Math.max(1, Math.min(11, hour - 7))} / span 1`, borderColor: meta.color }} title={tempo.name} onClick={() => onOpen(tempo.id)}>{tempo.name}</button>; })}</div>)}</div>
  </div>;
}
export function CourseNodeView(props: NodalViewProps) {
  const { node, nodes, onMutate, onOpen, onImport } = props;
  const { locale, t } = useLocale();
  const [tab, setTab] = useState<"syllabus" | "room" | "classes" | "content" | "evaluations">("syllabus");
  const [picker, setPicker] = useState<{ role: "syllabus" | "class" | "content" | "cover"; types?: BaseNodeType[] } | null>(null);
  const [query, setQuery] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const meta = getNodalMeta(node.content);
  const [courseTitle, setCourseTitle] = useState(() => meta.courseTitle || node.name);
  useEffect(() => { const nextMeta = getNodalMeta(node.content); setTab("syllabus"); setPicker(null); setQuery(""); setDescriptionOpen(Boolean(nextMeta.description)); setCourseTitle(nextMeta.courseTitle || node.name); }, [node.id]);
  const syllabus = relatedNode(nodes, node, "syllabus");
  const cover = relatedNode(nodes, node, "cover");
  const coverResource = cover ? getImageResourceInfo(cover.content, cover.name) : null;
  const calendar = relatedNode(nodes, node, "calendar");
  const calendarEntries = calendar ? calendarTempos(nodes, calendar.id) : [];
  const tasks = courseTasks(nodes, node.id);
  const patch = (value: Parameters<typeof patchNodal>[2]) => onMutate((current) => patchNodal(current, node.id, value));
  const updateIdentity = (change: Partial<Pick<typeof meta, "code" | "courseTitle" | "modality">>) => {
    const next = {
      code: change.code ?? meta.code,
      courseTitle: change.courseTitle ?? (meta.courseTitle || courseTitle || node.name),
      modality: change.modality ?? meta.modality,
    };
    const name = courseNodeName(next.code, next.courseTitle, next.modality) || node.name;
    onMutate((current) => patchNodal(current, node.id, next).map((item) => item.id === node.id ? { ...item, name } : item));
  };
  const selectRelation = (role: typeof picker extends infer _ ? "syllabus" | "class" | "content" | "cover" : never, id: string) => onMutate((current) => withRelation(current, node.id, role, id));
  const createAndLink = (role: "class" | "content", name: string, type: BaseNodeType) => {
    const id = crypto.randomUUID();
    onMutate((current) => {
      const created = { id, name, type, parentId: null, order: current.filter((n) => !n.parentId).length, content: "<p><br></p>" } as NodeItem;
      const next = [...current, created];
      return type === "tarea" ? withRelation(next, id, "course", node.id) : withRelation(next, node.id, role, id);
    });
  };
  const classRelations = meta.relations.filter((r) => r.role === "class");
  return <section className="course-node-view">
    <div className="course-node-view__identity"><NodeTypeLabel type="curso" />
      <div className="course-identity-fields"><input value={meta.code} placeholder={t("course.code")} aria-label={t("course.code")} onChange={(e) => updateIdentity({ code: e.target.value })} /><input value={courseTitle} placeholder={t("course.name")} aria-label={t("course.name")} onChange={(e) => setCourseTitle(e.target.value)} onBlur={() => updateIdentity({ courseTitle })} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setCourseTitle(meta.courseTitle || node.name); }} /><input value={meta.modality} placeholder={t("course.modality")} aria-label={t("course.modality")} onChange={(e) => updateIdentity({ modality: e.target.value })} /></div>
      <div className="course-section-title"><span className="course-caret" />{t("course.cover")}</div>
      {cover ? <div className="course-cover" style={coverResource ? { backgroundImage: `url(${coverResource.src})` } : undefined}><i className="corner corner--tl" /><i className="corner corner--tr" /><i className="corner corner--bl" /><i className="corner corner--br" /><NodeReference node={cover} nodes={nodes} onOpen={onOpen} /><button className="nodal-unlink" title={t("nodal.unlink")} onClick={() => onMutate((current) => withRelation(current,node.id,"cover",null))}>×</button></div> : <button className="course-cover" type="button" aria-label={t("course.cover")} onClick={() => setPicker({ role: "cover", types: ["imagen"] })}><i className="corner corner--tl" /><i className="corner corner--tr" /><i className="corner corner--bl" /><i className="corner corner--br" /><SidebarIcon name="image-add" /></button>}
      <label className="course-link-field"><span><NodeIcon type="curso" />{t("course.link")}</span><span className="course-link-input"><NodalIcon name="link_2" /><input type="url" value={meta.url} aria-label={t("course.link")} onChange={(e) => patch({ url: e.target.value })} /></span></label>
      <div className={`course-description-field${descriptionOpen ? " is-open" : ""}`}><button type="button" onClick={() => setDescriptionOpen((current) => !current)} aria-expanded={descriptionOpen}><span className="course-caret" /><span className={meta.description ? "has-value" : ""}>{descriptionOpen && meta.description ? "" : meta.description || t("course.description")}</span></button>{descriptionOpen && <textarea autoFocus value={meta.description} placeholder={t("course.description")} aria-label={t("course.description")} onChange={(e) => patch({ description: e.target.value })} />}</div>
      <div className="course-schedule"><strong><NodeIcon type="calendario" />{t("course.schedule")}</strong><CourseCalendarPreview calendar={calendar} tempos={calendarEntries} locale={locale} onOpen={onOpen} /></div>
    </div>
    <div className="course-node-view__context"><CourseNav tab={tab} setTab={setTab} />
      {tab === "syllabus" && <div className="course-context-panel course-syllabus">{syllabus ? <><PdfNodeView node={syllabus} /><button onClick={() => onOpen(syllabus.id)}>{t("nodal.open")}</button></> : <button className="course-empty-action" onClick={() => setPicker({ role: "syllabus", types: ["pdf"] })}>{t("course.addSyllabus")}<b>＋</b></button>}</div>}
      {tab === "room" && <div className="course-context-panel"><div className="course-context-actions"><button className="nodal-add" type="button" title={t("nodal.add")} aria-label={t("nodal.add")} onClick={() => patch({ roomLinks: [...meta.roomLinks, { id: crypto.randomUUID(), label: "", url: "" }] })}><NodalIcon name="add_link" /></button><SearchAction value={query} onChange={setQuery} /></div>{meta.roomLinks.map((link) => <div className="room-link" key={link.id}><button className="room-link__icon" type="button" disabled={!isWebUrl(link.url)} title={t("nodal.openLink")} aria-label={t("nodal.openLink")} onClick={() => void openWebUrl(link.url)}><NodalIcon name="link_2" /></button><input value={link.url} type="url" placeholder={t("course.roomLink")} aria-label={t("course.roomLink")} onChange={(e) => patch({ roomLinks: meta.roomLinks.map((item) => item.id === link.id ? { ...item, label: "", url: e.target.value } : item) })} onKeyDown={(e) => { if (e.key === "Enter") void openWebUrl(link.url); }} /><button type="button" disabled={!isWebUrl(link.url)} onClick={() => void openWebUrl(link.url)}>{t("nodal.openLink")}</button><button type="button" onClick={() => patch({ roomLinks: meta.roomLinks.filter((item) => item.id !== link.id) })}>×</button></div>)}</div>}
      {tab === "classes" && <div className="course-context-panel"><div className="course-context-actions"><button className="nodal-add" title={t("nodal.add")} aria-label={t("nodal.add")} onClick={() => setPicker({ role: "class", types: ["video"] })}><NodalIcon name="add_video" /></button><SearchAction value={query} onChange={setQuery} /></div>{classRelations.map((rel, index) => { const video = nodes.find((n) => n.id === rel.targetId); if (!video || !video.name.toLowerCase().includes(query.toLowerCase())) return null; const vm = getNodalMeta(video.content); const label = [meta.code, `T${String(index + 1).padStart(2,"0")}`, video.name, rel.date ? formatDate(rel.date) : "", vm.duration ? `${Math.floor(vm.duration / 3600)}h${String(Math.floor(vm.duration % 3600 / 60)).padStart(2,"0")}m` : ""].filter(Boolean).join(" - "); return <div className="node-reference-row" key={rel.targetId}><NodeReference node={video} nodes={nodes} onOpen={onOpen} label={label} /><button className="nodal-unlink" onClick={() => onMutate((current) => withoutRelation(current,node.id,"class",rel.targetId))}>×</button></div>; })}</div>}
      {tab === "content" && <div className="course-context-panel course-content-columns"><section><h2><NodalIcon name="material" />{t("course.material")}</h2><button className="nodal-add" onClick={() => setPicker({ role: "content" })}>＋</button><NodeReferenceList source={node} role="content" nodes={nodes} onOpen={onOpen} onRemove={(id) => onMutate((c) => withoutRelation(c,node.id,"content",id))} /></section><section><h2><NodalIcon name="task" />{t("course.tasks")}</h2><button className="nodal-add" onClick={() => createAndLink("content", t("nodes.task.label"), "tarea")}>＋</button>{tasks.map((task) => <NodeReference key={task.id} node={task} nodes={nodes} onOpen={onOpen} />)}</section></div>}
      {tab === "evaluations" && <div className="course-context-panel"><div className="course-context-actions course-context-actions--search"><SearchAction value={query} onChange={setQuery} /></div>{courseTasks(nodes,node.id,true).filter((n) => n.name.toLowerCase().includes(query.toLowerCase())).map((task) => <div className="evaluation-row" key={task.id}><NodeReference node={task} nodes={nodes} onOpen={onOpen} /><span><NodalIcon name="undated" />{relatedNode(nodes,task,"tempo") ? formatDate(getTempoMeta(relatedNode(nodes,task,"tempo")!.content).date) : t("task.undated")}</span></div>)}</div>}
    </div>
    {picker && <NodePicker nodes={nodes.filter((n) => n.id !== node.id)} types={picker.types} onChoose={(id) => selectRelation(picker.role,id)} onCreate={picker.role === "class" || picker.role === "content" ? (name,type) => createAndLink(picker.role as "class"|"content",name,type) : undefined} onImport={picker.role === "syllabus" || picker.role === "cover" ? onImport : undefined} onClose={() => setPicker(null)} />}
  </section>;
}

export function TaskNodeView(props: NodalViewProps & { deletedNodes: NodeItem[]; timeFormat: TimeFormat; setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; onDelete: (id: string) => void }) {
  const { node, nodes, onMutate, onOpen, onRename, onImport, deletedNodes, timeFormat, setExpanded } = props;
  const { t } = useLocale(); const [picker, setPicker] = useState<"course"|"material"|"relatedWork"|null>(null);
  const meta = getNodalMeta(node.content); const course = relatedNode(nodes,node,"course"); const tempo = relatedNode(nodes,node,"tempo");
  const patch = (value: Parameters<typeof patchNodal>[2]) => onMutate((c) => patchNodal(c,node.id,value));
  const remove = (role: "material"|"relatedWork", id: string) => onMutate((c) => withoutRelation(c,node.id,role,id));
  const addTempo = (subtype: "daily"|"weekly") => onMutate((c) => scheduleTask(c,node.id,crypto.randomUUID(),crypto.randomUUID(),`${node.name} · Calendar`,subtype));
  return <section className="task-node-view"><NodeTypeLabel type="tarea" /><NameInput node={node} onRename={onRename} className="nodal-title" />
    <div className="task-summary">{course ? <NodeReference node={course} nodes={nodes} onOpen={onOpen} /> : <button onClick={() => setPicker("course")}>{t("task.course")}</button>}<label><NodalIcon name="state" />{t("task.status")}<select value={meta.status} onChange={(e) => patch({ status: e.target.value as typeof meta.status })}><option value="pending">{t("task.pending")}</option><option value="progress">{t("task.progress")}</option><option value="done">{t("task.done")}</option></select></label><label><NodalIcon name="Evaluation" />{t("task.evaluation")}<input type="checkbox" checked={meta.evaluation} onChange={(e) => patch({ evaluation: e.target.checked })} /></label></div>
    <div className="task-body"><aside><h2><NodalIcon name="material" />{t("task.material")}</h2><button className="nodal-add" onClick={() => setPicker("material")}>＋</button><NodeReferenceList source={node} role="material" nodes={nodes} onOpen={onOpen} onRemove={(id) => remove("material",id)} /><h2><NodalIcon name="task" />{t("task.work")}</h2><button className="nodal-add" onClick={() => setPicker("relatedWork")}>＋</button><NodeReferenceList source={node} role="relatedWork" nodes={nodes} onOpen={onOpen} onRemove={(id) => remove("relatedWork",id)} /></aside><main>{tempo ? <TempoInspector tempo={tempo} nodes={nodes} deletedNodes={deletedNodes} timeFormat={timeFormat} variant="standalone" onRename={onRename} onContentChange={(id,content) => onMutate((c) => c.map((n) => n.id === id ? {...n,content}:n))} setExpanded={setExpanded} onOpenDeletedNode={() => undefined} onOpenNodeView={(id) => onOpen(id)} onFileImport={(file) => onImport(file)} /> : <div className="task-tempo-empty"><span><NodalIcon name="undated" />{t("task.undated")}</span><button onClick={() => addTempo("daily")}>{t("task.daily")}</button><button onClick={() => addTempo("weekly")}>{t("task.weekly")}</button></div>}</main></div>
    {picker && <NodePicker nodes={nodes.filter((n) => n.id !== node.id)} types={picker === "course" ? ["curso"] : undefined} onChoose={(id) => onMutate((current) => {
      const related = withRelation(current,node.id,picker,id);
      return picker === "course" && tempo ? ensureCourseCalendar(related,id,crypto.randomUUID(),`${nodes.find((n) => n.id === id)?.name ?? node.name} · Calendar`) : related;
    })} onImport={picker !== "course" ? onImport : undefined} onClose={() => setPicker(null)} />}
  </section>;
}

export function VideoNodeView({ node, onMutate, onRename, onOpen: _onOpen, nodes: _nodes, onImport: _onImport, onDelete }: NodalViewProps & { onDelete: (id: string) => void }) {
  const { t } = useLocale(); const meta = getNodalMeta(node.content); const source = useMemo(() => resolveVideoSource(meta.url),[meta.url]);
  const [query,setQuery] = useState(""); const [error,setError] = useState(false); const videoRef = useRef<HTMLVideoElement>(null);
  const patch = (value: Parameters<typeof patchNodal>[2]) => onMutate((c) => patchNodal(c,node.id,value));
  useEffect(() => setError(false),[meta.url]);
  const matches = query ? (meta.transcript.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi")) ?? []).length : 0;
  return <section className="video-node-view"><NodeTypeLabel type="video" /><NameInput node={node} onRename={onRename} className="nodal-title" />
    <div className="video-layout"><div><div className="video-player">{source.kind === "direct" ? <video ref={videoRef} controls src={source.url} onLoadedMetadata={(e) => patch({ duration: Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null, mediaType: e.currentTarget.currentSrc.split("?")[0].split(".").pop() ?? "" })} onError={() => setError(true)} /> : source.kind === "embed" ? <iframe src={source.url} title={node.name} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={() => setError(true)} /> : <span>{source.kind === "empty" ? t("video.noSource") : t("video.unsupported")}</span>}{error && <p role="alert">{t("video.playError")}</p>}</div><label className="video-url"><NodalIcon name="link_1" />{t("nodal.url")}<input type="url" value={meta.url} onChange={(e) => patch({ url: e.target.value })} /></label></div>
      <aside><div className="video-actions"><a className={source.kind === "direct" ? "" : "is-disabled"} href={source.kind === "direct" ? source.url : undefined} download><NodalIcon name="download" />{t("video.download")}</a><button onClick={() => { if (confirm(t("video.deleteConfirm"))) onDelete(node.id); }}><NodalIcon name="delete" />{t("nodal.remove")}</button></div><dl><dt><NodalIcon name="link_1" />{t("nodal.url")}</dt><dd>{meta.url || t("video.unknown")}</dd><dt><NodalIcon name="extension" />{t("video.extension")}</dt><dd>{source.kind === "direct" ? source.extension.toUpperCase() : meta.mediaType || t("video.unknown")}</dd><dt><NodalIcon name="storage" />{t("video.size")}</dt><dd>{meta.size === null ? t("video.unknown") : `${(meta.size/1024/1024).toFixed(1)} MB`}</dd></dl>{source.kind === "external" && isWebUrl(source.url) && <button onClick={() => void openWebUrl(source.url)}>{t("nodal.openLink")}</button>}</aside></div>
    <div className="video-transcript"><header><h2><NodalIcon name="audio_capture" />{t("video.transcript")}</h2><SearchAction value={query} onChange={setQuery} /></header>{query && <small>{t("video.matches",{count:matches})}</small>}<textarea value={meta.transcript} placeholder={t("video.transcriptHint")} onChange={(e) => patch({ transcript:e.target.value })} /></div>
  </section>;
}

// The domain module owns view selection; the workspace supplies shared services.
export function NodalNodeView(props: React.ComponentProps<typeof TaskNodeView> & { children?: React.ReactNode }) {
  switch (props.node.type) {
    case "curso": return <CourseNodeView {...props} />;
    case "tarea": return <TaskNodeView {...props} />;
    case "video": return <VideoNodeView {...props} />;
    default: return props.children;
  }
}
