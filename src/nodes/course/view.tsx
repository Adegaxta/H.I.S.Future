import { useEffect, useState } from "react";
import { useLocale } from "../../i18n/LocaleContext";
import type { BaseNodeType, NodeItem } from "../../types/nodes";
import { courseNodeName, courseTasks } from "./domain";
import { getNodalMeta } from "../metadata";
import { patchNodal, relatedNode, withRelation, withoutRelation } from "../relations";
import { getTempoMeta } from "../../utils/temporalMeta";
import { getImageResourceInfo } from "../../utils/imageResource";
import NodeTypeLabel from "../../components/NodeTypeLabel";
import PdfNodeView from "../pdf/view";
import { NodalIcon, NodePicker, NodeReference, NodeReferenceList, type NodalViewProps } from "../../components/NodeReferences";
import { NodeIcon, SidebarIcon } from "../../components/SidebarIcon";
import { NodeSearchAction, isWebUrl, openWebUrl } from "../viewPrimitives";

const formatDate = (iso: string) => iso ? new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${iso}T12:00:00`)) : "";
function CourseNav({ tab, setTab }: { tab: string; setTab: (tab: "syllabus" | "room" | "classes" | "content" | "evaluations") => void }) {
  const { t } = useLocale();
  const items = [["syllabus","syllable","course.syllabus"],["room","classroom","course.room"],["classes","classes_video","course.classes"],["content","content","course.content"],["evaluations","Evaluation","course.evaluations"]] as const;
  return <nav className="course-nav">{items.map(([id, icon, key]) => <button key={id} type="button" className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}><NodalIcon name={icon} />{t(key)}</button>)}</nav>;
}

export function CourseNodeView(props: NodalViewProps & { renderCalendar: (calendar: NodeItem, embedded?: boolean) => React.ReactNode }) {
  const { node, nodes, onMutate, onOpen, onImport } = props;
  const { t } = useLocale();
  const [tab, setTab] = useState<"syllabus" | "room" | "classes" | "content" | "evaluations">("syllabus");
  const [picker, setPicker] = useState<{ role: "syllabus" | "class" | "content" | "cover"; types?: BaseNodeType[] } | null>(null);
  const [query, setQuery] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(true);
  const [coverOpen, setCoverOpen] = useState(true);
  const meta = getNodalMeta(node.content);
  const [courseTitle, setCourseTitle] = useState(() => meta.courseTitle || node.name);
  useEffect(() => { const nextMeta = getNodalMeta(node.content); setTab("syllabus"); setScheduleOpen(true); setCoverOpen(true); setPicker(null); setQuery(""); setDescriptionOpen(Boolean(nextMeta.description)); setCourseTitle(nextMeta.courseTitle || node.name); }, [node.id]);
  useEffect(() => setCourseTitle(meta.courseTitle || node.name), [meta.courseTitle, node.name]);
  const syllabus = relatedNode(nodes, node, "syllabus");
  const cover = relatedNode(nodes, node, "cover");
  const coverResource = cover ? getImageResourceInfo(cover.content, cover.name) : null;
  const calendar = relatedNode(nodes, node, "calendar");
  const tasks = courseTasks(nodes, node.id);
  const patch = (value: Parameters<typeof patchNodal>[2]) => onMutate((current) => patchNodal(current, node.id, value));
  const updateIdentity = (change: Partial<Pick<typeof meta, "code" | "courseTitle" | "modality">>) => {
    const next = { code: change.code ?? meta.code, courseTitle: change.courseTitle ?? (meta.courseTitle || courseTitle || node.name), modality: change.modality ?? meta.modality };
    const name = courseNodeName(next.code, next.courseTitle, next.modality) || node.name;
    onMutate((current) => patchNodal(current, node.id, next).map((item) => item.id === node.id ? { ...item, name } : item));
  };
  const selectRelation = (role: "syllabus" | "class" | "content" | "cover", id: string) => onMutate((current) => withRelation(current, node.id, role, id));
  const createAndLink = (role: "class" | "content", name: string, type: BaseNodeType) => {
    const id = crypto.randomUUID();
    onMutate((current) => {
      const created = { id, name, type, parentId: null, order: current.filter((candidate) => !candidate.parentId).length, content: "<p><br></p>" } as NodeItem;
      const next = [...current, created];
      return type === "tarea" ? withRelation(next, id, "course", node.id) : withRelation(next, node.id, role, id);
    });
  };
  const classRelations = meta.relations.filter((relation) => relation.role === "class");
  return <section className="course-node-view">
    <div className="course-node-view__identity"><NodeTypeLabel type="curso" />
      <div className="course-identity-fields"><input value={meta.code} placeholder={t("course.code")} aria-label={t("course.code")} onChange={(event) => updateIdentity({ code: event.target.value })} /><input value={courseTitle} placeholder={t("course.name")} aria-label={t("course.name")} onChange={(event) => setCourseTitle(event.target.value)} onBlur={() => updateIdentity({ courseTitle })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setCourseTitle(meta.courseTitle || node.name); }} /><input value={meta.modality} placeholder={t("course.modality")} aria-label={t("course.modality")} onChange={(event) => updateIdentity({ modality: event.target.value })} /></div>
      <label className="course-link-field"><span><NodeIcon type="curso" />{t("course.link")}</span><span className="course-link-input"><NodalIcon name="link_2" /><input type="url" value={meta.url} aria-label={t("course.link")} onChange={(event) => patch({ url: event.target.value })} /></span></label>
      <button className="course-section-title" type="button" onClick={() => setCoverOpen((current) => !current)} aria-expanded={coverOpen} aria-controls={`course-cover-${node.id}`}><span className={`course-caret${coverOpen ? "" : " is-collapsed"}`} />{t("course.cover")}</button>
      {coverOpen && (cover ? <div id={`course-cover-${node.id}`} className="course-cover" style={coverResource ? { backgroundImage: `url(${coverResource.src})` } : undefined}><i className="corner corner--tl" /><i className="corner corner--tr" /><i className="corner corner--bl" /><i className="corner corner--br" /><NodeReference node={cover} nodes={nodes} onOpen={onOpen} /><button className="nodal-unlink" title={t("nodal.unlink")} onClick={() => onMutate((current) => withRelation(current,node.id,"cover",null))}>×</button></div> : <button className="course-cover" type="button" aria-label={t("course.cover")} onClick={() => setPicker({ role: "cover", types: ["imagen"] })}><i className="corner corner--tl" /><i className="corner corner--tr" /><i className="corner corner--bl" /><i className="corner corner--br" /><SidebarIcon name="image-add" /></button>)}
      <div className={`course-description-field${descriptionOpen ? " is-open" : ""}`}><button type="button" onClick={() => setDescriptionOpen((current) => !current)} aria-expanded={descriptionOpen} aria-controls={`course-description-${node.id}`}><span className="course-caret" aria-hidden="true" />{t("course.description")}</button>{descriptionOpen && <textarea id={`course-description-${node.id}`} value={meta.description} aria-label={t("course.description")} onChange={(event) => patch({ description: event.target.value })} />}</div>
      <div className={`course-schedule${scheduleOpen ? " is-open" : ""}`}><button className="course-schedule__toggle" type="button" onClick={() => setScheduleOpen((current) => !current)} aria-expanded={scheduleOpen} aria-controls={`course-schedule-${node.id}`}><span className="course-caret" aria-hidden="true" />{t("course.schedule")}</button>{scheduleOpen && <div id={`course-schedule-${node.id}`} className="course-schedule__calendar">{calendar && props.renderCalendar(calendar, true)}</div>}</div>
    </div>
    <div className="course-node-view__context"><CourseNav tab={tab} setTab={setTab} />
      {tab === "syllabus" && <div className="course-context-panel course-syllabus">{syllabus ? <><PdfNodeView node={syllabus} /><button onClick={() => onOpen(syllabus.id)}>{t("nodal.open")}</button></> : <button className="course-empty-action" onClick={() => setPicker({ role: "syllabus", types: ["pdf"] })}>{t("course.addSyllabus")}<b>＋</b></button>}</div>}
      {tab === "room" && <div className="course-context-panel"><div className="course-context-actions"><button className="nodal-add" type="button" title={t("nodal.add")} aria-label={t("nodal.add")} onClick={() => patch({ roomLinks: [...meta.roomLinks, { id: crypto.randomUUID(), label: "", url: "" }] })}><NodalIcon name="add_link" /></button><NodeSearchAction value={query} onChange={setQuery} /></div>{meta.roomLinks.map((link) => <div className="room-link" key={link.id}><button className="room-link__icon" type="button" disabled={!isWebUrl(link.url)} title={t("nodal.openLink")} aria-label={t("nodal.openLink")} onClick={() => void openWebUrl(link.url)}><NodalIcon name="link_2" /></button><input value={link.url} type="url" placeholder={t("course.roomLink")} aria-label={t("course.roomLink")} onChange={(event) => patch({ roomLinks: meta.roomLinks.map((item) => item.id === link.id ? { ...item, label: "", url: event.target.value } : item) })} onKeyDown={(event) => { if (event.key === "Enter") void openWebUrl(link.url); }} /><button type="button" disabled={!isWebUrl(link.url)} onClick={() => void openWebUrl(link.url)}>{t("nodal.openLink")}</button><button type="button" onClick={() => patch({ roomLinks: meta.roomLinks.filter((item) => item.id !== link.id) })}>×</button></div>)}</div>}
      {tab === "classes" && <div className="course-context-panel"><div className="course-context-actions"><button className="nodal-add" title={t("nodal.add")} aria-label={t("nodal.add")} onClick={() => setPicker({ role: "class", types: ["video"] })}><NodalIcon name="add_video" /></button><NodeSearchAction value={query} onChange={setQuery} /></div>{classRelations.map((relation, index) => { const video = nodes.find((candidate) => candidate.id === relation.targetId); if (!video || !video.name.toLowerCase().includes(query.toLowerCase())) return null; const videoMeta = getNodalMeta(video.content); const label = [meta.code, `T${String(index + 1).padStart(2,"0")}`, video.name, relation.date ? formatDate(relation.date) : "", videoMeta.duration ? `${Math.floor(videoMeta.duration / 3600)}h${String(Math.floor(videoMeta.duration % 3600 / 60)).padStart(2,"0")}m` : ""].filter(Boolean).join(" - "); return <div className="node-reference-row" key={relation.targetId}><NodeReference node={video} nodes={nodes} onOpen={onOpen} label={label} /><button className="nodal-unlink" onClick={() => onMutate((current) => withoutRelation(current,node.id,"class",relation.targetId))}>×</button></div>; })}</div>}
      {tab === "content" && <div className="course-context-panel course-content-columns"><section><h2><NodalIcon name="material" />{t("course.material")}</h2><button className="nodal-add" onClick={() => setPicker({ role: "content" })}>＋</button><NodeReferenceList source={node} role="content" nodes={nodes} onOpen={onOpen} onRemove={(id) => onMutate((current) => withoutRelation(current,node.id,"content",id))} /></section><section><h2><NodalIcon name="task" />{t("course.tasks")}</h2><button className="nodal-add" onClick={() => createAndLink("content", t("nodes.task.label"), "tarea")}>＋</button>{tasks.map((task) => <NodeReference key={task.id} node={task} nodes={nodes} onOpen={onOpen} />)}</section></div>}
      {tab === "evaluations" && <div className="course-context-panel"><div className="course-context-actions course-context-actions--search"><NodeSearchAction value={query} onChange={setQuery} /></div>{courseTasks(nodes,node.id,true).filter((candidate) => candidate.name.toLowerCase().includes(query.toLowerCase())).map((task) => <div className="evaluation-row" key={task.id}><NodeReference node={task} nodes={nodes} onOpen={onOpen} /><span><NodalIcon name="undated" />{relatedNode(nodes,task,"tempo") ? formatDate(getTempoMeta(relatedNode(nodes,task,"tempo")!.content).date) : t("task.undated")}</span></div>)}</div>}
    </div>
    {picker && <NodePicker nodes={nodes.filter((candidate) => candidate.id !== node.id)} types={picker.types} onChoose={(id) => selectRelation(picker.role,id)} onCreate={picker.role === "class" || picker.role === "content" ? (name,type) => createAndLink(picker.role as "class"|"content",name,type) : undefined} onImport={picker.role === "syllabus" || picker.role === "cover" ? onImport : undefined} onClose={() => setPicker(null)} />}
  </section>;
}
