# H.I.S. Future — Workspace Tabs + Split Panes V1

Fecha: 2026-09-29

## Resultado

La zona principal de H.I.S. ahora usa un workspace modular con tabs integradas en la barra superior existente, panes recursivos, drag & drop por zonas, resize persistente y restauración por baúl. No se añadió una segunda barra global ni se reescribieron Node, GemitaV o Graph.

## Auditoría previa

### Cómo se decidía la vista activa

`AppWorkspace.tsx` mantenía dos estados independientes:

- `view`: `list | graph | ai` decidía el contenido principal.
- `sidebarPanel`: `lore | recent | types` decidía el panel lateral.

El render principal hacía un condicional directo dentro del componente para montar `AIWorkspace`, `GraphView` o `RegisteredNodeView`. La localización se persistía en `localStorage` con una clave por ruta de proyecto.

### Por qué IA y LORE quedaban activos a la vez

La condición visual de LORE/Recent/Types era `sidebarPanel === id && view !== "graph"`. IA no era Grafo, por lo que al seleccionar IA el botón de IA recibía estado activo y LORE también conservaba el suyo. Eran dos fuentes visuales de verdad no excluyentes.

La corrección deriva ahora el estado primario exclusivamente de la vista de la tab activa del pane enfocado:

- `node` activa exactamente LORE, Recent o Types.
- `ai` activa solamente IA.
- `graph` activa solamente Grafo.
- ajustes no mantiene activa ninguna sección primaria.

### Capa elegida

La mejor capa es entre `AppWorkspace` y los renderers existentes. `AppWorkspace` continúa siendo dueño de los datos del proyecto y construye un `ViewRegistry`; `WorkspaceSurface` solo administra layout, tabs, focus, drag/drop y resize.

Se registraron sin reescritura:

- Node mediante `RegisteredNodeView` y `PageNodeChrome`.
- IA mediante `AIWorkspace`.
- Grafo mediante `GraphView`.

Calendario y tabla continúan funcionando como vistas de nodo registradas por el sistema nodal existente. Connectome no fue implementado; podrá añadirse como otro registro sin cambiar el árbol de panes.

## Arquitectura

### Antes

```text
AppWorkspace
├─ view = list | graph | ai
├─ sidebarPanel = lore | recent | types
└─ condicional directo de cada vista
```

### Después

```text
AppWorkspace
├─ datos canónicos del proyecto
├─ ViewRegistry
│  ├─ node → renderer existente
│  ├─ ai → AIWorkspace existente
│  └─ graph → GraphView existente
└─ WorkspaceLayout por baúl
   └─ Pane | Split(Pane | Split, Pane | Split)
```

## Contratos

```ts
interface WorkspaceTab {
  id: string
  viewType: "node" | "ai" | "graph" | null
  resourceId?: string
  title?: string
  state?: Record<string, unknown>
}

interface WorkspacePane {
  kind: "pane"
  id: string
  tabs: WorkspaceTab[]
  activeTabId: string | null
}

interface WorkspaceSplit {
  kind: "split"
  id: string
  direction: "horizontal" | "vertical"
  ratio: number
  children: [WorkspaceLayoutNode, WorkspaceLayoutNode]
}
```

`ViewRegistry` registra `type`, `title`, icono Lucide existente, renderer, resolución opcional de título, estado inicial opcional y política `keepAlive` opcional.

## Tabs y selector

El botón `+` crea una tab con `viewType: null`, sin recurso, foco ni selección automática. El selector central se genera recorriendo `ViewRegistry`; no contiene lógica fija para cada vista. Un pane sin tabs permanece en el árbol y muestra `Abrir vista`.

Al cerrar una tab se activa la vecina en la posición más próxima. Cerrar la última tab deja el pane vacío y no colapsa el split.

## Drag & drop y splits

Una tab arrastrada calcula cinco zonas geométricas en el pane destino:

- centro: mueve la tab al grupo destino;
- izquierda/derecha: crea un split horizontal;
- arriba/abajo: crea un split vertical.

Cada child puede ser otro split. Un overlay turquesa semitransparente muestra el destino. Mover una tab no se registra como cierre.

## Resize

Cada split tiene divisor propio. El movimiento actualiza una previsualización local fluida; el layout y la traza se actualizan una sola vez al soltar. El ratio se limita a `0.18–0.82` para evitar panes invisibles y se persiste.

## Persistencia y restore

La clave es `hisfuture.workspace.layout.v1.<projectKey>`. Por tanto, cada baúl restaura de forma independiente:

- árbol de panes;
- dirección y ratio de splits;
- tabs y orden;
- `activeTabId` por pane;
- pane enfocado;
- `viewType`, `resourceId` y estado mínimo.

El layout es estado de UI y no se guarda dentro del lore ni de los nodos. Un `resourceId` inexistente produce `Recurso no disponible` sin invalidar el resto del workspace. El lector valida y normaliza el JSON; ante datos inválidos utiliza un layout seguro de un pane.

## Focus y shortcuts

`activeTabId` es la única fuente de verdad dentro de cada pane y `focusedPaneId` determina qué grupo aparece en la barra superior. Las vistas ocultas usan `display: none`, no reciben interacción ni teclas.

Shortcuts V1:

- `Ctrl+T`: tab vacía.
- `Ctrl+W`: cierra la tab activa.
- `Ctrl+Tab` / `Ctrl+Shift+Tab`: recorre tabs del pane enfocado.

Se ignoran si el evento nace en input, textarea, select o contenido editable, evitando interferencia con el editor.

## Performance

En cada pane solo se muestra el renderer de la tab activa. Las tabs normales inactivas se desmontan. GemitaV usa `keepAlive`: queda montada, oculta y no interactiva para no perder input, scroll, conversación o generación al alternar tabs. Su `conversationId` se guarda además en `WorkspaceTab.state` para restaurar la conversación después de reiniciar.

Graph solo se monta cuando su tab está activa. V1 permite abrir el mismo recurso en tabs diferentes, como exige el contrato.

## Trazas verificadas

### 1. Node → nueva tab → IA

```text
[WORKSPACE] tab_created tabId=tab-… viewType=null
selector: Nueva pestaña → IA
resultado: [Nodo][GemitaV]
```

### 2. IA movida a split derecho

```text
[WORKSPACE] tab_moved tabId=tab-… paneId=pane-…
[WORKSPACE] pane_split direction=horizontal ratio=0.5
resultado: Nodo | GemitaV
```

### 3. Split recursivo

```text
[WORKSPACE] tab_moved tabId=tab-… paneId=pane-…
[WORKSPACE] pane_split direction=vertical ratio=0.5
resultado: Nodo | (GemitaV / Nodo)
```

### 4. Cierre de última tab

```text
[WORKSPACE] tab_closed tabId=tab-… paneId=pane-…
resultado: pane conservado, tabs=0, selector Abrir vista
```

### 5. Restore tras restart

```text
[WORKSPACE] workspace_restored panes=4
resultado: misma topología, tabs activas, recursos y ratios
```

### 6. Cambio de baúl

```text
hisfuture.workspace.layout.v1.<baúl-A> → IA
hisfuture.workspace.layout.v1.<baúl-B> → Grafo
resultado: restauración independiente
```

### 7. IA activa sin LORE activo

```text
focusedWorkspaceTab.viewType=ai
IA.is-active=true
LORE.is-active=false
```

## Tests

`tests/workspace-tabs.test.mjs` verifica:

- creación segura con al menos un pane;
- tab nueva vacía y sin recurso preseleccionado;
- IA y Nodo en tabs separadas;
- mover tabs;
- splits right y top, direcciones horizontal/vertical y recursión;
- cierre de última tab sin destruir pane;
- serialización y restore;
- referencia segura a recurso eliminado;
- layouts independientes por baúl;
- fuente única de active primary navigation;
- IA no conserva LORE activa;
- shortcuts ignorados dentro del editor;
- overlay de drop geométrico.

## Limitaciones V1

- El header muestra las tabs del pane enfocado; se cambia de pane haciendo clic en su contenido. Esto conserva una sola barra superior global y evita barras duplicadas dentro de cada pane.
- Calendar y Table siguen siendo recursos nodales, no tipos de vista raíz separados. Pueden promoverse al registro cuando exista una política clara para resolver qué recurso abrir.
- No se incluyeron menús de cerrar otras, duplicar, reabrir ni cerrar pane.
- El estado profundo de cámara de Graph todavía pertenece a Graph; el contrato `tab.state` ya permite migrarlo después.
- Mover una vista `keepAlive` entre panes la remonta porque cambia de rama React; alternarla dentro del mismo pane no la reinicia.
- No se añadió Connectome/Mosca.

## Verificación ejecutada

```text
npx tsc --noEmit
npm run test:workspace
npm run build
```
