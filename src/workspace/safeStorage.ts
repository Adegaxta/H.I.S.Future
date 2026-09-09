const MAX_LOCAL_STORAGE_STRING_BYTES = 900_000;

export function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    const estimatedBytes = new Blob([value]).size;
    if (estimatedBytes > MAX_LOCAL_STORAGE_STRING_BYTES) {
      console.warn(
        `[storage] Se descarta ${key}: valor demasiado grande (${(estimatedBytes / 1024 / 1024).toFixed(1)} MB) para localStorage.`,
      );
      localStorage.removeItem(key);
      return false;
    }

    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`[storage] No se pudo guardar ${key}; se ignora para evitar el quota.`, error);
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignorado: el almacenamiento puede no estar disponible por completo.
    }
    return false;
  }
}
