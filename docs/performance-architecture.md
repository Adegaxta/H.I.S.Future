# Arquitectura de rendimiento

## Decisión

H.I.S. Future mantiene Tauri + React + Rust + SQLite. Reemplazar esa base por Electron,
gRPC o una pila web alojada añadiría procesos, distribución y migraciones sin resolver
los hot paths observados. La estrategia adoptada es híbrida:

- Anytype: documentos por bloques con identidad estable, mutaciones granulares y trabajo
  pesado del grafo fuera del hilo de interfaz.
- Obsidian: shell pequeño, vistas diferidas, lectura desde caché e I/O atómico.
- Notion: bloques jerárquicos e independientemente direccionables y actualización visual
  optimista. La implementación interna de Notion no es pública; aquí solo se toma como
  referencia su modelo público de bloques.
- H.I.S. Future: proceso nativo ligero, SQLite WAL como estado durable, resources fuera
  del contenido y Projection Nodal compartida.

Fuentes primarias: [arquitectura de Anytype](https://github.com/anyproto/anytype-ts/blob/develop/CLAUDE.md),
[stores de Anytype](https://github.com/anyproto/anytype-ts/blob/develop/docs/src/ts/store/README.md),
[modelo Block de Notion](https://developers.notion.com/reference/block),
[Vault de Obsidian](https://docs.obsidian.md/Plugins/Vault),
[checklist de rendimiento de Obsidian](https://docs.obsidian.md/oo/plugin) y
[WAL de SQLite](https://sqlite.org/wal.html).

## Fronteras de frecuencia

| Frecuencia | Trabajo permitido |
| --- | --- |
| cada frame | transformación visual; sin React state, serialización ni SQLite |
| cada input | estado local optimista y DOM del bloque activo |
| pausa corta | reconciliación del bloque modificado y actualización de índices |
| blur, Ctrl+S, Close | flush durable y checkpoint |
| abrir una vista pesada | import dinámico, proyección e inicialización de renderer |
| inicio frío | shell, sesión y resumen mínimo; no editor, grafo ni estilos del workspace |

## Migración por capas

1. **Shell y presupuestos.** Separar Home del workspace, editor y graph. Bloquear en CI
   cualquier crecimiento accidental del paquete inicial.
2. **Persistencia granular.** Asignar ID estable a cada bloque y guardar operaciones
   `insert/update/move/delete`; redimensionar una imagen debe escribir solo su `width`.
   El HTML actual permanece como formato compatible durante la migración.
3. **Carga por demanda.** Hidratar inicialmente resúmenes de Nodes y el contenido del
   Node seleccionado. Cargar contenido completo, papelera, graph facts o PDF solo al
   abrir la superficie correspondiente.
4. **Aislamiento de render.** Suscripciones por Node/bloque, virtualización del Lore y
   parsing/indexado incremental en Worker. La simulación del Graph se moverá a Worker
   solo cuando las mediciones del WebView lo justifiquen.

Estado actual: la capa 1 está completa. La capa 2 comenzó con `editor_image_layouts`:
cada imagen redimensionable posee `data-block-id`, su ancho se restaura por Node y cada
release ejecuta un upsert de una sola fila. Las imágenes antiguas realizan un único
snapshot de compatibilidad para adquirir identidad; Ctrl+S, Close y Exit esperan las
escrituras granulares pendientes. El mismo contrato será la base de texto, orden y
otros atributos de bloque, sin una conversión destructiva del formato existente.

No se introduce CRDT ni Protobuf por adelantado. CRDT se reserva para edición concurrente
real; un codec binario se evaluará únicamente si el perfil muestra que JSON/IPC domina el
tiempo, no por analogía con una arquitectura multiproceso.

## Presupuestos iniciales

`npm run test:performance` genera producción y verifica:

- shell JavaScript: máximo 350 KB raw / 115 KB gzip;
- shell CSS: máximo 45 KB raw / 12 KB gzip;
- workspace JavaScript: máximo 750 KB raw / 225 KB gzip;
- `AppWorkspace` no puede volver a ser import estático desde `App`.

Baseline del 2026-09-12 después de la primera separación:

| Artefacto | Antes | Después |
| --- | ---: | ---: |
| JavaScript inicial | 1,001 KB | 306 KB |
| CSS inicial | 130 KB | 37 KB |
| Workspace diferido | — | 694 KB |

El tiempo de apertura nativa medido previamente pasó de 1,704 ms a 285 ms. Los tamaños
de bundle no sustituyen métricas interactivas: la aceptación final también exige medir
time-to-useful-UI, long tasks al escribir/redimensionar y frame time del Graph en el
WebView objetivo.

### Estado de la fase 2

El primer bloque granular ya está activo. `editor_image_layouts` conserva el ancho por
`(node_id, block_id)` y elimina sus filas por cascade al borrar el Node. El gesto solo
cambia CSS durante el movimiento y realiza un `UPSERT` de una fila al soltar. Imágenes
nuevas nacen con ID estable; una imagen legacy hace un único snapshot HTML para guardar
su identidad y desde el segundo redimensionado deja de serializar el documento. Las
escrituras pendientes forman parte del flush de Ctrl+S, Close Project y Exit.
