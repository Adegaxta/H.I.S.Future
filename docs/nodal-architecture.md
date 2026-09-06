# Arquitectura Nodal: estabilización gradual

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
| Curso → syllabus / calendar / cover | nodalMeta, contenido del Curso | Un destino por rol; PDF / Calendar / Imagen validados |
| Curso → class / content | nodalMeta, contenido del Curso | Varios destinos; class requiere Video |
| Tarea → course / tempo | nodalMeta, contenido de Tarea | Un destino por rol; Tempo es la fuente temporal |
| Tarea → material / relatedWork | nodalMeta, contenido de Tarea | Varios destinos, sin duplicar entidades |
| Tempo → calendar | nodalMeta | Referencia explícita; fallback histórico parentId para proyectos existentes |
| Evaluación / tareas de Curso / tempos de Calendar | funciones de proyección nodalMeta | Filtros de entidades existentes, sin estado independiente |
| Menciones y llamadas HTML | editor / GraphView | IDs en contenido; no son filas SQL links |
| links SQLite | persistencia heredada | Sin escritor frontend actual; se preserva entre nodos activos |

NodeRelation ya aporta role + targetId + order opcional + date opcional. El lector valida roles y forma, elimina duplicados de rol/destino y conserva el orden del array; no se introduce ordenación nueva por order. canRelate es la política de dominio, no infraestructura de persistencia. relatedNode resuelve contra los activos. Un destino borrado deja una referencia sin resolver; restaurar el mismo ID reactiva la proyección. Borrado permanente no limpia automáticamente referencias semánticas. Las FK de links sí eliminan enlaces a entidades retiradas; no se reconstruyen al restaurar la papelera. No equiparar links con las relaciones semánticas en HTML.

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
| Acciones del proyecto | useNodeStore y funciones nodalMeta | createNode, renameNode, moveNode, deleteNode, restoreDeletedNodes, mutateNodes; actualmente no existe undo/redo de acciones. |
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
7. NodalViews.tsx: conexión de esa vista al host actual NodalNodeView; no necesita añadir otro caso a AppWorkspace.
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
