# Cierre Legal / Pre-Distribution V0

2026-09-06. Se ejecutó un único build de producción de prueba con `npm run tauri -- build --no-bundle -- --message-format=json`. **No está listo para distribuir: quedan los bloqueos concretos indicados al final.** Esta conclusión no cuestiona la identidad confirmada ni inventa permisos para cerrar los otros pendientes.

## 1. Archivos y cambios

- src/main.tsx: condición `import.meta.env.DEV` para la entrada de preview.
- vite.config.ts: plugin Live UI solo en `command === "serve"`.
- index.html: retirada de referencia al favicon de plantilla Vite.
- public/vite.svg y public/tauri.svg trasladados a docs/legal/template-assets, sin alterar su contenido. React.svg conservado fuera del grafo de producción.
- Los 28 SVG enumerados en [material-symbols-provenance.md](legal/material-symbols-provenance.md): únicamente comentario destacado de modificación, sin cambios de representación.
- NOTICE creado; LICENSE, LICENSING.md, LEGAL.md y README actualizados con Matias Escobedo. Textos estándar PolyForm intactos.
- THIRD_PARTY_NOTICES.md y PRIVACY.md actualizados; informes V0/V0.1 identificados como históricos. Inventarios actualizados y anexos de evidencia, componentes, textos, suplementos y fuente option-ext añadidos bajo docs/legal.
- dist y ejecutable de prueba generados en target/release; carpeta documental acompañante preparada para revisión. No se añadió nada al índice ni se hizo commit/push.

## 2. Identidad, copyright y Required Notice

**Matias Escobedo, persona natural, es el titular/licenciante actual del código original de HIS**, según confirmación humana expresa. H.I.S. Future / HIS es el nombre del proyecto/producto, no persona jurídica. No se atribuye registro de marca ni se crea empresa.

[NOTICE](../NOTICE) contiene la línea `Required Notice: Copyright Matias Escobedo`. El prefijo y estructura corresponden a Notices de las dos licencias oficiales. Se mantiene fuera de sus textos estándar, sin inventar URL ni rango de años de creación. El aviso identifica el copyright del código original; no reclama propiedad sobre terceros. No queda pendiente el nombre jurídico confirmado.

El esquema sigue siendo Noncommercial 1.0.0 **O** Small Business 1.0.0, alternativas no acumulativas, con los textos completos sin modificaciones en [LICENSE-NONCOMMERCIAL](../LICENSE-NONCOMMERCIAL) y [LICENSE-SMALL-BUSINESS](../LICENSE-SMALL-BUSINESS). Véase [LICENSING.md](../LICENSING.md).

## 3. Material y clasificación de assets

Se añadieron comentarios destacados en cada uno de los 28 SVG ya cotejados. Describen diferencias de presentación frente al original de Google y remiten al registro Apache-2.0. Al retirar exclusivamente el comentario añadido, cada archivo coincide byte por byte con su versión previa: se preservaron geometría, apariencia y atributos. La lista completa está en el registro Material; no se trataron los demás SVG como Google.

[asset-production-review.csv](legal/asset-production-review.csv) clasifica A (propio confirmado/declarado identificable), B (tercero identificado), C (plantilla fuera de producción), D (pendiente), y diferencia aparición comprobada en dist de falta de confirmación. Las copias HISProject.ico quedan en A por creación propia confirmada. Los gráficos HISFuture identificados con el producto se registran conforme a la declaración de diseño original, no como marca registrada. No se generaliza esa atribución a todos los gráficos.

Actualización Legal V0.4: la reorganización no añadió assets; los 95 archivos actuales bajo `src/assets/` corresponden a la revisión anterior con rutas nuevas. `src/assets/original/` se clasifica A por creación propia de Matias Escobedo; `src/assets/modified/google-material/` se clasifica B por derivación Google Material y modificación visual de Matias Escobedo; `src/assets/third-party/google-material/` se clasifica B por importación de Material Symbols / Material Icons bajo Apache-2.0. Los hashes fueron comprobados contra los archivos actuales en ambos inventarios. El archivo provisional `New Interface.ai` fue eliminado y retirado de los inventarios.

Los logos Vite/Tauri se retiraron de public y del uso productivo; no aparecen en dist. No se eliminó el tooling de desarrollo. Los CSV guardan hashes históricos y actuales por separado; el inventario V0.1 no debe interpretarse como hash posterior a los comentarios de cumplimiento.

No persisten D del frontend en producción: `public/coso/` fue eliminado junto con sus tres SVG y `New Interface.ai` fue retirado del proyecto. Los D restantes de `src-tauri/icons/` no tienen evidencia de distribución en el frontend `dist`.

## 4. HyperIDE / Live UI

Su propósito es previsualización/inspección de desarrollo. Se conserva en el repositorio y en el servidor de desarrollo. La entrada normal sigue montando App. La condición estática DEV permite excluir el import dinámico en producción; el plugin Babel no se activa en build.

La [evidencia del build](legal/production-build-evidence.json) registra ausencia en JS/CSS/HTML/worker de `__canvas_preview__`, `hypercanvas`, `HyperIDE`, `test-preview`, `picsum.photos` y `data-lui`. No hay chunk de preview en dist. No se limita esta conclusión a una inspección de configuración: se comprobó el resultado del build real. No se afirma que un archivo .pdb o cualquier ruta de diagnóstico nativa equivalga a Live UI. No se distribuye el código de tooling con el ejecutable de prueba; sus términos siguen siendo relevantes si se entrega el repositorio completo con ese tooling.

## 5. Build real y recursos

El build terminó correctamente en modo release y generó **hisfuture.exe (16.105.984 bytes)**, SHA-256 `c8bc4b7251c75663e6b10669760c2a6f296fe32626f7610386eb2a2aad66ef7b`. La evidencia JSON enumera tamaños/hashes de los nueve archivos dist y del ejecutable, e imports PE. El archivo .d del ejecutable referencia los recursos dist utilizados. No se generó installer ni paquete NSIS/MSI.

dist contiene index.html, JS y CSS principales, logo/icono HISFuture y el worker PDF.js. Los SVG pequeños importados pueden estar incorporados dentro del JS/CSS; no se confundió ausencia de archivo separado con ausencia del producto. Los .lib/.dll/.pdb auxiliares de Cargo no se consideran automáticamente archivos a entregar.

**PDF.js:** se incluye el módulo usado por el visor y el worker de 1.265.413 bytes. No hay archivos de fuentes Liberation/Foxit, CMaps ni WASM opcionales, ni binarios canvas. Tampoco se encontraron fuentes comerciales Acumin/WOFF/TTF/OTF/EOT en el dist real. No se concluye sobre fuentes incrustadas en documentos que el usuario importe en el futuro.

**Nativo:** registros de build muestran `static=sqlite3`, `static=bz2`, `static=lzma` y `static=zstd`. El wrapper webview2-com-sys enlaza WebView2LoaderStatic en Windows. El PE referencia DLL de Windows y UCRT; no se copió un runtime WebView2 ni redistribuibles del sistema a un installer. No se deduce que todos los archivos presentes en target o caché deban redistribuirse.

## 6. MPL y avisos

La [evidencia de compilación](legal/production-compilation-evidence.json) separa tipo de artefacto, nivel de optimización y features. cssparser, cssparser-macros, selectors y dtoa-short fueron compilados para herramientas, sin artefacto release de runtime observado. option-ext 0.2.0 sí tiene artefacto release de runtime. No se afirma que necesariamente conserve código máquina tras optimización; se cubre conservadoramente con MPL-2.0 y su [fuente exacta](legal/sources/option-ext-0.2.0.crate), para evitar restringir los derechos cubiertos. No se declara HIS globalmente MPL/GPL.

[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) remite a los textos de 223 bibliotecas Rust de runtime y siete paquetes npm, con suplementos de procedencia fijada a revisiones upstream. Los avisos de MIT/Apache/BSD/Unicode y nativos se preservan; no se usa el lockfile como única prueba de inclusión. La selección es de entradas de runtime, no un análisis de cada función eliminada por linker. No se presenta como libre de pendientes: los assets D siguen pendientes; el loader Microsoft se cotejó posteriormente como se detalla abajo.

La documentación acompañante se copia junto al ejecutable para revisión, con licencias PolyForm, NOTICE, textos de terceros y fuente MPL. El binario aislado no incluye por sí mismo todos esos avisos. No se instaló ni distribuyó a terceros este resultado.

## 7. Privacidad

[PRIVACY.md](../PRIVACY.md) contextualiza Picsum/HyperIDE como desarrollo, excluido del frontend de producción comprobado. Se mantienen las conexiones reales de vídeos, embeds, URLs, imágenes remotas y navegadores externos. No se promete offline absoluto, anonimato ni ausencia universal de transmisión. No cambió almacenamiento/persistencia ni se implementó Discord RPC.

## 8. Validación técnica

| Comprobación | Resultado |
| --- | --- |
| Un build Tauri release --no-bundle, con tsc + Vite | Correcto; sin installer. Advertencia de tamaño de chunks y función Rust current_project no usada. |
| cargo check --locked | Correcto; misma advertencia dead_code preexistente. |
| cargo fmt --check | Correcto. |
| npm run test:nodal | Correcto: nodal, invariantes de importación y contexto UX. |
| cargo test --locked | 13 tests correctos, 0 fallos; restantes targets/doc-tests sin tests. Una primera invocación desde la raíz no encontró Cargo.toml; se corrigió el directorio y se ejecutó la suite completa. |
| Comparación de 28 SVG y revisión de 3 derivados | Contenido previo intacto salvo comentarios de aviso; los tres derivados conservan viewBox y trazados. |
| git diff --check | Correcto; solo avisos habituales de conversión LF/CRLF. |

No se corrigieron bugs funcionales no relacionados ni se alteró arquitectura/persistencia/dependencias. Los cambios técnicos se limitan a excluir tooling y recursos de plantilla autorizados y a avisos no visuales. No se hizo una prueba manual exhaustiva de todos los flujos de escritorio; el build y los tests no sustituyen esa prueba.

## 9. Bloqueos restantes y límite de esta entrega

1. **Assets D incorporados:** confirmar su procedencia/licencia individual. El CSV da la lista concreta; la declaración general de diseño original no se transformó en autoría universal.
2. **Loader Microsoft resuelto:** se obtuvo el paquete oficial [Microsoft.Web.WebView2 1.0.3650.58](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.3650.58), sin instalarlo ni cambiar dependencias. El loader x64 tiene el mismo SHA-256 que el incluido en webview2-com-sys: 0659b741bde6348d4c4a6ec4ceb9af50e3d0048ed9cd3c8659bccbb61fde55ee. Se conservaron LICENSE y NOTICE originales del SDK en docs/legal/WEBVIEW2-SDK-LICENSE.txt y WEBVIEW2-SDK-NOTICE.txt. El LICENSE permite redistribuir sujeto a sus condiciones y sus avisos acompañan la revisión; ya no queda ese bloqueo para este loader. No se instaló un runtime adicional.
3. La eventual entrega del repositorio completo requiere resolver términos de HyperIDE y assets históricos, aunque queden fuera del ejecutable. La futura selección del paquete debe preservar los avisos acompañantes y fuente MPL.

Por los assets D pendientes **no se emite “Pre-Distribution V0 ready for human review.”** La identidad de Matias Escobedo sí está cerrada con la confirmación recibida. No se inventó una incompatibilidad global PolyForm/MPL/GPL; se reportan pendientes concretos.

No se crearon installer final, updater, claves, latest.json, release ni publicación. Sin commit/push, cambios de monetización, CLA, cuentas, nuevas features o integración Discord. El archivo New Interface.ai ya estaba ausente al comenzar y no se restauró. La tarea se detiene antes de Distribution V0.
