# Correcciones de interacción del editor

## Arquitectura y causas

El DOM editable conserva el contenido entre renders de React. `useEditorSelection` observa Selection/Range y mantiene el Range de la toolbar; `useEditorController` coordina selección de bloques, comandos, paste, historial de edición y guardado. `RichTextEditor` conecta los eventos, tablas e hidratación de menciones. La navegación vive en `useWorkspaceNavigation`, separada del historial de edición.

| Problema | Causa localizada | Corrección |
| --- | --- | --- |
| Ctrl+Click mueve el viewport | El toggle borraba la selección, desenfocaba y llamaba a `focus()` sin `preventScroll`, dentro del actualizador de estado. La selección nativa del clic podía ocurrir antes del toggle. | Cancelar únicamente la colocación nativa del caret en el pointerdown de Ctrl/Cmd+Click de bloques. Actualizar selección fuera del actualizador React y enfocar con `preventScroll`. |
| Multiselección reutiliza bloques anteriores | Comparaciones por referencia DOM y coexistencia con restauraciones tardías de Range. | Resolver los bloques actuales mediante identidad temporal; cada clic añade o quita solo su identidad. Eliminar restauraciones tardías de texto. |
| Paste agrega contenido después | La rama de HTML con bloques creaba un Range después del bloque y nunca reemplazaba el Range activo. Las rutas asíncronas consultaban la selección más tarde. | Capturar el Range antes de preparar el clipboard, comprobar editor/página de origen y ejecutar la inserción nativa sobre ese Range. Las imágenes también usan el Range capturado. Una selección de texto dentro de tabla toma la ruta de texto en vez de reemplazar la matriz de celdas. |
| Selección de headings se pierde | La gestión común borraba Range en pointerdown e intentaba restaurar selecciones en frames posteriores desde la toolbar. | Dejar la selección de texto en manos del navegador; la toolbar observa y guarda una copia sin reescribirla. Las acciones explícitas de formato siguen restaurando su Range guardado. |
| Back/Forward pierde posición | Las entradas solo contenían destino; el scroll real está en un contenedor interno, y en pestañas es la vista de nodo. | Guardar scrollTop/scrollLeft por entrada, capturarlos al desplazar y antes de interacciones/navegación, localizar el contenedor real y restaurar al cargar. MutationObserver/ResizeObserver esperan altura suficiente; se desconectan al completar o al interactuar el usuario. |
| Menciones reciben formato incompleto | Formato/color aplicado solo a la etiqueta; el icono absoluto reservaba padding, fuera de la decoración. La limpieza eliminaba color y decoración guardados. | Aplicar formato al contenedor, conservar estilos inline guardados y reservar el icono mediante espacio inline generado que participa del subrayado. La línea usa la posición de decoración heredada; el icono mantiene su alineación. |

Ctrl+Click, multiselección y pérdida de Range comparten la coordinación de selección/focus. Paste tiene además una rama de inserción independiente incorrecta. Historial/scroll y decoración de menciones tienen causas propias.

## Archivos modificados por esta corrección

- `src/editor/useEditorController.ts`: toggle, Range de paste, formato de menciones y pointerdown específico.
- `src/editor/useEditorSelection.ts`: observación de selección sin borrado/restauración diferida; focus sin desplazamiento.
- `src/editor/blockModel.ts`: identidad de bloque declarada temporal para excluirla del contenido guardado.
- `src/editor/RichTextEditor.tsx`: paste de texto seleccionado en tablas; conservación de marks guardados en menciones.
- `src/editor/styles.css`: decoración de la mención completa, incluido espacio del icono.
- `src/hooks/useWorkspaceNavigation.ts`: posiciones visuales por entrada y restauración según carga real.
- `src/components/AppWorkspace.tsx`: resolución del contenedor de scroll del editor activo.
- `tests/editor-interactions.fixture.tsx` y `tests/editor-interactions.browser.mjs`: reproducción con el componente real y navegador.

No hay migración del modelo de páginas. La identidad de bloque es temporal y se elimina en la serialización existente. El texto generado por CSS no se guarda ni modifica el contenido de las menciones. Se conservaron los cambios locales que ya existían.

## Verificación

- Compilación de producción (`npm run build`) correcta.
- Comprobación de tipos correcta.
- Pruebas existentes de compatibilidad del editor, pestañas y acciones contextuales correctas.
- Edge/Chromium con el RichTextEditor real: A+B+C → A+C con scroll exacto; reemplazo de selección completa y parcial con texto plano; reemplazo parcial con HTML enriquecido, conservación del resto y caret colapsado; undo/redo de paste; selección persistente en H1; Back/Forward restaurando 1800 y 900; navegación por mención; Mouse 4/5 mediante eventos; dos visitas distintas a A conservando posiciones diferentes.
- Formato underline de una mención guardada sin wrapper de etiqueta: hidratación compatible, atributo de mark y decoración del contenedor, color heredado y navegación tras aplicar formato. Revisión visual de la continuidad bajo icono y nombre.
- El contenido serializado no incluye identidad ni selección temporal de bloques. La pila cronológica de edición y el guardado incremental existentes siguen siendo las rutas usadas por estas operaciones.

Las pruebas de navegador utilizan Edge headless y eventos de clipboard/mouse reproducidos. No se ejecutó el binario Tauri ni se verificaron físicamente los botones laterales o el clipboard de una aplicación externa. Las pruebas de compatibilidad cubren tablas y contenido existente; no se hizo una revisión visual exhaustiva de todos los tipos de bloque.
