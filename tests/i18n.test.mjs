import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const server = await createServer({ root, server: { middlewareMode: true }, appType: "custom" });

try {
  const core = await server.ssrLoadModule("/src/i18n/core.ts");
  const catalogs = await server.ssrLoadModule("/src/i18n/translations.ts");
  const persistence = await server.ssrLoadModule("/src/i18n/persistence.ts");
  const { NODE_REGISTRY } = await server.ssrLoadModule("/src/defs/nodeTypes.ts");
  const { SLASH_REGISTRY } = await server.ssrLoadModule("/src/defs/editor.ts");

  assert.equal(core.DEFAULT_LOCALE, "es");
  assert.equal(core.BASE_LOCALE, "es");
  assert.equal(core.normalizeLocale("en"), "en");
  assert.equal(core.normalizeLocale("legacy-corrupt-value"), "es");
  assert.deepEqual(Object.keys(catalogs.EN_TRANSLATIONS).sort(), Object.keys(catalogs.ES_TRANSLATIONS).sort());
  for (const locale of ["es", "en"]) {
    const directory = path.join(root, "src", "i18n", "catalogs", locale);
    const keys = fs.readdirSync(directory).flatMap((name) =>
      [...fs.readFileSync(path.join(directory, name), "utf8").matchAll(/^\s*"([^"]+)":/gm)].map((match) => match[1]),
    );
    assert.equal(new Set(keys).size, keys.length, `${locale} contains duplicate catalog keys`);
  }
  assert.equal(core.translate("en", "nodes.calendar.label"), "Calendar");
  assert.equal(core.translate("es", "context.removeManyFromLore", { count: 3 }), "Quitar 3 Nodos de Lore");
  assert.equal(core.translate("es", "home.recent.removeConfirm", { name: "Árbol 日本" }).includes("Árbol 日本"), true);

  const fallbackKey = "home.settings";
  const englishValue = catalogs.EN_TRANSLATIONS[fallbackKey];
  delete catalogs.EN_TRANSLATIONS[fallbackKey];
  assert.equal(core.translate("en", fallbackKey), catalogs.ES_TRANSLATIONS[fallbackKey]);
  catalogs.EN_TRANSLATIONS[fallbackKey] = englishValue;

  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(persistence.getInitialLocale(storage), "es");
  values.set(persistence.GLOBAL_LOCALE_STORAGE_KEY, "obsolete");
  assert.equal(persistence.getInitialLocale(storage), "es");
  persistence.cacheLocale(storage, "en", "C:/Project");
  assert.equal(persistence.getInitialLocale(storage, "C:/Project"), "en");
  assert.equal(values.get(persistence.GLOBAL_LOCALE_STORAGE_KEY), "en");

  const calendarDefinition = NODE_REGISTRY.get("calendario");
  assert.equal(calendarDefinition.type, "calendario");
  assert.equal(core.translate("en", calendarDefinition.labelKey), "Calendar");
  assert.equal(core.translate("es", calendarDefinition.labelKey), "Calendario");
  assert.equal(SLASH_REGISTRY.get("UL").labelKey, "editor.commands.bullets");

  const criticalSources = [
    "src/screens/HomeScreen.tsx",
    "src/components/AppWorkspace.tsx",
    "src/components/CalendarNodeView.tsx",
    "src/components/LoreAddDialog.tsx",
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  for (const forbidden of [
    'title="Minimizar"',
    'placeholder="Buscar"',
    ">Nodos eliminados<",
    ">Añadir a Lore<",
  ]) {
    assert.equal(criticalSources.includes(forbidden), false, `hardcoded UI copy returned: ${forbidden}`);
  }

  console.log("PASS: typed catalogs, fallback, interpolation, persistence recovery, and presentation-only Node/command labels.");
} finally {
  await server.close();
}
