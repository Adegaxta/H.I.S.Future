# Colores y corrección ortográfica del editor

Se corrigieron las etiquetas de las paletas para mostrar el color correspondiente. Los fondos nuevos se aplican con una opacidad del 22%, tanto en texto como en bloques y celdas. Un color de borde asignado crea un borde completo de 1 px; Predeterminado retira ese borde y recupera el estilo existente.

El menú conserva los bloques seleccionados al recibir clics. Los cambios de color se aplican a toda la multiselección en una sola operación de historial. Un clic derecho sobre un bloque seleccionado conserva la selección; sobre otro bloque selecciona únicamente ese bloque y abre sus opciones.

Las palabras incorrectas abren un menú de sugerencias con la apariencia de HISFuture. La corrección usa el idioma actual del baúl, mantiene el resto del texto y admite deshacer y rehacer. El diccionario personal se guarda en la aplicación, fuera del baúl, y se comparte entre páginas e idiomas. La selección múltiple de bloques tiene prioridad sobre el menú ortográfico.

En Windows se utiliza el corrector disponible del sistema. Si falta el idioma, se utilizan diccionarios offline incluidos de español e inglés. Sus subrayados no modifican el contenido ni se serializan. Las licencias están en `public/licenses/spelling` y en `THIRD_PARTY_NOTICES.md`.

## Verificación

- Compilación de producción, comprobación de tipos y pruebas de editor, idiomas y menú contextual correctas.
- Pruebas con el editor real en Edge: etiquetas de paleta, fondos atenuados, bordes completos y predeterminados, colores en tres bloques seleccionados y selección coherente mediante clic derecho.
- Sugerencias y correcciones reales en español e inglés, deshacer/rehacer y diccionario personal conservado entre páginas e idiomas.
- Las pruebas anteriores de selección, pegado, navegación, scroll y formato de menciones siguen pasando.
- Pruebas Rust del corrector de Windows correctas: español disponible en este equipo; inglés utiliza el respaldo incluido.

No se inició el binario Tauri para una revisión manual. Se verificaron por separado la interfaz en navegador y la integración nativa de Windows. Se conservaron los cambios locales anteriores; no hay migración del contenido del baúl.
