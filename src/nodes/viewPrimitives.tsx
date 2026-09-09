import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { NodeItem } from "../types/nodes";
import { normalizeWebUrl } from "../utils/webUrl";
import { useLocale } from "../i18n/LocaleContext";
import { UiIcon } from "../ui/Icon";

export const isWebUrl = (value: string) => Boolean(normalizeWebUrl(value));
export const openWebUrl = async (value: string) => {
  const url = normalizeWebUrl(value);
  if (!url) return;
  try { await openUrl(url); } catch { window.open(url, "_blank", "noopener,noreferrer"); }
};

export function NodeNameInput({ node, onRename, className = "", placeholder = "" }: { node: NodeItem; onRename: (id: string, name: string) => void; className?: string; placeholder?: string }) {
  const [value, setValue] = useState(node.name);
  useEffect(() => setValue(node.name), [node.id, node.name]);
  const commit = () => value.trim() ? onRename(node.id, value) : setValue(node.name);
  return <input className={className} value={value} placeholder={placeholder} aria-label={placeholder} onChange={(event) => setValue(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setValue(node.name); }} />;
}

export function NodeSearchAction({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useLocale();
  return <label className="nodal-inline-search" title={t("nodal.search")}><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={t("nodal.search")} aria-label={t("nodal.search")} /><UiIcon name="search" /></label>;
}
