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
    // NODOS
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
        ? "Fusión con Páginas: puedes mencionar (@) un nodo de vídeo en una página de estudio para tener tus notas en una pestaña y el reproductor en panel dividido lado a lado."
        : "Fusion with Pages: mention (@) a video node in your study page to keep comprehensive notes on one tab and the video player in a split pane side by side.",
    },
    {
      id: "node-image",
      category: "nodes",
      title: isEs ? "Imagen y Galería Visual" : "Image & Visual Gallery",
      badge: "image",
      icon: "🖼️",
      summary: isEs
        ? "Gestor integral de recursos gráficos, ilustraciones, capturas de pantalla y diagramas con metadatos técnicos y visualización adaptable."
        : "Comprehensive manager for graphic assets, illustrations, screenshots, and diagrams with technical metadata and adaptive presentation.",
      capabilities: isEs
        ? [
            "Soporte de formatos PNG, JPEG, GIF, WebP y SVG con preservación de fidelidad.",
            "Inspección de resolución nativa, relación de aspecto, peso de archivo y fecha de captura.",
            "Modo Lightbox a pantalla completa con navegación y zoom.",
            "Doble comportamiento al incrustar en documentos: mención inline en chip o imagen completa redimensionable.",
            "Selector de avatar o icono personalizado a partir de imágenes del proyecto.",
          ]
        : [
            "Full support for PNG, JPEG, GIF, WebP, and SVG with pixel-perfect preservation.",
            "Inspection of native resolution, aspect ratio, storage size, and capture date.",
            "Fullscreen lightbox mode with zoom and navigation controls.",
            "Dual document embed mode: compact inline mention chip or full resizable block.",
            "Set as vault avatar or node visual representation across the workspace.",
          ],
      howToUse: isEs
        ? [
            "Arrastra y suelta imágenes directamente dentro del editor o del panel lateral.",
            "Al hacer clic en una imagen incrustada en una página, se abrirá la vista previa emergente para examinarla en detalle.",
            "Arrastra los tiradores en los bordes de la imagen para ajustar su ancho al milímetro.",
          ]
        : [
            "Drag and drop image files directly into the editor or sidebar tree.",
            "Click on any embedded image inside a page to open the floating zoom preview.",
            "Drag horizontal edge handles to adjust presentation width effortlessly.",
          ],
      fusionTip: isEs
        ? "Fusión con Bloques Globo: utiliza imágenes como iconos representativos en encabezados o tarjetas visuales temáticas dentro del Lore."
        : "Fusion with Globe Blocks: set images as distinct visual emblems in custom callout blocks or cards across your Lore.",
    },
    {
      id: "node-pdf",
      category: "nodes",
      title: isEs ? "Lector de PDF Integrado" : "Built-in PDF Reader",
      badge: "pdf",
      icon: "📑",
      summary: isEs
        ? "Visor de documentos PDF nativo de alto rendimiento integrado directamente en el espacio de trabajo sin depender de navegadores externos."
        : "High-performance native PDF document reader built right into the workspace without relying on external browser plugins.",
      capabilities: isEs
        ? [
            "Navegación fluida por páginas con controles de página anterior, siguiente y salto numérico directo.",
            "Controles de zoom (acercar, alejar, ajustar al ancho de página y tamaño real).",
            "Indexación local de documentos para acceso instantáneo dentro de la bóveda.",
            "Conservación del progreso de lectura entre sesiones de trabajo.",
          ]
        : [
            "Smooth page navigation with previous, next, and direct numerical page jump controls.",
            "Precise zoom controls (zoom in, zoom out, fit-to-width, and actual size).",
            "Local document indexing for instant zero-latency access within the vault.",
            "Automatic retention of reading state and page position across sessions.",
          ],
      fusionTip: isEs
        ? "Fusión con Vista Dividida (Split View): abre el PDF en el panel izquierdo y una Página de notas en el panel derecho para extraer citas y diagramas sin alternar entre aplicaciones."
        : "Fusion with Split View: open the PDF in the left pane and a study Page in the right pane to take notes and extract citations without switching apps.",
    },
    {
      id: "node-calendar",
      category: "nodes",
      title: isEs ? "Calendario y Cronología" : "Calendar & Chronology",
      badge: "calendar",
      icon: "📅",
      summary: isEs
        ? "Planificador temporal interactivo para gestionar eventos, fechas clave, plazos de entrega y vincular hitos cronológicos con documentos del Lore."
        : "Interactive timeline planner to manage events, milestone dates, deadlines, and link chronological records to Lore documents.",
      capabilities: isEs
        ? [
            "Vista de cuadrícula mensual interactiva con navegación rápida por meses y años.",
            "Asignación de fechas, horas y duraciones a eventos vinculados a nodos.",
            "Comandos de barra inclinada (/evento) para crear o sincronizar fechas desde el editor.",
            "Visualización de días con carga de trabajo y plazos inminentes.",
          ]
        : [
            "Interactive monthly calendar grid with month and year jumping.",
            "Assign dates, times, and durations to events linked directly to project nodes.",
            "Slash commands (/evento) to trigger date stamps and scheduled milestones from text.",
            "Clear visual workload indicators and upcoming deadline markers.",
          ],
      fusionTip: isEs
        ? "Fusión con Tareas: los nodos de tipo Tarea con fecha límite asignada se reflejan visualmente en el calendario para una vista unificada de prioridades."
        : "Fusion with Tasks: Task nodes with deadlines automatically reflect onto the calendar grid for a unified view of your delivery commitments.",
    },
    {
      id: "node-tempo",
      category: "nodes",
      title: isEs ? "Tempo (Hábitos y Consistencia)" : "Tempo (Habits & Consistency)",
      badge: "tempo",
      icon: "⏱️",
      summary: isEs
        ? "Módulo de gestión de hábitos, rutinas recurrentes y métricas de consistencia personal para monitorizar la ejecución continua de proyectos."
        : "Habit and recurring routine management module with consistency tracking to ensure continuous project momentum.",
      capabilities: isEs
        ? [
            "Registro de frecuencias de ejecución diarias, semanales o personalizadas.",
            "Métricas visuales de rachas continuas y porcentaje de cumplimiento.",
            "Historial cronológico de actividad con vista de calor.",
            "Diseñado para mantener la disciplina en redacción, investigación o aprendizaje.",
          ]
        : [
            "Daily, weekly, or custom cadence routine logging.",
            "Visual streaks counter and percentage-based consistency graphs.",
            "Heatmap-style chronological activity log.",
            "Designed to sustain momentum in creative writing, research, or skill acquisition.",
          ],
      fusionTip: isEs
        ? "Fusión con Cursos: monitoriza tu ritmo de avance diario en un curso o proyecto de investigación para evitar estancamientos."
        : "Fusion with Courses: track daily study cadence across course modules or research vaults to maintain steady progression.",
    },
    {
      id: "node-task",
      category: "nodes",
      title: isEs ? "Tarea y Elemento de Acción" : "Task & Action Item",
      badge: "task",
      icon: "✅",
      summary: isEs
        ? "Nodo atómico de tarea para registrar acciones pendientes, asignaciones, estados de avance y fechas objetivo dentro de cualquier flujo de trabajo."
        : "Atomic task node designed to capture actionable todos, assignments, progression states, and target deadlines across any workflow.",
      capabilities: isEs
        ? [
            "Estados de ciclo de vida: pendiente, en progreso, completado y descartado.",
            "Campos de fecha de vencimiento y prioridad visual.",
            "Integrable mediante menciones dentro de actas de reunión o bitácoras de proyecto.",
          ]
        : [
            "Lifecycle states: pending, in-progress, completed, and archived.",
            "Due date scheduling and visual priority tags.",
            "Seamlessly embeddable via mentions inside meeting notes or sprint logs.",
          ],
      fusionTip: isEs
        ? "Fusión con Páginas: usa listas to-do interactivas ([] ) en tu página de trabajo para desglosar la tarea en subtareas accionables al instante."
        : "Fusion with Pages: use interactive markdown checklists ([] ) inside your parent page to break down the task into immediate micro-steps.",
    },
    {
      id: "node-course",
      category: "nodes",
      title: isEs ? "Curso y Estructura Educativa" : "Course & Learning Path",
      badge: "course",
      icon: "🎓",
      summary: isEs
        ? "Estructura pedagógica modular diseñada para articular itinerarios de aprendizaje, lecciones progresivas, materiales didácticos y seguimiento curricular."
        : "Modular pedagogical structure designed to articulate learning paths, progressive lessons, didactic materials, and curricular tracking.",
      capabilities: isEs
        ? [
            "Organización jerárquica por módulos temáticos y lecciones individuales.",
            "Seguimiento visual de porcentaje de lecciones completadas.",
            "Asociación de lecturas PDF, vídeos de clase y apuntes en un único espacio unificado.",
          ]
        : [
            "Hierarchical taxonomy organized into thematic units and individual lessons.",
            "Visual completion percentage and syllabus progress meters.",
            "Consolidation of PDF readings, video lectures, and rich notes into one unified hub.",
          ],
      fusionTip: isEs
        ? "Fusión con Vídeos y PDFs: agrupa un nodo de vídeo y un nodo de PDF bajo una lección del curso para tener teoría y práctica sincronizadas."
        : "Fusion with Videos & PDFs: group video and PDF nodes under a course lesson to keep theory and exercise materials synchronized.",
    },
    {
      id: "node-category",
      category: "nodes",
      title: isEs ? "Categoría y Agrupador" : "Category & Classifier",
      badge: "category",
      icon: "📁",
      summary: isEs
        ? "Contenedor organizacional puro en el Lore que sirve para categorizar grandes áreas de conocimiento, clasificar universos ficcionales o dividir proyectos."
        : "Pure organizational container in the Lore used to classify large knowledge domains, fictional universe facets, or project workstreams.",
      capabilities: isEs
        ? [
            "Agrupación jerárquica limpia sin sobrecargar el espacio de trabajo con contenido vacío.",
            "Filtrable al instante en la pestaña 'Tipos' de la barra lateral.",
            "Reorganizable libremente mediante arrastre en el árbol.",
          ]
        : [
            "Clean hierarchical grouping without bloating documents with unnecessary markup.",
            "Instant categorization and filtering via the sidebar 'Types' view.",
            "Fully draggable and reorderable in the project tree.",
          ],
      fusionTip: isEs
        ? "Fusión con Árbol del Lore: utiliza Categorías para estructurar tus carpetas raíz (ej. 'Personajes', 'Capítulos', 'Referencias') y anida Páginas dentro."
        : "Fusion with Lore Tree: use Categories for your top-level structure (e.g. 'Characters', 'Chapters', 'Research') and nest Pages beneath them.",
    },
    {
      id: "node-project",
      category: "nodes",
      title: isEs ? "Proyecto (Bóveda Raíz)" : "Project (Root Vault)",
      badge: "project",
      icon: "🏛️",
      summary: isEs
        ? "La identidad central de la bóveda de conocimiento. Gestiona el nombre del proyecto, avatar o icono distintivo, tipo de nodo por defecto y configuración horaria."
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
      fusionTip: isEs
        ? "Fusión con Configuración: desde el panel de Configuración General puedes ajustar el avatar del proyecto y cambiar la identidad visual de toda la aplicación."
        : "Fusion with Settings: customize the project avatar and visual identity directly from General Settings to personalize the app environment.",
    },

    // ----------------------------------------------------
    // FUSIONES Y SINERGIAS
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
      title: isEs ? "Fusión: Grafo Conceptual 2D con Motor Pixi" : "Fusion: 2D Concept Graph with Pixi Engine",
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

    // ----------------------------------------------------
    // EDITOR Y ATAJOS
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
            "Pulsar Enter dentro del bloque inserta saltos de línea (\n) con total naturalidad sin romper el bloque.",
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

    // ----------------------------------------------------
    // NAVEGACIÓN Y GRAFO
    // ----------------------------------------------------
    {
      id: "nav-quick-switcher",
      category: "navigation",
      title: isEs ? "Quick Switcher / Command Palette (Ctrl+K)" : "Quick Switcher / Command Palette (Ctrl+K)",
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
      title: isEs ? "Árbol del Lore y Organización Jerárquica" : "Lore Tree & Hierarchical Organization",
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
            "Tres pestañas en la barra lateral: 'Lore' (árbol), 'Recientes' (historial) y 'Tipos' (filtro por tipo).",
          ]
        : [
            "Infinite hierarchical nesting: embed pages inside pages or under categories.",
            "Intuitive drag-and-drop to reorder sibling positions or re-parent nodes.",
            "Multi-selection support for batch moves and cleanup operations.",
            "Right-click context menu: rename, duplicate, open in tab, export, or send to trash.",
            "Three dedicated sidebar tabs: 'Lore' (tree), 'Recent' (history), and 'Types' (by category).",
          ],
    },

    // ----------------------------------------------------
    // UTILIDADES Y SISTEMA
    // ----------------------------------------------------
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
            "Conteo total de palabras y caracteres del documento.",
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
      id: "util-export",
      category: "utilities",
      title: isEs ? "Exportación e Impresión Limpia" : "Clean Print & Document Export",
      icon: "🖨️",
      summary: isEs
        ? "Genera salidas listas para compartir o archivar en papel o PDF sin marcas de interfaz ni botones de edición."
        : "Generate clean outputs ready for sharing, printing, or PDF archiving without interface chrome or editor controls.",
      capabilities: isEs
        ? [
            "Diseño tipográfico limpio adaptado para hojas de papel A4 o Carta.",
            "Ocultamiento automático de tiradores de bloque, menús de interfaz y barras flotantes.",
            "Compatible con la función 'Guardar como PDF' de cualquier sistema operativo.",
          ]
        : [
            "Clean typographic stylesheet tailored for standard A4 and Letter paper prints.",
            "Automatic stripping of block drag handles, transient selection UI, and buttons.",
            "Compatible with native operating system 'Save to PDF' printer drivers.",
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
