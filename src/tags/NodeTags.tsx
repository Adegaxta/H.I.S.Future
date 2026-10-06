import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";
import tagAsset from "../assets/third-party/Lucide.dev/icons/tag.svg";
import tagPlusAsset from "../assets/third-party/Lucide.dev/icons/tag-plus.svg";
import {
  createTag,
  deleteTag,
  getNodeTags,
  listTags,
  reorderTags,
  setNodeTag,
  TAGS_CHANGED_EVENT,
  updateTag,
} from "./repository";
import { TagChip } from "./TagChip";
import { TagPicker } from "./TagPicker";
import type { Tag } from "./types";
import "./styles.css";

export function NodeTags({ nodeId, interactive = true }: { nodeId: string; interactive?: boolean }) {
  const { t } = useLocale();
  const [tags, setTags] = useState<Tag[]>([]);
  const [assigned, setAssigned] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      const [allTags, nodeTags] = await Promise.all([listTags(), getNodeTags(nodeId)]);
      setTags(allTags);
      setAssigned(nodeTags);
      setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [nodeId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const refresh = () => void reload();
    window.addEventListener(TAGS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(TAGS_CHANGED_EVENT, refresh);
  }, [reload]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  useEffect(() => { setOpen(false); }, [nodeId]);

  const assignedIds = useMemo(() => new Set(assigned.map((tag) => tag.id)), [assigned]);
  const run = async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    setError(null);
    try { return await operation(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); return null; }
  };

  if (!interactive && assigned.length === 0) return null;

  return (
    <div className="node-tags" ref={anchorRef}>
      {interactive && (
        <button
          type="button"
          className={`node-tags__button${open ? " is-active" : ""}`}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={t("tags.manage")}
          title={t("tags.manage")}
        >
          <img src={assigned.length === 0 || hovering ? tagPlusAsset : tagAsset} alt="" />
        </button>
      )}
      <div className="node-tags__chips">
        {assigned.map((tag) => <TagChip key={tag.id} tag={tag} />)}
      </div>
      {open && (
        <div className="tag-picker" role="dialog" aria-label={t("tags.title")}>
          <TagPicker
            tags={tags}
            assignedIds={assignedIds}
            error={error}
            onToggle={(tag) => {
              const nextAssigned = !assignedIds.has(tag.id);
              setAssigned((current) => nextAssigned ? [...current, tag].sort((a, b) => a.order - b.order) : current.filter((item) => item.id !== tag.id));
              void run(() => setNodeTag(nodeId, tag.id, nextAssigned)).then((result) => { if (result === null) void reload(); });
            }}
            onCreate={(draft) => run(() => createTag(draft))}
            onUpdate={(id, draft) => run(() => updateTag(id, draft))}
            onDelete={async (id) => {
              if (!window.confirm(t("tags.deleteConfirm"))) return false;
              const result = await run(() => deleteTag(id));
              return result !== null;
            }}
            onReorder={(sourceId, targetId) => {
              const next = [...tags];
              const sourceIndex = next.findIndex((tag) => tag.id === sourceId);
              const targetIndex = next.findIndex((tag) => tag.id === targetId);
              if (sourceIndex < 0 || targetIndex < 0) return;
              const [moved] = next.splice(sourceIndex, 1);
              next.splice(targetIndex, 0, moved);
              const ordered = next.map((tag, order) => ({ ...tag, order }));
              setTags(ordered);
              setAssigned((current) => current.map((tag) => ordered.find((item) => item.id === tag.id) ?? tag).sort((a, b) => a.order - b.order));
              void run(() => reorderTags(ordered.map((tag) => tag.id))).then((result) => { if (result === null) void reload(); });
            }}
          />
        </div>
      )}
    </div>
  );
}
