export interface GraphPreferenceStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
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
