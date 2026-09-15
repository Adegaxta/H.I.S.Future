export interface GraphPreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface GraphUserPreferences {
  showTypes: boolean;
  showIcons: boolean;
  showImages: boolean;
  showArrows: boolean;
  showOrphans: boolean;
  scalePagesByContent: boolean;
  scaleImagesByDimensions: boolean;
  scaleNodesWithZoom: boolean;
  searchQuery: string;
  hiddenTypes: string[];
  labelThreshold: number;
  nodeScale: number;
  linkScale: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  localDepth: number;
}

export const DEFAULT_GRAPH_USER_PREFERENCES: GraphUserPreferences = {
  showTypes: false,
  showIcons: true,
  showImages: true,
  showArrows: true,
  showOrphans: true,
  scalePagesByContent: false,
  scaleImagesByDimensions: false,
  scaleNodesWithZoom: true,
  searchQuery: "",
  hiddenTypes: [],
  labelThreshold: 0.45,
  nodeScale: 1,
  linkScale: 0.45,
  centerForce: 1,
  repelForce: 1,
  linkForce: 1,
  linkDistance: 1,
  localDepth: 1,
};

function clampPreference(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

export function readGraphUserPreferences(
  storage: GraphPreferenceStorage,
  projectKey: string,
): GraphUserPreferences {
  const defaults = DEFAULT_GRAPH_USER_PREFERENCES;
  try {
    const serialized = storage.getItem(`hisfuture:graph:configuration:${projectKey}`);
    const parsed = serialized ? JSON.parse(serialized) as Partial<GraphUserPreferences> : {};
    return {
      showTypes: typeof parsed.showTypes === "boolean" ? parsed.showTypes : readGraphBooleanPreference(storage, `hisfuture:graph:types:${projectKey}`, defaults.showTypes, `hisfuture:graph:concepts:${projectKey}`),
      showIcons: typeof parsed.showIcons === "boolean" ? parsed.showIcons : readGraphBooleanPreference(storage, `hisfuture:graph:icons:${projectKey}`, defaults.showIcons),
      showImages: typeof parsed.showImages === "boolean" ? parsed.showImages : readGraphBooleanPreference(storage, `hisfuture:graph:images:${projectKey}`, defaults.showImages),
      showArrows: typeof parsed.showArrows === "boolean" ? parsed.showArrows : defaults.showArrows,
      showOrphans: typeof parsed.showOrphans === "boolean" ? parsed.showOrphans : defaults.showOrphans,
      scalePagesByContent: typeof parsed.scalePagesByContent === "boolean" ? parsed.scalePagesByContent : defaults.scalePagesByContent,
      scaleImagesByDimensions: typeof parsed.scaleImagesByDimensions === "boolean" ? parsed.scaleImagesByDimensions : defaults.scaleImagesByDimensions,
      scaleNodesWithZoom: typeof parsed.scaleNodesWithZoom === "boolean" ? parsed.scaleNodesWithZoom : defaults.scaleNodesWithZoom,
      searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery.slice(0, 240) : defaults.searchQuery,
      hiddenTypes: Array.isArray(parsed.hiddenTypes)
        ? parsed.hiddenTypes.filter((type): type is string => typeof type === "string").slice(0, 64)
        : defaults.hiddenTypes,
      labelThreshold: clampPreference(parsed.labelThreshold, 0, 1, defaults.labelThreshold),
      nodeScale: clampPreference(parsed.nodeScale, 0.55, 2, defaults.nodeScale),
      linkScale: clampPreference(parsed.linkScale, 0.45, 2.5, defaults.linkScale),
      centerForce: clampPreference(parsed.centerForce, 0, 2, defaults.centerForce),
      repelForce: clampPreference(parsed.repelForce, 0, 2, defaults.repelForce),
      linkForce: clampPreference(parsed.linkForce, 0, 2, defaults.linkForce),
      linkDistance: clampPreference(parsed.linkDistance, 0.5, 2, defaults.linkDistance),
      localDepth: Math.round(clampPreference(parsed.localDepth, 1, 5, defaults.localDepth)),
    };
  } catch {
    return { ...defaults };
  }
}

export function writeGraphUserPreferences(
  storage: GraphPreferenceStorage,
  projectKey: string,
  preferences: GraphUserPreferences,
): void {
  try {
    storage.setItem(`hisfuture:graph:configuration:${projectKey}`, JSON.stringify(preferences));
  } catch {
  }
}

export function readGraphBooleanPreference(
  storage: GraphPreferenceStorage,
  key: string,
  defaultValue: boolean,
  legacyKey?: string,
): boolean {
  try {
    const current = storage.getItem(key);
    if (current !== null) return current === "true";
    if (legacyKey) {
      const legacy = storage.getItem(legacyKey);
      if (legacy !== null) {
        const migrated = legacy !== "false";
        storage.setItem(key, String(migrated));
        return migrated;
      }
    }
  } catch {
  }
  return defaultValue;
}

export function writeGraphBooleanPreference(
  storage: GraphPreferenceStorage,
  key: string,
  value: boolean,
): void {
  try {
    storage.setItem(key, String(value));
  } catch {
  }
}
