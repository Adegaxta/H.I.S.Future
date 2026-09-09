# Lifecycle de H.I.S. Future

## Ownership

- `AppLifecycle` posee la semántica de ventana y proceso. La X solo oculta; el tray restaura el mismo árbol React; `Salir` solicita un flush y recién después cierra el runtime nativo.
- `useWorkspaceLifecycle` posee el cierre del proyecto. Captura el editor activo, vacía persistencia y después dispone el proyecto para volver a Home.
- `PersistenceQueue` posee el orden de escrituras. Conserva una escritura activa, combina snapshots en espera con el más reciente, expone `flush()`/`hasPendingWrites()` y conserva el último snapshot si una escritura falla.
- `OpenProject.archive_dirty` posee la necesidad de reconstruir el `.his`. Solo cambios SQLite, settings o resources reales lo activan; cerrar un archivo limpio no vuelve a comprimirlo.

## Flujos

```text
X -> hide window -> proyecto y workspace siguen montados
tray Open -> show/focus -> mismo proyecto, vista y nodo
tray Exit -> flush queue -> checkpoint/package si está dirty -> app.exit
Close Project -> snapshot editor -> flush queue -> close runtime -> Home
```

El PDF muestra primero el shell, transfiere bytes crudos por IPC y monta la primera página. Las demás páginas se activan cerca del viewport mediante `IntersectionObserver`; no se crean renders globales al abrir el nodo.

## Medición reproducible

- Backend: `cargo test lifecycle_benchmark_reports_phases -- --ignored --nocapture`
- Suite funcional: `npm run test:lifecycle`
- UI real: medir manualmente desde pulsar X/tray/open PDF hasta ventana visible o primera página útil. Las pruebas de backend no se presentan como tiempo de pintura.
