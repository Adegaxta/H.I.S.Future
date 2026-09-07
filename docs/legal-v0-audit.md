> Actualización posterior: Matias Escobedo confirmó ser titular/licenciante del código original como persona natural. Los pendientes y verificaciones de este informe son históricos; véase [cierre pre-distribución](pre-distribution-audit.md).

# Informe técnico/documental — Legal V0 (histórico)

**Registro histórico de la primera revisión.** El esquema de licencia única, el pendiente sobre uso personal y las conclusiones iniciales de procedencia fueron actualizados por [Legal V0.1](legal-v0.1-audit.md). En V0, LICENSE contenía Small Business; ese texto íntegro está ahora en [LICENSE-SMALL-BUSINESS](../LICENSE-SMALL-BUSINESS), mientras LICENSE explica la elección dual. Los anexos de dependencias/assets reflejan V0.1. Las verificaciones que siguen describen V0, no el estado inicial de V0.1.

Fecha: 2026-09-06. Base revisada: commit `dda3f51`, versión de manifiestos 0.1.0. Repositorio inicialmente sin cambios locales. Esta pasada prepara documentos; no declara que HIS esté jurídicamente listo para distribución.

## Resultado y conflictos previos

Antes de redactar se revisaron manifiestos y lockfiles npm/Rust, código frontend y backend, configuración Tauri/Vite, README, documentación existente, archivos gráficos, referencias de fuentes, integración PDF/vídeo, almacenamiento y llamadas de red. No se encontró una licencia principal ni avisos de terceros previos en los archivos versionados inspeccionados.

Se comunicaron los siguientes conflictos o incertidumbres: titular jurídico no identificado; diferencia entre la intención de uso personal gratuito y el alcance expreso de PolyForm Small Business; assets sin procedencia; obligaciones MPL/Unicode/código nativo; y recursos opcionales de PDF.js con licencias específicas. No se resolvieron inventando permisos ni alterando componentes.

## Archivos entregados

- [LICENSE](../LICENSE): texto oficial íntegro.
- [LEGAL.md](../LEGAL.md): modelo, titular pendiente, contenido, servicios, descargas, Alpha, referencia a garantías, marca y contribuciones.
- [PRIVACY.md](../PRIVACY.md): comportamiento y límites verificables.
- [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md): obligaciones y pendientes de terceros.
- [README.md](../README.md): sección añadida; contenido de plantilla conservado.
- Este informe y cuatro anexos: [dependencias](legal/dependency-inventory.csv), [assets](legal/asset-inventory.csv), [textos de terceros](legal/THIRD_PARTY_LICENSES.txt) e [índice de fuentes](legal/license-sources.csv).

## Licencia exacta e identidad

**PolyForm Small Business License 1.0.0**, identificador SPDX `PolyForm-Small-Business-1.0.0`. Descarga directa de la [fuente oficial de texto](https://polyformproject.org/licenses/small-business/1.0.0.txt), enlazada desde la [página oficial](https://polyformproject.org/licenses/small-business/1.0.0). La ruta con barra final devolvió error durante la consulta; se utilizó la página oficial sin barra y su enlace de descarga.

SHA-256 de LICENSE: `2f81e317d36f83a199c9fa10bcb250775fd90510303eaeb15aac2d8f0c1fc2d6`. No se sustituyó el ejemplo del texto ni se añadió copyright de HIS dentro del estándar. Los enlaces de secciones de LICENSE son los originales y no se reescribieron.

No se identificó un titular jurídico acreditado. El placeholder `authors = ["you"]`, el identificador técnico `com.terce.hisfuture` y la identidad de commits no bastan para acreditarlo. El código específico de nodos, editor, proyectos y documentación es código del proyecto a efectos de organización técnica, **no una afirmación de propiedad jurídica exclusiva**. Dependencias, plantilla y material con marcas de generación externa se separan de esa clasificación provisional.

Confirmaciones humanas necesarias:

1. Nombre real del titular o titulares y facultad de conceder las licencias, con cadena de derechos sobre aportes y encargos previos.
2. Aviso propio de copyright, años correctos y eventual línea de Required Notice. H.I.S. Future no sustituye a una persona o entidad real. El ejemplo Yoyodyne de LICENSE no se adopta.
3. Tratamiento de la intención de uso personal gratuito. No se añade una licencia complementaria ni se promete cobertura general de todo individuo. Revisar este punto antes de comunicarlo como permiso concedido.
4. Procedencia y derechos sobre los assets, material incrustado en Illustrator y código de herramientas externas.
5. Condiciones comerciales y canal real de contacto, cuando se decida ofrecerlas; ninguno se inventa en Legal V0.

## Dependencias y evidencia del alcance

Se inspeccionaron `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` y `src-tauri/Cargo.lock`. El inventario conserva versiones, licencias declaradas disponibles y referencias/checksums de registros. Las expresiones declaradas no constituyen por sí solas una inspección de cada archivo incorporado.

`cargo metadata --locked --offline --filter-platform x86_64-pc-windows-msvc --format-version 1` resolvió 389 paquetes, incluido HIS y componentes de compilación. La resolución offline sin filtro de plataforma no pudo completarse por paquetes no almacenados, empezando por `android_system_properties` 0.1.6. No se descargaron ni instalaron dependencias. Las 749 entradas del inventario combinan ambos lockfiles; los paquetes no almacenados de otras plataformas están señalados. La ausencia de una licencia verificada allí es un pendiente, no una licencia permisiva supuesta.

Se inspeccionaron los textos locales de las dependencias directas y familias especiales detalladas en THIRD_PARTY_NOTICES. Se conservaron 65 archivos en 27 secciones deduplicadas por hash, incluidos copyrights reales. La selección no pretende cerrar los avisos de todas las transitivas del futuro binario. Antes de distribuir debe contrastarse ese binario y sus recursos con el inventario, completar avisos faltantes y resolver el alcance MPL. La preparación privada para terceros también requiere esta revisión.

PDF.js se integra por su módulo y worker. Sus fuentes Liberation incluidas en el paquete instalado declaran GPLv2 con excepciones; no se asume que sean OFL ni que se distribuyan actualmente. Las carpetas de fuentes, CMaps y WASM no aparecen en el `dist` preexistente. El visor no configura sus URLs de recursos. Es necesario confirmar la composición del paquete futuro antes de aplicar o descartar sus obligaciones. SQLite incorporado debe auditarse separadamente del wrapper MIT; no se concluye que usar un wrapper cubra todo el código nativo.

No se documenta una incompatibilidad general entre PolyForm y todos los componentes permisivos o MPL encontrados. Sí quedan obligaciones independientes y dudas sobre el contenido final que impiden declarar cumplimiento completo. No se afirma ausencia de copyleft en todo el lockfile, recursos opcionales o plataformas no resueltas.

## Assets y fuentes

El inventario cubre 119 archivos versionados y conserva sus hashes. Se distinguieron logos de plantilla, SVG compatibles visualmente con Material Symbols y diseños HIS/UI sin procedencia acreditada. La semejanza no confirma autoría ni licencia; se exige trazabilidad antes de distribución. `public/vite.svg` está referenciado como favicon. Se inventarió `New Interface.ai` sin editarlo ni interpretar su presencia como prueba de derechos.

CSS referencia fuentes del sistema/instaladas sin archivos de fuente versionados independientes ni `@font-face` de red encontrado. Esto no da derecho a empaquetar Acumin o Segoe UI; tampoco verifica posibles fuentes o gráficos incrustados en Illustrator.

## Matriz de privacidad contra el código

| Afirmación documentada | Evidencia revisada |
| --- | --- |
| Proyectos elegidos por el usuario, manifiesto y SQLite | [fileManager.ts](../src/project/fileManager.ts), [project.rs](../src-tauri/src/project.rs): MANIFEST_FILE, DATABASE_FILE, SCHEMA, create/open/save |
| `.his`, temporales, recursos PDF y limpieza sin garantía | [project.rs](../src-tauri/src/project.rs): temporary_project_folder, zip_directory, remove_temporary_folder, resource_path |
| Papelera, ocultos, idioma y contenido estructurado | [nodeRepository.ts](../src/project/nodeRepository.ts), [settingsRepository.ts](../src/project/settingsRepository.ts), [project.rs](../src-tauri/src/project.rs) |
| Imágenes y metadatos incorporados/referencias remotas | [imageResource.ts](../src/utils/imageResource.ts), [RichTextEditor.tsx](../src/components/RichTextEditor.tsx), [ImageNodeView.tsx](../src/components/ImageNodeView.tsx) |
| Preferencias, rutas recientes y actividad local | [useProjectSession.ts](../src/project/useProjectSession.ts), [AppWorkspace.tsx](../src/components/AppWorkspace.tsx), [useNodeStore.ts](../src/hooks/useNodeStore.ts), [LocaleContext.tsx](../src/i18n/LocaleContext.tsx), [GraphView.tsx](../src/components/GraphView.tsx), [HisTip.tsx](../src/components/HisTip.tsx) |
| YouTube, Vimeo, vídeos directos, enlaces y descargas | [videoSource.ts](../src/utils/videoSource.ts), [NodalViews.tsx](../src/components/NodalViews.tsx), [ImageNodeView.tsx](../src/components/ImageNodeView.tsx) |
| PDF local y worker incluido | [PdfViewer.tsx](../src/components/PdfViewer.tsx), [pdfjs.ts](../src/pdf/pdfjs.ts), [resourceRepository.ts](../src/project/resourceRepository.ts) |
| Discord: consola local con nombre de proyecto, sin RPC real | [App.tsx](../src/App.tsx), [discordPresence.ts](../src/utils/discordPresence.ts), [lib.rs](../src-tauri/src/lib.rs) |
| Registro Windows e icono local | [lib.rs](../src-tauri/src/lib.rs): register_his_file_association |
| Previsualización, Picsum y diagnósticos a ventana padre | [main.tsx](../src/main.tsx), [__canvas_preview__.tsx](../src/__canvas_preview__.tsx): imágenes de ejemplo y postMessage |
| Rutas fuente codificadas en atributos; desarrollo Vite/HMR | [live-ui-editor.babel-plugin.js](../live-ui-editor.babel-plugin.js), [vite.config.ts](../vite.config.ts) |

Se buscaron llamadas `fetch`, apertura de URLs, iframes, carga de imágenes, WebSocket, sendBeacon, XMLHttpRequest, telemetría y analytics, y se leyeron los flujos encontrados. No se identificó infraestructura propia ni envío automático de proyectos en el flujo habitual. Es una conclusión limitada al código inspeccionado; no una certificación de tráfico, de proveedores externos o de infraestructura fuera del repositorio.

PRIVACY afirma almacenamiento local con las excepciones indicadas, ausencia de telemetría/analytics propios encontrados en el flujo habitual, Discord como stub local, conexiones por medios/enlaces remotos, PDF importado local y diagnósticos de previsualización a su contenedor. No promete que nada salga del dispositivo. Las direcciones remotas y sus parámetros pueden revelar información a sus proveedores. El comportamiento del WebView y de esas páginas puede ampliar los destinos de red.

## Pendientes antes de distribuir y aceptar contribuciones

Además de identidad y uso personal: cerrar procedencia de assets/código externo; comprobar texto/avisos de todos los componentes realmente entregados por plataforma; resolver fuentes MPL y recursos PDF opcionales; determinar condiciones del runtime WebView/sistema que se entregue; comprobar que los avisos acompañen efectivamente las copias. El código actual de HyperIDE y los atributos con rutas locales también merecen una decisión separada antes de distribución. No se retiran ni corrigen en esta pasada documental.

El README previo era de plantilla y no invitaba expresamente a contribuciones. Se añadió una nota temporal conservadora. Antes de aportes externos sustanciales: identificar autores y permisos de empleadores/terceros si corresponde, establecer condiciones de entrada explícitas, conservar trazabilidad y asegurar facultades suficientes para licenciamiento comercial alternativo. No basta presumir que toda contribución bajo PolyForm puede relicenciarse; no se inventó cesión ni CLA.

## Validación y límites

Resultado: 54 enlaces locales propios válidos; LICENSE idéntico byte a byte a una segunda descarga oficial; 65 archivos fuente de avisos cotejados por hash y contenido; 119 assets con hashes sin cambios. Los enlaces/ejemplos internos del texto oficial permanecen intactos. Se revisó la consistencia de los documentos con LICENSE, la ausencia de entidad o marca registrada inventadas y la correspondencia de PRIVACY con la matriz anterior. La validación de enlaces se limita a destinos locales; no se certifica disponibilidad futura de URLs externas.

`git diff --check` terminó con código 0, sin errores; Git solo advirtió sobre su conversión habitual LF/CRLF del README. Como los documentos nuevos aún no están versionados, se comprobaron además sus enlaces y espacios finales propios, y la fidelidad de los textos legales copiados, sin añadirlos al índice. No se ejecutó la suite funcional: solo cambian documentos y anexos documentales. No se modificó funcionalidad, UI, arquitectura Nodal, persistencia, configuración, dependencias ni `New Interface.ai`. No se preparó installer/updater, no se generó un build, no se publicó release y no se realizó commit ni push. La configuración de bundle preexistente no fue creada en esta pasada. El trabajo se detiene en Legal V0 para revisión humana.
