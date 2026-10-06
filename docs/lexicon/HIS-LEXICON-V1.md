# HIS Lexicon V1

Estado: runtime propio operativo; datasets externos importados localmente fuera del repositorio y no redistribuidos. Auditoría realizada el 2026-09-28.

## Auditoría del sistema previo

| Área | Estado anterior | Decisión V1 |
| --- | --- | --- |
| Normalización | `ConversationQueryResolver`, `NodeContextRetrieval` y `AINodeInspector` repetían NFKD, eliminación de diacríticos, minúsculas españolas y limpieza de puntuación. `ConceptResolver` usaba NFKC sin eliminar acentos. `utils/searchText.ts` tenía una cuarta variante NFD. | Reutilizar `LexicalNormalizer` en la ruta de IA. `searchText.ts` se conserva porque pertenece a búsquedas visuales generales y cambiarlo ampliaría innecesariamente el alcance. |
| Case-insensitive y acentos | Dependía de `toLocaleLowerCase("es")`; algunas búsquedas quitaban acentos y otras no. | Conservar forma original, forma Unicode NFKC, clave plegada y clave secundaria sin diacríticos. La coincidencia secundaria queda marcada como `accent-folded`, no como identidad absoluta. |
| Tokenización | División por espacios o reemplazo de puntuación; sin frases compuestas. | Tokenización Unicode común y selección longest-first de frases conocidas. |
| Stopwords | Dos listas embebidas: una para entidades conversacionales y otra para retrieval; solo español con unas pocas palabras inglesas. | `StopwordRegistry` pequeño, por idioma y con efectos/weight explícitos. La lista conversacional especializada se conserva para seguimiento de tema; retrieval usa el registro central. |
| Entity/alias matching | Nombres de Nodo y aliases de `AIConcept` por coincidencia literal; un prefijo de token podía contar como entidad. | El dominio HIS se resuelve antes que labels dinámicos y devuelve canonical + provenance. Los nombres de Nodo siguen siendo datos documentales, no nuevas definiciones léxicas. |
| Retrieval scoring | Pesos deterministas sobre nombre, headings y contenido; términos normalizados literalmente. | Los pesos no cambian. Solo cambia la producción de términos: stopwords ponderadas, formas canónicas y compuestos. |
| ConversationQueryResolver | Detectaba labels actuales y reconstruía follow-ups con regex. | Mantener su responsabilidad conversacional y alimentarlo con entidades canónicas del Lexicon. |
| ConceptResolver | Coincidencia exacta entre query y nombre/aliases. | Añadir equivalencias canónicas sin mover la construcción de contexto al Lexicon. |
| Singular/plural | No había regla general; solo coincidencia parcial por prefijo. | Solo resolver formas declaradas o importadas. No se aplica stemming heurístico destructivo. |
| Idiomas | UI `es`/`en`; lógica de IA esencialmente española. | API BCP-47 acotada inicialmente a `es`, `en`, `de`, `ja`, `ko`, `ru`, `zh`, `cs`, más `und`. La interfaz no asume español. |
| Recursos/datasets | No había dataset léxico. Existe `docs/legal/` para inventario y licencias. | Extender `docs/legal/lexicon/`; mantener cada fuente separada y cada fila con procedencia. |

Funciones reemplazadas o ampliadas:

- Los `normalize()` privados de `ConversationQueryResolver`, `NodeContextRetrieval` y `AINodeInspector` delegan en `normalizeLexicalText`.
- `NodeContextRetrieval.significantTerms()` consume `LexiconService.analyzeQuery()` en vez de su lista local.
- `ConceptResolver.resolveAIConcepts()` conserva la comprobación de límites y añade canonical forms.
- `AINodeInspector.classifyAINodeIntent()` sigue decidiendo la intención; el Lexicon solo aporta `intentHints`.
- `ConversationQueryResolver` conserva historial y grounding; el Lexicon solo aporta entidades.

## Arquitectura

`LexiconService` orquesta providers ordenados por prioridad. `HISDomainProvider` tiene prioridad 1000; `WiktionaryProvider`, 200; `EnglishWordNetProvider`, 100. Un término desconocido devuelve `raw-fallback` con su texto NFKC, nunca una corrección inventada.

Cada `LexicalEntry` contiene ID estable, canonical, idioma, namespace, categoría, prioridad, POS opcional, forms tipadas, synonyms, translations, intent hints y un objeto `source` obligatorio. Los providers exponen solo capacidades que tienen (`lookup`, y opcionalmente `matchText`, `getSynonyms`, `getTranslations`).

El léxico propio diferencia `Nodo/app` de `Nodo/lore`. Los Nodos del proyecto solo alimentan el resolver documental; un Nodo llamado `Noosfera` no genera otra entrada del lore.

## Formato local

| Formato | Tamaño | Lookup | Actualización | Tauri | Procedencia |
| --- | --- | --- | --- | --- | --- |
| JSON comprimido | Bueno en disco; necesita descompresión/carga | Lineal o índice adicional | Sencilla, reemplazo completo | Fácil | Posible, pero obliga a duplicar índices o cargar demasiado |
| Binario propio | Potencialmente mínimo | Rápido | Difícil de depurar y migrar | Requiere implementación propia | Más difícil de auditar |
| Índices propios | Ajustables | Rápido | Alto coste de mantenimiento | Código adicional | Riesgo de acoplamiento |
| SQLite | Compresión moderada | Índices B-tree y consultas acotadas | Transaccional y versionable | HIS ya usa SQLite/Rusqlite | Columnas de source/licencia y tablas separadas |

Elección: TypeScript para el pequeño HIS Domain Lexicon y SQLite separado por fuente para datasets externos. No es una segunda base conceptual del proyecto: es un artefacto generado, de solo lectura y reemplazable. No se carga completo en RAM. La V1 incluye el esquema/importadores; el empaquetado y el adaptador Tauri del SQLite externo quedan bloqueados hasta aprobar el dataset exacto.

## Cache y performance

El provider propio construye índices `Map` una vez. No se añadió LRU: con el dataset pequeño, medir primero es más barato y evita invalidación. SQLite deberá apoyarse inicialmente en su page cache e índices; solo se añadirá una cache de resultados si el benchmark con el dataset aprobado lo justifica.

Ejecutar:

```text
npm run test:lexicon
npm run benchmark:lexicon
```

El benchmark imprime tokens originales, canonical, stopwords, source, términos significativos, entidades, intent hints y promedio por query. El import local aprobado produjo `../.his-lexicon-data/wiktionary.sqlite` (310.530.048 bytes) y `../.his-lexicon-data/open-english-wordnet.sqlite` (64.053.248 bytes). La metadata completa, hashes, filas, tiempo y RAM pico están en `../.his-lexicon-data/build-metadata.json`.

## Mantenimiento explícito

`npm run lexicon:update` solo muestra el plan y no accede a la red. Con `--approve-large-downloads` exige además `approvalStatus=approved`, URLs directas, tamaños exactos y SHA-256 fijados en `dataset-manifest.json`; entonces descarga a staging temporal, verifica bytes/hash, procesa, genera SQLite y metadata/atribuciones, y elimina el staging. Los importadores también aceptan archivos locales explícitos:

```text
npm run lexicon:import:kaikki -- --input es-extract.jsonl.gz --output wiktionary.sqlite --language es --version 2026-09-02
npm run lexicon:import:wordnet -- --input english-wordnet.json --output open-english-wordnet.sqlite --version 2025
```

No hay descarga al iniciar HIS. Sin bases externas, HIS funciona offline con el provider propio y fallback raw. Las bases locales no están aún en el build ni activadas como recurso de runtime porque la aprobación fue para importación local con `redistribute=false`.

## Alcance deliberadamente excluido

No se modificó Gemma, llama.cpp, embeddings, vector DB, ranking profundo, GraphRAG, reranking, chunks, memory, fine-tuning ni planificación de respuesta.
