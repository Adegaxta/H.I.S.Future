# HIS Language Understanding & Response Planning V1

Fecha de auditoría e implementación: 2026-09-29
Proyecto: GEMITAV / HIS Core (`hisfuture` 0.6.3)

## 1. Resumen ejecutivo

La actualización se implementó encima de GEMITAV V0/V0.1. No reemplaza chats persistentes, FTS5, ConversationState, memoria, Context Engine, AnswerSpec, validadores, repair ni NLGFinalizer.

El cambio central es un contrato explícito:

`mensaje → LanguageUnderstandingResult → SemanticFrame → ResponsePlan → ComplexityEstimator → renderer → validators`

Resultados verificados:

- `voy a contarte algo` se reconoce como intención comunicativa y no como tarea;
- intención pragmática ponderada con señales y scores, no una única regla binaria;
- discurso narrativo de seis turnos conserva el rol esperado;
- sujeto, referencia y fecha conservan confidence, reasons y provenance;
- cache semántica por conversación, messageId y texto normalizado;
- EventGraph episódico aislado del lore;
- ResponsePlan y `LanguageRenderer` desacoplan Gemma del pipeline;
- fast path social usa NLG solo con comprensión suficiente;
- contexto con namespaces de alta señal y selección acotada;
- memoria rechaza frames o menciones de baja confianza;
- repair focal puede eliminar unidades inválidas sin una regeneración completa;
- límites de generación se derivan del ResponsePlan: 48/240/600 tokens;
- tests previos de HIS Core/GEMITAV y nuevos tests V1 pasan.

## 2. Auditoría inicial

### Señales que existían realmente

- Normalización NFKC, lowercase locale-aware y accent folding.
- Tokenización Unicode.
- Stopwords con peso y efectos (`zero-score`, `reduced-score`, `not-entity`, `not-primary-keyword`).
- Entradas léxicas con canonical, POS opcional, forms, synonyms, translations, intent hints, namespace, prioridad y provenance.
- Actos conversacionales V0 mediante frases exactas y regex.
- Entidades por Lexicon/nombre de nodo; personas por capitalización; referencias a entidades activas.
- Fechas relativas: ayer, anteayer, hoy, mañana, días, semana anterior y días de semana.
- ConversationState persistido, memoria tipada, supersession, summaries y contexto acotado.
- AnswerSpec autorizado, validación de facts/coverage/consistency, repair y final validation.

### Uso anterior del Lexicon

El Lexicon participaba en query analysis, scope/entity resolution, retrieval y parcialmente en `ConversationActResolver`. No alimentaba una representación morfológica/gramatical central. Kaikki y OEWN tenían adaptadores a `LexicalEntry`, pero el runtime solo consumía shards generados disponibles; no existe carga mágica del corpus completo.

### Datos léxicos disponibles

| Dato | Estado antes | Estado V1 |
|---|---|---|
| lemma/canonical | disponible | consumido por morphology |
| POS | opcional | normalizado a `pos[]` |
| morphology | no estaba en contrato | campo opcional, nunca inventado como fuente léxica |
| aliases/inflections/plural | disponible en `forms` | consumido |
| translations | disponible | conservado |
| synonyms | disponible | conservado |
| stopword weight | disponible | consumido en análisis léxico |
| namespace/domain | disponible | conservado |
| semantic hints | no estaba en contrato | campo opcional para shards futuros |
| provenance | disponible | propagado |

Cuando el dataset no aporta morphology, V1 usa reglas conversacionales españolas explícitamente marcadas con provenance `rule`; no las presenta como datos Kaikki/OEWN.

### Heurísticas binarias detectadas

- `factualLanguage → KNOWLEDGE` podía dominar una frase social.
- `voy a ... → TASK` convertía comunicación futura en tarea.
- la presencia de `me/mi` fijaba sujeto USER incluso con `ella` como sujeto;
- lugares dependían de una lista fija;
- routing dependía principalmente de número de facts y depth;
- referencias elegían el primer antecedente activo sin candidatos explícitos.

### Paralelismo, recálculo y cache

Memoria, summary y búsqueda FTS histórica ya no esperan entre sí: se solicitan con `Promise.all`. Análisis léxico, morfológico, temporal y de referencias mantienen etapas separadas y timings; dentro de un mensaje son muy baratos y comparten el resultado léxico. Los derivados inmutables quedan cacheados por `conversationId:messageId:normalizedText`; el hot state conserva 16 frames recientes, IDs de memoria elegida y versión de summary.

## 3. Arquitectura before/after

Antes:

`query → ConversationAct regex → retrieval opcional → AnswerSpec → direct NLG/Gemma → validators`

Después:

`query → normalization/lexicon/morphology/grammar → SemanticFrame + intent/discourse/subject/reference/time → memory/context → AnswerSpec → ResponsePlan → complexity → DeterministicNLGRenderer/GemmaRenderer → validators`

Autoridad conservada: HIS Core comprende y planifica; memoria aporta continuidad; HIS Knowledge autoriza lore; Gemma renderiza; NLG realiza; validadores controlan.

## 4. Language Understanding Pipeline

`LanguageUnderstandingPipeline` devuelve `AnalysisValue<T>` en todas las capas: `value`, `confidence`, `reasons`, `provenance`. Sus timings son:

`normalizeMs`, `lexicalMs`, `morphologyMs`, `grammarMs`, `semanticFrameMs`, `intentMs`, `discourseMs`, `subjectMs`, `referenceMs`, `temporalMs`.

El resultado agregado conserva confidence y cacheHit.

### LexicalAnalyzer

Usa `hisLexicon.analyzeQuery`, no un diccionario paralelo. Cada token conserva canonical, match, source, stopword, intent hints y offsets. `LexicalEntry` admite morphology/semanticHints opcionales sin suponer que la fuente los contiene.

### Morphology

V1 prioriza señales conversacionales: persona/número de pronombres y verbos frecuentes, presente, infinitivo, gerundio, participio y clíticos. Ejemplo real:

- `voy`: lemma `ir`, 1ª singular, presente, indicativo;
- `contarte`: lemma `contar`, infinitivo, clítico `te`.

No es un parser académico ni pretende cubrir toda la conjugación española.

### GrammarSignals

Expone sujeto explícito/implícito, verbo, auxiliares, negación, pregunta, imperativo, condición, causalidad, contraste, coordinación, tiempo, modalidad y `communicationIntention`. Distingue obligación, deseo, belief, posibilidad y futuro intencional.

### SemanticFrame

El frame compatible con V0.1 se enriqueció con communicativeAct, discourseRole, addressee, predicate, events, preferences, decisions, temporalReferences, polarity, certainty, knowledge/action/social intent, confidence y provenance. Los campos son opcionales para mantener compatibilidad con datos anteriores.

### IntentScorer y PragmaticIntent

Produce lista ordenada de `{intent, score, supportingSignals}`. Incluye greeting, small talk, share experience, question, knowledge/action request, task, preference, correction, rewrite, translate, shorten y expand. La intención comunicativa suprime activamente TASK/KNOWLEDGE de baja calidad.

### DiscourseState

Es distinto de Memory. Implementa OPENING, TOPIC_INTRODUCTION, NARRATIVE_CONTINUATION, ELABORATION, QUESTION_ON_TOPIC, CORRECTION y CONTRAST; el contrato incluye los roles restantes para extensión.

### SubjectResolver, ReferenceResolver y TemporalResolver

SubjectResolver conserva candidatos, confidence y reason. ReferenceResolver usa frame, estado y mensajes recientes; una corrección explícita gana. TemporalResolver mantiene surface, resolved value, anchor y tipo de resolución. No fuerza una resolución ambigua.

## 5. EventGraph y memoria

`ConversationEventGraph` crea EventNode con subject, predicate, participants, location, temporalRef, source messages, confidence y provenance. Está aislado por conversationId y nunca se convierte en lore. Los episodios persistentes siguen pasando por `MemoryPolicy`, por lo que consultas posteriores pueden recuperarlos incluso tras reiniciar.

Se añadieron contratos ejecutables para `MemoryConsolidator`, `MemoryDeduplicator`, `MemoryConflictResolver`, `MemoryDecay` y `MemoryAudit`. Consolidation expira, deduplica y aplica supersession por subject+predicate. No se programó un background thread inseguro; queda como slow path invocable en idle/post-response.

## 6. ResponsePlan, ComplexityEstimator y renderers

ResponsePlan contiene goal, audience, tone, register, verbosity, semantic units, facts/relations autorizados, uncertainty, conflicts, acknowledgements, questions, structure, length, capacidad NLG, necesidad generativa, reason, confidence y complexity.

Complexity:

- `SIMPLE_DETERMINISTIC`: actos sociales inequívocos;
- `STRUCTURED_NLG`: hasta cuatro facts/dos relaciones y baja ambigüedad;
- `GENERATIVE`: síntesis, estilo, transformación o confianza insuficiente.

`LanguageRenderer` tiene implementaciones `DeterministicNLGRenderer` y `GemmaRenderer`. Se deja además `CapabilitySelector`, que solo selecciona de una allow-list suministrada y no activa internet/tools.

## 7. Evolución NLG y variación controlada

El renderer determinista consume ResponsePlan/AnswerSpec. Para ACKNOWLEDGE_AND_INVITE rota variantes equivalentes y evita las tres más recientes. No añade facts. El NLG existente conserva unidades claim/relation/temporal/uncertainty/conflict/list y fallback seguro.

El repair focal elimina únicamente sentencias marcadas como inválidas y revalida; si no basta, usa el repair generativo existente.

## 8. Context engineering y prompt compression

El contexto usa:

- `[CURRENT_REQUEST]`
- `[SEMANTIC_FRAME]`
- `[DISCOURSE_STATE]`
- `[RELEVANT_HISTORY]` / `[REFERENCED_HISTORY]`
- `[MEMORY]`
- `[HIS_KNOWLEDGE]`
- `[RESPONSE_PLAN]`

Gemma recibe request + plan compacto + facts/relations/uncertainty/conflicts. No recibe graph, corpus ni historial completos. El prompt compacto medido tuvo 58 tokens. `max_tokens` ahora depende de verbosity: SHORT 48, NORMAL 240, LONG 600.

## 9. Hot state, cache y ejecución

`HotConversationStateStore` mantiene state, últimos 16 frames, memorias seleccionadas, summary version y version local. SQLite continúa siendo autoridad persistente. El cache semántico está aislado por conversación y se puede invalidar por conversationId.

El runtime `LocalAIRuntimeManager.ensure()` prueba primero el endpoint/proceso existente, reutiliza el child y solo crea uno si no hay servidor. Por tanto llama-server se mantiene caliente y no se reinicia por request.

No se añadieron flags manuales de KV/prefix. La prueba del servidor mostró soporte estable automático: segunda petición `cached_tokens=53` de 58. Se evita un hack adicional dependiente de versión.

## 10. Confidence y uncertainty policy

- frame `<0.72`: no persistir;
- mention `<0.75`: ignorar para MemoryWriter;
- referencia de baja confianza: no se fuerza;
- deterministic NLG requiere understanding `>=0.72` y baja ambigüedad;
- belief reduce certainty y no se promueve a fact canónico;
- assistant output nunca es autoridad de memoria.

## 11. Métricas y benchmarks

### CPU / contexto

| Medición | Resultado |
|---|---:|
| Lexicon, 5.000 iteraciones | 234,16 ms total; 0,04683 ms avg |
| LU V1, 1.000 mensajes | 123,94 ms total; 0,124 ms avg |
| 1.000 assemblies sobre corpus de 10.000 | 9,51 ms total |
| Contexto 1.000+ | 6 recientes + 1 referenciado; 754 chars |

### Gemma local real

Prompt idéntico de 58 tokens, salida limitada a 32 para la medición:

| Estado | Wall | Prompt eval | Cache | Generation |
|---|---:|---:|---:|---:|
| primera petición tras cargar servidor | 1.337,28 ms | 344,97 ms / 58 tokens | 0 | 927,49 ms / 32 tokens |
| petición caliente | 949,97 ms | 56,41 ms / 5 tokens | 53 tokens | 882,76 ms / 32 tokens |

Esto no mide el arranque del proceso/model load; mide primera vs segunda inferencia después de `/health=ok`. El servidor temporal del benchmark fue detenido al terminar.

TimeToFirstUsefulOutput queda medido exactamente para DIRECT_NLG como `totalMs`. El cliente SSE todavía no persiste el timestamp del primer delta de Gemma: es una limitación real pendiente.

## 12. Trazas requeridas

### A. `holaaa que tal sabes te voy a contar mi dia`

Normalized: `holaaa que tal sabes te voy a contar mi dia`; grammar: near_future + communication_intention; primary `SHARE_EXPERIENCE 0.99`; `GREETING 0.96`; TASK `0.11`; KNOWLEDGE `0.07`; discourse TOPIC_INTRODUCTION; tasks `[]`; route SIMPLE_DETERMINISTIC; goal ACKNOWLEDGE_AND_INVITE.

### B. `voy a contarte algo`

`voy → ir/1sg/present`; `contarte → contar/infinitive/clitic te`; modality intention; addressee ASSISTANT; SHARE_EXPERIENCE; task false; route SIMPLE_DETERMINISTIC.

### C. `tengo que terminar el validator`

Grammar obligation; TASK_DECLARATION `0.91`; frame TASK; MemoryPolicy permite task solo porque frame/mention superan umbrales.

### D. Narrativa de seis turnos

1. hola → OPENING
2. te voy a contar mi día → TOPIC_INTRODUCTION
3. primero fui a trabajar → NARRATIVE_CONTINUATION
4. después vi a Ana → NARRATIVE_CONTINUATION
5. pasó algo raro → ELABORATION
6. por qué crees que hizo eso? → QUESTION_ON_TOPIC

La introducción social no solicita HIS Knowledge.

### E. `qué te conté ayer de Ana?`

Interrogative + DATE ayer + conversational recall; se priorizan episodios/persona/fecha, FTS/reference y EventGraph, no corpus completo. Contexto benchmark: 1 mensaje antiguo referenciado, 6 recientes, 754 chars.

### F. Respuesta simple NLG

Plan: ACKNOWLEDGE_AND_INVITE; facts `[]`; uncertainty `[]`; complexity SIMPLE_DETERMINISTIC; salida ejemplo: `Dale, cuéntame.`; modelCalls `0`.

### G. Respuesta compleja a Gemma

Una explicación con síntesis, varios facts/relations, depth detailed/exhaustive o transformación estilística produce complexity GENERATIVE. Gemma recibe el plan compacto y límites derivados de verbosity; luego pasa por validate/repair/NLG/final validate.

### H. Misma consulta: NLG vs Gemma

Consulta: `voy a contarte algo`.

- NLG: respuesta pragmáticamente correcta (`Dale, cuéntame.`), fast path en milisegundos/submilisegundos de CPU, sin facts nuevos.
- Gemma forzada para benchmark: 1.337 ms primera / 950 ms caliente; las dos salidas repitieron partes del plan y fueron pragmáticamente peores. Conclusión: el router correcto es NLG.

### I. Chat 1.000+

Se analizaron 1.000 mensajes en 123,94 ms. Context selection conservó 6 recientes + 1 referencia y 754 chars, independientemente del tamaño total.

### J. Cold vs warm Gemma

Primera petición: 1.337,28 ms, sin cache. Warm: 949,97 ms, 53/58 prompt tokens cacheados. Mejora wall aproximada: 29 %. No se confunde esta cifra con startup del modelo.

## 13. Validación

Pasaron:

- `npm run build`
- `npm run test:ai-context`
- `npm run test:language-understanding`
- `npm run benchmark:language-understanding`

Los tests nuevos cubren los casos A–G/J lingüísticos, seis turnos de discurso, routing, memoria conservadora, NLG, cache y contexto acotado. Los tests anteriores de Context Engine y GEMITAV V0/V0.1 siguen pasando.

## 14. Limitaciones reales

- Morfología española V1 es conversacional y acotada; no sustituye un tagger/parser completo.
- EventGraph caliente no tiene tabla propia; persistencia episódica se realiza hoy mediante `ai_memory_records` y provenance.
- El cache de frames es RAM; no se añadió todavía una tabla SQLite de derivados.
- DiscourseState se representa en frame/hot state; no tiene aún tabla independiente.
- MemoryConsolidator existe pero no se agenda automáticamente en background.
- Validation pragmática se aplica principalmente mediante plan/routing y validadores existentes; falta una taxonomía de errores pragmáticos persistida.
- TimeToFirstUsefulOutput de Gemma necesita timestamp del primer delta SSE.
- La prueba de calidad NLG/Gemma es determinista para el caso social; no es todavía un eval humano amplio de naturalness.
- No se añadieron internet, browser, skills, voice, global cross-vault memory, emotion model, agents, cloud embeddings ni vector DB.
- No se añadió conocimiento HIS hardcodeado en production logic; nombres propios solo aparecen en tests/informe.

## 15. Archivos principales

- `src/ai/language-understanding/LanguageUnderstandingPipeline.ts`
- `src/ai/language-understanding/types.ts`
- `src/ai/conversation/EventGraph.ts`
- `src/ai/conversation/HotConversationState.ts`
- `src/ai/conversation/MemoryMaintenance.ts`
- `src/ai/response-engine/ResponsePlan.ts`
- `src/ai/response-engine/LanguageRenderer.ts`
- `src/ai/response-engine/CapabilitySelector.ts`
- `tests/language-understanding-v1.test.mjs`
- `tests/language-understanding-v1-benchmark.mjs`

La dirección resultante es la buscada: HIS entiende, recuerda y planifica; NLG responde cuando basta; Gemma redacta cuando aporta valor.
