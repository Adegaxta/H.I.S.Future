import type { RenderNodeType } from "../defs/nodeTypes";
import { translate } from "../i18n/core";
import type { TranslationKey } from "../i18n/translations";
import type { PresenceActivity, PresenceContextState } from "./types";

const NODE_ACTIVITY: Readonly<Partial<Record<RenderNodeType, TranslationKey>>> = {
  pagina: "presence.activity.page",
  "pagina-carpeta": "presence.activity.page",
  calendario: "presence.activity.calendar",
  tempo: "presence.activity.tempo",
  pdf: "presence.activity.pdf",
  imagen: "presence.activity.image",
  video: "presence.activity.video",
  curso: "presence.activity.course",
  tarea: "presence.activity.task",
  categoria: "presence.activity.categories",
};

const SURFACE_ACTIVITY: Readonly<Record<PresenceContextState["surface"], TranslationKey>> = {
  home: "presence.activity.generic",
  workspace: "presence.activity.generic",
  graph: "presence.activity.graph",
  settings: "presence.activity.settings",
  trash: "presence.activity.trash",
  changelog: "presence.activity.changelog",
};

interface PresenceAsset {
  image: string;
  text: TranslationKey;
}

const NODE_ASSET: Readonly<Partial<Record<RenderNodeType, PresenceAsset>>> = {
  pagina: { image: "node_page", text: "presence.asset.page" },
  "pagina-carpeta": { image: "node_page", text: "presence.asset.page" },
  calendario: { image: "node_calendar", text: "presence.asset.calendar" },
  tempo: { image: "node_tempo", text: "presence.asset.tempo" },
  proyecto: { image: "node_project", text: "presence.asset.project" },
  curso: { image: "node_course", text: "presence.asset.course" },
  pdf: { image: "node_pdf", text: "presence.asset.pdf" },
  imagen: { image: "node_image", text: "presence.asset.image" },
  video: { image: "node_video", text: "presence.asset.video" },
};

const GRAPH_ASSET: PresenceAsset = { image: "graph_7", text: "presence.asset.graph" };

export function projectPresence(context: PresenceContextState): PresenceActivity {
  const smallAsset = context.surface === "graph"
    ? GRAPH_ASSET
    : context.nodeType
      ? NODE_ASSET[context.nodeType]
      : undefined;
  return {
    details: translate(
      context.locale,
      context.nodeType
        ? NODE_ACTIVITY[context.nodeType] ?? SURFACE_ACTIVITY[context.surface]
        : SURFACE_ACTIVITY[context.surface],
    ),
    state: "H.I.S. Future",
    largeImage: "hisfuture_icon",
    largeText: "H.I.S. Future",
    ...(smallAsset && {
      smallImage: smallAsset.image,
      smallText: translate(context.locale, smallAsset.text),
    }),
  };
}

export function presenceActivityFingerprint(activity: PresenceActivity): string {
  return JSON.stringify(activity);
}
