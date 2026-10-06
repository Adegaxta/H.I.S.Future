# Auditoría automatizada de Nodo Página / RichTextEditor

Fecha: 2 de octubre de 2026. Entorno: Windows, Edge/Chromium y WebView2 de la aplicación Tauri. Se auditó el árbol de trabajo existente, incluidas modificaciones anteriores. No se corrigió ni refactorizó código productivo.

## Resultado de la primera entrega

Se confirmaron cuatro hallazgos: dos pérdidas de texto en el procesamiento del pegado, un cambio persistente de la condición no editable de menciones seleccionadas y una estructura inválida de listas que cambia al restaurar el historial. Los tres primeros se comprobaron también dentro de la aplicación nativa y sobreviven al guardado/reapertura de su Baúl DEV temporal. El cuarto se reprodujo independientemente en el editor real de la fixture de navegador.

Las regresiones conocidas de scroll con Ctrl+Click, multiselección, sustitución de texto simple/HTML, selección H1, Back/Forward y toolbar/underline junto a menciones pasaron sus escenarios explícitos. Esto no implica que todas sus combinaciones posibles estén libres de errores.

La persistencia SQLite conservó exactamente los documentos recibidos durante 40 ciclos de guardar contenido incremental, cerrar el proyecto y abrirlo de nuevo. Una comprobación independiente de la base en modo de solo lectura encontró `integrity_check = ok`, 82 filas y ninguna diferencia frente al estado esperado. Las pérdidas del pegado ocurren antes de SQLite.

## Arquitectura y estrategia

El mapa detallado, realizado antes de construir el harness, está en `tests/editor-audit/README.md`. Sus capas son:

| Capa | Responsabilidad y componentes |
|---|---|
| Superficie Página | `nodes/page/renderer.tsx`, `NodeTabSurface.tsx`, `header.tsx`, `RichTextNodeContent.tsx`: nodo, pestañas, chrome y referencias al editor |
| Editor/React | `RichTextEditor.tsx`, `useRichTextEditor.ts`, `useEditorController.ts`: DOM editable autoritativo, eventos, menús, contenido React secundario, carga por ID |
| Bloques/IDs | `blockModel.ts`, `useEditorBlocks.ts`, `useEditorBlockSelection.ts`: bloques raíz, listas, selección múltiple, controles y arrastre. Identidades de interacción transitorias; IDs de bloque de imagen persistentes; referencias de mención pueden repetirse |
| Selección/formato | `useEditorSelection.ts`, `inlineMarks.ts`, `commands.ts`: Range/Selection, rangos guardados, offsets UTF-16, estado on/off/mixed, headings, listas, formato inline y formato de menciones |
| Menciones | `useEditorMentions.ts`, `useEditorPickers.ts`, `pickerSession.ts`: rangos de triggers, comandos slash, resolución de destinos, hidratación, navegación y caché de firmas visuales |
| Tablas | `table.ts`, `tableSelection.ts`, `tableActions.ts`, `tableClipboard.ts`: grid de spans, celdas editables, selección rectangular, TSV/HTML, controles runtime y resize |
| Portapapeles | `html.ts`, `useEditorController.ts`: texto/HTML/Anytype, sanitización, reemplazo de Range, copy de fragmento limpio, corte nativo y corte de bloques; imports asíncronos verifican que nodo/editor/Range sigan vigentes |
| Historial | `useEditorHistory.ts`, controlador: snapshots HTML y paths/offsets de selección, agrupación, límites, stacks por nodo, invalidación de redo |
| Navegación | `useWorkspaceNavigation.ts`, `workspace/tabs/*`: historial por vista, cambio de nodo, Back/Forward, scrollTop/Left, RAF de restauración, panes y vistas conservadas |
| Serialización | `serialization.ts`, `persistence.ts`, `pageMeta.ts`: limpieza de atributos temporales/UI, preservación de comentarios de metadata, extracción de contenido sin mutar DOM |
| Guardado/carga | `useNodeStore.ts`, `useDebouncedPersistence.ts`, `PersistenceQueue.ts`, `nodePersistence.ts`, `useWorkspaceLifecycle.ts`: debounce, versiones, merge full/incremental, cola serial, flush del DOM vivo antes de cierre |
| SQLite | `nodeRepository.ts`, `settingsRepository.ts`, backend Rust `project.rs`/`persistence.rs`: nodes/project_meta, snapshots, contenido incremental y checkpoint |
| Cachés/recursos | `imageRuntimeResolver.ts`, registros de recursos y firmas de menciones: leases de Object URLs, WeakMaps, revocación retrasada y visuales hidratados |

Se reutilizaron Vite, React, Node assert, Playwright/Edge del runtime disponible y los runners existentes. No se instalaron paquetes. El generador tiene PRNG con seed; no usa `Math.random` para elegir acciones. Las acciones se guardan completas, por lo que el replay usa la secuencia registrada aunque el generador evolucione.

El oráculo de reemplazo calcula el texto esperado por concatenación independiente del sanitizador. El modelo de persistencia usa un mapa de documentos y contrasta el resultado final de la cola real. La equivalencia de carga ignora `title`/`aria-label` regenerados en menciones, pero conserva contenido, estructura, formato y condición no editable. Se distinguen transformaciones Markdown deliberadas de corrupción: `> texto` no se considera por sí solo una pérdida, porque el importador implementa blockquotes.

Las fixtures usan el editor productivo; no hay una copia simplificada del editor. Los eventos de clipboard y de drop de nodo se construyen en el navegador. Las demás interacciones usan teclado, clicks y toolbar reales del navegador. Esta mezcla prueba handlers y DOM, pero no equivale a probar el portapapeles global de Windows.

## Invariantes comprobadas

1. Unicidad de `data-editor-block-id` donde existe; no se exige unicidad a destinos de menciones.
2. Range conectado, con ambos extremos dentro del editor cuando éste tiene el foco.
3. Sustitución exacta de una selección por texto literal; conservación de bloques ajenos en reemplazos locales.
4. Copy no modifica contenido y excluye atributos/UI transitorios.
5. Serialización idempotente, sin `data-line-selected`, identidades de interacción ni controles runtime.
6. Texto Unicode y entidades conservados al convertir texto/HTML y al serializar.
7. Undo/Redo recupera el HTML cuando hay un undo efectivo y ninguna edición intermedia invalida redo.
8. Guardar/cargar y cambiar de nodo conservan semántica, considerando hidratación legítima de metadata visual.
9. Menciones conservan ID y condición no editable; edición adyacente no elimina el destino.
10. Estado de toolbar fiel a marcas on/off/mixed; underline y strike junto a referencias.
11. Tablas conservan nueve celdas y una sola instancia de controles por celda después de ciclos de carga.
12. Ctrl+Click no cambia scroll; Back/Forward restaura posiciones esperadas.
13. Cola de persistencia serial, último estado correcto, merge full/incremental y retry tras fallo de escritura.
14. Ausencia de pageerrors y errores React observados en las ejecuciones válidas.
15. Tendencias de heap tras GC, nodos, listeners, timers, renders y latencia durante ciclos repetidos.

No se prohíben las palabras `NaN` o `undefined` dentro de texto escrito por el usuario. Los anchos/estructuras válidos tienen verificaciones específicas en los tests existentes; no se convierte una búsqueda de palabras en un falso detector de corrupción.

## Infraestructura y ejecuciones

| Archivo nuevo | Función |
|---|---|
| `tests/editor-audit/fixture.tsx` | Editor real, dos nodos, navegación y API de observación/reinicio |
| `tests/editor-audit/run.mjs` | Propiedades, regresiones, generación stateful, traces, replay, shrinking y soak |
| `tests/editor-audit/native.mjs` | WebView2 aislada, Inicio Rápido, edición UI, SQLite y reapertura |
| `tests/editor-audit/persistence-model.mjs` | Modelo aleatorio de cola full/incremental con fallos inyectados |
| `tests/editor-audit/corpus.mjs` | Replay de los hallazgos; devuelve error mientras los bugs sigan presentes |
| `tests/editor-audit/corpus-*.json` | Acciones explícitas reproducibles de los hallazgos |

La campaña exploratoria completó cinco secuencias: seed 938271 con 20 acciones, 20261002 con 80, 347 con 200, 731993 con 500 y 17 con 1.000. Total: 1.800 acciones en esa campaña. Una segunda campaña refinada completó otras 1.800 acciones con las mismas cinco seeds y tamaños, comprobando además la condición no editable de las menciones: 3.600 acciones stateful en total. Se continuó después de fallos para observar operaciones posteriores. Hubo también una campaña de descubrimiento que se detenía al primer fallo; sus cantidades no se suman como cobertura distinta.

El modelo de persistencia ejecutó 300 seeds, 100 solicitudes por seed: 30.000 acciones. Realizó 11.356 intentos de escritura. En las seeds divisibles por tres se inyectó un fallo de I/O; hubo 654 promesas rechazadas porque varias solicitudes compartían el mismo drain fallido. Después de reintentar, los 300 estados finales coincidieron con el modelo y el máximo de escritores simultáneos fue uno.

Las propiedades recorrieron 3.000 casos parametrizados, seis contratos por caso: 18.000 comprobaciones por ejecución. Se repitieron varias veces; no se presentan repeticiones como casos distintos. Cubren serialización, limpieza, conservación de texto, HTML/texto plano, atributos inseguros directos y matrices TSV. Son propiedades parametrizadas de este corpus, no un generador exhaustivo de gramáticas HTML.

El stress de documentos incluyó vacío, un carácter, 50.000 emojis, 1.500 párrafos y tablas, más un documento nativo con 100.000 emojis. La suite nativa verificó cinco ciclos de escribir Unicode, guardar, cerrar el backend, descargar React mediante reload y reabrir la Página; luego reprodujo los tres fallos persistentes y ejecutó 40 ciclos sobre 82 filas.

También pasaron los runners existentes `test:editor`, `test:lifecycle`, `test:workspace`, `editor-mentions.browser.mjs`, `editor-menus.browser.mjs` y `mention-menu.browser.mjs`. Estos cubren estructura/modelo existente, navegación de menciones, underline, selección cruzada, menús, ortografía, undo/redo e hidratación de iconos.

## Hallazgos confirmados

### AUDIT-001 — Entidades de texto se convierten otra vez en HTML

**Severidad: CRITICAL según el criterio solicitado de pérdida de texto persistente.** Seed de corpus: 347. Seed de propiedad: 10. Determinista en browser y WebView2.

Reproducción mínima: seleccionar contenido de un párrafo y pegar HTML con texto escapado, por ejemplo `<span>L&lt;literal&gt;R</span>`. Guardar y reabrir confirma la durabilidad de la pérdida, pero no es necesario para provocar el fallo.

Esperado: `L<literal>R` como texto. Real: `LR`. En la prueba nativa el HTML guardado fue `<p>L<literal>R</literal></p>` y después de reabrir siguió mostrando `LR`.

Componente/invariantes: sanitización, pegado, conservación literal de texto y equivalencia semántica. Se pierde `<literal>` silenciosamente. SQLite conserva el resultado ya alterado.

Causa probable: `src/editor/html.ts:1029` devuelve `node.textContent` sin escaparlo al construir una nueva cadena HTML. El DOMParser ya ha decodificado las entidades, por lo que `insertHTML` vuelve a interpretarlas como etiquetas. El consumidor está en `useEditorController.ts`, ruta `onPaste`.

Corpus: `corpus-sanitizer-entities.json`. Una operación de reemplazo. Confirmación nativa: `results/native-report.json`, finding `SANITIZE_TEXT`.

### AUDIT-002 — El canal text/plain se interpreta inicialmente como HTML

**Severidad: CRITICAL por pérdida de texto persistente.** Seed: 347. Determinista, browser y WebView2.

Reproducción mínima: seleccionar un párrafo y pegar en el canal `text/plain` la cadena `L<b>B</b>R`.

Esperado: los caracteres literales `L<b>B</b>R`. Real: `LBR`; se almacena `<p>LBR</p>` y reabrir mantiene `LBR`.

Componente/invariantes: `formatPastedText`, separación de MIME types y conservación de texto. Las etiquetas literales desaparecen antes del guardado.

Causa probable: `src/editor/html.ts:113` analiza `source` con DOMParser como `text/html` y usa su `body.textContent` aunque el dato proceda de `text/plain`. Es independiente del fallo anterior: aquí la primera decodificación ya elimina etiquetas reales de la cadena plana.

Corpus: `corpus-plain-html.json`, una operación. Confirmación nativa: finding `PLAIN_TEXT_HTML_DECODE`.

### AUDIT-003 — Guardar una mención seleccionada elimina su condición no editable

**Severidad: HIGH.** Seed: 3. Determinista en fixture y aplicación nativa. Persiste un estado semántico incorrecto; no se demostró pérdida del ID/destino ni de texto por esta secuencia.

Reproducción mínima reducida: en una Página con una mención, seleccionar todo y guardar/reabrir manteniendo la selección al capturar el contenido. No hacen falta Delete ni Undo; esos pasos pertenecían a la reproducción original y fueron eliminados por shrinking.

Esperado: la mención mantiene `contenteditable="false"` y sigue siendo atómica. Real: el DOM vivo antes de guardar tiene ese atributo y `data-mention-selected`; el serializado pierde ambos. Después de reabrir, `contentEditable = "inherit"` e `isContentEditable = true`.

Componentes/invariantes: limpieza de atributos transitorios, selección de menciones, restauración/hidratación y equivalencia Save/Load. La condición de edición de un elemento no es equivalente a un atributo visual de selección.

Causa probable: `serialization.ts:96–107` elimina `contenteditable` siempre que el mismo elemento tenga cualquier atributo transitorio, incluyendo `data-mention-selected`. `useEditorSelection.ts` añade ese estado al seleccionar. La hidratación de menciones existentes en `useEditorMentions.ts:207` reconstruye etiqueta/icono, pero no restablece la condición no editable.

Corpus reducido: `corpus-mention-undo.json`, dos acciones de harness (Ctrl+A, capturar serialización/reabrir). El corpus original Ctrl+A → Delete → Undo → guardar/reabrir tenía cuatro acciones y se redujo en ocho intentos. Confirmación SQLite nativa: finding `MENTION_SELECTED_SERIALIZATION`.

### AUDIT-004 — La lista slash queda dentro de un párrafo y cambia al restaurar HTML

**Severidad: MEDIUM.** Seed: 4. Determinista en el editor real de la fixture. Texto conservado; aparecen párrafos vacíos extra. No se verificó este caso en el backend nativo.

Reproducción: partir de un párrafo vacío, escribir `/`, elegir Lista con viñetas, escribir `Contenido 😀`, ejecutar Undo y Redo.

Antes: `<p><ul><li>Contenido 😀</li></ul></p>`. Después: `<p></p><ul><li>Contenido 😀</li></ul><p></p>`. La anidación UL dentro de P es inválida para el parser HTML; restaurar el snapshot con `innerHTML` normaliza el árbol y crea dos párrafos vacíos.

Componentes/invariantes: comando de listas, estructura de bloques, snapshots y equivalencia Undo/Redo. La igualdad de texto por sí sola habría ocultado este fallo.

Causa probable: la rama `value === "UL"` de `useEditorController.ts:1573` aplica `insertUnorderedList` al Range de contenido del bloque sin reparar/reemplazar el contenedor P resultante. `restoreEditorSnapshot` vuelve a parsear ese HTML.

Corpus: `corpus-list-undo.json`, dos acciones compuestas (crear la lista y Undo/Redo), equivalentes a los pasos UI indicados. Se confirmó mediante replay completo, repetición independiente y dos intentos de reducción. No se afirma que esas acciones compuestas sean un mínimo global de eventos de teclado.

## Performance y soak

Se midieron ocho tandas de 20 ciclos montar → seleccionar → pegar, con GC explícito antes de cada muestra. En la ejecución instrumentada registrada en `results/verified/report.json`:

| Métrica | Resultado |
|---|---|
| Heap tras GC | 48.608.000 → 49.243.000 bytes aproximadamente; crecimiento pequeño, no prueba de fuga |
| Nodos DOM | 297 en las ocho muestras |
| Listeners JS | 216 en las ocho muestras |
| Timeouts activos | 0 al tomar las muestras |
| Intervals activos | 1 estable |
| Object URLs activas | 0 en este escenario, sin imágenes de recurso |
| Renders | +60 por tanda de 20 ciclos: tres por ciclo, sin crecimiento del coste por tanda |
| P95 del ciclo completo | Aproximadamente 94 ms, estable; incluye espera artificial de reinicio |
| Ciclo nativo incremental/cerrar/abrir/cargar | Aproximadamente 37–98 ms en la ejecución final |

Una segunda campaña tras calentamiento mostró nodos/listeners estables y heap aproximadamente 49,5–49,7 MB. No hay evidencia suficiente de una fuga en estos escenarios. No se extrapola a horas de uso ni a documentos con muchas imágenes; la revocación retrasada de Object URLs no se ejercitó con cargas de recursos aquí.

## Aislamiento, evidencia y falsos positivos descartados

La suite nativa lanzó un proceso propio con perfil WebView2 temporal y puerto CDP propio. Entró por Inicio Rápido y verificó que `folderPath` estuviera bajo `%TEMP%/hisfuture-dev-PID/DEV`. El Baúl final conservado para inspección es `C:\Users\Matias\AppData\Local\Temp\hisfuture-dev-31484\DEV`; no se usó la instancia del usuario ni un Baúl real. El frontend se sirve en el origen localhost autorizado por Tauri; el primer intento en otro puerto fue rechazado por permisos y quedó registrado como fallo del entorno de prueba, no como bug de Página.

Los traces JSON comprimidos con gzip guardan seed, acciones, índice, estado antes/después, DOM, HTML serializado, texto/bloques, scroll, Selection, excepción, errores/avisos y tiempo. Las comprobaciones SHA-256 de `src` y `src-tauri/src` indican `productionUnchanged: true` en las suites registradas. El inventario base incluye los cambios que ya estaban presentes antes de esta auditoría.

Se descartaron estas falsas alarmas: NBSP frente a espacio ordinario en insertHTML; índices de LI anidados comparados equivocadamente con bloques raíz; hidratación que añade title/aria-label a menciones; conversión Markdown deliberada de `> texto`; overlays de la fixture interceptando clicks de sus botones; selector de texto exacto que no incluía el icono del botón slash. Las ejecuciones iniciales se conservan como evidencia histórica, pero no constituyen hallazgos confirmados.

## Cobertura y puntos ciegos

Se cubrieron escritura, Unicode, Enter/Shift+Enter, Backspace/Delete, Home/End y flechas; rangos parciales/completos/cruzados; Ctrl+A y Ctrl+Click; doble click; bold/italic/underline/strike; headings y listas mediante slash; copy/cut; texto/HTML pegados; undo/redo; cambios de nodo, menciones, Back/Forward, guardado, reload y apertura de SQLite. Hay cobertura dirigida de tablas, toolbar y multi-selección.

Quedan fuera de demostración automática completa: portapapeles y drag/drop desde otras apps de Windows; secuencias aleatorias de arrastre físico de líneas con pointer capture y geometría; importación asíncrona de archivos/imágenes durante un cambio de nodo; liberar muchos Object URLs de recursos tras los 30 segundos de gracia; IME/composición de japonés/chino y bidi con navegación por graphemes; quitar formato mediante todas las rutas de UI; todas las combinaciones de edición de filas/columnas/resizes de tablas; impresión/exportación; cierres abruptos del proceso/cortes eléctricos; todas las pestañas ocultas/splits con editores simultáneos; fuga de memoria Rust/WebView durante horas. El CDP no expone referencias privadas React: se comprueba su efecto observable y validez de Range, no todos los refs internos.

El soak es repetido y medido, pero breve. La batería es amplia y reproducible; ninguna cantidad finita de fuzzing permite afirmar cobertura exhaustiva universal. Los límites anteriores son parte de esta primera entrega y no se reemplazan por afirmaciones de éxito.

## Reejecución

Desde la raíz del repositorio:

```text
node tests/editor-audit/run.mjs --explore=1
node tests/editor-audit/persistence-model.mjs
node tests/editor-audit/native.mjs
node tests/editor-audit/corpus.mjs
```

Para replay individual: `node tests/editor-audit/run.mjs --replay=tests/editor-audit/corpus-sanitizer-entities.json --skip-regressions=1 --skip-soak=1 --properties=0`.

`--seed=938271 --length=400` genera una secuencia concreta. `--strict=1` hace que el runner general devuelva error si encuentra hallazgos; sin strict completa la auditoría y escribe informe aunque encuentre bugs. El runner de corpus devuelve error mientras alguno de sus fallos siga presente. `HIS_AUDIT_OUTPUT` permite conservar campañas separadas y `HIS_AUDIT_PORT` cambiar el puerto de la fixture. La suite nativa necesita el ejecutable de desarrollo existente y WebView2; no compila ni modifica producción.

Los informes principales están en `tests/editor-audit/results`: `native-report.json`, `sqlite-independent-check.json`, `persistence-model.json`, `exploratory/report.json`, `campaign-final/report.json`, `verified/report.json`, `regressions-complete/report.json`, `corpus-report.json` y los traces de cada seed. Los traces `seed-*.json.gz` pueden pasarse directamente a `--replay`; la compresión conserva íntegros antes/después y evita cientos de MB de HTML repetido. Los JSON del corpus son el punto de partida para verificar las correcciones que se decidan después de esta entrega.
