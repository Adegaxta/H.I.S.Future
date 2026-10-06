# Auditoría de Nodo Página: contrato y arquitectura

Esta batería únicamente añade archivos de pruebas. No cambia producción. Los resultados corresponden a la revisión local existente, con cambios previos del usuario. `baseline.json` registra SHA-256 de todos los archivos de `src` y `src-tauri/src`; el ejecutor comprueba su conservación.

## Mapa inspeccionado antes de escribir el harness

| Capa | Archivos principales | Contrato y riesgo |
|---|---|---|
| Página/React | nodes/page/renderer.tsx, header.tsx, NodeTabSurface.tsx, nodes/capabilities/RichTextNodeContent.tsx | Contexto del nodo, pestañas y referencias al editor; pestañas pueden conservarse montadas |
| DOM | editor/RichTextEditor.tsx, useRichTextEditor.ts, useEditorController.ts | DOM vivo autoritativo; carga al cambiar ID; callbacks guardan HTML, no se reemplaza DOM en cada render |
| Bloques/IDs | blockModel.ts, useEditorBlocks.ts, useEditorBlockSelection.ts, blockCapabilities.ts | Bloques raíz/seleccionables, wrappers y celdas distintos. data-editor-block-identity es transitorio; data-editor-block-id de imágenes es persistente. No exigir unicidad a IDs de menciones repetidas |
| Selección | useEditorSelection.ts, inlineMarks.ts | Range válido con ambos extremos en el editor; offsets UTF-16. Rangos guardados se validan antes de reutilizar; marcas on/off/mixed |
| Formato | commands.ts, useEditorController.ts, RichTextEditor.tsx | execCommand, headings/listas; toolbar restaura selección; menciones atómicas tienen formato propio |
| Menciones/pickers | useEditorMentions.ts, useEditorPickers.ts, pickerSession.ts | Rangos de trigger, resolución de nodo, etiquetas regeneradas, navegación; firma de hidratación cacheada |
| Tablas | table.ts, tableSelection.ts, tableActions.ts, tableClipboard.ts | Modelo de spans grid/row/cell, interfaz runtime excluida de guardado; pegado matricial acotado a celdas existentes |
| Portapapeles | html.ts, useEditorController.ts | Pegado capturado, sanitización, insertHTML, imports asíncronos comprobando editor/ID/Range; copia clona fragmento y limpia runtime; corte normal depende de navegador y corte de bloques del menú |
| Historial | useEditorHistory.ts, useEditorController.ts | Snapshots HTML + paths/offsets de selección, máximo 100, grupos de escritura; redo invalidado por nuevas ediciones; reset por nodo |
| Arrastre | useEditorBlocks.ts, useEditorController.ts | Reordenación de líneas, selección rectangular, payload de nodo/file import; referencias y atributos temporales |
| Navegación/scroll | hooks/useWorkspaceNavigation.ts, workspace/tabs/* | Historial por vista, entradas con scrollTop/Left, restauración con RAF; capas activas por pestaña |
| Serialización | serialization.ts, persistence.ts, utils/pageMeta.ts | Tokenizador limpia atributos/UI sin mutar DOM; metadatos de página se preservan como comentarios; runtime src de imágenes eliminado |
| Guardado | hooks/useNodeStore.ts, useDebouncedPersistence.ts, lifecycle/* | Versiones, cola serial, full vs contenido incremental, debounce 500 ms/max 4 s; cierre captura DOM y vacía escrituras pendientes |
| Backend | project/nodeRepository.ts, settingsRepository.ts, src-tauri/src/project.rs, persistence.rs | SQLite nodes/project_meta, snapshots y actualizaciones incrementales; backend browser DEV es memoria y no demuestra durabilidad |
| Cachés | utils/imageRuntimeResolver.ts, resourceRegistry.ts, useEditorMentions.ts | Object URLs con leases/revocación retrasada 30 s, WeakMaps por editor, descriptors/signatures; medir después de calentamiento |
| Inicio rápido | project/fileManager.ts, src-tauri/src/lib.rs create_dev_project | Baúl exacto `%TEMP%/hisfuture-dev-PID/DEV`; proceso aislado y perfil WebView2 propio |

## Estrategia e invariantes

Reutiliza Vite, React, Playwright/Edge y Node assert ya disponibles. Generador PRNG con seed, trazas JSON y reducción delta-debugging. El oráculo de sustitución usa texto DOM y concatenación independiente; no reutiliza el sanitizador como oráculo. Hay secuencias cortas/medianas/largas/muy largas, propiedades de sanitización y serialización, regresiones, y muestras de heap tras GC con tendencias, sin inferir fuga por un incremento.

Comprobar: texto conservado en sanitización y roundtrips; limpieza/idempotencia de serialización; IDs de bloque persistentes únicos (menciones pueden repetirse); ambos extremos Selection conectados y pertenecientes al editor cuando está enfocado; sustitución exacta por pegado simple; bloques ajenos intactos en sustituciones locales; copy sin mutación; undo/redo equivalente con redo válido; cambios de nodo conservan contenido guardado; scroll CtrlClick y Back/Forward; H1 seleccionado; marks activos; menciones conservan destino al editar adyacente; ausencia de pageerror y React errors. No prohibir literalmente palabras `undefined`/`NaN` en texto escrito por usuario.

Se registran acciones, antes/después (DOM y serialización), excepciones, avisos y tiempos. Un fallo sólo es confirmado si una reproducción independiente vuelve a violar el mismo contrato. Los corpus contienen acciones mínimas encontradas, no una promesa de mínimo global. Límites: eventos sintéticos de clipboard no verifican integración del portapapeles Windows; formatos ejercidos con teclado/toolbar según escenario; operaciones asíncronas y IME necesitan cobertura propia; native SQLite y browser fixture son suites distintas. Un número finito de secuencias no prueba ausencia universal de bugs.

Ejecutar: `node tests/editor-audit/run.mjs`. Opciones: `--seed=938271 --length=400`, `--properties=3000`, `--replay=archivo.json`. Suite nativa: `node tests/editor-audit/native.mjs`.

Las trazas se guardan como `seed-*.json.gz`; replay acepta JSON o gzip. Ejecutar `node tests/editor-audit/persistence-model.mjs` para las 300 seeds del modelo de cola, y `node tests/editor-audit/corpus.mjs` para los cuatro hallazgos confirmados (exit 1 mientras estén presentes). Informe final: `docs/editor-audit-2026-10-02.md`.
