import { useEffect, useState } from "react";
import { useLocale } from "../i18n/LocaleContext";
import moreAsset from "../assets/third-party/google-material/icons/more_vert.svg";
import dragAsset from "../assets/third-party/google-material/icons/drag_indicator.svg";
import { DEFAULT_TAG_COLOR } from "./palette";
import { TagChip } from "./TagChip";
import { TagColorPicker } from "./TagColorPicker";
import type { Tag, TagDraft } from "./types";

interface TagPickerProps {
  tags: Tag[];
  assignedIds: ReadonlySet<string>;
  error: string | null;
  onToggle: (tag: Tag) => void;
  onCreate: (draft: TagDraft) => Promise<Tag | null>;
  onUpdate: (id: string, draft: TagDraft) => Promise<Tag | null>;
  onDelete: (id: string) => Promise<boolean>;
  onReorder: (sourceId: string, targetId: string) => void;
}

export function TagPicker({ tags, assignedIds, error, onToggle, onCreate, onUpdate, onDelete, onReorder }: TagPickerProps) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Tag | "new" | null>(null);
  const filtered = tags.filter((tag) => tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  if (editing) {
    return (
      <TagEditor
        tag={editing === "new" ? null : editing}
        error={error}
        onBack={() => setEditing(null)}
        onCreate={async (draft) => {
          const created = await onCreate(draft);
          if (created) setEditing(created);
        }}
        onUpdate={async (id, draft) => {
          const updated = await onUpdate(id, draft);
          if (updated) setEditing(updated);
        }}
        onDelete={async (id) => {
          if (await onDelete(id)) setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="tag-picker__view">
      <div className="tag-picker__title">{t("tags.title")}</div>
      <input
        className="tag-picker__search"
        type="search"
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("tags.search")}
        aria-label={t("tags.search")}
      />
      <div className="tag-picker__divider" />
      <div className="tag-picker__list">
        {filtered.map((tag) => (
          <div
            className="tag-picker__row"
            key={tag.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = event.dataTransfer.getData("application/x-his-tag");
              if (sourceId && sourceId !== tag.id) onReorder(sourceId, tag.id);
            }}
          >
            <button
              type="button"
              className="tag-picker__drag"
              draggable
              title={t("tags.reorder")}
              aria-label={t("tags.reorder")}
              onClick={(event) => event.stopPropagation()}
              onDragStart={(event) => {
                event.stopPropagation();
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-his-tag", tag.id);
              }}
            >
              <img className="tag-picker__more-icon" src={moreAsset} alt="" />
              <img className="tag-picker__drag-icon" src={dragAsset} alt="" />
            </button>
            <button type="button" className="tag-picker__toggle" onClick={() => onToggle(tag)} aria-pressed={assignedIds.has(tag.id)}>
              <TagChip tag={tag} selected={assignedIds.has(tag.id)} />
            </button>
            <button type="button" className="tag-picker__edit" onClick={() => setEditing(tag)}>{t("tags.edit")}</button>
          </div>
        ))}
        {filtered.length === 0 && <div className="tag-picker__empty">{t("tags.empty")}</div>}
      </div>
      <div className="tag-picker__divider" />
      <button type="button" className="tag-picker__create" onClick={() => setEditing("new")}>+ {t("tags.create")}</button>
      {error && <div className="tag-picker__error" role="alert">{error}</div>}
    </div>
  );
}

function TagEditor({ tag, error, onBack, onCreate, onUpdate, onDelete }: {
  tag: Tag | null;
  error: string | null;
  onBack: () => void;
  onCreate: (draft: TagDraft) => Promise<void>;
  onUpdate: (id: string, draft: TagDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useLocale();
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? DEFAULT_TAG_COLOR);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(tag?.name ?? "");
    setColor(tag?.color ?? DEFAULT_TAG_COLOR);
  }, [tag?.id, tag?.name, tag?.color]);

  const saveExisting = async (nextName = name, nextColor = color) => {
    if (!tag || !nextName.trim() || (nextName.trim() === tag.name && nextColor.toUpperCase() === tag.color.toUpperCase())) return;
    setBusy(true);
    await onUpdate(tag.id, { name: nextName, color: nextColor });
    setBusy(false);
  };

  return (
    <div className="tag-editor">
      <button type="button" className="tag-editor__back" onClick={onBack}>← {t("tags.title")}</button>
      <input
        className="tag-editor__name"
        value={name}
        autoFocus
        maxLength={80}
        placeholder={t("tags.name")}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => void saveExisting()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") onBack();
        }}
      />
      <div className="tag-editor__divider" />
      <TagColorPicker value={color} onChange={(nextColor) => {
        setColor(nextColor);
        if (tag) void saveExisting(name, nextColor);
      }} />
      {!tag && (
        <button type="button" className="tag-editor__save" disabled={busy || !name.trim()} onClick={async () => {
          setBusy(true);
          await onCreate({ name, color });
          setBusy(false);
        }}>{t("tags.create")}</button>
      )}
      {tag && <button type="button" className="tag-editor__delete" disabled={busy} onClick={() => void onDelete(tag.id)}>{t("tags.delete")}</button>}
      {error && <div className="tag-picker__error" role="alert">{error}</div>}
    </div>
  );
}
