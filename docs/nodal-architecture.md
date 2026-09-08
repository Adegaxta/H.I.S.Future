# Arquitectura Nodal: estabilización gradual

## Definiciones declarativas y registry (2026-09-08)

Cada tipo persistido tiene un owner lógico en `src/nodes/<tipo>/definition.ts`. Una `NodeDefinition` declara el ID interno estable, claves i18n, color, capacidades existentes, política de creación/panel, concepto opcional y contenido inicial. Un `NodeModule` la asocia con un `rendererId` y sus reglas de relación sin introducir React en el catálogo. `pagina-carpeta` es un módulo visual derivado de Página; nunca se persiste como tipo.

`src/nodes/registry.ts` es la única composición de definiciones. Su API pública ofrece `getNodeDefinition`, `getNodeRenderer`, `hasNodeCapability` y las consultas acotadas de `NODE_REGISTRY`. El registro rechaza duplicados al construirse, `find` devuelve `null` para entradas externas desconocidas y `get` falla explícitamente: ya no degrada silenciosamente un tipo corrupto a Página. `src/defs/nodeTypes.ts` permanece solo como punto de compatibilidad de imports.

Las capacidades actuales son únicamente comportamientos con consumidores reales:

- `containChildren`: determina expansión y destino de drag/drop.
- `openOnPrimaryAction`: determina si un click abre una vista.
- `navigateWithinView`: permite a Calendar y Curso consumir navegación local.

Los flags de creación y visibilidad son configuración declarativa, no capacidades. Las reglas de relaciones, metadata, serialización, importación y lógica interna de cada vista tampoco pertenecen al registry.

Para añadir un Node se crea su módulo propietario, se registra una sola vez en `BASE_MODULES`, se reutilizan claves i18n válidas y se conecta su `NodeRendererId` en `RegisteredNodeView`. Un ID persistido existente no se renombra ni se traduce; cambiarlo exige una migración explícita de `.his` y SQLite. Evita reintroducir decisiones globales `node.type === ...` en `AppWorkspace`: usa una capacidad compartida cuando la semántica sea realmente común o conserva la decisión dentro del módulo dueño cuando sea específica.

## Ownership de renderers y servicios Calendar/Tempo (2026-09-08)

Cada owner Nodal exporta ahora su adaptador desde `src/nodes/<tipo>/renderer.tsx`. `RegisteredNodeView` es únicamente el composition root que relaciona los `NodeRendererId` declarados con esos adaptadores; no implementa detalles visuales de Página, Imagen, Calendar, Tempo, Curso, Tarea o Video.

Calendar posee además `operations.ts`: numeración y creación de Calendarios, creación de Tempos y actualización de su metadata. El renderer de Calendar conecta estas operaciones con `CalendarNodeView`, y el renderer de Curso reutiliza ese mismo owner para su calendario embebido. `AppWorkspace` ya no contiene `renderCalendar`, `createTempoNode`, `moveTempoNode` ni condiciones de tipo para esas operaciones; solo entrega primitivas genéricas del store y registra el handler de navegación.

La frontera intencional que permanece en el workspace es la integración con estado global del proyecto: portada basada en Imagen, navegación superior, papelera e importación de archivos. Esas responsabilidades no deben moverse al registry. Una etapa posterior puede agruparlas en un contrato de host más pequeño, pero solo cuando exista un segundo consumidor o una separación verificable.

## Contrato del host y módulos visuales completos (2026-09-08)

`NodeViewHost`, definido en `src/nodes/rendering.ts`, es la frontera entre el shell del proyecto y los módulos Nodal. Agrupa servicios por intención: `data`, `mutations`, `navigation`, `tree`, `files`, `editor`, `contextMenus` y `projectImage`. `AppWorkspace` construye una instancia y renderiza únicamente `<RegisteredNodeView node={selectedNode} host={nodeViewHost} />`; añadir un renderer ya no amplía la lista de props del workspace.

Los adaptadores reciben el contrato común, pero cada owner selecciona y traduce solo las dependencias que necesita. El contrato contiene operaciones, no conocimiento de tipos ni componentes. Esto mantiene el estilo Defs: datos declarativos en `definition.ts`, ejecución local en `renderer.tsx`/`operations.ts` y composición explícita en un único borde.

Curso, Tarea y Video poseen ahora sus implementaciones físicas en `src/nodes/course/view.tsx`, `src/nodes/task/view.tsx` y `src/nodes/video/view.tsx`. Los controles reutilizables de nombre, búsqueda y apertura segura de URL viven en `src/nodes/viewPrimitives.tsx`. El contenedor transversal `components/NodalViews.tsx` fue eliminado.

No deben añadirse servicios vacíos al host para Nodes hipotéticos. Una operación específica permanece en su módulo; solo cruza el contrato cuando necesita estado o infraestructura propiedad del shell. Si una sección crece, debe dividirse por responsabilidad y con un consumidor real, no por simetría.

## Ownership físico completo y NodeModule (2026-09-08)

Las implementaciones específicas de Página, Categoría, Imagen, Calendar, Tempo y PDF también viven ahora bajo `src/nodes/<tipo>/`. `components/` conserva infraestructura transversal reutilizable —editor, referencias, menús, visor PDF y controles generales—, no vistas raíz de tipos concretos.

`NodeModule` agrupa datos puros: `{ definition, renderer, relations }`. El registry compone `BASE_MODULES` una sola vez y deriva tipos, definiciones, filtros, relaciones y resolución del renderer desde esa colección. El componente registrado mantiene únicamente el mapa entre un `NodeRendererId` y la función React correspondiente. Esta separación evita que importar labels o capabilities cargue la UI completa y permite a herramientas o agentes inspeccionar el catálogo sin ejecutar React.

## Dominio modular y relaciones declarativas (2026-09-08)

El antiguo `utils/nodalMeta.ts` fue eliminado. `nodes/metadata.ts` conserva exactamente el codec HTML compatible; `nodes/relations.ts` implementa las primitivas genéricas; `nodes/model.ts` crea registros base; y `nodes/relationTypes.ts` define el vocabulario estable.

Las políticas viven con sus Nodes. Curso declara syllabus, calendar, class, content y cover; Tarea declara course, tempo, material y relatedWork; Tempo declara calendar. Cada regla expresa cardinalidad y, cuando corresponde, tipos destino. `canRelate` y `withRelation` consultan estas reglas mediante el registry, sin conocer Curso, Tarea ni Tempo.

La lógica específica también tiene owner: sincronización y ciclo de vida Curso–Calendar en `course/domain.ts`, programación en `task/domain.ts` y proyección de Tempos en `calendar/projections.ts`. `nodes/domain.ts` es solo un punto de exportación para herramientas y pruebas; no contiene implementación.

## Contribuciones runtime por owner (2026-09-08)

Las diferencias legítimas que necesita la infraestructura general se publican desde `course/runtime.ts`, `image/runtime.ts` y `tempo/runtime.ts`. `nodes/runtime.ts` es un registro disperso de contribuciones: aplica el renombrado y consulta aportes para el grafo sin implementar reglas de Curso, Imagen ni Tempo.

Curso conserva localmente la actualización de `courseTitle` al renombrarse; Imagen resuelve su miniatura del grafo; Tempo publica únicamente el enlace histórico basado en `parentId` cuando su padre es Calendar. Las relaciones Nodal explícitas siguen recorriendo el motor genérico. `useNodeStore` y `GraphView` ya no contienen comparaciones por esos tipos.

No toda condición de tipo debe convertirse en una contribución. Una regla interna a un dominio permanece en su owner; una capacidad declarativa se usa cuando varios consumidores comparten la misma semántica; y el runtime se reserva para una infraestructura transversal que admite aportes opcionales de tipos concretos.

## Ownership CSS incremental (2026-09-08)

`App.tsx` carga primero el shell histórico `App.css` y después `nodes/styles.css`, que actúa como composition root visual de los módulos. Curso, Tarea, Video, Imagen, PDF y Página ya son owners CSS completos. Cada uno contiene su layout, estados, controles y responsive; Curso posee además las adaptaciones del Calendar y PDF embebidos. Esas adaptaciones pertenecen a Curso porque describen el contexto donde consume otras superficies, sin modificar sus vistas independientes.

El traslado conserva selectores y valores, y mantiene el orden base → integración → responsive dentro del owner. `App.css` ya no puede declarar `.course-node-view`; una prueba estructural protege esta frontera. Los iconos globales por tipo permanecen temporalmente en el shell porque comparten rutas relativas al catálogo de assets y requieren una extracción conjunta, no copias por Node.

La migración continuará por Calendar/Tempo antes de separar primitives/editor/shell. No se dividirán reglas aisladas solo para reducir líneas: cada corte debe dejar un responsable inequívoco y compilar con la misma cascada efectiva.

## Página, editor y bloques (2026-09-08)

Página es el Node persistente: posee cabecera, portada, icono, descripción, alineación y ancho del cuerpo. `pageMeta` conserva por compatibilidad el ancho histórico 100–200, mientras la presentación lo normaliza explícitamente a 50–100 %. El cambio de descripción entra una sola vez al historial de metadata cuando termina la edición, y cambiar de Página cierra menús transitorios para que no migren visualmente al siguiente Node.

El editor enriquecido es infraestructura compartida consumida por Página y por cualquier otra superficie que edite HTML. Un bloque de texto no es un Node, no tiene identidad SQLite y no aparece en el registro Nodal. Es una unidad estructural DOM dentro del contenido: párrafo, título, cita, elemento de lista, divisor, índice o mención de imagen completa. `editor/blockModel.ts` es ahora el contrato único de selectores y separa bloques estructurales de bloques seleccionables.

Globe es un contenedor estructural anidado: agrupa contenido, pero su envoltorio no compite en la selección rectangular con sus líneas hijas. La selección mantiene solo unidades exteriores cuando detecta solapamientos padre/hijo. Se puede multiseleccionar con rectángulo, con Ctrl/Cmd + clic y con el atajo global ya existente; el botón de opciones conserva el conjunto únicamente cuando pertenece a él. Abrir las opciones de una línea vacía ya no la elimina.

El llamado `BlockTextDevTree` no representa el documento ni sus bloques. Es solamente el pequeño árbol de interfaz del botón flotante de opciones y su panel hijo de color. Su `parentId` expresa qué menú abrió a cuál; no debe persistirse ni confundirse con `parentId` Nodal o con la anidación HTML de Globe/listas.

Las operaciones sobre varios bloques comparten una sola captura de historial y una sola sincronización de contenido. Las marcas `data-line-selected`, `data-line-dragging` y `data-line-drop-target` son estado efímero: la serialización trabaja sobre un clon y las elimina antes de guardar, de modo que el archivo `.his` conserva contenido y metadata, no selección visual de una sesión anterior.

## Autopsia antes de cambios (2026-09-05)

El repositorio ya contenía nueve tipos base en NODE_REGISTRY y un subtipo visual pagina-carpeta. Defs ya era dueño de etiquetas, color, concepto, creación, panel de tipos y contenido inicial. Tipos, grafo y referencias consumían ese registro. La selección tras crear repetía cuatro tipos en useNodeStore; makeNode repetía el contenido inicial. Los iconos se resuelven por clases CSS, sin necesidad actual de otro catálogo de iconos. SQLite repetía los tipos entre esquema, migración y validación manual.

AppWorkspace coordinaba navegación, cierre, imports, cabecera, paneles y selección de todas las vistas. NodalViews ya implementaba Curso/Tarea/Video y fileNodeImporter ya poseía la importación. Extraerlos otra vez o repartir archivos por tamaño no resolvería una responsabilidad nueva.

Riesgos confirmados: empaquetado truncaba el archivo original; save_nodes borraba links y nodes; PRAGMA foreign_keys dentro de la transacción no desactivaba las restricciones; Lore se guardaba en otra operación; papelera local podía descartarse al superar 900 KB; cierre continuaba tras errores; schema metadata se sobrescribía sin rechazar versiones futuras. Existían ocho pruebas Rust y un script de pruebas nodales, pero no cubrían estas fallas.

## Etapas y límites

1. Persistencia e invariantes: snapshot transaccional, empaquetado por reemplazo, cierre que propaga errores, papelera portable, validación de IDs/jerarquía/versiones y pruebas.
2. Defs: centralizar la política existente de selección al crear y el contenido inicial; comprobar contrato de tipos TypeScript/SQLite.
3. Workspace: el módulo Nodal selecciona y conecta sus vistas Curso/Tarea/Video mediante NodalNodeView. No mover carpetas por estética.
4. Relaciones: auditar y mantener la primitiva existente; no construir otro sistema.
5. Historiales: separar navegación de editor y acciones; no implementar undo universal.
6. Evaluación Audio hipotética, sin implementarlo.

## Persistencia: dueños y contrato

- useNodeStore posee nodos activos y papelera, serializa los guardados y registra errores. No guarda antes de cargar correctamente. El guardado explícito incluye el estado más reciente del editor incluso si no cambió el contador de mutaciones.
- nodeRepository envía nodos, loreHiddenIds y deletedNodes juntos; Rust confirma todo en una transacción. deletedNodes almacena el JSON completo, conservando identidad, contenido y loreHidden. Si el proyecto no tiene esa clave, se importa la papelera local del mismo proyecto y se conservan los datos locales de origen. Una clave vacía persistida es autoritativa.
- save_workspace hace UPSERT conservando enlaces entre entidades activas y elimina solo IDs ausentes. Rechaza duplicados, padres inexistentes y ciclos. Las FK se difieren hasta commit para admitir hijos antes de padres. Un error intermedio revierte toda la transacción.
- close_project sincroniza WAL, escribe un contenedor temporal junto al destino y solo reemplaza el original tras finish + sync_all. El fallo conserva la sesión y comunica la carpeta recuperable. SQLite se cierra antes de borrar el temporal, necesario en Windows.
- Manifiesto v1 y metadata Nodal v1 siguen vigentes. La nueva clave de papelera es aditiva. Versiones futuras se rechazan, no se degradan. Las migraciones antiguas y reparación de links siguen operativas.
- PDF usa resources/pdf por ID; imagen sigue embebida en contenido; Video conserva URL. No se cambian formatos ni se recolectan recursos automáticamente.
- readEditorContent comparte serialización normal y de cierre; conserva metadata de Página/Tempo y elimina marcas temporales de placeholder.

## Relaciones: auditoría y decisión de etapa 4

| Relación | Dueño actual | Multiplicidad y comportamiento |
| --- | --- | --- |
| Curso → syllabus / calendar / cover | `courseNodeModule.relations`, metadata del Curso | Un destino por rol; PDF / Calendar / Imagen validados |
| Curso → class / content | `courseNodeModule.relations` | Varios destinos; class requiere Video |
| Tarea → course / tempo | `taskNodeModule.relations` | Un destino por rol; Tempo es la fuente temporal |
| Tarea → material / relatedWork | `taskNodeModule.relations` | Varios destinos, sin duplicar entidades |
| Tempo → calendar | `tempoNodeModule.relations` | Referencia explícita; fallback histórico parentId para proyectos existentes |
| Evaluación / tareas de Curso / tempos de Calendar | `course/domain.ts` y `calendar/projections.ts` | Filtros de entidades existentes, sin estado independiente |
| Menciones y llamadas HTML | editor / GraphView | IDs en contenido; no son filas SQL links |
| links SQLite | persistencia heredada | Sin escritor frontend actual; se preserva entre nodos activos |

NodeRelation aporta role + targetId + order opcional + date opcional. El lector valida roles y forma, elimina duplicados de rol/destino y conserva el orden del array; no se introduce ordenación nueva por order. Las políticas declarativas gobiernan `canRelate`; `relatedNode` resuelve contra los activos. Un destino borrado deja una referencia sin resolver; restaurar el mismo ID reactiva la proyección. Borrado permanente no limpia automáticamente referencias semánticas. Las FK de links sí eliminan enlaces a entidades retiradas; no se reconstruyen al restaurar la papelera. No equiparar links con las relaciones semánticas en HTML.

Decisión: mantener esta primitiva y los roles actuales. Ya evita la duplicación que justificaría una abstracción; extraer otra capa o normalizar relaciones a SQLite añadiría migraciones y dos posibles fuentes de verdad. PDF y Video son destinos independientes, no implementaciones dentro de Curso. No se usa parentId como sustituto de relaciones nuevas.

## Verificación por etapa

Etapas 1–3: pruebas nodales, build/typecheck, cargo fmt --check, cargo check, 12 pruebas Rust y diff --check de archivos de esta tarea aprobados. Etapa 4 no modifica ejecución: conserva los contratos ya cubiertos y vuelve a ejecutar las verificaciones. El diff global avisa por el cambio previo de src/assets/New Interface.ai; se excluye únicamente ese archivo para comprobar esta tarea.

## Deuda y límites de lo verificado

- Falta prueba interactiva del cierre de ventana Tauri, importación PDF/imagen y edición inmediata antes de cerrar; las pruebas automáticas no equivalen a esa validación.
- Un cierre forzado o corte de energía no garantiza recuperar el último estado en el .his; la copia SQLite temporal es recuperable pero no hay descubrimiento automático de sesiones abandonadas.
- Recursos y snapshot no forman una transacción conjunta de filesystem/SQLite. El importador escribe recurso antes de crear el nodo; un fallo puede dejar un recurso huérfano, sin recolector automático.
- La papelera perdida por versiones anteriores no puede reconstruirse. Abrir el proyecto con una versión anterior de la aplicación no garantiza que esa versión mantenga actualizada la nueva papelera.
- Configuración visual, portada del proyecto y recientes siguen parcialmente locales; no se migraron por carecer de un contrato único de proyecto en esta tarea.
- Los temporales de aperturas fallidas pueden quedar en disco. No se hizo limpieza masiva.
- CSS sigue siendo dueño de los assets de iconos. Los tipos SQLite siguen declarados en dos esquemas; el test detecta divergencias con Defs.
- Persisten avisos previos de bundle grande y current_project sin uso. No se modificó New Interface.ai.

## Historiales: etapa 5

| Historial | Dueño | Interfaz y límites |
| --- | --- | --- |
| Editor | useEditorHistory / useEditorController | push, undo, redo, reset por Node ID; HTML y bloques. structuralHistory también pertenece al editor. |
| Acciones del proyecto | useNodeStore y dominios Nodal | createNode, renameNode, moveNode, deleteNode, restoreDeletedNodes, mutateNodes; actualmente no existe undo/redo de acciones. |
| Navegación workspace | useWorkspaceNavigation | recibe destinos node/trash y emite onNavigate; solo escucha mouse 4/5, sin conocer contenido ni modificar nodos. |
| Navegación Calendar | CalendarNodeView | NavigationHandler(direction): boolean; true consume la navegación local, false permite retroceder por workspace. |

La extracción conserva el recorrido anterior y su política de volver/avanzar. Las pruebas cubren límites, duplicados, retorno sin borrar la rama futura y nueva visita que reemplaza esa rama. Calendar conserva su estado fecha/vista y su persistencia existente. Ctrl+Z sigue en el controlador del editor y no se conecta a navegación.

No se inventó un historial general de proyecto: requeriría definir agrupación de acciones, recursos, restauración de jerarquía y atomicidad de cambios compuestos. La frontera actual son las operaciones explícitas del store y sus transformaciones de nodos. Una implementación futura debe envolver esas operaciones, no reutilizar stacks HTML ni destinos de navegación. No se añadieron interfaces vacías ni eventos sin consumidor.

Etapa 5: pruebas nodales/navegación, build/typecheck, cargo fmt/check/tests y diff de esta tarea aprobados. Se mantienen los límites de verificación interactiva y las advertencias anteriores.

## Evaluación final: Audio hipotético (no implementado)

Para un Audio remoto sencillo, la estimación actual es de nueve archivos, incluyendo vista, asset y pruebas:

1. defs/nodeTypes.ts: declaración del tipo, concepto si corresponde, política de creación, selección y contenido inicial.
2. defs/palette.ts: token de color.
3. i18n/translations.ts: etiquetas en idiomas existentes.
4. App.css: regla del icono por convención node-type-icon--audio.
5. Un asset de icono si no existe uno adecuado.
6. Una vista Audio en su módulo de dominio, con reproducción/estado propio solo si el producto lo requiere.
7. `nodes/audio/renderer.tsx`: adaptador que consume `NodeViewHost`; se conecta en el composition root sin añadir casos a AppWorkspace.
8. src-tauri/src/project.rs: ampliar CHECK del esquema y migración, condición que detecta esquemas antiguos y prueba de roundtrip. El guardado genérico no necesita otra rama por Audio.
9. tests/nodal.test.mjs: expectativa de selección tras crear y pruebas de comportamiento. La comprobación del contrato registry/SQLite detecta automáticamente divergencias.

No es una promesa de coste fijo: importar bytes locales requeriría además política de recurso, extensión soportada, importador y quizá codec propio. resourceRepository/fileNodeImporter seguirían siendo servicios transversales, sin duplicarlos dentro de Audio. Audio no debe reutilizar reglas de proveedores de Video solo para ahorrar un archivo.

El tipo aparecería automáticamente en Tipos y creación según flags, en referencias por ID y en el grafo según concepto. Las relaciones material/content/relatedWork ya admiten un destino independiente; no haría falta añadir un rol para cada tipo. Los IDs, jerarquía, papelera y guardado consumirían servicios actuales. El sistema de iconos y el contrato de SQLite siguen exigiendo cambios explícitos justificables. La metadata de esquema todavía no se genera desde TypeScript; automatizarlo ahora introduciría otro proceso de build.

La mejora es acotada: se retiraron una lista paralela de selección, el default repetido y la conexión repetida de tres vistas. AppWorkspace aún conoce Página/Imagen/PDF/Calendar/Tempo y conserva import/drop y cierre. No se afirma que añadir un Nodo cueste cero cambios ni que Nodal esté terminado.

## Revisión final de invariantes

Se añadió una prueba del importador real con dobles únicamente para lectura PDF y escritura de recursos: crea exactamente un nodo, devuelve su mismo ID, conecta resourceId y elimina su propio recurso si falla la creación. No sustituye una prueba real del motor PDF o del navegador.

La revisión encontró serialización desigual de metadata HTML. stringifyHtmlMetadata ahora escapa los delimitadores para Página, PDF, Calendar/Tempo y Nodal, conservando JSON legible por versiones existentes. Reemplazar metadata usa una función para conservar literalmente textos con $& o $$. Las pruebas cubren terminadores de comentario, comillas, reemplazos repetidos y roundtrip temporal. No se cambian campos ni reglas temporales. La metadata que ya hubiera sido truncada por una versión anterior no se reconstruye automáticamente.

No se implementó Audio, no se añadió un nodo Evaluación, no se duplicó temporalidad de Tarea y no se rediseñó la UI. Las comprobaciones finales se ejecutan sobre el conjunto completo de cambios; los límites interactivos anteriores siguen vigentes.

La ejecución final concurrente encontró una colisión real de carpetas temporales: dos sesiones creadas en el mismo tick del reloj podían compartir extracción porque create_dir_all aceptaba una carpeta existente. temporary_project_folder ahora reserva con create_dir exclusivo, PID y contador; reintenta una colisión sin reutilizar el directorio. Se añadió una prueba de 32 reservas concurrentes. El total final pasa a 13 pruebas Rust.

Resultado final: pruebas nodales, de navegación, metadata e importación aprobadas; 13 tests Rust aprobados; build/typecheck, cargo check, cargo fmt --check y revisión de whitespace de archivos de esta tarea aprobados. El control global conserva las advertencias del archivo Illustrator previo. No se ejecutaron pruebas de píxeles ni se instalaron dependencias nuevas.
