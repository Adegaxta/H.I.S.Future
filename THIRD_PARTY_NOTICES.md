# H.I.S. Future — avisos del build de prueba

Pre-Distribution V0, 2026-09-06. Matias Escobedo es el licenciante del código original, como persona natural. Los terceros conservan sus derechos y licencias; la elección PolyForm no los relicencia. **Persisten bloqueos de procedencia de assets: no se declara cumplimiento completo para distribuir.**

## Textos y alcance real

Los [textos de producción](docs/legal/PRODUCTION_LICENSES.txt), [índice](docs/legal/production-license-sources.csv), [suplementos](docs/legal/production-license-supplements.json) y [componentes](docs/legal/production-components.csv) corresponden al build identificado en la [evidencia](docs/legal/production-build-evidence.json). Los anexos de textos de Legal V0 son históricos.

La selección contiene 223 bibliotecas Rust con artefactos release de runtime y siete paquetes npm del frontend. No cuantifica qué funciones retuvo la optimización del linker; conserva avisos de las entradas de ese runtime. No incluye indiscriminadamente el lockfile ni herramientas/proc-macros. Se agruparon textos idénticos en 136 secciones, más suplementos recuperados de subdirectorios o revisiones oficiales identificadas por .cargo_vcs_info.json. Se preservan copyrights originales, alternativas MIT cuando se ofrecen y obligaciones acumulativas AND, incluidas BSD/Unicode. No se inventan atribuciones.

## Frontend y PDF.js

React/React DOM 19.2.8 y scheduler 0.27.0: MIT. API Tauri 2.11.1, dialog 2.7.2 y opener 2.5.4: avisos de sus paquetes y textos aplicables conservados. El plugin SQL npm no tiene importación de producción revisada; el plugin SQL Rust sí está entre las entradas nativas.

PDF.js 6.3.289: Apache-2.0; se conserva el texto y sus avisos (Copyright 2024 Mozilla Foundation). El frontend incluye el visor y el worker pdf.worker.min-Dswkl-cV.mjs. **El dist real no contiene Liberation/Foxit, CMaps, WASM opcionales ni binarios @napi-rs/canvas.** El visor carga bytes locales y no configura URLs para esos recursos. No se copian sus licencias como si esos archivos se entregaran, ni se concluye que la GPL de Liberation instalada en node_modules alcance a HIS. Revisar si cambia el contenido del paquete.

## Material y otros assets

Los SVG de `src/assets/third-party/google-material/` son Material Symbols / Material Icons importados de Google bajo [Apache-2.0](docs/legal/LICENSE-MATERIAL-APACHE-2.0.txt). Los 28 archivos con cotejo geométrico individual conservan sus comentarios destacados de modificación; los demás mantienen su clasificación por carpeta y su procedencia de familia. Tras retirar solo los comentarios añadidos, los bytes previos de los archivos avisados son idénticos: no cambian geometría ni apariencia. El [registro individual](docs/legal/material-symbols-provenance.md) enumera los archivos cotejados y sus originales. No se encontró NOTICE en la raíz oficial cotejada; no se inventan años o copyrights.

Los iconos activos `src/assets/modified/google-material/icons/lore_active.svg`, `nodetype_active.svg` y `recent_active.svg` se atribuyen a Google Material Symbols / Material Icons bajo Apache-2.0 por confirmacion humana. El glyph, version y revision upstream exactos no pudieron verificarse; la limitacion afecta la trazabilidad historica, no la procedencia declarada. Cada SVG conserva un aviso destacado de modificacion visual por Matias Escobedo.

HISProject.ico tiene creación propia confirmada por el autor; ambas copias son idénticas. La [clasificación A/B/C/D](docs/legal/asset-production-review.csv) registra los demás casos, sin atribuir automáticamente todos los SVG a Matias Escobedo. Persisten assets D dentro de dist y bloquean la distribución hasta acreditar procedencia. Vite/Tauri se trasladaron fuera de public a documentación histórica; se retiró el favicon Vite y React.svg no tiene importación productiva. Esos logos no aparecen en dist.

## Rust y código nativo

Los registros reales indican enlace estático de SQLite, bzip2, liblzma y Zstandard. Los permisos MIT de wrappers no sustituyen los términos del código C. Se conservan los textos de bzip2 1.0.8 y Zstandard 1.5.7, además de los wrappers.

Para liblzma de lzma-sys 0.1.20 se conserva COPYING de XZ: distingue liblzma en dominio público de scripts/herramientas GPL/LGPL. build.rs compila liblzma y dos fuentes comunes; no el conjunto de herramientas xz. No se propagan a HIS las licencias de herramientas por mera presencia en el paquete. SQLite está incorporado por libsqlite3-sys 0.30.1; el wrapper MIT se distingue del código SQLite de dominio público. No se supone inclusión de SQLCipher por existir su carpeta.

El ejecutable referencia DLL del sistema Windows/UCRT y utiliza el loader WebView2. No se entregó instalador ni runtime WebView2. webview2-com-sys incluye el loader/SDK Microsoft 1.0.3650.58. Se cotejó su WebView2LoaderStatic.lib x64 con el paquete oficial Microsoft de esa versión: ambos tienen SHA-256 0659b741bde6348d4c4a6ec4ceb9af50e3d0048ed9cd3c8659bccbb61fde55ee. Se conservan íntegros [LICENSE del SDK](docs/legal/WEBVIEW2-SDK-LICENSE.txt) y [NOTICE del SDK](docs/legal/WEBVIEW2-SDK-NOTICE.txt), obtenidos del [paquete oficial](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.3650.58). Sus condiciones de redistribución incluyen conservar copyright, condiciones y exención, y no usar nombres para promocionar productos sin permiso; no se asignó MIT del wrapper al loader. Se mantiene el NOTICE tal como se entrega, sin afirmar que cada subcomponente nombrado esté en el loader. Este cotejo cierra el pendiente del loader de este build; no instala ni licencia por extensión cualquier runtime futuro. Los imports PE se registran en la evidencia; referenciar DLL del sistema no significa que se hayan copiado a una entrega.

## MPL

cssparser, cssparser-macros, selectors y dtoa-short aparecen en artefactos de herramientas (opt_level 0/proc-macro), sin artefacto release de runtime observado. No se declaran entregados solo por aparecer en el lockfile.

option-ext 0.2.0 sí tiene artefacto release de runtime. No se certifica retención de su código máquina tras el linker; se cubre conservadoramente con MPL-2.0 y la [fuente exacta](docs/legal/sources/option-ext-0.2.0.crate), sin cambios locales de esta tarea. SHA-256: 04744f49eae99ab78e0d5c0b603ab218f515ea8cfe5a456d7629ad883a3b6e7d. La fuente cubierta se ofrece bajo MPL-2.0 y PolyForm no limita esos derechos. No se concluye que HIS sea globalmente MPL/GPL. [Referencia oficial Mozilla](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

## Documentación acompañante

Se prepara una carpeta de revisión junto al ejecutable con licencias, NOTICE, estos avisos, textos de terceros y fuente MPL. El ejecutable aislado no constituye una entrega documental completa. Véase el [informe de cierre](docs/pre-distribution-audit.md) para bloqueos y límites. Sin installer, updater ni release.
