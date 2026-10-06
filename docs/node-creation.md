# Creación de nodos

## Auditoría de la implementación existente

- Árbol: `useTreeController.openCreate` y el formulario inline de `SidebarTree`.
- Lore y grafo: formulario de `LoreAddDialog`; Baúl: `NodePanels.onCreateType` creaba inmediatamente.
- Modelo: `types/nodes.ts`, `NodeItem` conserva un único `parentId` y orden entre hermanos.
- Tipos: `nodes/registry.ts`, `NODE_REGISTRY` y capacidades/estados `creation.available`.
- Predeterminado: `workspace/defaultNodeType.ts` y configuración de `AppWorkspace` / `ProjectSettingsPanel`.
- Tags: `tags/repository.ts`, entidades compartidas, tabla `node_tags`, `TagChip` y capacidades `tags` del registro. Actualmente solo Página y Proyecto admiten tags; se respeta esa restricción.
- Descripciones: Página usa `utils/pageMeta.ts`; otros tipos usan `nodes/metadata.ts`.
- Movimiento: `utils/nodeTree.ts`, `reorderNodes`, `wouldCreateCycle`; se reemplaza el padre existente.
- Lore: `loreHidden`, `utils/loreTree.ts`; el Baúl incluye nodos que no se muestran en Lore.
- Menciones: infraestructura del editor (`useEditorMentions`, `MentionMenu`, `editor-mention`). No se fabrica contenido ni enlaces ocultos antes de disponer de un contexto editable.
- Persistencia: `useNodeStore`, cola de persistencia, `project/nodeRepository.ts`, comando Tauri `save_nodes`, transacción de `project::save_workspace_traced` y backend DEV.
- Historial: actividad reciente del almacén; el undo del editor es de contenido/metadatos. La creación anterior no tenía un undo estructural global y no se introduce otro sistema.

## Implementación

`NodeCreationPanel` reemplaza los formularios manuales. Se abre desde el árbol, sus acciones contextuales, los botones de tipos del Baúl, Crear nuevo de Lore y el fondo del grafo. Las importaciones, duplicados y creación interna de recursos mantienen sus operaciones específicas existentes.

Panel lateral con backdrop nativo, foco modal, Escape y clic fuera. Mantiene el orden del mockup, tipos por icono y tooltip, tags reales, plantilla vacía, padre/hijo, destinos y los assets `circle-plus.svg` / `circle-x.svg`. Secciones con scroll interno y acciones siempre accesibles; columnas adaptadas a pantallas pequeñas. Textos en los catálogos español/inglés.

Las selecciones viven únicamente en el panel hasta confirmar. `nodes/creation.ts` valida nombre, existencia, capacidad de tags, padre del hijo confirmado y ciclos; reutiliza el movimiento existente. El conflicto permite mover, mantener la ubicación para mencionar después, o cancelar la asignación. El nodo Proyecto principal no puede convertirse en hijo; los nodos fijados/protegidos tampoco se ofrecen como hijos.

`createConfiguredNode` termina las escrituras pendientes, construye el snapshot y aplica la reconciliación de cursos/Proyecto. Nodo, descripción, jerarquía, pertenencia Lore/Baúl y tags se guardan en una sola transacción. Solo después del éxito se publica el snapshot en React. El parámetro opcional de tags conserva compatibilidad con otros guardados.

## Archivos de esta implementación

- Nuevos: `src/components/NodeCreationPanel.tsx`, `src/components/nodeCreation.css`, `src/nodes/creation.ts`.
- Integración: `src/components/AppWorkspace.tsx`, `src/components/LoreAddDialog.tsx`, `src/workspace/navigation/SidebarTree.tsx`, `src/hooks/useTreeController.ts`, `src/graph/view.tsx`, `src/nodes/page/chrome.tsx`.
- Guardado: `src/hooks/useNodeStore.ts`, `src/project/nodeRepository.ts`, `src/project/browserDevBackend.ts`, `src-tauri/src/lib.rs`, `src-tauri/src/project.rs`.
- Idiomas: `src/i18n/catalogs/es/nodes-ui.ts`, `src/i18n/catalogs/en/nodes-ui.ts`.
- Pruebas: `tests/node-creation.test.mjs`, `tests/node-creation.browser.mjs`, prueba Rust `node_creation_tags_and_reparenting_commit_or_roll_back_together`.
- Capturas: `docs/node-creation-wide.png`, `docs/node-creation-small.png`.

## Validación

Pruebas de navegador sobre la aplicación real en DEV: nombre obligatorio, Escape, clic fuera sin cambios, selector vacío de plantillas, Lore/Baúl, descripción visible, tags reales, padre manual, conflicto cancelado, alternativa de mención sin mover, reparenting confirmado, padre contextual y su eliminación, predeterminado configurado, inglés y pantalla pequeña sin overflow horizontal.

Prueba de dominio: entradas inválidas, ciclos directos/indirectos, hijos raíz, un único padre, inmutabilidad y descripción vacía.

Prueba SQLite: fallo de tag revierte creación y movimiento; éxito persiste ambos y los tags al cerrar/reabrir el proyecto.

Se verifican también TypeScript/build, catálogos i18n, Lore y registro de nodos. Las capturas fueron inspeccionadas en tamaño amplio y móvil. La prueba de reapertura usa el backend SQLite real; no sustituye una revisión manual del ejecutable empaquetado.

## Ajustes del selector y tipos disponibles

Se sustituyen los selectores nativos de padre/hijo por `ExistingNodePicker`, un diálogo con búsqueda, nombres, tipos, iconos en su color y selección única, siguiendo el selector de existentes de Lore. Incluye quitar selección, cancelar y Escape sin cerrar la creación principal.

El orden visual se declara en `creation.order` de cada definición: Página, Carpeta, Proyecto, Imagen y Video, seguido de los demás. Se conserva el orden/identidad del registro de persistencia y se omite Tempo del panel. Los iconos usan el color real de su definición y Cancelar tiene transición hacia el rojo existente en HIS.

Proyecto, Imagen, Calendario y PDF se habilitan en las definiciones existentes. Los proyectos adicionales no reciben el rol de Proyecto principal. Los calendarios se inicializan con `createCalendarContent`, sin limitar su cantidad. Imagen y PDF vacíos muestran botones de carga; conservan su identidad y jerarquía. La primera imagen adopta nombre de archivo, tamaño, formato, hash y el recurso del proyecto; la vista existente obtiene dimensiones y transparencia. PDF reutiliza el importador existente, incluida su validación y rollback. El nombre y el contenido se asignan juntos mediante `mutateNodes` para evitar conflictos entre la actualización del archivo y el renombrado.

Prueba de navegador extendida: orden de tipos, ausencia de Tempo, selector nuevo, creación de Proyecto adicional y dos calendarios, carga real de PNG con verificación de metadatos y carga de PDF con visor funcional.

## Corrección del bloqueo al cargar recursos

Se retira la actualización de actividad reciente de los updaters de nodos: React puede repetirlos al combinar transiciones, y programar estado dentro de ellos puede producir un ciclo de renderizado. `mutateNodes` conserva su actualización funcional para admitir varias operaciones en el mismo evento; la actividad se registra después del commit. El renombrado usa esta misma ruta. El resolvedor de imágenes depende de identidad/nombre/contenido, en lugar de depender de cada nueva referencia al objeto.

La prueba `tests/node-upload.native.mjs` abre un proceso WebView2 aislado y un proyecto DEV temporal con 212 nodos existentes. Carga una imagen y un PDF a través de los controles reales, verifica la navegación después de cada carga, comprueba nombres/contenidos en SQLite, reabre el proyecto y vuelve a abrir la imagen. Falla si aparece un error de React o del frontend. No abre ni modifica el proyecto del usuario.
