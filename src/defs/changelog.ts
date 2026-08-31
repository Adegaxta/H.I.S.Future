export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  category: "Editor" | "Imágenes" | "Persistencia" | "Sistema" | "Fix";
  changes: string[];
}

export const CURRENT_VERSION = "0.2.24";

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
  version: "0.2.24",
  date: "2026-08-31",
  title: "UNDO/REDO POR PÁGINA",
  category: "Fix",
  changes: [
    "Se corrigió un bug donde el historial de undo/redo de una Página podía mantenerse al cambiar a otro Nodo - Página.",
    "Ahora el historial de cambios de portada e icono se reinicia correctamente al cambiar de página, evitando que Ctrl+Z o Ctrl+Y afecten accidentalmente al Nodo - Página equivocado.",
    "Se reforzó el aislamiento del historial de edición para que cada Nodo - Página mantenga únicamente sus propios cambios recientes.",
    "Se validó la corrección con una compilación limpia mediante npm run build.",
  ],
},
  {
    version: "0.2.23",
    date: "2026-08-31",
    title: "CABECERA Y BLOQUES MODULARES",
    category: "Editor",
    changes: [
      "Se separaron los ajustes de la cabecera y los bloques de texto de los Nodos - Página: cada uno conserva su propia posición.",
      "Se agregó Posición de Bloques de Texto con opciones izquierda, centro y derecha; el valor inicial es centro.",
      "El ancho de bloques ahora afecta solo al contenido del editor y, al reducirse, se centra de forma predeterminada sin modificar la cabecera.",
      "Se corrigió la persistencia de los ajustes de página para que las reparaciones internas del editor no reviertan cambios recientes de ancho o posición.",
      "Los menús de configuración se cierran al hacer click fuera o pulsar Escape, y sus submenús se mantienen dentro de la ventana.",
    ],
  },
  {
    version: "0.2.22",
    date: "2026-08-31",
    title: "PORTADA UPDATE",
    category: "Editor",
    changes: [
      "Se agregó el sistema modular de portada e icono para los Nodos - Página, usando referencias a Nodos - Imagen del proyecto.",
      "Ahora es posible elegir una imagen existente desde una galería o cargar una imagen externa, que se convierte automáticamente en un Nodo - Imagen.",
      "La portada ocupa una franja horizontal amplia sin deformar la imagen, mientras el icono aparece a la izquierda del título en un tamaño mayor.",
      "Se añadió la descripción persistente de la página con el placeholder 'Añadir descripción...' y el control para ocultarla o mostrarla.",
      "Se ajustó la posición de Nodo - Página y sus botones para alinearlos con el título, y se evitó mostrar el placeholder de comandos al hacer click directamente en divisores.",
    ],
  },
  {
    version: "0.2.21",
    date: "2026-08-31",
    title: "ETIQUETAS MODULARES DE NODOS",
    category: "Sistema",
    changes: [
      "Se unificó la forma de mostrar la información de los nodos con el formato modular 'Nodo - Subtipo'.",
      "Ahora los tipos Página, Imagen, Categoría y Página-Carpeta se muestran de forma consistente en el árbol, paneles, papelera y encabezados del espacio de trabajo.",
      "Se centralizó la generación de estas etiquetas para que los nuevos tipos de nodo adopten automáticamente el mismo formato.",
    ],
  },
  {
  version: "0.2.20",
  date: "2026-08-30",
  title: "EDITOR FIX",
  category: "Fix",
  changes: [
    "Se corrigió un problema que hacía que el cursor saltara fuera de los globos al crear nuevas líneas mediante Enter.",
    "Se mejoró la detección del contenido raíz del editor para reconocer correctamente globos y divisores como bloques válidos.",
    "Se evitó la creación innecesaria de párrafos fantasma que podían robar el foco y dejar líneas inutilizables."
  ],
},
  {
  version: "0.2.19",
  date: "2026-08-30",
  title: "TEXT & INDEX FIXES",
  category: "Fix",
  changes: [
    "Se corrigió el formato de texto en negrita para que conserve su color base en lugar de cambiar a blanco.",
    "Se cambió el color base del texto del editor de gris a blanco.",
    "Se corrigió el índice para permitir hacer clic correctamente en sus entradas.",
    "Se mejoró el funcionamiento del índice para evitar errores durante la navegación."
  ],
},
  {
  version: "0.2.18",
  date: "2026-08-30",
  title: "THE GITHUB UPDATE",
  category: "Sistema",
  changes: [
    "Se inicializó un repositorio Git para H.I.S. Future, permitiendo llevar un historial real de cambios del proyecto.",
    "Se creó el primer commit oficial del proyecto con el estado actual de H.I.S. Future.",
    "Se configuró la rama principal como main y se vinculó el proyecto con su repositorio remoto en GitHub.",
    "El repositorio quedó preparado para registrar futuros cambios mediante commits sin depender únicamente del changelog interno de la aplicación.",
  ],
},
  {
    version: CURRENT_VERSION,
    date: "2026-08-30",
    title: "Duplicación por Alt+arrastre: bloques, divisores y globos",
    category: "Editor",
    changes: [
      "Se agregó la duplicación de bloques de texto al mantener Alt mientras se arrastra desde el botón del bloque o el handle de arrastre.",
      "Ahora también funciona si el usuario pulsa Alt durante el arrastre mismo; la duplicación se activa en mitad del movimiento sin necesidad de mantenerlo desde el inicio.",
      "Los divisores y los globos también se duplican con la misma lógica, manteniendo el comportamiento de bloques añadidos dentro del flujo del editor.",
      "El bloque original queda intacto al duplicarse, y la copia se inserta en el destino del arrastre sin romper la estructura ni el scroll del documento.",
      "La lógica de mover bloques sigue intacta cuando no se usa Alt, preservando el comportamiento normal del editor y la multi-selección.",
    ],
  },
  {
    version: "0.2.16",
    date: "2026-08-30",
    title: "Índice sin caret ni foco editable",
    category: "Editor",
    changes: [
      "Se corrigió el bug donde al hacer click en un ítem del índice aparecía el caret o se quedaba el foco en un bloque que no debe ser editable.",
      "El índice quedó totalmente aislado del flujo de texto del editor: no se puede seleccionar texto ni dejar el cursor dentro de ese bloque automático.",
      "La navegación mediante click vuelve a mover la vista hacia el título correcto, sin convertir la interacción en edición del documento.",
      "La experiencia del índice quedó consistente con su propósito real: un bloque de navegación rápida y automática, no un área de texto del documento.",
    ],
  },
  {
    version: "0.2.15",
    date: "2026-08-30",
    title: "Índice navegable: click real y scroll hacia el título",
    category: "Editor",
    changes: [
      "Se corrigió la navegación del índice: al hacer click sobre un título del índice ya no se bloquea la acción y el editor deja de tratar ese bloque como parte del texto editable.",
      "El cursor y la selección de texto no se disparan al pulsar una entrada del índice, evitando que el navegador se quede sin mover la vista hacia la sección correspondiente.",
      "La vista vuelve a desplazarse hacia el título correcto con la misma lógica de navegación del índice, manteniendo el comportamiento automático y sin interferir con la edición normal del documento.",
      "La experiencia del bloque de índice quedó consistente con su propósito real: navegación rápida entre secciones del nodo página, no edición del contenido.",
    ],
  },
  {
    version: "0.2.14",
    date: "2026-08-30",
    title: "Índice automático: sin edición accidental ni texto editable",
    category: "Editor",
    changes: [
      "Se corrigió el bug donde el índice del nodo página entraba en modo de edición al hacer click, dejando que el usuario escribiera dentro del bloque automático.",
      "El bloque del índice quedó definido como no editable y fuera del flujo de texto del editor, para que solo funcione como navegación rápida entre secciones.",
      "Se eliminó la selección de texto artificial al hacer click en una entrada del índice, evitando que el navegador active el caret en un bloque que no debe ser editable.",
      "La navegación del índice sigue funcionando como acción de movimiento por la página, sin interferir con la edición normal del contenido del editor.",
    ],
  },
  {
    version: "0.2.13",
    date: "2026-08-30",
    title: "Fix de selección múltiple por Ctrl/Cmd+click",
    category: "Editor",
    changes: [
      "Se corrigió el parpadeo visual de la selección múltiple al hacer Ctrl/Cmd+click sobre un bloque de texto: ya no se selecciona por un segundo y luego desaparece.",
      "La lógica de selección quedó centralizada en el flujo de pointerdown para evitar que el click vuelva a disparar una segunda selección de forma conflictiva.",
      "Si el bloque ya estaba seleccionado, ahora se deselecciona solo ese bloque y se conservan los demás de la selección múltiple sin colapsar el grupo.",
      "La selección normal del editor sigue funcionando de forma limpia y sin interferencias con el modo multi-select del bloque de texto.",
    ],
  },
  {
    version: "0.2.12",
    date: "2026-08-29",
    title: "Fix de cierre: scroll global y popovers del bloque de texto",
    category: "Sistema",
    changes: [
      "Se corrigió el bloqueo global del scroll cuando una ventana emergente del bloque de texto se cerraba: ahora el documento vuelve a desplazarse normalmente sin quedar trabado.",
      "La popover del bloque y la paleta de color pueden seguir haciendo scroll interno dentro de sí mismas, sin bloquear la vista general del editor ni la página.",
      "Se reforzó la limpieza del estado del picker al cerrar las opciones del bloque, evitando que un menú cerrado siga activo en memoria y mantenga el bloqueo residual.",
      "La experiencia del editor quedó más estable al combinar selección del bloque, apertura de menús y cierre de popovers en secuencia rápida.",
    ],
  },
  {
    version: "0.2.11",
    date: "2026-08-29",
    title: "Mega Update: editor modular, nodos dev y menús acotados",
    category: "Sistema",
    changes: [
      "Se consolidó la arquitectura del editor por nodos dev reutilizables, dejando el bloque de texto, sus paneles y sus acciones bajo una estructura declarativa y fácil de mantener.",
      "El botón del bloque de texto quedó definido como nodo raíz y sus ventanas emergentes como nodos hijos, con cierre conjunto, restricción de viewport y limpieza automática si el nodo raíz desaparece.",
      "Se normalizó la lógica de selección del bloque para que al hacer click sobre el bloque correcto se active el estado real de edición y no se generen estados visuales inconsistentes.",
      "La paleta de color del bloque se integró dentro del árbol de nodos con posición acotada, hover consistente y comportamiento más predecible al abrir y cerrar menús emergentes.",
      "Se reforzó el bloqueo de scroll mientras los menús activos están abiertos y se evitó el desplazamiento accidental del documento durante la edición y el uso de opciones del bloque.",
      "La estructura queda preparada para crecer sin duplicar lógica: futuros bugs y features se pueden resolver en definiciones y registries en vez de pegar lógicas ad hoc dentro del editor.",
    ],
  },
  {
    version: "0.2.10",
    date: "2026-08-29",
    title: "Dev Nodes: bloque de texto modular y acotado",
    category: "Sistema",
    changes: [
      "Se formalizó el bloque de texto como un árbol de nodos dev: el botón del bloque es el nodo raíz y sus ventanas emergentes pasan a ser nodos hijos con cierre conjunto.",
      "La ventana del bloque ya no puede escaparse del marco de la app: todas sus posiciones se aclampan dentro de la viewport para mantener la experiencia estable.",
      "Si desaparece el nodo raíz del bloque, desaparecen sus hijos asociados automáticamente, evitando ventanas huérfanas y estados de UI colgantes.",
      "La opción de color quedó modularizada como hijo del nodo del bloque, con su propio estado de posición y un cierre limpio y consistente con el resto del editor.",
      "Se reforzó el bloqueo de scroll del editor mientras los nodos dev de menús activos están abiertos, para que la experiencia siga sin permitir desplazamiento accidental.",
    ],
  },
  {
    version: "0.2.9",
    date: "2026-08-29",
    title: "Rainbow Update",
    category: "Editor",
    changes: [
      "Se pulieron las opciones del bloque de texto con resaltado hover consistente con la paleta de colores y mejor respuesta visual al pasar el cursor.",
      "Se corrigió el scroll global mientras los menús del editor están abiertos: ahora el documento queda bloqueado de verdad y no se puede seguir desplazando por la página.",
      "Se reforzó la experiencia del menú de acciones del bloque para que no se sienta 'rígido', manteniendo el foco visual claro en la opción activa.",
      "Se dejó el comportamiento más estable para el editor cuando se combinan menús emergentes, selección de bloque y acciones rápidas dentro del contenido.",
    ],
  },
  {
    version: "0.2.8",
    date: "2026-08-29",
    title: "Globo + índice: sin pérdida de texto ni bloque extra",
    category: "Editor",
    changes: [
      "Se corrigió el bug donde el comando /indice dentro de un globo eliminaba el primer bloque de texto y lo sustituía por el índice.",
      "El índice ahora se inserta dentro del mismo contenido del globo sin destruir el texto previo ni generar un bloque extra inferior.",
      "Se reforzó la lógica de inserción para que el contenido del globo siga siendo un flujo de texto limpio y estable durante la edición.",
      "La edición de bloques internos del globo vuelve a ser más segura, evitando saltos de cursor y contaminaciones de formato entre líneas.",
    ],
  },
  {
    version: "0.2.7",
    date: "2026-08-29",
    title: "Índice in place: bloque real, sin rastro",
    category: "Editor",
    changes: [
      "Se cambió la generación del comando /indice para que reemplace el bloque actual donde estás escribiendo, sin dejar un bloque de texto extra debajo.",
      "El índice ahora se genera exactamente en el punto de inserción, lo que hace que la experiencia de edición se sienta más natural y menos fragmentada.",
      "Se corrigió el flujo dentro de globos para que el índice quede dentro del contenido del globo y no fuera del contenedor ni contamine el texto siguiente.",
      "La navegación del índice desde cada entrada ahora mueve la vista hacia el título real con scroll más cómodo y resaltado temporal para identificar la sección abierta.",
    ],
  },
  {
    version: "0.2.6",
    date: "2026-08-29",
    title: "Globo Index: bloque autónomo y sin contaminación de estilo",
    category: "Editor",
    changes: [
      "Se corrigió la inserción del comando /indice cuando se ejecuta dentro de un globo: ahora el índice se genera dentro del contenido del globo y no fuera del contenedor.",
      "El bloque del índice queda aislado como una sección autónoma, evitando que el resto del texto del globo herede negritas, subrayados o formato previo.",
      "El cursor vuelve a un párrafo limpio tras el índice, dejando el flujo de edición más natural y parecido a un editor de texto convencional.",
      "La experiencia de escritura se volvió más estable para bloques complejos, especialmente cuando se combinan globos, índices y contenido textual continuo.",
    ],
  },
  {
    version: "0.2.5",
    date: "2026-08-29",
    title: "Mini update: portada manual y pulido visual del nodo imagen",
    category: "Imágenes",
    changes: [
      "Se agregó el botón 'Usar como portada' dentro del panel del nodo imagen, con una acción explícita y clara para el usuario.",
      "La portada del proyecto ya no cambia por accidente al crear o pegar una imagen; solo se actualiza cuando el usuario decide usarla como portada.",
      "Se mejoró la presentación visual de las acciones del nodo imagen con hover, separación y un estilo más limpio y consistente con la interfaz.",
      "Se dejó la experiencia más previsibles para el editor, sin que la vista salte al nodo al crear una imagen nueva desde pegado o arrastre.",
    ],
  },
  {
    version: "0.2.4",
    date: "2026-08-29",
    title: "Imágenes grandes, pegado seguro y compresión automática",
    category: "Imágenes",
    changes: [
      "Se agregó compresión automática para imagenes cargadas y pegadas antes de persistirlas, evitando tamaños excesivos en localStorage y en el HTML del nodo.",
      "El pegado de imagenes dentro del editor ya crea un nodo imagen real y lo inserta como mención completa sin saltar la vista ni sustituir el foco del documento.",
      "Se evitó que cada imagen nueva se convierta en portada del proyecto; la portada sólo actualiza cuando el usuario carga explícitamente la imagen del proyecto.",
      "Se reforzó la deduplicación por hash y nombre para impedir que se creen nodos duplicados al volver a pegar o arrastrar la misma imagen.",
      "Se mantuvo la protección contra quota para la papelera y la portada, incluso con imágenes 4K o pruebas de estrés del proyecto.",
    ],
  },
  {
    version: "0.2.3",
    date: "2026-08-29",
    title: "Protección contra quota y imágenes grandes",
    category: "Persistencia",
    changes: [
      "Se corrigió el crash por QuotaExceededError al guardar la portada del proyecto y la papelera cuando la imagen es muy grande o se repite en varias sesiones.",
      "La app ahora valida el tamaño previo a guardar en localStorage y descarta entradas excesivas sin romper la interfaz ni bloquear el flujo del usuario.",
      "Se reforzó la persistencia de la papelera para ignorar nodos con contenido enorme en lugar de fallar al guardar toda la lista.",
      "Se redujo la posibilidad de duplicar nodos de imagen al arrastrar archivos con varios handlers activos en el árbol y el viewport global.",
      "Se dejó un comportamiento más estable para pruebas de estrés con imágenes 4K y proyectos con contenido pesado.",
    ],
  },
  {
    version: "0.2.2",
    date: "2026-08-29",
    title: "El guardado por fin guarda (en serio)",
    category: "Persistencia",
    changes: [
      "Reescrito el sistema de persistencia: escribir ya no reconstruye el árbol completo de nodos en cada tecla, así que se acabó el lag al tipear rápido.",
      "El autosave ahora tiene un límite máximo de espera: aunque nunca pares de escribir, el proyecto se guarda solito cada pocos segundos igual.",
      "Corregido un bug donde salir del proyecto justo después de escribir podía perder el último cambio por una carrera entre el guardado y el cierre.",
      "Arreglado un error de FOREIGN KEY que impedía guardar cuando un nodo quedaba ordenado antes que su propio padre en el árbol — ahora el orden se corrige solo antes de cada guardado.",
      "Los nodos con un padre fantasma (referencia rota) se autoreparan solos al guardar, en vez de bloquear el guardado de todo el proyecto.",
      "Divisores, globos, menciones e imágenes ahora persisten de forma confiable entre sesiones.",
      "Corregido un bug fantasma en Ajustes: la página que tenías abierta antes se seguía renderizando debajo del panel de Ajustes (General, Papelera o Changelog), apareciendo 'de la nada' al hacer scroll.",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-08-29",
    title: "Salida del proyecto sin bloqueo",
    category: "Sistema",
    changes: [
      "Corregido el cierre del proyecto para que no quede bloqueado si la última instantánea del editor falla al guardar.",
      "La salida del proyecto continúa aunque el guardado falle, evitando que el usuario quede atrapado en la sesión activa.",
      "Mejorada la gestión del cierre de ventana para manejar errores sin impedir la salida del proyecto.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-08-29",
    title: "THE MODULAR UPDATE",
    category: "Sistema",
    changes: [
      "Sistema de Defs centralizado: tipos de nodo, comandos del editor y colores ahora viven en una sola carpeta (defs/).",
      "Jerarquía de tipos de nodo explícita: página-carpeta ahora declara de qué tipo hereda y qué cambia, en vez de copiarse a mano.",
      "Paleta de colores unificada: un solo lugar define los colores de la app, eliminando valores duplicados.",
      "Registro de comandos slash (/) formalizado con el mismo patrón que los tipos de nodo.",
      "Eliminados datos duplicados entre el almacenamiento y las definiciones de tipos de nodo.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-08-28",
    title: "Sistema de recursos de imagen",
    category: "Imágenes",
    changes: [
      "Identidad estable para nodos de imagen y deduplicación por hash.",
      "Descripción editable, reemplazo, copia y descarga de imágenes.",
      "Arrastre de imágenes externas dentro de la jerarquía del proyecto.",
      "Miniaturas sincronizadas en menciones y portada del proyecto.",
    ],
  },
];