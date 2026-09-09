# Graph renderer performance

## Autopsia (2026-09-09)

La primera optimización eliminó la reconstrucción semántica durante drag, pan y zoom. La evidencia interactiva posterior aisló un segundo límite: al activar Tipos, Iconos o Imágenes, el canvas SVG/HTML volvía a degradarse aunque `GraphProjection` y el layout permanecieran memoizados.

El renderer anterior mantenía un botón HTML por vértice, un texto DOM por label, un `<line>` SVG por conexión y, según preferencias, máscaras CSS o `<img>` independientes. Tipos agregaba nueve hubs reales del Registry, un grouping edge por Node y sus labels/iconos. Con 49 Nodes eran 58 botones/textos, cerca de 50 conexiones adicionales y varias capas de composición. Las búsquedas de Registry eran O(1) y la proyección no se repetía durante el gesto: el coste dominante era paint/composición del árbol mixto DOM/SVG, agravado por imágenes y máscaras, no una segunda semántica oculta.

## Arquitectura híbrida

```text
Nodal State
    -> GraphProjection (read-only)
    -> GraphRuntime (layout, posiciones, índices y facts)
    -> GraphScene (preferencias visuales y LOD)
    -> PixiGraphRenderer (canvas WebGL)
```

React conserva toolbar, preferencias, mensajes, navegación y montaje/desmontaje. PixiJS 8.20.1 es propietario únicamente de nodes, edges, labels, Type Hubs, iconos, thumbnails, hit testing y viewport visual. Se carga dinámicamente cuando entra Graph, sin convertir cada Node en un componente React.

`GraphProjection` no importa Pixi, escena ni LOD. Los edges visualmente coincidentes se agrupan por endpoints en runtime, pero `facts` conserva todos los edges, roles, provenance y ocurrencias proyectados; la optimización visual no elimina información semántica.

## Level of Detail

| LOD | Umbral base | Nodes | Labels | Edges |
| --- | ---: | --- | --- | --- |
| detail | >= 0.62 | thumbnail permitido; en otro caso icon/circle | todos | completos |
| medium | >= 0.42 | icon permitido; Image con imágenes ON pasa a circle | todos | completos simplificados |
| far | >= 0.30 | circle | hover/selected | menor peso |
| distant | < 0.30 | point | ninguno | baja opacidad |

Una histéresis de 0.025 evita alternancia cerca de los thresholds. Las preferencias deciden qué representación está permitida; LOD decide cuándo se utiliza. Image con Imágenes ON sigue `thumbnail -> circle -> point`. Un icono sigue `icon -> circle -> point`. Type Hubs usan identidad oficial en detail/medium y se simplifican igual al alejarse.

Textos y sprites se conservan y cambian `visible`; no se destruyen al cruzar thresholds. Las texturas se cargan una vez por source dentro del renderer, se reutilizan y se descargan al destruirlo. Los iconos se resuelven desde las clases CSS que ya posee el sistema Node, por lo que no existe un segundo catálogo tipo/icono.

## Trabajo por frecuencia

| Momento | Trabajo |
| --- | --- |
| mount | crear `Application`, canvas, capas, listeners y `ResizeObserver` |
| cambio de datos/Tipos | Projection memoizada; runtime; reconciliar escena Pixi |
| cambio de Iconos/Imágenes | actualizar representación de escena; reutilizar texturas |
| cambio de threshold LOD | visibilidad/tamaño/estilo; no Projection ni layout |
| pan/zoom por frame activo | transformar un `Container`; render bajo demanda |
| drag por frame activo | mover un Node y redibujar solo edges incidentes |
| Graph quieto | sin ticker ni animation loop permanente |

`updatePositions()` es la frontera preparada para una futura `GraphSimulation`: acepta posiciones de múltiples Nodes, actualiza cada display y deduplica los edges sucios sin pasar por React ni reconstruir Projection. Pixi no almacena relaciones ni velocidades y no es un motor físico.

## Lifecycle

La aplicación usa WebGL, resolución limitada a 2x devicePixelRatio, resize explícito y render bajo demanda (`autoStart: false`, `app.stop()`). Al desmontar se desconecta el observer, se cancelan RAF pendientes, se quitan listeners, se destruye canvas/scene/context y se descargan las texturas cargadas por Graph. La inicialización asíncrona soporta el mount/unmount doble de React StrictMode sin dejar canvas huérfanos.

## Stress reproducible

`npm run test:graph:stress` crea datos sintéticos con aproximadamente tres relaciones por Node, Type Hubs activos, iconos/imágenes permitidos y evaluación de los cuatro LOD. Mide Projection + runtime + preparación de escena; no mide FPS, paint WebGL, transferencia GPU ni decodificación real de imágenes.

| Nodes | Visual edges, incluidos grouping | Mediana estructural |
| ---: | ---: | ---: |
| 50 | 194 | 1.00 ms |
| 250 | 994 | 2.56 ms |
| 500 | 1994 | 6.25 ms |
| 1000 | 3994 | 11.00 ms |

Las cifras verifican que el trabajo estructural continúa siendo pequeño y aproximadamente lineal. La fluidez visual real debe comprobarse en el WebView y GPU objetivo; no se infieren FPS de este benchmark.

## Simulación física v0.1.4

`GraphSimulation` vive en `src/graph/simulation.ts`. Consume el `GraphRuntimeModel` y solo modifica las posiciones de sus puntos y su estado interno de velocidades/pinning. No conoce React, Pixi, `GraphProjection`, SQLite ni persistencia. `PixiGraphRenderer` es su scheduler: ejecuta RAF únicamente mientras la simulación está despierta y pasa los cambios a `updatePositions()`. El renderer conserva las posiciones en `positionCache`; React y Projection siguen fuera del hot loop.

La fuerza usa repulsión O(n²) acotada a 900 px, separación mínima con colisión suave, springs por edge, centrado suave y damping exponencial. Los defaults semánticos son: `nodal-relation` 0.85 / 280 px, `mention-reference` 0.50 / 350 px, `legacy-runtime-derived` 0.32 / 410 px y `grouping` 0.025 / 620 px. Los Type Hubs tienen masa 2.5 y nunca reciben un tratamiento gravitatorio especial; los grouping edges siguen siendo visibles y semánticos, pero su influencia física es deliberadamente baja.

El drag se pinnea después del umbral existente. Solo se activa el nodo y sus vecinos directos; mientras está fijado sigue exactamente el cursor y al soltar vuelve a la simulación con velocidad cero. La simulación duerme tras 14 frames bajo el umbral de velocidad o como máximo después de 240 frames. `wake("structure")` activa todo el grafo; drag y release conservan una región local. Los endpoints ausentes se ignoran en runtime, sin alterar diagnostics.

### Benchmark de step

Medición local con el benchmark sintético existente, incluyendo Type Hubs y aproximadamente tres relaciones por Node. Es coste CPU del step, no una certificación de FPS WebGL:

| Nodes | Visual edges | Media de step | Frames hasta sleep |
| ---: | ---: | ---: | ---: |
| 50 | 194 | 0.99 ms | 240 (máximo) |
| 250 | 994 | 3.91 ms | 240 (máximo) |
| 500 | 1994 | 7.64 ms | 240 (máximo) |
| 1000 | 3994 | 25.60 ms | 240 (máximo) |

El límite observado en este fixture indica que el grafo sintético todavía está settling durante el máximo configurado; no hay un ticker permanente después de ese punto. La siguiente optimización razonable sería mejorar la convergencia o introducir un índice espacial solo si los grafos reales hacen necesario superar el coste actual, no añadir Barnes-Hut por adelantado.
