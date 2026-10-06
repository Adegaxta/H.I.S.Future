# Encuadre de imágenes compartido

El selector ahora separa elegir un original y confirmar su presentación. No crea archivos recortados ni cambia los bytes del recurso. No implementa el futuro sistema de Usos.

## Arquitectura y destinos

Se reutilizan `ImagePickerDialog`, `IconCapabilityPicker`, la biblioteca local, el importador de archivos, Unsplash y los proveedores de emojis e iconos existentes. `PageNodeHeader` también utiliza ahora `IconCapabilityPicker`, eliminando su implementación duplicada de las pestañas y la galería.

Un único `ImageFramingEditor` implementa arrastre, zoom relativo a cover, límites, máscara exterior y confirmación. El marco y los renders utilizan `imagePresentationGeometry`; `PresentedImage` presenta el original sin cambiar su fuente. El borde usa `var(--his-accent)`.

- **Baúl:** marco 1:1; se aplica al avatar y a la imagen de ajustes. Pulsar la imagen permite reajustar la configuración actual. Cancelar el encuadre vuelve a la biblioteca sin aplicar cambios; X cierra el selector sin aplicarlos.
- **Icono de nodo:** marco 1:1; el encuadre acompaña a la variante imagen de `NodeVisual`. Lo interpretan el encabezado, los iconos compartidos, referencias del editor y texturas del grafo. Los iconos de referencias externas del editor también reutilizan el flujo.
- **Portada:** su CSS mantiene 220 px de altura y ancho `calc(100% + 132px)`. Una medición con `ResizeObserver` reutiliza esa geometría real para el preview, incluyendo cuando todavía no hay portada. No se introduce un ratio fijo.
- **Emojis / Lucide / Material Symbols:** continúan aplicándose directamente. Un SVG registrado como nodo Imagen se trata como imagen; los proveedores semánticos de iconos no pasan por encuadre.

## Modelo y persistencia

`ImagePresentation` contiene `{ centerX, centerY, zoom }`. Los centros son coordenadas normalizadas del original; el zoom multiplica la escala mínima necesaria para cubrir el marco. Su rango es de 1 a 5 veces cover. La geometría limita el centro para que no aparezcan espacios vacíos.

La transformación pertenece al uso:

- Icono: `iconVisual.presentation` en los metadatos existentes del nodo.
- Portada: `coverPresentation` junto a `coverNodeId`, también en los metadatos del nodo.
- Baúl: configuración de proyecto `vaultImage`, versión 1, con `nodeId`, variante visual opcional y presentación. Se guarda en `project_meta` de SQLite mediante las APIs existentes. Las referencias locales anteriores se conservan como fallback compatible.

Icono y portada mantienen el guardado habitual del contenido del nodo. El Baúl guarda únicamente cuando se confirma una selección. El cierre/guardado del proyecto espera los guardados confirmados pendientes del Baúl.

El arrastre y el slider solo modifican estado temporal del editor. No escriben nodos, configuraciones ni archivos por frame. Las URLs se adquieren por identidad del recurso, incluyendo su hash para recursos del proyecto, y no por la transformación. El grafo crea únicamente una textura de presentación en memoria; no la convierte en archivo ni en fuente persistente.

## Compatibilidad y cancelación

Los datos nuevos son opcionales. Sin transformación se mantienen los renders legacy: cover centrado para avatar/portada y el comportamiento previo de cada icono. No hay migración destructiva. Elegir una imagen ya configurada recupera su encuadre para ese destino.

Las subidas usan el importador de la biblioteca y almacenan el original antes de abrir el editor. Cancelar o cerrar no elimina ese original ni confirma el encuadre. Una misma imagen puede tener presentaciones distintas como icono, portada y Baúl.

## Verificación

Pruebas que pasaron:

- TypeScript: `npx tsc --noEmit`.
- Geometría/serialización: `node tests/image-presentation.test.mjs`. Cobertura completa del marco, límites, distintas orientaciones y resoluciones, metadatos legacy y encuadres independientes por destino.
- Navegador: `node tests/image-framing.browser.mjs`. Coincidencia preview/render, Baúl e icono cuadrados, ratio real de portada y resize, arrastre/zoom, cancelación/X, reapertura, bypass semántico, subida cancelada conservando biblioteca, originales sin cambios y ninguna persistencia/URL nueva durante ajustes.
- Regresión del parpadeo: `node tests/vault-image.browser.mjs`, con originales legacy y recursos mediante object URLs.
- SQLite/archivo `.his`: `cargo test --lib persists_vault_image_presentation_inside_his_archive --manifest-path src-tauri/Cargo.toml`. Guarda configuración del Baúl y metadatos de icono/portada, cierra el archivo, lo reabre y compara los datos; también rechaza una transformación inválida.
- Compatibilidad: `node-visuals`, `image-resources`, `i18n`, `editor-compatibility`, `graph-projection`, `graph-renderer` y `lifecycle`.

Límites reales: al cambiar el ancho de una portada de altura fija cambia necesariamente la región visible. Se mantienen el centro y zoom normalizados, con límites recalculados para cubrirla. No se añadió wheel. No se realizó una descarga real desde Unsplash ni un reinicio manual de la aplicación; se verificaron los flujos compartidos en navegador y la reapertura nativa del archivo con SQLite.

## Archivos de esta actualización

Selector y presentación:

- `src/nodes/capabilities/IconCapabilityPicker.tsx`
- `src/nodes/capabilities/icon.ts`
- `src/nodes/visuals/ImageFramingEditor.tsx` (nuevo)
- `src/nodes/visuals/PresentedImage.tsx` (nuevo)
- `src/nodes/visuals/imagePresentation.css` (nuevo)
- `src/nodes/visuals/NodeVisualRenderer.tsx`
- `src/nodes/visuals/types.ts`
- `src/utils/imagePresentation.ts` (nuevo)
- `src/utils/domImagePresentation.ts` (nuevo)
- `src/utils/imageRuntimeResolver.ts`

Destinos, modelo y persistencia:

- `src/components/AppWorkspace.tsx`
- `src/workspace/useProjectCover.ts`
- `src/workspace/vaultImageSetting.ts` (nuevo)
- `src/workspace/panels/ProjectSettingsPanel.tsx`
- `src/nodes/page/header.tsx`
- `src/utils/pageMeta.ts`
- `src/nodes/nodeIconSource.ts`
- `src/project/settingsRepository.ts`
- `src-tauri/src/project.rs`
- `src/editor/RichTextEditor.tsx`
- `src/editor/globeIcon.ts`
- `src/editor/useEditorMentions.ts`
- `src/graph/view.tsx`
- `src/graph/visualTexture.ts`
- `src/i18n/catalogs/es/nodes-ui.ts`
- `src/i18n/catalogs/en/nodes-ui.ts`

Pruebas/documentación:

- `tests/image-presentation.test.mjs` (nuevo)
- `tests/image-framing.fixture.tsx` (nuevo)
- `tests/image-framing.browser.mjs` (nuevo)
- `tests/node-visuals.test.mjs`
- `tests/vault-image.fixture.tsx`
- `tests/vault-image.browser.mjs`
- `docs/image-framing.md` (este informe)
