import type { RenderNodeType } from "../defs/nodeTypes";
import type { Locale } from "../i18n/core";

export type PresenceSurface =
  | "home"
  | "workspace"
  | "graph"
  | "settings"
  | "trash"
  | "changelog";

export interface PresenceContextState {
  surface: PresenceSurface;
  nodeType?: RenderNodeType | null;
  locale: Locale;
}

export interface PresenceActivity {
  details: string;
  state: string;
  largeImage: string;
  largeText: string;
  smallImage?: string;
  smallText?: string;
}
