# Graph runtime performance

## Autopsia (2026-09-09)

El renderer anterior ejecutaba `buildGraphProjection`, layout, reducción de edges, conteos e índices en el cuerpo de `GraphView`. Drag, pan y zoom escribían React state por cada evento de puntero; cada escritura volvía a ejecutar toda esa ruta y reconciliaba todas las líneas y todos los botones. Drag además recorría todas las aristas, calculaba influencia para vecinos conectados y copiaba el mapa completo de posiciones en cada movimiento.

Este coste existía con Tipos, Iconos e Imágenes desactivados. Los thumbnails añadían coste de DOM únicamente durante render semántico y los iconos cambiaban el contenido visual del Node, pero ninguno explicaba el lag base.

## Frontera actual

Estado de baja frecuencia:

- `GraphProjection`, memoizada por Nodes, Tipos y traducción;
- layout e índices runtime, memoizados por Projection;
- preferencias;
- selección semántica y cambios de datos.

Estado de alta frecuencia:

- posición del puntero;
- posición del Node arrastrado;
- pan y zoom del viewport.

`useGraphInteraction` conserva el estado de alta frecuencia en refs, agrupa pointer/wheel mediante `requestAnimationFrame` y actualiza directamente la transformación común del canvas. Drag modifica un solo botón y las líneas incidentes obtenidas desde `edgesByPointId`. No reconstruye Projection, layout ni VDOM. La antigua influencia proporcional sobre vecinos fue retirada porque multiplicaba escrituras sin representar una relación semántica.

## Complejidad del hot path

| Interacción | Antes | Ahora |
| --- | --- | --- |
| pointermove de drag | O(V + E + contenido) más reconciliación global; también movía vecinos | O(1) al recibir evento y O(grado del Node) por frame |
| pan | render/projection/layout global por evento | O(1), una transformación del canvas por frame |
| wheel/zoom | render/projection/layout global por evento | O(1), una transformación común por frame |
| hover | CSS | CSS |
| cambio semántico | reconstrucción global necesaria | reconstrucción global memoizada y necesaria |

## Stress reproducible

`npm run test:graph:stress` construye proyectos sintéticos sin modificar `.his`, con aproximadamente tres edges dirigidos por Node. Mide Projection + layout + creación de índices; no mide FPS, pintura, composición GPU ni decodificación real de imágenes.

Resultado de referencia en el equipo de desarrollo:

| Nodes | Edges | Mediana estructural |
| ---: | ---: | ---: |
| 50 | 144 | 0.50 ms |
| 250 | 744 | 1.56 ms |
| 500 | 1494 | 2.55 ms |
| 1000 | 2994 | 8.43 ms |

Estas cifras demuestran crecimiento aproximadamente lineal para la carga evaluada y ausencia del trabajo semántico en interacción. No equivalen a una garantía de FPS: a 1000 Nodes, layout visual, texto, imágenes y número de elementos DOM/SVG todavía pueden dominar el render inicial.

## Decisión de renderer

SVG sigue siendo suficiente para el objetivo actual. Cincuenta Nodes son una carga trivial una vez retirados los renders por pointermove; 250 y 500 conservan un runtime estructural pequeño. Mil Nodes permanecen utilizables desde el modelo, aunque requieren una prueba visual real para calificar fluidez del DOM en el equipo objetivo. No hay evidencia actual que justifique PixiJS/WebGL. Una migración futura solo debería evaluarse con perfiles de pintura/DOM que demuestren que el renderer, y no el runtime, es el límite.
