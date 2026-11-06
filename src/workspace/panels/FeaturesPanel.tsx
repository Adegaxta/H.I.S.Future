import { useMemo, useState } from "react";
import { useLocale } from "../../i18n/LocaleContext";

type FeatureCategory = "all" | "nodes" | "editor" | "fusions" | "navigation" | "utilities";

interface FeatureItem {
  id: string;
  category: "nodes" | "editor" | "fusions" | "navigation" | "utilities";
  title: string;
  badge?: string;
  icon: string;
  summary: string;
  capabilities: string[];
  howToUse?: string[];
  shortcuts?: string[];
  fusionTip?: string;
}

export function FeaturesPanel() {
  const { locale, t } = useLocale();
  const [activeCategory, setActiveCategory] = useState<FeatureCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isEs = locale === "es";

  const features: FeatureItem[] = useMemo(() => [
    // ----------------------------------------------------
    // NODOS (11 TIPOS)
    // ----------------------------------------------------
    {
      id: "node-page",
      category: "nodes",
      title: isEs ? "Página y Carpeta de Páginas" : "Page & Page Folder",
      badge: "page / page_folder",
      icon: "📄",
      summary: isEs
        ? "El lienzo principal de conocimiento en HIS. Documento no lineal estructurado en bloques independientes con soporte para texto enriquecido, listas dinámicas, tablas interactivas, medios y metadatos."
        : "The primary canvas of knowledge in HIS. A non-linear document structured into independent blocks with rich text, dynamic lists, interactive tables, media, and metadata.",
      capabilities: isEs
        ? [
            "Arquitectura modular de bloques: párrafos, encabezados H1-H3, listas, citas, código y bloques Globo.",
            "Listas jerárquicas colapsables y listas To-Do con casillas de verificación interactivas.",
            "Encabezados desplegables (Toggle Headings) para ocultar y revelar secciones extensas.",
            "Tablas de datos editables con redimensión de columnas, colores y pegado matricial.",
            "Incrustación de imágenes con tiradores de redimensionado libre y previsualización ampliada al clic.",
            "Pie de retroenlaces (Backlinks) que detecta automáticamente menciones desde otros documentos.",
            "Capacidad dual: cuando contiene subpáginas en el árbol, actúa como carpeta y documento simultáneamente.",
          ]
        : [
            "Modular block architecture: paragraphs, headings H1-H3, lists, quotes, code, and Globe blocks.",
            "Collapsible hierarchical lists and interactive To-Do checklists.",
            "Toggle Headings to cleanly fold and expand long documentation sections.",
            "Editable data tables with column resizing, custom styling, and spreadsheet matrix pasting.",
            "Embedded images with interactive resizing handles and Discord-style zoom preview on click.",
            "Backlinks footer automatically discovering inbound mentions from other documents.",
            "Dual role: when holding child pages in the Lore tree, functions as both a folder and document.",
          ],
      howToUse: isEs
        ? [
            "Crea una página desde el botón '+' en la barra lateral o con el atajo de creación rápida.",
            "Escribe '/' en cualquier línea vacía para abrir el menú de comandos y seleccionar formatos.",
            "Escribe '@' para vincular o incrustar cualquier otro nodo del proyecto al vuelo.",
            "Arrastra cualquier bloque desde su tirador lateral izquierdo para reordenar el contenido.",
          ]
        : [
            "Create a page from the '+' button in the sidebar or via the quick creation workflow.",
            "Type '/' on an empty block to open the slash commands menu and pick formats.",
            "Type '@' anywhere to link or embed any other project node on the fly.",
            "Drag any block handle on the left gutter to smoothly reorder sections.",
          ],
      fusionTip: isEs
        ? "Fusión con Grafo y Retroenlaces: cada enlace '@' que colocas dentro de una página teje una sinapsis en el Grafo Conceptual 2D y activa un retroenlace bidireccional en la página destino."
        : "Fusion with Graph & Backlinks: every '@' mention placed inside a page knits a synaptic edge in the 2D Concept Graph and triggers a bidirectional backlink in the destination page.",
    },
    {
      id: "node-course",
      category: "nodes",
      title: isEs ? "Curso y Campus Académico" : "Course & Academic Campus",
      badge: "course",
      icon: "🎓",
      summary: isEs
        ? "El centro neurálgico para estudiantes e investigadores. Centraliza el temario, enlaces a aulas virtuales (Zoom/Meet), clases grabadas con códigos, tareas, exámenes y calendario de horarios."
        : "The nerve center for students and researchers. Centralizes syllabus, virtual room links (Zoom/Meet), recorded lectures, tasks, exams, and embedded schedule calendar.",
      capabilities: isEs
        ? [
            "Pestaña Syllabus: visor de PDF integrado para consultar el programa académico sin abrir apps externas.",
            "Pestaña Aula (Room): registro de enlaces a clases en vivo (Meet, Zoom, Teams, portales) con botón de lanzamiento directo con un clic.",
            "Pestaña Clases: catálogo de vídeos de sesiones grabadas con código automático (T01, T02...), fecha y duración en minutos/horas.",
            "Pestaña Contenido: doble columna dividida entre 'Material de estudio' (PDFs, apuntes) y 'Tareas del curso'.",
            "Pestaña Evaluaciones: seguimiento cronológico de exámenes, entregas y pruebas con fechas detectadas automáticamente.",
            "Horario incrustado: visualización del calendario semanal del curso directamente en la ficha de identidad.",
            "Portada tecnológica: soporte de portada con estética retro-futurista y esquinas luminosas.",
          ]
        : [
            "Syllabus tab: built-in PDF viewer to review academic programs without external apps.",
            "Room tab: direct launcher links for live lectures (Meet, Zoom, Teams, portals) with one-click opening.",
            "Classes tab: catalog of recorded lecture videos with auto-sequencing (T01, T02...), dates, and runtime.",
            "Content tab: dual columns split between 'Study Material' and 'Course Tasks'.",
            "Evaluations tab: chronological tracking of exams and milestone deliverables.",
            "Embedded Schedule: direct weekly calendar view right inside the course identity section.",
            "Cyberpunk cover: futuristic card cover with corner accents.",
          ],
      howToUse: isEs
        ? [
            "Crea un Nodo Curso y define su código (ej. MAT-101), nombre y modalidad (Presencial/Virtual).",
            "En la pestaña 'Syllabus', pulsa '＋ Añadir programa' y selecciona o importa tu PDF.",
            "En la pestaña 'Aula', añade tus enlaces de Zoom o Meet para entrar a clase en un clic.",
            "En 'Clases', añade nodos de Vídeo para organizar tus grabaciones con duración y fecha.",
          ]
        : [
            "Create a Course Node and set its code (e.g. MAT-101), title, and modality.",
            "In 'Syllabus', click '＋ Add syllabus' to link or import your syllabus PDF.",
            "In 'Room', add your Zoom or Google Meet links for one-click lecture entry.",
            "In 'Classes', link Video nodes to organize recorded sessions with duration tags.",
          ],
      fusionTip: isEs
        ? "Fusión Total del Estudiante: el Nodo Curso actúa como un 'hub' que integra Nodos PDF (Syllabus), Nodos Video (Clases), Nodos Tarea (Deberes) y Nodos Calendario (Horario) en una sola vista."
        : "Total Student Hub: Course nodes unify PDF nodes (Syllabus), Video nodes (Lectures), Task nodes (Homework), and Calendar nodes (Schedule) into a singular command deck.",
    },
    {
      id: "node-task",
      category: "nodes",
      title: isEs ? "Tarea y Elemento de Acción" : "Task & Action Item",
      badge: "task",
      icon: "✅",
      summary: isEs
        ? "Nodo atómico de gestión de trabajo con estados de ejecución, vinculación a cursos, materiales de apoyo, trabajo relacionado y programación temporal con Tempo."
        : "Atomic workflow node featuring lifecycle states, course association, study materials, related work, and Tempo time scheduling.",
      capabilities: isEs
        ? [
            "Estados de progreso: Pendiente (pending), En progreso (progress) y Completado (done).",
            "Marcador de Evaluación: etiqueta tareas críticas como exámenes, entregas o proyectos puntuables.",
            "Vinculación a Curso: asocia la tarea directamente a una asignatura o materia para verla en su pestaña de contenidos.",
            "Columna de Materiales: lista de documentos, páginas o referencias necesarios para realizar la tarea.",
            "Columna de Trabajo Relacionado: enlaces bidireccionales con proyectos o entregables generados.",
            "Inspector de Tempo integrado: añade programación diaria, semanal o fija una fecha límite sin fecha previa.",
          ]
        : [
            "Lifecycle progress states: Pending, In Progress, and Completed.",
            "Evaluation flag: highlight critical exam dates, milestone submissions, or graded work.",
            "Course linkage: associate the task to an academic course to reflect it in the course content matrix.",
            "Materials column: reference docs, pages, and cheat-sheets needed to execute.",
            "Related Work column: bidirectional links to produced deliverables and child artifacts.",
            "Integrated Tempo Inspector: attach daily/weekly schedules or deadline milestones.",
          ],
      howToUse: isEs
        ? [
            "Crea una Tarea desde el menú lateral o desde dentro de la pestaña Contenido de un Curso.",
            "Cambia el selector de estado según avances (Pendiente -> En progreso -> Completado).",
            "Si tiene fecha límite, pulsa 'Diario' o 'Semanal' para activar el temporizador Tempo.",
          ]
        : [
            "Create a Task from the sidebar or from within a Course's Content tab.",
            "Update the status selector as you advance (Pending -> In Progress -> Completed).",
            "If it has a deadline, click 'Daily' or 'Weekly' to attach a Tempo schedule.",
          ],
      fusionTip: isEs
        ? "Fusión con Calendario: cuando una Tarea tiene Tempo programado, aparece automáticamente en el Calendario semanal y en la vista mensual con su color identificativo."
        : "Fusion with Calendar: tasks with Tempo schedules automatically map onto the weekly and monthly Calendar views with status coloring.",
    },
    {
      id: "node-video",
      category: "nodes",
      title: isEs ? "Vídeo con Marcas de Tiempo" : "Video with Interactive Timestamps",
      badge: "video",
      icon: "🎬",
      summary: isEs
        ? "Reproductor multimedia especializado para aprendizaje y análisis audiovisual, con soporte para vídeos locales y URLs web (YouTube/Vimeo) y bloc de transcripción sincronizado."
        : "Dedicated media player for learning and audiovisual analysis, supporting local files and web URLs (YouTube/Vimeo) with a synchronized transcription notepad.",
      capabilities: isEs
        ? [
            "Reproducción fluida de archivos directos (MP4, WebM) y fuentes incrustadas mediante iframe.",
            "Detección y extracción automática de duración, extensión y tamaño de almacenamiento.",
            "Botón '+ Insertar marca de tiempo actual': captura la posición exacta de reproducción y la estampa en el cursor.",
            "Barra interactiva de marcas de tiempo detectadas: un clic en cualquier píldora [MM:SS] salta la reproducción al segundo exacto.",
            "Buscador integrado en la transcripción con contador en tiempo real de coincidencias.",
            "Enlace de descarga directa y apertura externa con un solo clic.",
          ]
        : [
            "Smooth playback of direct files (MP4, WebM) and embedded iframe URLs.",
            "Automatic extraction and inspection of duration, extension, and storage footprint.",
            "'+ Insert current timestamp' button: stamps playback position [MM:SS] into notes at the caret.",
            "Interactive timestamp pills bar: clicking any detected [MM:SS] badge seeks playback to that exact second.",
            "Live in-transcript search with match counter highlight.",
            "One-click direct download and external browser opening.",
          ],
      howToUse: isEs
        ? [
            "Pega una URL de YouTube o importa un archivo de vídeo desde tu equipo.",
            "Mientras ves el vídeo, pulsa el botón '+ Insertar marca de tiempo actual' para anotar ideas clave.",
            "Al hacer clic en cualquier marca de tiempo [MM:SS] en el panel, el vídeo salta y se reproduce de inmediato.",
          ]
        : [
            "Paste a video URL or import a local video file from your computer.",
            "While watching, click '+ Insert current timestamp' to capture key discussion points.",
            "Click any timestamp [MM:SS] badge in the panel to instantly jump and resume playback.",
          ],
      fusionTip: isEs
        ? "Fusión con Clases de Curso: los Nodos Vídeo enlazados en un Curso reciben automáticamente códigos de clase secuenciales (T01, T02...) y cálculo acumulado de duración."
        : "Fusion with Course Lectures: Video nodes linked in a Course automatically receive sequential codes (T01, T02...) and cumulative runtime calculation.",
    },
    {
      id: "node-image",
      category: "nodes",
      title: isEs ? "Imagen, Galería e Inspector Técnico" : "Image, Gallery & Technical Inspector",
      badge: "image",
      icon: "🖼️",
      summary: isEs
        ? "Gestor integral de recursos gráficos, capturas y diagramas con visor a pantalla completa, inspector de resolución y metadatos técnicos y selector de portada del proyecto."
        : "Comprehensive manager for graphics, screenshots, and diagrams with fullscreen viewer, resolution inspector, technical metadata, and project cover selector.",
      capabilities: isEs
        ? [
            "Soporte de formatos PNG, JPEG, GIF, WebP y SVG con preservación de fidelidad sin pérdidas.",
            "Inspector técnico: resolución nativa (ancho x alto), peso en disco, formato MIME y detección de transparencia alfa.",
            "Botón 'Usar como portada del proyecto': fija la imagen como identidad visual de toda la bóveda.",
            "Descarga a disco local: exporta la imagen original en cualquier momento con un clic.",
            "Reemplazo en caliente: actualiza o cambia la imagen sin romper menciones ni enlaces existentes.",
            "Zoom flotante en documentos: haz clic en cualquier imagen incrustada para verla a pantalla completa estilo Discord.",
          ]
        : [
            "Lossless support for PNG, JPEG, GIF, WebP, and SVG formats.",
            "Technical Inspector: native resolution (width x height), disk size, MIME type, and alpha transparency check.",
            "'Use as project cover' button: sets the artwork as the visual brand of the entire vault.",
            "Export to disk: download the original image file at any time with one click.",
            "Live replacement: swap image assets without breaking existing mentions or document embeds.",
            "Discord-style zoom preview: click any embedded image inside a page to open the floating zoom viewer.",
          ],
      howToUse: isEs
        ? [
            "Arrastra una imagen desde tu explorador de archivos directamente sobre HIS.",
            "O usa el buscador integrado de Unsplash para encontrar fotos profesionales en alta definición.",
            "En el visor de imagen, consulta los detalles técnicos o establécela como portada del proyecto.",
          ]
        : [
            "Drag an image file from your system explorer directly onto HIS.",
            "Or use the integrated Unsplash picker to search high-res photography.",
            "In the image viewer, inspect technical dimensions or set it as vault cover.",
          ],
      fusionTip: isEs
        ? "Fusión con Menciones @: al mencionar una imagen en una página puedes elegir entre 'Insertada' (un chip discreto con hover-card) o 'Completa' (la imagen viva con tiradores de ajuste de ancho)."
        : "Fusion with @ Mentions: when referencing an image you can choose between 'Inline' (a subtle chip with hover preview) or 'Full' (live resizable image block).",
    },
    {
      id: "node-pdf",
      category: "nodes",
      title: isEs ? "Lector de PDF Nativo" : "Built-in Native PDF Reader",
      badge: "pdf",
      icon: "📑",
      summary: isEs
        ? "Visor de documentos PDF nativo de alto rendimiento integrado directamente en el espacio de trabajo con paginación, salto numérico y zoom preciso."
        : "High-performance native PDF document reader built right into the workspace with pagination, direct jump, and granular zoom controls.",
      capabilities: isEs
        ? [
            "Navegación fluida por páginas con controles de anterior, siguiente y salto numérico directo.",
            "Controles de zoom (acercar, alejar, ajustar al ancho de página y tamaño real).",
            "Indexación local de documentos para acceso instantáneo dentro de la bóveda sin conexión a internet.",
            "Conservación del progreso de lectura entre sesiones de trabajo.",
            "Incrustación en cursos: visualización directa como syllabus o material de clase.",
          ]
        : [
            "Smooth page navigation with previous, next, and direct numerical page jump controls.",
            "Precise zoom controls (zoom in, zoom out, fit-to-width, and actual size).",
            "Local document indexing for instant zero-latency offline access.",
            "Automatic retention of reading state and page position across sessions.",
            "Course embeddability: renders directly as a course syllabus or lecture material.",
          ],
      howToUse: isEs
        ? [
            "Importa cualquier archivo PDF desde el menú lateral o arrastrándolo a la app.",
            "Utiliza los controles superiores para ajustar el nivel de zoom y navegar entre páginas.",
            "Ábrelo en panel dividido junto a tus notas para redactar resúmenes con referencia visual constante.",
          ]
        : [
            "Import any PDF file via sidebar creation or simple drag-and-drop.",
            "Use the top toolbar to adjust zoom level and flip through pages.",
            "Open in split view alongside your notes to summarize with constant visual reference.",
          ],
      fusionTip: isEs
        ? "Fusión con Vista Dividida (Split View): abre el PDF en el panel izquierdo y una Página de notas en el panel derecho para transcribir y sintetizar sin alternar ventanas."
        : "Fusion with Split View: open the PDF on the left and a study Page on the right to extract quotes and take notes without app switching.",
    },
    {
      id: "node-calendar",
      category: "nodes",
      title: isEs ? "Calendario y Cronología (Mensual y Semanal)" : "Calendar & Chronology (Monthly & Weekly)",
      badge: "calendar",
      icon: "📅",
      summary: isEs
        ? "Planificador temporal interactivo con doble vista mensual y semanal para organizar eventos, fechas límite de tareas, entregas de cursos y rutinas de estudio."
        : "Interactive timeline planner with dual monthly and weekly views to organize events, task deadlines, course deliverables, and study schedules.",
      capabilities: isEs
        ? [
            "Doble vista: Cuadrícula mensual panorámica y vista semanal con rejilla de horas.",
            "Asignación de fechas, horas de inicio/fin y duraciones a eventos.",
            "Sincronización bidireccional con Nodos Tarea: las tareas con fecha aparecen coloreadas según su estado.",
            "Soporte de horarios de asignaturas integrado con Nodos Curso.",
            "Navegación rápida por meses y años con botón de retorno a 'Hoy'.",
          ]
        : [
            "Dual layout: Panoramic monthly grid and detailed weekly hourly schedule.",
            "Event start/end time duration assignment and calendar coloring.",
            "Bidirectional sync with Task Nodes: scheduled tasks appear color-coded by progress.",
            "Academic schedule integration directly linked to Course Nodes.",
            "Quick jumping across months and years with 'Today' instant reset button.",
          ],
      howToUse: isEs
        ? [
            "Abre el nodo Calendario para revisar tus compromisos del mes.",
            "Alterna entre la vista mensual y la vista semanal para planificar tu día hora por hora.",
            "Haz clic en cualquier día o franja horaria para crear un evento o vincular una tarea.",
          ]
        : [
            "Open the Calendar node to review your monthly commitments.",
            "Toggle between monthly and weekly view to plan your day hour by hour.",
            "Click any day slot or time range to create an event or bind a task.",
          ],
      fusionTip: isEs
        ? "Fusión con Cursos y Tareas: al programar una tarea en un Curso, el Calendario del curso y el Calendario general se actualizan automáticamente en tiempo real."
        : "Fusion with Courses & Tasks: scheduling a task inside a Course immediately populates both the course calendar and general calendar in real time.",
    },
    {
      id: "node-tempo",
      category: "nodes",
      title: isEs ? "Tempo (Hábitos y Consistencia)" : "Tempo (Habits & Consistency)",
      badge: "tempo",
      icon: "⏱️",
      summary: isEs
        ? "Módulo de gestión de hábitos, rutinas recurrentes y métricas de consistencia personal con soporte para frecuencias diarias, semanales, mensuales o anuales."
        : "Habit and recurring routine management module with consistency tracking supporting daily, weekly, monthly, and annual cadences.",
      capabilities: isEs
        ? [
            "Subtipos de recurrencia: diario (daily), semanal (weekly), mensual (monthly) y anual (annual).",
            "Configuración de formato de hora preferido (12h AM/PM vs 24h internacional).",
            "Bloc de notas de inspección integrado para registrar bitácoras de cada sesión de hábito.",
            "Contador visual de rachas continuas y registro histórico de constancia.",
            "Modo panel lateral o modo vista completa.",
          ]
        : [
            "Recurrence cadences: daily, weekly, monthly, and annual tracking.",
            "Time format customization (12-hour AM/PM vs 24-hour international).",
            "Built-in inspector notepad to document reflections and logs per session.",
            "Visual streaks tracker and chronological consistency log.",
            "Dual presentation: sidebar inspector panel or standalone view.",
          ],
      howToUse: isEs
        ? [
            "Los nodos Tempo se generan al programar tareas o al iniciar rutinas de hábito.",
            "Elige la frecuencia (Diario o Semanal) y asigna la hora de inicio o límite.",
            "Utiliza el editor inferior para tomar notas de progreso durante tu sesión de trabajo.",
          ]
        : [
            "Tempo nodes are generated when scheduling tasks or logging routines.",
            "Choose the cadence (Daily or Weekly) and set the start or target time.",
            "Use the built-in notepad to log progress notes during your session.",
          ],
      fusionTip: isEs
        ? "Fusión con Tareas: Tempo actúa como el motor temporal de las Tareas de HIS, permitiendo que una tarea simple tenga fecha, recurrencia y recordatorios."
        : "Fusion with Tasks: Tempo powers the time dimension of HIS Tasks, transforming a simple to-do into a recurring, deadline-tracked habit.",
    },
    {
      id: "node-category",
      category: "nodes",
      title: isEs ? "Categoría y Agrupador Lore" : "Category & Lore Folder",
      badge: "category",
      icon: "📁",
      summary: isEs
        ? "Contenedor organizacional puro en el árbol del Lore para estructurar universos narrativos, proyectos complejos o separar áreas de estudio sin peso innecesario."
        : "Pure organizational container in the Lore tree used to classify knowledge domains, worldbuilding lore, or complex projects without document bloat.",
      capabilities: isEs
        ? [
            "Agrupación jerárquica limpia sin contenido de texto redundante.",
            "Reorganizable mediante arrastrar y soltar (Drag & Drop) dentro del árbol.",
            "Filtrable instantáneamente en la pestaña 'Tipos' del panel de navegación lateral.",
            "Soporte de menú contextual con clic derecho para añadir elementos hijos directamente.",
          ]
        : [
            "Clean hierarchical grouping without bloating the project with empty files.",
            "Smooth drag-and-drop reordering within the sidebar Lore tree.",
            "Instantly filtered via the 'Types' sidebar panel.",
            "Right-click context menu to spawn child nodes directly underneath.",
          ],
      howToUse: isEs
        ? [
            "Crea una Categoría para tus carpetas principales (ej. 'Facultad', 'Novela', 'Trabajo').",
            "Arrastra Páginas u otros nodos dentro de la Categoría para mantener todo ordenado.",
          ]
        : [
            "Create a Category for top-level folders (e.g. 'University', 'Novel', 'Work').",
            "Drag Pages or other nodes inside to keep your project tree organized.",
          ],
      fusionTip: isEs
        ? "Fusión con Páginas: si necesitas que una carpeta contenga a su vez texto explicativo, puedes crear una Página y anidar otras páginas debajo; HIS la convertirá automáticamente en una 'Carpeta de Páginas'."
        : "Fusion with Pages: if you need a folder to also contain descriptive text, nest sub-pages under a Page; HIS will automatically treat it as a dual Page-Folder.",
    },
    {
      id: "node-project",
      category: "nodes",
      title: isEs ? "Proyecto (Bóveda Raíz)" : "Project (Root Vault)",
      badge: "project",
      icon: "🏛️",
      summary: isEs
        ? "La identidad central de la bóveda de conocimiento. Gestiona el nombre del proyecto, avatar e icono distintivo, tipo de nodo por defecto y preferencias horarias."
        : "The core identity of the knowledge vault. Configures project branding, avatar emblem, default node type, and chronological preferences.",
      capabilities: isEs
        ? [
            "Personalización del avatar con colores de la paleta HIS, emojis, iconos o imágenes personalizadas.",
            "Selección del tipo de nodo por defecto al crear nuevos elementos en la barra lateral.",
            "Configuración del formato de hora (12 horas AM/PM vs 24 horas militar).",
            "Aislamiento completo de almacenamiento local: tus datos residen únicamente en tu máquina.",
          ]
        : [
            "Avatar customization using HIS palette accents, emoji glyphs, vector icons, or custom art.",
            "Default node type setting for fast one-click creation in the sidebar.",
            "Time format configuration (12-hour AM/PM vs 24-hour international).",
            "Complete local-first storage isolation: all project data resides exclusively on your device.",
          ],
      howToUse: isEs
        ? [
            "Haz clic en el avatar del proyecto en la esquina superior izquierda de la barra lateral para acceder a la configuración de la bóveda.",
            "Personaliza el avatar, el nombre del proyecto y las opciones de creación rápida.",
          ]
        : [
            "Click the project avatar in the top-left sidebar corner to open project configuration.",
            "Customize the avatar emblem, project name, and default node options.",
          ],
      fusionTip: isEs
        ? "Fusión con Guardado Seguro: cada cambio en el proyecto se preserva en un contenedor cifrado '.his' de alto rendimiento con transacciones SQLite."
        : "Fusion with Safe Persistence: every project change is preserved inside a verified local '.his' container powered by atomic SQLite transactions.",
    },

    // ----------------------------------------------------
    // FUSIONES Y SINERGIAS ÚNICAS
    // ----------------------------------------------------
    {
      id: "fusion-video-notes",
      category: "fusions",
      title: isEs ? "Fusión: Apuntes Sincronizados con Vídeo" : "Fusion: Synchronized Video Study Notes",
      icon: "⚡",
      summary: isEs
        ? "Vincula notas de texto con puntos exactos de un vídeo. Al hacer clic en cualquier marca de tiempo de tus notas, el reproductor viaja al segundo exacto donde se explicó el concepto."
        : "Bind written thoughts to exact moments in video playback. Clicking any timestamp in your notes jumps the player straight to that explanatory second.",
      capabilities: isEs
        ? [
            "Estampado instantáneo: pulsa '+ Insertar marca de tiempo actual' para sellar [MM:SS] sin pausar la mente.",
            "Píldoras interactivas automáticas: HIS detecta cualquier patrón [MM:SS] o MM:SS en el texto y lo convierte en botón de salto.",
            "Búsqueda textual: busca palabras en la transcripción y salta directamente al fragmento donde se mencionan.",
            "Ideal para análisis de conferencias, clases magistrales, revisión de código o anotación cinematográfica.",
          ]
        : [
            "Zero-friction stamping: click '+ Insert current timestamp' to insert [MM:SS] without breaking concentration.",
            "Automatic interactive pills: HIS detects any [MM:SS] or MM:SS pattern and generates instant seek buttons.",
            "In-transcript keyword search with real-time occurrence highlights.",
            "Perfect for lecture analysis, masterclasses, code walkthroughs, and film breakdown.",
          ],
      howToUse: isEs
        ? [
            "1. Abre un nodo de Vídeo.",
            "2. Inicia la reproducción y escribe tus notas en el panel de transcripción inferior.",
            "3. Pulsa '+ Insertar marca de tiempo actual' cada vez que cambies de tema o escuches algo relevante.",
            "4. Haz clic en las píldoras '⏱ MM:SS' para rebobinar el vídeo instantáneamente al fragmento deseado.",
          ]
        : [
            "1. Open any Video node.",
            "2. Start playback and jot down thoughts in the lower transcript notepad.",
            "3. Click '+ Insert current timestamp' whenever a new topic or key insight is shared.",
            "4. Click any '⏱ MM:SS' pill to jump the video directly to that moment.",
          ],
    },
    {
      id: "fusion-course-hub",
      category: "fusions",
      title: isEs ? "Fusión: Campus y Centro de Mando del Estudiante" : "Fusion: Student Command Deck Hub",
      icon: "🏛️",
      summary: isEs
        ? "El Nodo Curso articula cinco dimensiones del aprendizaje en una sola pantalla: temario en PDF, enlaces a aulas virtuales, grabaciones de clases, tareas y calendario de horarios."
        : "Course nodes orchestrate five learning dimensions in one screen: PDF syllabus, live room links, lecture video archives, tasks, and embedded schedules.",
      capabilities: isEs
        ? [
            "Centralización radical: olvídate de tener 10 pestañas abiertas en el navegador; todo lo relativo a la asignatura vive en su ficha.",
            "Lanzamiento de clases con un clic hacia Zoom, Meet o Teams.",
            "Cálculo automatizado de tiempo total de vídeos de clase vistos y pendientes.",
            "Evaluaciones vinculadas con alertas de fechas límite inminentes.",
          ]
        : [
            "Radical consolidation: replace 10 open browser tabs with a single course command deck.",
            "One-click classroom launcher for Zoom, Google Meet, and Microsoft Teams.",
            "Automated calculation of total recorded lecture hours completed and pending.",
            "Evaluation milestones linked with upcoming deadline alerts.",
          ],
      fusionTip: isEs
        ? "Organiza cada semestre creando una Categoría 'Ciclo 2026' y dentro coloca tus Nodos Curso. Todo tu material universitario quedará perfectamente indexado."
        : "Organize semesters by creating a Category 'Term 2026' and nesting your Course Nodes inside. All academic materials stay perfectly indexed.",
    },
    {
      id: "fusion-transclusion",
      category: "fusions",
      title: isEs ? "Fusión: Menciones @ y Transclusión Viva" : "Fusion: @ Mentions & Living Transclusion",
      icon: "🔗",
      summary: isEs
        ? "Conecta nodos con fluidez quirúrgica. Escribe '@' y elige entre dos experiencias: un chip de enlace compacto con hover-card interactiva o una incrustación completa del nodo dentro del texto."
        : "Connect nodes with surgical fluidity. Type '@' and choose between two distinct modes: a compact link chip with an interactive hover-card or a full live embed directly inside your prose.",
      capabilities: isEs
        ? [
            "Modo Insertada (Chip): Enlace en línea con icono y nombre. Al pasar el ratón muestra una tarjeta flotante de vista previa sin salir del documento.",
            "Modo Completo (Transclusión): Incrusta el nodo de forma viva (ej. imágenes a tamaño completo con tiradores interactivos de redimensión).",
            "Creación al vuelo: si el nodo que buscas con '@' no existe, HIS te permite crearlo en el mismo instante.",
            "Navegación con un clic: haz clic en cualquier mención para abrir ese documento en tu panel activo o en una nueva pestaña.",
          ]
        : [
            "Inline Chip mode: compact inline link with node emblem. Hovering summons a live preview card without leaving your page.",
            "Full Embed mode: inserts the node directly into the flow of text (e.g. resizable full images with interactive width handles).",
            "On-the-fly creation: if the node queried via '@' doesn't exist yet, HIS lets you spawn it instantly.",
            "One-click navigation: click any mention pill to navigate or open in a split pane tab.",
          ],
      howToUse: isEs
        ? [
            "Escribe '@' en cualquier bloque de texto.",
            "Empieza a escribir el nombre del nodo que quieres enlazar.",
            "Usa las flechas ↑ ↓ para elegir entre 'Insertada' o 'Completa' y pulsa Enter.",
          ]
        : [
            "Type '@' inside any paragraph or block.",
            "Begin typing the target node name.",
            "Use arrows ↑ ↓ to toggle between 'Inline' or 'Full' presentation and press Enter.",
          ],
    },
    {
      id: "fusion-backlinks",
      category: "fusions",
      title: isEs ? "Fusión: Retroenlaces Bidireccionales (Backlinks)" : "Fusion: Bidirectional Backlinks Network",
      icon: "🔄",
      summary: isEs
        ? "Convierte tus notas en una red cerebral Zettelkasten. Toda página sabe automáticamente qué otros documentos la mencionan o citan en el proyecto, sin necesidad de configurar enlaces manuales de retorno."
        : "Transforms your vault into a living Zettelkasten network. Every page automatically knows which other documents reference it across the project, eliminating manual reciprocal linking.",
      capabilities: isEs
        ? [
            "Descubrimiento automático en segundo plano basado en menciones @ y referencias de contenido.",
            "Sección colapsable al final de cada página con conteo numérico de menciones entrantes.",
            "Píldoras interactivas con el icono de tipo de nodo y nombre para saltar al documento citador con un solo clic.",
            "Permite descubrir relaciones emergentes entre conceptos que escribiste meses atrás.",
          ]
        : [
            "Automatic background discovery based on in-text @ mentions and content references.",
            "Collapsible section at the bottom of every page displaying incoming mention counts.",
            "Interactive node pills with node type icons and titles for one-click back-navigation.",
            "Reveals emergent connections between concepts authored across different periods.",
          ],
    },
    {
      id: "fusion-graph-pixi",
      category: "fusions",
      title: isEs ? "Fusión: Grafo Conceptual 2D con Motor Pixi.js" : "Fusion: 2D Concept Graph with Pixi Engine",
      icon: "🕸️",
      summary: isEs
        ? "Tu base de conocimiento visualizada como una constelación de neuronas interconectadas en WebGL. Cada enlace '@' crea una conexión física que agrupa tus ideas en clústeres orgánicos."
        : "Your knowledge base visualized as an interconnected neuronal constellation in WebGL. Every '@' link forms a physical edge, naturally pulling ideas into organic clusters.",
      capabilities: isEs
        ? [
            "Renderizado acelerado por hardware mediante WebGL y Pixi.js de alta tasa de refresco.",
            "Simulación física de fuerzas: los nodos más referenciados actúan como centros gravitacionales de tu conocimiento.",
            "Controles intuitivos de paneo, zoom con rueda del ratón y arrastre interactivo de nodos.",
            "Haz clic en cualquier nodo del grafo para abrirlo de inmediato en el espacio de trabajo.",
          ]
        : [
            "Hardware-accelerated rendering powered by high-framerate WebGL and Pixi.js.",
            "Force-directed physics simulation: highly linked hubs act as gravitational centers.",
            "Smooth panning, mouse wheel zoom, and real-time interactive node dragging.",
            "Click any star in the constellation to instantly open and edit that document.",
          ],
    },
    {
      id: "fusion-tempo-tasks",
      category: "fusions",
      title: isEs ? "Fusión: Planificación Temporal Tarea-Tempo" : "Fusion: Task-Tempo Time Scheduling",
      icon: "⏱️",
      summary: isEs
        ? "Al programar una Tarea como diaria o semanal, HIS genera un nodo Tempo vinculado que proyecta la tarea en el Calendario y registra el tiempo dedicado."
        : "Scheduling a Task as daily or weekly creates a linked Tempo node, mapping the task directly onto the Calendar and tracking invested focus time.",
      capabilities: isEs
        ? [
            "Programación sin fricción: activa la periodicidad directamente desde la ficha de la Tarea.",
            "Reflejo automático en la vista semanal del Calendario para visualización de carga de trabajo.",
            "Anotaciones contextuales durante la sesión de trabajo sin salir del temporizador.",
          ]
        : [
            "Frictionless scheduling: toggle cadence directly from the Task view.",
            "Automatic reflection in the weekly Calendar view to balance daily workload.",
            "Contextual focus notes logged inside the session timer.",
          ],
    },

    // ----------------------------------------------------
    // EDITOR Y ATAJOS DE TECLADO
    // ----------------------------------------------------
    {
      id: "editor-markdown-shortcuts",
      category: "editor",
      title: isEs ? "Atajos Markdown al Vuelo" : "Instant Markdown Shortcuts",
      icon: "⌨️",
      summary: isEs
        ? "Formatea tu texto a la velocidad del pensamiento. Escribe los prefijos estándar de Markdown al inicio de una línea y el editor transformará el bloque automáticamente."
        : "Format documents at the speed of thought. Type standard Markdown prefixes at the beginning of a line and the editor will format the block automatically.",
      capabilities: isEs
        ? [
            "# + Espacio -> Título H1",
            "## + Espacio -> Título H2",
            "### + Espacio -> Título H3",
            "#> / ##> / ###> + Espacio -> Encabezados desplegables (Toggle Headings)",
            "- o * o • + Espacio -> Lista con viñetas",
            "1. o 1) + Espacio -> Lista numerada",
            "[] o [ ] + Espacio -> Casilla interactiva To-Do",
            "> + Espacio -> Bloque destacado / cita",
            "--- + Espacio o Enter -> Separador horizontal con nueva línea",
            "``` + Espacio o Enter -> Bloque de código multilínea",
          ]
        : [
            "# + Space -> Heading 1",
            "## + Space -> Heading 2",
            "### + Space -> Heading 3",
            "#> / ##> / ###> + Space -> Toggle Headings",
            "- or * or • + Space -> Bulleted list",
            "1. or 1) + Space -> Numbered list",
            "[] or [ ] + Space -> Interactive To-Do checklist item",
            "> + Space -> Highlighted block / quote",
            "--- + Space or Enter -> Horizontal divider line",
            "``` + Space or Enter -> Multiline code block",
          ],
      shortcuts: [
        "# + Space",
        "## + Space",
        "### + Space",
        "- + Space",
        "1. + Space",
        "[] + Space",
        "> + Space",
        "--- + Enter",
        "``` + Enter",
      ],
    },
    {
      id: "editor-code-blocks",
      category: "editor",
      title: isEs ? "Bloques de Código Multilínea" : "Multiline Code Blocks",
      icon: "💻",
      summary: isEs
        ? "Entorno tipográfico monoespaciado para fragmentos de programación, comandos de terminal y configuración, con botón flotante de copia integrado."
        : "Monospaced typographic environment for code snippets, terminal commands, and scripts with built-in floating one-click clipboard copy.",
      capabilities: isEs
        ? [
            "Tipografía monoespaciada Cascadia Code / SF Mono con fondo oscuro de alto contraste.",
            "Pulsar Enter dentro del bloque inserta saltos de línea (\\n) con total naturalidad sin romper el bloque.",
            "Pulsar Shift + Enter o Ctrl + Enter sale del bloque de código e inserta un párrafo nuevo debajo.",
            "Botón flotante 'Copiar' en la esquina superior derecha con feedback visual 'Copiado'.",
            "Convertible bidireccionalmente desde el menú de formato de bloque (badge </>).",
          ]
        : [
            "High-contrast dark monospaced typography using Cascadia Code and SF Mono.",
            "Pressing Enter cleanly inserts newline characters (\\n) without splitting blocks.",
            "Pressing Shift + Enter or Ctrl + Enter exits the code block into a fresh paragraph below.",
            "Floating 'Copy' button on block hover with instant visual 'Copied' feedback.",
            "Bidirectionally convertible from the block format menu (badge </>).",
          ],
      shortcuts: ["``` + Enter", "Enter", "Shift + Enter", "Ctrl + Enter"],
    },
    {
      id: "editor-tables",
      category: "editor",
      title: isEs ? "Tablas de Datos Interactivas" : "Interactive Data Tables",
      icon: "📊",
      summary: isEs
        ? "Cuadrículas estructuradas para organizar datos, matrices comparativas y registros tabulares directamente dentro de cualquier página."
        : "Structured grids to organize data, comparative matrices, and tabular records directly inside any page.",
      capabilities: isEs
        ? [
            "Añadir y eliminar filas y columnas desde tiradores intuitivos.",
            "Reorganización por arrastre de columnas y filas.",
            "Pegado inteligente desde hojas de cálculo (Excel, Google Sheets o CSV tabulado).",
            "Aplicación de colores de fondo y bordes por celda o selección de celdas.",
            "Navegación ágil entre celdas mediante la tecla Tab y Shift + Tab.",
          ]
        : [
            "Add and remove rows and columns via intuitive edge handles.",
            "Drag-and-drop column and row reordering.",
            "Intelligent matrix paste directly from spreadsheets (Excel, Google Sheets, or TSV).",
            "Cell and row custom accent color and border fills.",
            "Swift keyboard navigation using Tab and Shift + Tab across cells.",
          ],
    },
    {
      id: "editor-globe-blocks",
      category: "editor",
      title: isEs ? "Bloques Globo, Desplegables y Columnas" : "Globe Blocks, Toggles & Column Layouts",
      icon: "🌐",
      summary: isEs
        ? "Estructuras avanzadas de diseño para documentos: cajas destacadas con iconos temáticos, listas desplegables plegables tipo acordeón y distribución en columnas paralelas."
        : "Advanced layout structures for documents: themed callout boxes with icons, collapsible accordion toggles, and multi-column parallel layouts.",
      capabilities: isEs
        ? [
            "Bloques Globo (Globe): cajas de aviso con icono temático, borde iluminado y fondo contrastado para notas clave y alertas.",
            "Desplegables (Dropdowns / Toggle lists): encabezados plegables que ocultan contenido extenso para mantener la página limpia.",
            "Diseño en columnas: organiza ideas o comparativas en bloques lado a lado.",
            "Paleta cromática de bloque: colorea el texto o el fondo del bloque con los tonos característicos de HIS.",
          ]
        : [
            "Globe blocks: illuminated callouts with custom emblem icons for key insights and alerts.",
            "Dropdown toggles: collapsible headers that fold long explanations to keep pages uncluttered.",
            "Multi-column layouts: place complementary notes side-by-side.",
            "Block color styling: customize text and background accents with the HIS palette.",
          ],
      shortcuts: ["#> + Space", "/globo"],
    },
    {
      id: "editor-slash-commands",
      category: "editor",
      title: isEs ? "Comandos de Barra Inclinada (/)" : "Slash Commands Menu (/)",
      icon: "⚡",
      summary: isEs
        ? "El centro de control creativo del editor. Escribe '/' para desplegar un catálogo completo de bloques, formatos, divisores y colores."
        : "The creative command deck of the editor. Type '/' to summon a comprehensive catalog of blocks, formats, dividers, and palettes.",
      capabilities: isEs
        ? [
            "Conversión instantánea de tipo de bloque (párrafo, encabezados, listas, citas, código).",
            "Inserción directa de tablas, líneas divisorias y bloques Globo.",
            "Selector de colores de texto y fondos de bloque.",
            "Acceso directo a menciones y creación de nuevos nodos.",
          ]
        : [
            "Instant block type transformation (paragraph, headings, lists, quotes, code).",
            "One-click insertion of tables, horizontal dividers, and Globe callouts.",
            "Typography color palette and block background styling.",
            "Direct mention trigger and new node creation workflow.",
          ],
      shortcuts: ["/"],
    },
    {
      id: "editor-inline-formatting",
      category: "editor",
      title: isEs ? "Formato de Texto y Atajos de Teclado" : "Inline Formatting & Keybindings",
      icon: "✨",
      summary: isEs
        ? "Atajos de teclado universales para estilizar texto seleccionado sin levantar las manos del teclado."
        : "Universal keyboard shortcuts to style selected text without taking your hands off the keyboard.",
      capabilities: isEs
        ? [
            "Ctrl + B: Negrita",
            "Ctrl + I: Cursiva",
            "Ctrl + U: Subrayado",
            "Ctrl + E: Código en línea (inline code)",
            "Ctrl + Shift + S o Ctrl + Shift + X: Tachado",
            "Tab / Shift + Tab: Indentar / Desindentar listas y bloques",
            "Ctrl + Z / Ctrl + Y: Deshacer / Rehacer unificado (texto y estructura sincronizados)",
          ]
        : [
            "Ctrl + B: Bold",
            "Ctrl + I: Italic",
            "Ctrl + U: Underline",
            "Ctrl + E: Inline code",
            "Ctrl + Shift + S or Ctrl + Shift + X: Strikethrough",
            "Tab / Shift + Tab: Indent / Outdent lists and blocks",
            "Ctrl + Z / Ctrl + Y: Unified structural & inline Undo / Redo stack",
          ],
      shortcuts: ["Ctrl + B", "Ctrl + I", "Ctrl + U", "Ctrl + E", "Ctrl + Shift + S", "Ctrl + Z", "Ctrl + Y"],
    },
    {
      id: "editor-image-preview",
      category: "editor",
      title: isEs ? "Previsualización Ampliada e Interacción con Imágenes" : "Image Zoom Preview & Interactive Handles",
      icon: "🔍",
      summary: isEs
        ? "Control milimétrico sobre las imágenes incrustadas: ajuste de ancho mediante tiradores táctiles y visor flotante ampliado con fondo desenfocado estilo Discord."
        : "Precise control over embedded images: horizontal drag-to-resize handles and a Discord-style floating modal zoom with backdrop blur.",
      capabilities: isEs
        ? [
            "Clic sobre cualquier imagen incrustada abre el visor emergente de alta resolución.",
            "Tiradores en los bordes laterales para ajustar el ancho exacto del bloque visual.",
            "Botón de descarga directa desde la vista previa.",
            "Alternancia fluida entre chip de mención compacto o bloque completo.",
          ]
        : [
            "Clicking any embedded image launches the high-resolution zoom lightbox.",
            "Horizontal edge handles for fine-tuned width resizing directly in the editor.",
            "Direct download button inside the zoom preview.",
            "Seamless toggle between inline mention chip and full visual block.",
          ],
    },

    // ----------------------------------------------------
    // NAVEGACIÓN Y ESPACIO DE TRABAJO
    // ----------------------------------------------------
    {
      id: "nav-quick-switcher",
      category: "navigation",
      title: isEs ? "Quick Switcher / Paleta Universal (Ctrl+K)" : "Quick Switcher / Spotlight (Ctrl+K)",
      icon: "🔍",
      summary: isEs
        ? "El buscador flotante universal de HIS. Encuentra y salta a cualquier nodo del proyecto en milisegundos con navegación total por teclado."
        : "The universal floating spotlight of HIS. Find and jump to any node in the vault in milliseconds with 100% keyboard navigation.",
      capabilities: isEs
        ? [
            "Activación instantánea mediante Ctrl + K o Ctrl + P desde cualquier parte de la aplicación.",
            "Búsqueda normalizada inteligente: ignora mayúsculas, minúsculas y tildes.",
            "Muestra automáticamente los nodos más recientes cuando el campo de búsqueda está vacío.",
            "Navegación ágil con las flechas ↑ y ↓, selección con Enter y cierre con Escape.",
            "Muestra icono representativo y tipo de nodo para una identificación visual inmediata.",
          ]
        : [
            "Instant trigger using Ctrl + K or Ctrl + P from anywhere in the app.",
            "Intelligent normalized search: insensitive to case, accents, and diacritics.",
            "Auto-surfaces recent documents when query input is blank.",
            "Swift navigation with ↑ and ↓ arrow keys, Enter to activate, and Escape to dismiss.",
            "Displays node type glyph and label for instant recognition.",
          ],
      shortcuts: ["Ctrl + K", "Ctrl + P", "↑ / ↓", "Enter", "ESC"],
    },
    {
      id: "nav-history-controls",
      category: "navigation",
      title: isEs ? "Historial de Navegación (← y →)" : "Navigation History Controls (← & →)",
      icon: "🧭",
      summary: isEs
        ? "Viaja hacia atrás y hacia adelante por los nodos que has visitado exactamente igual que en un navegador web, siempre accesible en la esquina superior del workspace."
        : "Travel backward and forward across your visited nodes just like a web browser, permanently accessible in the top workspace corner.",
      capabilities: isEs
        ? [
            "Botones Atrás (←) y Adelante (→) integrados en la cabecera del espacio de trabajo.",
            "Pila de navegación cronológica que recuerda cada documento que has abierto.",
            "Permite explorar referencias cruzadas y regresar a tu página de origen sin perder el contexto.",
          ]
        : [
            "Back (←) and Forward (→) buttons docked in the top workspace controls.",
            "Chronological stack remembering every node visited in sequence.",
            "Explore deep reference chains and effortlessly return to your origin page.",
          ],
    },
    {
      id: "nav-split-view",
      category: "navigation",
      title: isEs ? "Pestañas y Vistas Divididas (Paneles)" : "Tabs & Split Panes System",
      icon: "🪟",
      summary: isEs
        ? "Organiza tu área de trabajo a tu medida. Abre múltiples pestañas simultáneas y divide la pantalla en paneles paralelos para trabajar en multitarea."
        : "Tailor your workspace layout. Open multiple simultaneous tabs and split the screen into side-by-side panes for efficient multitasking.",
      capabilities: isEs
        ? [
            "Pestañas de documentos independientes en la barra superior del área de trabajo.",
            "División de pantalla en paneles verticales u horizontales.",
            "Permite comparar notas, consultar un PDF mientras redactas o ver un vídeo con apuntes al lado.",
            "Cierre y cambio de foco de pestañas individual sin perder el estado de edición.",
          ]
        : [
            "Independent document tabs pinned along the top workspace surface.",
            "Split workspace area into vertical or horizontal panes.",
            "Compare documents, consult a PDF while writing, or keep video notes side-by-side.",
            "Individual tab closing and focus switching with zero state loss.",
          ],
    },
    {
      id: "nav-zen-mode",
      category: "navigation",
      title: isEs ? "Modo Zen de Concentración (F11)" : "Zen Focus Mode (F11)",
      icon: "🧘",
      summary: isEs
        ? "Elimina cualquier distracción visual. Oculta la barra lateral y barras de herramientas para sumergirte en una experiencia pura de escritura y lectura."
        : "Eliminate all visual noise. Hides sidebars and peripheral toolbars to immerse yourself in pure writing and reading focus.",
      capabilities: isEs
        ? [
            "Alternancia instantánea pulsando F11.",
            "Maximiza el ancho y centrado del documento en la pantalla.",
            "El contenido permanece 100% editable con todos los atajos de teclado operativos.",
          ]
        : [
            "Instant toggle with a single press of F11.",
            "Maximizes text container layout and centering across the screen.",
            "Document remains 100% functional with all keybindings active.",
          ],
      shortcuts: ["F11"],
    },
    {
      id: "nav-lore-sidebar",
      category: "navigation",
      title: isEs ? "Árbol del Lore y Gestión Jerárquica" : "Lore Tree & Hierarchical Organization",
      icon: "🌲",
      summary: isEs
        ? "La estructura vertebral de tus proyectos. Organiza páginas, carpetas y recursos con drag & drop intuitivo y selección múltiple."
        : "The backbone of your project. Organize pages, folders, and assets with intuitive drag-and-drop and multi-selection.",
      capabilities: isEs
        ? [
            "Jerarquía infinita: anida páginas dentro de otras páginas o bajo categorías temáticas.",
            "Arrastrar y soltar (Drag & Drop) para reorganizar el orden o mover nodos entre carpetas.",
            "Selección múltiple de nodos para mover o eliminar por lotes.",
            "Menú contextual con clic derecho: renombrar, duplicar, abrir en pestaña, exportar o eliminar.",
            "Tres pestañas en la barra lateral: 'Lore' (árbol), 'Recientes' (historial) y 'Tipos' (filtro por tipo con contadores).",
          ]
        : [
            "Infinite hierarchical nesting: embed pages inside pages or under categories.",
            "Intuitive drag-and-drop to reorder sibling positions or re-parent nodes.",
            "Multi-selection support for batch moves and cleanup operations.",
            "Right-click context menu: rename, duplicate, open in tab, export, or send to trash.",
            "Three dedicated sidebar tabs: 'Lore' (tree), 'Recent' (history), and 'Types' (by category with counters).",
          ],
    },

    // ----------------------------------------------------
    // UTILIDADES Y SISTEMA
    // ----------------------------------------------------
    {
      id: "util-export-multiformat",
      category: "utilities",
      title: isEs ? "Exportación Multi-formato (Markdown, HTML y PDF)" : "Multi-Format Export (Markdown, HTML & PDF)",
      icon: "📤",
      summary: isEs
        ? "Exporta tus documentos a formatos estándar universales en cualquier momento: Markdown limpio (.md), páginas web HTML independientes con estilos integrados, o impresión directa a PDF."
        : "Export your documents to universal standard formats anytime: clean Markdown (.md), self-contained styled HTML pages, or direct print-to-PDF.",
      capabilities: isEs
        ? [
            "Exportación a Markdown (.md): preserva encabezados, listas to-do, tablas y enlaces limpios compatibles con Obsidian, GitHub o VS Code.",
            "Exportación a HTML (.html): genera un archivo autocontenido con los estilos cyberpunk oscuros de HIS listo para ver en cualquier navegador.",
            "Impresión / PDF (.pdf): hoja de estilos tipográfica limpia optimizada para hojas A4 o Carta sin botones de interfaz.",
            "Acceso directo desde el menú de opciones del nodo (tres puntos) o menú contextual.",
          ]
        : [
            "Markdown (.md) export: preserves headings, task checklists, tables, and clean links compatible with Obsidian and GitHub.",
            "HTML (.html) export: builds a self-contained web page with HIS styling viewable in any browser.",
            "Print / PDF (.pdf): clean print stylesheet optimized for standard A4 and Letter pages without UI controls.",
            "Direct access via the node action menu (three dots) or right-click context menu.",
          ],
    },
    {
      id: "util-tags-system",
      category: "utilities",
      title: isEs ? "Sistema de Etiquetas y Colores de Tags" : "Multidimensional Tags System & Color Palettes",
      icon: "🏷️",
      summary: isEs
        ? "Organización transversal flexible. Asigna múltiples etiquetas a cualquier nodo con colores personalizados de la paleta HIS para filtrar y clasificar conceptos entre carpetas."
        : "Flexible cross-cutting organization. Assign multiple tags to any node with custom color pills from the HIS palette to classify and filter concepts.",
      capabilities: isEs
        ? [
            "Selector de etiquetas rápido con búsqueda y creación instantánea de nuevos tags.",
            "Paleta cromática de tags: asigna colores diferenciados a cada etiqueta para identificación visual inmediata.",
            "Píldoras de etiquetas (Tag Chips) visibles en la cabecera de los nodos y diálogos de creación.",
            "Permite relacionar notas que pertenecen a diferentes carpetas bajo un mismo tópico temático.",
          ]
        : [
            "Quick tag picker with instant search and on-the-fly tag spawning.",
            "Tag color palette: assign distinct accents to tags for rapid visual scanning.",
            "Tag Chips displayed prominently across node headers and creation panels.",
            "Cross-references notes living in disparate folders under shared thematic topics.",
          ],
    },
    {
      id: "util-unsplash",
      category: "utilities",
      title: isEs ? "Banco de Imágenes Unsplash Integrado" : "Built-in Unsplash Image Hub",
      icon: "📷",
      summary: isEs
        ? "Buscador fotográfico directo sin salir de la app. Explora millones de fotografías de alta resolución libres de derechos de Unsplash e impórtalas con un clic."
        : "Direct photographic search without leaving the app. Browse millions of high-resolution royalty-free photos from Unsplash and import them with one click.",
      capabilities: isEs
        ? [
            "Búsqueda por palabras clave en tiempo real con rejilla de miniaturas fluidas.",
            "Descarga e indexación local automática en tu bóveda con atribución al fotógrafo.",
            "Uso directo como portadas de curso, portadas de proyecto o imágenes ilustrativas de página.",
            "Cero fricción: no necesitas descargar archivos al escritorio ni abrir el navegador web.",
          ]
        : [
            "Real-time keyword search with responsive high-density thumbnail masonry.",
            "Automatic local download and indexing with photographer attribution metadata.",
            "Instant assignment as course covers, project covers, or page illustrations.",
            "Zero friction: eliminates manual browser downloads and desktop file dragging.",
          ],
    },
    {
      id: "util-discord-presence",
      category: "utilities",
      title: isEs ? "Discord Rich Presence" : "Discord Rich Presence",
      icon: "🎮",
      summary: isEs
        ? "Conexión nativa con tu perfil de Discord. Muestra en tiempo real qué proyecto estás editando, en qué nodo trabajas y cuánto tiempo llevas concentrado."
        : "Native link with your Discord profile. Displays real-time status showing your active project, edited node, and elapsed focus duration.",
      capabilities: isEs
        ? [
            "Actualización automática de estado al abrir y editar proyectos.",
            "Icono oficial de H.I.S. Future y badge de la aplicación en tu perfil de Discord.",
            "Muestra el nombre del nodo activo y contador de tiempo transcurrido.",
            "Se limpia y desactiva limpiamente al cerrar el proyecto o salir de la aplicación.",
          ]
        : [
            "Automatic status publication on project load and editing activity.",
            "Official H.I.S. Future artwork emblem displayed in your Discord profile.",
            "Surfaces active node title and elapsed focus timer.",
            "Cleans up and disconnects gracefully on project close or app exit.",
          ],
    },
    {
      id: "util-icon-picker",
      category: "utilities",
      title: isEs ? "Selector de Iconos y Emojis Vectoriales" : "Vector Icon & Emoji Picker System",
      icon: "🎨",
      summary: isEs
        ? "Personalización visual extrema. Miles de iconos vectoriales Google Material Symbols Rounded, Lucide Icons, Twemoji y Noto Color Emoji con buscador semántico."
        : "Extreme visual customization. Thousands of vector Google Material Symbols Rounded, Lucide Icons, Twemoji, and Noto Color Emoji with semantic search.",
      capabilities: isEs
        ? [
            "Catálogo integrado de iconos Lucide y Google Material Symbols con renderizado nítido a cualquier resolución.",
            "Buscador semántico inteligente: encuentra iconos escribiendo conceptos en español o inglés.",
            "Selector de emojis nativos de alta fidelidad Twemoji y Noto Color Emoji.",
            "Asignación visual por nodo para transformar el árbol lateral en un mapa visual intuitivo.",
          ]
        : [
            "Comprehensive catalog of Lucide and Material Symbols with pixel-sharp vector rendering.",
            "Semantic search engine: queries icons by concept in both Spanish and English.",
            "High-fidelity Twemoji and Noto Color Emoji integration.",
            "Per-node icon assignment turning your project tree into an intuitive visual map.",
          ],
    },
    {
      id: "util-metrics",
      category: "utilities",
      title: isEs ? "Métricas de Escritura en Vivo" : "Live Writing Metrics Bar",
      icon: "📏",
      summary: isEs
        ? "Monitoriza el volumen y ritmo de tu trabajo. Conteo dinámico de palabras, caracteres y tiempo estimado de lectura anclado discretamente en cada página."
        : "Keep track of your writing cadence and volume. Dynamic word, character, and reading time counter docked discreetly on every page.",
      capabilities: isEs
        ? [
            "Conteo total de palabras y caracteres del documento actualizado en cada pulsación.",
            "Cálculo automático de tiempo estimado de lectura en minutos.",
            "Métricas en selección: al seleccionar un fragmento de texto, muestra cuántas palabras y caracteres abarca.",
          ]
        : [
            "Total document word and character counts updated on every keystroke.",
            "Automatic estimated reading time in minutes.",
            "Selection metrics: selecting any passage instantly reveals word and character count of that portion.",
          ],
    },
    {
      id: "util-spelling",
      category: "utilities",
      title: isEs ? "Corrector Ortográfico Multilingüe" : "Multilingual Spell Checker",
      icon: "📖",
      summary: isEs
        ? "Detección inteligente de errores ortográficos con soporte para español e inglés y diccionario personalizable."
        : "Intelligent spelling error detection with support for Spanish and English and custom dictionary management.",
      capabilities: isEs
        ? [
            "Subrayado sutil de palabras dudosas sin interrumpir la escritura.",
            "Clic derecho sobre cualquier palabra marcada para ver sugerencias inmediatas de corrección.",
            "Opción de 'Añadir al diccionario' para recordar términos técnicos, nombres de personajes o neologismos.",
          ]
        : [
            "Subtle underline of questionable words without disrupting typing flow.",
            "Right-click on any highlighted word to view instant replacement suggestions.",
            "'Add to dictionary' option to remember jargon, worldbuilding names, or neologisms.",
          ],
    },
    {
      id: "util-trash",
      category: "utilities",
      title: isEs ? "Papelera Segura con Recuperación" : "Safe Trash & Restoration",
      icon: "🗑️",
      summary: isEs
        ? "Protección integral contra pérdidas accidentales. Todo elemento borrado viaja a la Papelera antes de cualquier eliminación definitiva."
        : "Complete safeguard against accidental deletions. Every deleted item is safely quarantined in the Trash before permanent removal.",
      capabilities: isEs
        ? [
            "Doble vista en papelera: vista de Galería visual o vista de Lista tabular.",
            "Previsualización e inspección completa del contenido de nodos eliminados antes de restaurar.",
            "Restauración con un solo clic a su ubicación original en el árbol del Lore.",
            "Opción de vaciado definitivo o eliminación selectiva.",
          ]
        : [
            "Dual trash layout: visual card Gallery or structured tabular List.",
            "Full read-only inspection of deleted node content before deciding to restore.",
            "One-click restoration returning the node to its original Lore branch.",
            "Selective permanent deletion or full trash empty.",
          ],
    },
    {
      id: "util-dev-console",
      category: "utilities",
      title: isEs ? "Consola Técnica y Auto-reparación de Integridad" : "Technical Diagnostics Console & Self-Healing",
      icon: "🛠️",
      summary: isEs
        ? "Monitor de salud y diagnóstico en tiempo real de HIS. Supervisa transacciones SQLite, eventos de integridad estructural y auto-repara relaciones rotas al vuelo."
        : "Real-time health monitor and diagnostics deck. Supervises SQLite transactions, structural integrity checks, and heals broken node relations on the fly.",
      capabilities: isEs
        ? [
            "Trazado en vivo de eventos de base de datos, persistencia incremental y Discord RPC.",
            "Comprobación automática de integridad (Workspace Integrity Checker) en cada carga y guardado.",
            "Auto-reparación inteligente: purga referencias huérfanas hacia nodos eliminados sin corromper tu información.",
            "Inspección de tiempos de serialización y rendimiento milimétrico.",
          ]
        : [
            "Live streaming of SQLite operations, incremental saves, and Discord RPC activity.",
            "Automated Workspace Integrity Checker executing on project load and save phases.",
            "Intelligent self-healing: automatically reconciles orphaned relation references.",
            "Deep timing inspection measuring serialization and SQLite disk commit milliseconds.",
          ],
    },
    {
      id: "util-local-first",
      category: "utilities",
      title: isEs ? "Bóveda Local-First '.his' y Privacidad Absoluta" : "Local-First '.his' Vault & Total Privacy",
      icon: "🔒",
      summary: isEs
        ? "Tus datos son 100% tuyos. Cada proyecto reside en un archivo contenedor único '.his' empaquetado con SQLite local, sin servidores remotos ni telemetría invasiva."
        : "Your data belongs exclusively to you. Every project lives inside a single verified '.his' container file backed by local SQLite with zero cloud dependencies or telemetry.",
      capabilities: isEs
        ? [
            "Formato contenedor '.his': transporta tu bóveda completa (notas, imágenes, vídeos, PDFs y relaciones) en un solo archivo.",
            "Persistencia desacoplada en caliente (Debounced Persistence): guarda en milisegundos sin congelar la interfaz.",
            "Sustitución atómica protegida contra caídas de tensión o bloqueos de disco de Windows.",
            "Funciona 100% sin conexión a internet.",
          ]
        : [
            "Unified '.his' container: carry your entire vault (notes, images, videos, PDFs, and graph) in one portable file.",
            "Debounced hot persistence: streams saves in milliseconds without ever freezing the UI.",
            "Multi-stage atomic replacement resilient against power loss or Windows antivirus locks.",
            "Operates 100% offline with zero cloud latency.",
          ],
    },
  ], [isEs]);

  const filteredFeatures = useMemo(() => {
    return features.filter((item) => {
      if (activeCategory !== "all" && item.category !== activeCategory) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchSummary = item.summary.toLowerCase().includes(q);
      const matchBadge = item.badge?.toLowerCase().includes(q) ?? false;
      const matchCap = item.capabilities.some((c) => c.toLowerCase().includes(q));
      const matchShortcuts = item.shortcuts?.some((s) => s.toLowerCase().includes(q)) ?? false;
      const matchFusion = item.fusionTip?.toLowerCase().includes(q) ?? false;

      return matchTitle || matchSummary || matchBadge || matchCap || matchShortcuts || matchFusion;
    });
  }, [features, activeCategory, searchQuery]);

  return (
    <section className="project-settings features-panel-root">
      <div className="project-settings__eyebrow">
        {t("features.heading")}
      </div>
      <h1 className="features-panel-title">
        {t("features.title")}
      </h1>
      <p className="features-panel-subtitle">
        {t("features.subtitle")}
      </p>

      {/* Buscador interactivo */}
      <div className="features-search-bar">
        <svg
          className="features-search-icon"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          className="features-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("features.searchPlaceholder")}
          spellCheck={false}
        />
        {searchQuery && (
          <button
            type="button"
            className="features-search-clear"
            onClick={() => setSearchQuery("")}
            title={isEs ? "Limpiar búsqueda" : "Clear search"}
          >
            ✕
          </button>
        )}
      </div>

      {/* Filtros de categoría */}
      <div className="features-category-pills">
        {([
          ["all", isEs ? "🌟 Todo" : "🌟 All"],
          ["nodes", isEs ? "🧩 Nodos (11)" : "🧩 Nodes (11)"],
          ["fusions", isEs ? "⚡ Fusiones Únicas" : "⚡ Fusions"],
          ["editor", isEs ? "✍️ Editor y Atajos" : "✍️ Editor & Shortcuts"],
          ["navigation", isEs ? "🧭 Navegación y Grafo" : "🧭 Navigation & Graph"],
          ["utilities", isEs ? "🛠️ Utilidades y Sistema" : "🛠️ Utilities & System"],
        ] as const).map(([catId, label]) => (
          <button
            key={catId}
            type="button"
            className={`features-category-pill ${activeCategory === catId ? "is-active" : ""}`}
            onClick={() => setActiveCategory(catId)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Contador de resultados */}
      <div className="features-results-meta">
        <span>
          {isEs
            ? `${filteredFeatures.length} ${filteredFeatures.length === 1 ? "función encontrada" : "funciones encontradas"}`
            : `${filteredFeatures.length} ${filteredFeatures.length === 1 ? "feature found" : "features found"}`}
        </span>
      </div>

      {/* Grid de tarjetas de funciones */}
      <div className="features-cards-grid">
        {filteredFeatures.map((item) => {
          const isExpanded = expandedId === item.id;
          return (
            <article
              key={item.id}
              className={`features-card ${isExpanded ? "is-expanded" : ""}`}
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
            >
              <div className="features-card__header">
                <span className="features-card__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <div className="features-card__heading">
                  <div className="features-card__title-row">
                    <h2>{item.title}</h2>
                    {item.badge && (
                      <span className="features-card__badge">{item.badge}</span>
                    )}
                  </div>
                  <p className="features-card__summary">{item.summary}</p>
                </div>
                <button
                  type="button"
                  className="features-card__toggle-btn"
                  aria-label={isExpanded ? "Colapsar" : "Expandir"}
                >
                  <span className={`features-card__arrow ${isExpanded ? "is-open" : ""}`}>
                    ▼
                  </span>
                </button>
              </div>

              {/* Contenido expandible detallado */}
              {isExpanded && (
                <div className="features-card__body" onClick={(e) => e.stopPropagation()}>
                  <div className="features-card__section">
                    <h3>{isEs ? "Capacidades Clave:" : "Key Capabilities:"}</h3>
                    <ul className="features-card__list">
                      {item.capabilities.map((cap, i) => (
                        <li key={i}>{cap}</li>
                      ))}
                    </ul>
                  </div>

                  {item.shortcuts && item.shortcuts.length > 0 && (
                    <div className="features-card__section">
                      <h3>{isEs ? "Atajos Rápidos:" : "Quick Shortcuts:"}</h3>
                      <div className="features-card__shortcuts-row">
                        {item.shortcuts.map((sc, i) => (
                          <kbd key={i} className="features-kbd">
                            {sc}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.howToUse && item.howToUse.length > 0 && (
                    <div className="features-card__section">
                      <h3>{isEs ? "Cómo Utilizarlo:" : "How to Use:"}</h3>
                      <ol className="features-card__ordered-list">
                        {item.howToUse.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {item.fusionTip && (
                    <div className="features-card__fusion-box">
                      <span className="features-card__fusion-icon">⚡</span>
                      <div className="features-card__fusion-content">
                        <strong>{isEs ? "Sinergia / Fusión Única:" : "Unique Fusion / Synergy:"}</strong>
                        <p>{item.fusionTip}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {filteredFeatures.length === 0 && (
        <div className="features-empty-state">
          <p>
            {isEs
              ? "No se encontraron funciones o atajos que coincidan con tu búsqueda."
              : "No features or shortcuts matched your search query."}
          </p>
          <button
            type="button"
            className="features-empty-reset"
            onClick={() => {
              setSearchQuery("");
              setActiveCategory("all");
            }}
          >
            {isEs ? "Restablecer filtros" : "Reset filters"}
          </button>
        </div>
      )}
    </section>
  );
}
