import { stringifyHtmlMetadata } from "../utils/htmlMetadata";
import { RELATION_ROLES, type NodeRelation } from "./relationTypes";

export interface NodalMeta {
  version: 1;
  relations: NodeRelation[];
  code: string;
  courseTitle: string;
  modality: string;
  description: string;
  url: string;
  roomLinks: { id: string; label: string; url: string }[];
  evaluation: boolean;
  status: "pending" | "progress" | "done";
  transcript: string;
  duration: number | null;
  size: number | null;
  mediaType: string;
  role: "vault-primary" | null;
}

const PATTERN = /<!--hisfuture-nodal-meta:([\s\S]*?)-->/;
const text = (value: unknown) => typeof value === "string" ? value : "";
const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
function rawMeta(content: string): Record<string, unknown> {
  try {
    const value = JSON.parse(PATTERN.exec(content)?.[1] ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export function getNodalMeta(content: string): NodalMeta {
  const raw = rawMeta(content);
  const relations: NodeRelation[] = [];
  if (Array.isArray(raw.relations)) for (const value of raw.relations) {
    if (!value || !RELATION_ROLES.includes(value.role) || typeof value.targetId !== "string" || !value.targetId) continue;
    if (relations.some((item) => item.role === value.role && item.targetId === value.targetId)) continue;
    relations.push({ role: value.role, targetId: value.targetId,
      ...(positive(value.order) !== null ? { order: value.order } : {}),
      ...(typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? { date: value.date } : {}),
    });
  }
  return {
    version: 1, relations, code: text(raw.code), courseTitle: text(raw.courseTitle), modality: text(raw.modality), description: text(raw.description), url: text(raw.url),
    roomLinks: Array.isArray(raw.roomLinks) ? raw.roomLinks.filter((value) => value && typeof value.id === "string" && typeof value.url === "string").map((value) => ({ id: value.id, url: value.url, label: text(value.label) })) : [],
    evaluation: raw.evaluation === true, status: raw.status === "progress" || raw.status === "done" ? raw.status : "pending",
    transcript: text(raw.transcript), duration: positive(raw.duration), size: positive(raw.size), mediaType: text(raw.mediaType),
    role: raw.role === "vault-primary" ? "vault-primary" : null,
  };
}

export function setNodalMeta(content: string, patch: Partial<NodalMeta>): string {
  const json = stringifyHtmlMetadata({ ...rawMeta(content), ...patch, version: 1 });
  return `<!--hisfuture-nodal-meta:${json}-->${content.replace(PATTERN, "")}`;
}
