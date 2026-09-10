# Lifecycle de H.I.S. Future

## Ownership y durabilidad

- `AppLifecycle` posee la semántica de ventana y proceso. La X solo oculta; el tray restaura el mismo árbol React; `Salir` solicita un flush y espera la cola de archivos antes de cerrar.
- `useWorkspaceLifecycle` posee el cierre lógico del Vault. Captura el editor activo y vacía `PersistenceQueue` antes de pedir al backend que desmonte el proyecto.
- `PersistenceQueue` mantiene una sola escritura activa, combina snapshots en espera con el más reciente, expone `flush()` y conserva para retry un snapshot que no pudo escribirse.
- SQLite confirmado y los archivos bajo `resources/` son el working state durable. En un `.his`, viven en una carpeta estable por Vault bajo los datos locales de H.I.S. Future; ya no dependen de una extracción temporal que se borra al cerrar.
- `OpenProject.archive_dirty` distingue la copia de trabajo de la representación portable. Para `.his`, un marcador durable conserva ese estado incluso si el proceso termina antes de empaquetar.
- `ArchiveSyncManager` posee una cola global de concurrencia 1. Combina requests por ruta, empaqueta desde el working state cerrado, valida el ZIP temporal y reemplaza el `.his` de forma atómica/replace-safe. Un fallo conserva tanto el `.his` anterior como la copia de trabajo dirty.

El formato portable continúa siendo `.his v1`; no cambian manifiesto, SQLite, IDs, rutas de resources ni semántica Nodal.

## Flujos

```text
mutation -> snapshot RAM -> PersistenceQueue -> SQLite/resources durable
Close Vault -> flush -> checkpoint SQLite -> desmontar DB -> queue archive -> Home
ArchiveSyncManager -> temporary .his -> validate -> atomic replace -> archive clean
X -> hide window -> Vault/workspace siguen montados
tray Open -> show/focus -> mismo Vault, vista y nodo
tray Exit -> flush -> close/queue current -> drain all archive jobs -> app.exit
```

Cerrar A no espera el ZIP. B puede abrirse mientras A se empaqueta. Reabrir A sí espera exclusivamente el job de A para impedir que extracción, reemplazo y nuevas escrituras se crucen; después reutiliza su working state durable. Un estado `failed` también reutiliza esa copia más nueva y permite un retry al volver a cerrar.

Los resources se escriben a temporal, se sincronizan y se renombran antes de que la operación se confirme. Cambiar nombre o metadata de un Nodo PDF solo modifica SQLite: no reescribe sus bytes. Image y PDF conservan sus políticas existentes.

## Interrupciones y garantías

| Punto de interrupción | Estado esperado |
| --- | --- |
| Antes del autosave | El cambio aún puede existir solo en RAM; es la limitación preexistente del debounce. Close/Exit capturan y hacen flush. |
| Durante el flush | La transacción SQLite no se presenta como confirmada; Close/Exit fallan y el workspace permanece visible. |
| Después del commit/checkpoint | SQLite/resources y el marcador dirty permanecen en la copia durable aunque el `.his` siga anterior. |
| Durante packaging o temporal | El `.his` oficial anterior no se toca; el temporal se limpia cuando el error es observable. |
| Durante replace | La primitiva del sistema reemplaza el archivo completo; un fallo conserva el anterior y mantiene dirty. |
| Después de replace | Se registra el stamp del `.his` y recién entonces se elimina el marcador dirty. Si este último paso falla, se conserva dirty y el retry es seguro. |

No existen jobs persistentes que continúen ejecutándose sin proceso. En el siguiente inicio, el marcador dirty hace que H.I.S. Future prefiera la copia de trabajo durable sobre un `.his` anterior. Una copia limpia se reutiliza solo si tamaño y timestamp del `.his` coinciden; un cambio externo fuerza nueva extracción.

## Instrumentación y medición reproducible

- Frontend: captura del editor, `PersistenceQueue.flush`, guardado frontend, transición React y primer paint útil de Home.
- Backend close: checkpoint durable, handoff a la cola y `home_ready`.
- Archive worker: pending/syncing/clean/failed y duración de package/validate/replace.
- Exit: duración de `archive_queue_drain` hasta `exit_ready`.
- Benchmark backend: `cargo test lifecycle_benchmark_reports_phases -- --ignored --nocapture`.
- Suite funcional: `npm run test:lifecycle` y `cargo test --lib`.
- QA nativo: `node tests/native-lifecycle-qa.mjs` contra una app Tauri iniciada con CDP.

Abrir `.his` todavía materializa todos los resources cuando no hay working state reutilizable. Lazy extraction queda fuera de esta fase.
