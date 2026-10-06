# HIS Core Context Engine V1 — Informe de implementación

Fecha: 2026-09-28

## Resumen ejecutivo

HIS Future ahora prepara las consultas mediante un pipeline determinista, modular y trazable antes de invocar a Gemita:

```text
mensaje
→ HIS Lexicon
→ ScopeResolver
→ ConversationMemory
→ ReferenceResolver
→ EntityResolver
→ IntentResolver
→ QueryPlanner
→ representación/chunking estructural
→ ranking + grafo
→ expansión small-to-big
→ EvidenceGrader
→ ResponsePlanner
→ ContextBudgetManager
→ ContextBuilder V1
→ adapter de mensajes
→ llama-server / Gemita
```

El modelo, los pesos, llama.cpp y el sampling no fueron modificados.

## 1. Arquitectura anterior

`AIWorkspace` concentraba resolución, retrieval, construcción de contexto, logs y payload. El recorrido era:

`AIWorkspace → Lexicon → ConversationQueryResolver → ConceptResolver → NodeContextRetrieval → AINodeInspector → ContextBuilder → todos los mensajes válidos → LocalAIClient`.

Fortalezas reutilizadas:

- `AINodeInspector` ya convertía HTML a texto/Markdown y cacheaba por `node.id + content`.
- Ya extraía headings, calls `@`, links, imágenes, tablas, jerarquía y relaciones nodales.
- La referencia directa `@Nodo` y la política básica de nodo vacío ya existían parcialmente.

Límites encontrados:

- no había scope APP/LORE/MIXED/GENERAL;
- Gemita recibía todo el historial;
- ranking, expansión y evidencia estaban mezclados;
- el fragmento era una ventana/párrafo, no una unidad de sección;
- contexto relacionado se trataba como evidencia suficiente;
- no había QueryPlan, ResponsePlan ni presupuesto por categorías.

## 2. Arquitectura nueva y módulos

Los módulos nuevos están en `src/ai/context-engine/`:

- `types.ts`: contratos tipados y traza.
- `ScopeResolver.ts`: APP, LORE, MIXED y GENERAL con razones.
- `ConversationMemory.ts`: estado conversacional, herencia y ModelHistory.
- `EntityResolver.ts`: Lexicon, términos compuestos, nombres exactos y `@`.
- `IntentResolver.ts`: intenciones coexistentes.
- `QueryPlanner.ts`: targets, aspectos y profundidad.
- `StructuralChunker.ts`: Nodo → sección/heading → bloques → chunk.
- `StructuralGraph.ts`: calls, relaciones nodales, jerarquía y links internos.
- `CandidateRanker.ts`: ranking explicable.
- `ContextExpander.ts`: small-to-big y estrategia full-node.
- `EvidenceGrader.ts`: SUPPORTED, PARTIAL, INSUFFICIENT y CONFLICTING.
- `ResponsePlanner.ts`: profundidad, formato y aspectos requeridos.
- `ContextBudgetManager.ts`: presupuesto de conversación, contenido, metadata e instrucciones.
- `ContextBuilderV1.ts`: serialización final con namespaces.
- `ContextEngine.ts`: orquestación pura.
- `AIRequestPreparation.ts`: adapter entre el motor y el streaming.
- `config.ts`: bandera temporal `VITE_CONTEXT_ENGINE_V1=false` para volver al legacy.

## 3. Memoria

`ConversationState` mantiene entidades, scope, temas, intención y targets recientes, pero no obliga al modelo a leerlos. La herencia solo ocurre con dependencias explícitas como “¿y qué pasó después?”, pronombres cortos o patrones equivalentes.

`ModelHistory` queda entre 0 y 4 mensajes previos. Una consulta autocontenida usa 0; un follow-up usa el par reciente relevante. La resolución nunca toma afirmaciones del asistente como nueva entidad canónica.

## 4. ScopeResolver y aislamiento APP/LORE

- “Explícame … Noosfera … universo” → LORE.
- “¿Qué tipo de Nodo es Noosfera?” → APP.
- “¿Qué dice el Nodo Noosfera sobre … lore?” → MIXED.
- Las comparaciones con el mundo real separan corpus HIS de conocimiento general.

En LORE, `ContextBuilderV1` no incluye `HIS_DOCUMENT_METADATA`. APP usa metadata y contenido documental. MIXED conserva ambos namespaces y añade el límite de conocimiento general.

## 5. Resolución, Lexicon e intenciones

HIS Lexicon V1 participa en canonicalización, plurales, idioma, stopwords, namespaces, hints y longest-match. Así:

- Noosferones → Noosferón;
- Homeostasis Noética permanece compuesta;
- “Para” y “Forma” no se convierten en entidades fuertes;
- “resúmeme” y “summarize” llegan a la misma intención.

Las intenciones son múltiples: FACT, SUMMARY, FULL_NODE, COMPARE, RELATIONS, STRUCTURE, TIMELINE, CAUSE, DEFINITION, FOLLOW_UP y GENERAL_EXPLANATION.

## 6. QueryPlanner y ResponsePlanner

El plan descompone únicamente necesidades de información. Una explicación “al completo” produce profundidad `exhaustive`, formato `structured` y aspectos como definición, origen, funcionamiento, componentes, relaciones y papel. La ausencia de evidencia para un aspecto queda visible como PARTIAL; no se inventa contenido para rellenarlo.

## 7. Representación, chunking y cache

Se reutilizó `AINodeInspector` y su cache `node.id + content`; no se duplica HTML pesado. Los chunks conservan Nodo padre, sección, heading, posición, entidades y calls. La unidad primaria es el bloque estructural dentro de una sección, no un corte ciego de caracteres.

## 8. Small-to-big y full-node

El ranking recupera hasta 20 candidatos internos; la expansión entrega como máximo cinco contextos con contenido útil.

- consulta puntual → chunk;
- consulta de sección → sección;
- resumen o exhaustiva → documento completo si mide hasta 9.000 caracteres;
- documento de 9.001–18.000 → secciones principales;
- documento mayor → mapa estructural + expansión selectiva.

Un target vacío se conserva como metadata/entidad, con `contentMode=none`, y no consume slot de contenido.

## 9. Grafo y relaciones @

Pesos principales:

`target explícito @ (5000) > call (1800) > nombre exacto (1200) > target resuelto (950) > heading/entidad/contenido`.

El grafo se construye sin LLM a partir de calls, relaciones nodales, jerarquía y links internos. Las menciones textuales no desplazan una relación explícita.

## 10. EvidenceGrader

Estados:

- `SUPPORTED`: todos los aspectos pedidos tienen señal explícita.
- `PARTIAL`: existe evidencia útil, pero faltan aspectos.
- `INSUFFICIENT`: hay documentos relacionados, pero no contestan el atributo pedido.
- `CONFLICTING`: dos fuentes contienen valores incompatibles.

Para `INSUFFICIENT`, el builder ordena decir que HIS no especifica el dato. Para `CONFLICTING`, presenta las versiones separadas y prohíbe elegir o reconciliar arbitrariamente.

## 11. ContextBuilder y presupuesto

Namespaces principales:

- `QUERY_SCOPE`
- `QUERY_PLAN`
- `EVIDENCE`
- `HIS_LORE_SOURCE`
- `HIS_DOCUMENT_METADATA`
- `HIS_DOCUMENT_CONTENT`
- `GENERAL_KNOWLEDGE_BOUNDARY`
- `RESPONSE_RULES`

Presupuesto V1: 15.000 caracteres de entrada contextual; 9.200 para evidencia, 1.600 para conversación, 1.200 para metadata, 2.200 para instrucciones y una reserva de respuesta de 5.000 caracteres. La estimación local es conservadora (aprox. 4 caracteres/token).

## 12. Diagnósticos DEV

Por request ID se emiten: `LEXICON`, `SCOPE`, `MEMORY`, `RESOLVE`, `PLAN`, `RETRIEVAL`, `GRAPH`, `EXPAND`, `EVIDENCE`, `CONTEXT` y `MODEL`, además de categorías previas.

Los logs incluyen tiempos por módulo, razones de ranking y tamaños; los documentos completos no se imprimen.

## 13. Launcher

Auditoría:

- captura stdout y stderr línea por línea;
- el prefijo `__HIS_AI_EVENT__` ya era compatible;
- request IDs y presentación agrupada ya funcionaban;
- el validador tenía una lista cerrada que rechazaba categorías nuevas, incluido `lexicon`.

Cambio aplicado: solo tipos, whitelist, colores y test de consola. No se movió lógica de IA ni se añadió dependencia con HIS Future.

## 14. Benchmark antes/después

Corpus controlado y reproducible en `tests/context-engine-benchmark.mjs`; mismo Gemma local y mismas seis consultas. Las latencias son una ejecución local y deben interpretarse como orientación, no como microbenchmark estadístico.

| Consulta | Contexto legacy → V1 | Mensajes legacy → V1 | Evidencia V1 | Docs irrelevantes |
|---|---:|---:|---|---:|
| Háblame de Retterh | 2110 → 1004 | 31 → 1 | SUPPORTED | 0 → 0 |
| ¿y qué pasó después? | 2128 → 1013 | 3 → 3 | SUPPORTED | 0 → 0 |
| Noosfera al completo | 2068 → 1241 | 1 → 1 | PARTIAL | 0 → 0 |
| Color de Noosferones | 2008 → 1156 | 1 → 1 | INSUFFICIENT | 1 → 1 |
| Resumen Noosferones | 1990 → 1030 | 1 → 1 | SUPPORTED | 0 → 0 |
| Relación Retterh/Midas | 2669 → 1027 | 1 → 1 | SUPPORTED | 0 → 0 |

Respuestas finales observadas con Gemma:

- Retterh: misma información correcta, con 30 mensajes previos eliminados.
- Follow-up: heredó Retterh y respondió sobre la alianza posterior.
- Noosfera: V1 incluyó el Nodo completo y el documento relacionado; marcó faltantes como PARTIAL.
- Color: legacy respondió que la documentación no asigna color; V1 respondió “No se especifica un color exacto” bajo una garantía explícita `INSUFFICIENT`.
- Resumen: V1 produjo un resumen compacto sin convertir metadata de aplicación en lore.
- Relaciones: V1 respondió que Retterh y Midas fueron aliados, apoyado por el call explícito.

## 15. Trazas solicitadas

### Háblame de Retterh

`normalized=hablame de retterh → scope=LORE → inheritance=[] → intent=GENERAL_EXPLANATION → target=Retterh → selected=[Retterh:chunk, Crónica de la alianza:chunk, Midas:chunk] → evidence=SUPPORTED → history=1`.

### ¿y qué pasó después?

`normalized=y que paso despues → inherited=[Retterh] → effective=¿y qué pasó después Retterh → scope=LORE → intents=[TIMELINE,FOLLOW_UP] → selected=[Retterh,Midas,Crónica de la alianza] → evidence=SUPPORTED → history=3`.

### Explícame al completo la Noosfera…

`scope=LORE → target=Noosfera → depth=exhaustive → aspects=[definition,origin,functioning,components,relations,role] → selected=[Noosfera:full,Nodión:full] → evidence=PARTIAL → app metadata absent`.

### ¿Qué color exacto tienen los Noosferones?

`Noosferones→Noosferón → scope=LORE → intent=FACT → aspect=exact_color → related nodes=[Noosferón,Noosfera] → no explicit color value → evidence=INSUFFICIENT → refusal to invent`.

### resúmeme todo sobre los Noosferones

`resúmeme→SUMMARY; Noosferones→Noosferón → depth=exhaustive → selected=[Noosferón:full,Noosfera:full] → evidence=SUPPORTED`.

### ¿Qué relación tienen Retterh y Midas?

`targets=[Retterh,Midas] → intent=RELATIONS → graph call selects Crónica de la alianza → expansion=[Retterh:section,Midas:section,Crónica:section] → evidence=SUPPORTED`.

## 16. Tests y validación

- 15 escenarios funcionales obligatorios: pasan.
- invariantes adicionales de historial y presupuesto: pasan.
- suite AI legacy + V1: pasa.
- HIS Lexicon V1: pasa.
- build TypeScript/Vite de HIS Future: pasa.
- `cargo check`: validado tras ampliar las categorías.
- parser y build de H.I.S. Launcher: pasan.
- comparación real con Gemma local: completada; el servidor temporal se cerró.

## 17. Limitaciones restantes

- El benchmark usa un corpus sintético controlado porque los Nodos reales viven en proyectos abiertos en runtime; debe repetirse con un proyecto real representativo.
- Evidence V1 es deliberadamente heurístico. Colores, fechas, causalidad y contradicciones simples están cubiertos; extracción formal de afirmaciones complejas queda para una versión posterior.
- La memoria de conversación sigue siendo de sesión React, igual que antes; no se añadió persistencia.
- La estimación de tokens usa caracteres, no el tokenizador exacto de Gemma.
- El fallback sin DOM conserva bloques de texto, pero la mejor estructura de secciones se obtiene en el runtime navegador/Tauri.
- La bandera legacy es temporal y debe retirarse cuando las pruebas sobre corpus real confirmen estabilidad.

## Archivos principales modificados/creados

HIS Future:

- `src/ai/context-engine/*`
- `src/ai/AIRequestPreparation.ts`
- `src/ai/AIWorkspace.tsx`
- `src/ai/AILogger.ts`
- `src-tauri/src/lib.rs`
- `tests/context-engine-v1.test.mjs`
- `tests/context-engine-benchmark.mjs`
- `package.json`

H.I.S. Launcher (solo consola DEV):

- `src/services/processTypes.ts`
- `src/services/aiConsoleLog.ts`
- `src/styles/app.css`
- `tests/ai-console.test.mjs`
