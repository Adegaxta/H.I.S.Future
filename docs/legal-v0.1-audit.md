> Actualización posterior: Matias Escobedo confirmó ser titular/licenciante del código original como persona natural. Los pendientes y verificaciones de este informe son históricos; véase [cierre pre-distribución](pre-distribution-audit.md).

# Informe Legal V0.1

Fecha: 2026-09-06. Revisión documental posterior a Legal V0. No inicia Distribution V0. El informe V0 se conserva como [registro histórico](legal-v0-audit.md), incluida su matriz de privacidad; las conclusiones sobre licencias y procedencia que siguen sustituyen las iniciales.

## Cambios documentales

Actualizados: [LICENSE](../LICENSE), [LEGAL.md](../LEGAL.md), [README.md](../README.md), [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md), informe histórico V0, [inventario de assets](legal/asset-inventory.csv) y únicamente la fila de HIS en el [inventario de dependencias](legal/dependency-inventory.csv).

Creados: [LICENSING.md](../LICENSING.md), [LICENSE-NONCOMMERCIAL](../LICENSE-NONCOMMERCIAL), [LICENSE-SMALL-BUSINESS](../LICENSE-SMALL-BUSINESS), este informe, [registro individual Material Symbols](legal/material-symbols-provenance.md) y [texto Apache oficial de Google](legal/LICENSE-MATERIAL-APACHE-2.0.txt). PRIVACY.md y los textos de paquetes de terceros conservados en V0 no requieren modificaciones.

## Licencias alternativas y fuentes

HIS se ofrece bajo **PolyForm Noncommercial License 1.0.0 O PolyForm Small Business License 1.0.0**. El usuario puede elegir cualquiera para la que su uso califique; debe cumplir íntegramente esa alternativa, sin obligación de satisfacer ambas ni combinación de cláusulas.

- [Noncommercial, fuente oficial completa](https://polyformproject.org/licenses/noncommercial/1.0.0.txt): uso personal/no comercial cubierto, gratuito; considerar las condiciones de Personal Uses y también Noncommercial Organizations.
- [Small Business, fuente oficial completa](https://polyformproject.org/licenses/small-business/1.0.0.txt): uso gratuito para freelancers, estudios indie y pequeños negocios que cumplan sus términos. No se alteran los límites de menos de 100 empleados/contratistas y facturación inferior al umbral de 1.000.000 USD de 2019 ajustado por el índice oficial, ni la definición de organizaciones vinculadas.

Un uso comercial no cubierto por ninguna requiere términos comerciales separados del licenciante. No se infiere una obligación de pago para una organización concreta sin evaluar ambas alternativas y su uso. No se inventan precios, excepciones, contratos o permisos adicionales. Las licencias no se presentan como OSI Open Source.

El pendiente conceptual de V0 sobre uso personal se aborda mediante la alternativa estándar Noncommercial elegida expresamente por el usuario, sin modificar Small Business. Sigue pendiente confirmar identidad jurídica del titular, facultades sobre el material y eventual aviso de copyright/Required Notice. H.I.S. Future no se convierte en nombre de entidad jurídica. Los terceros conservan sus licencias independientes.

SHA-256 de los textos íntegros:

| Archivo | SHA-256 |
| --- | --- |
| LICENSE-NONCOMMERCIAL | ffcca38841adb694b6f380647e15f17c446a4d1656fed51a1e2041d064c94cc8 |
| LICENSE-SMALL-BUSINESS | 2f81e317d36f83a199c9fa10bcb250775fd90510303eaeb15aac2d8f0c1fc2d6 |

LICENSE es ahora una nota de elección; no se presenta como un tercer texto estándar ni como modificación de los dos textos oficiales. LICENSING.md contiene la explicación. Sus respectivas cláusulas Notices y No Liability permanecen intactas.

## Procedencia: evidencia humana y cotejo individual

La declaración humana de esta revisión confirma el uso de iconos de Google Fonts Icons y modificaciones visuales sobre algunos, la creación propia del icono .his y el diseño de interfaz/gráficos originales HIS con excepción de terceros identificables. Es evidencia de procedencia declarada, sin completar el nombre jurídico ni resolver automáticamente cada archivo del conjunto.

Se confirmaron **28 archivos Material Symbols** por coincidencia de viewBox y secuencia de comandos/números de todos sus trazados. Las comparaciones normalizan separadores; no se basan solo en nombre, color o parecido. Los originales se fijan al commit `0cbb08816df07faaae3dca060d4ebb10b66c214f` del repositorio oficial de Google. El inventario y registro individual incluyen correspondencias, hashes y diferencias observadas de atributos, como fill y dimensiones. No se afirma que el SVG completo sea idéntico ni que se haya determinado la fecha histórica de descarga.

La [guía oficial de Material Symbols](https://developers.google.com/fonts/docs/material_symbols) y el [repositorio oficial de Material Symbols / Material Icons](https://github.com/google/material-design-icons) confirman Apache-2.0. Se conserva su [LICENSE en la revisión fijada](https://raw.githubusercontent.com/google/material-design-icons/0cbb08816df07faaae3dca060d4ebb10b66c214f/LICENSE). No se encontró NOTICE en la raíz inspeccionada; eso no exime de conservar avisos que acompañen otras versiones o archivos utilizados. El registro destaca modificaciones observadas; queda pendiente asegurar los avisos en archivos modificados conforme a Apache 4(b) antes de distribuir. No se modifica UI ni se insertan comentarios en assets en esta pasada.

Las dos copias de HISProject.ico, en src/assets/icons y src-tauri/icons, son idénticas. Su procedencia queda resuelta para la auditoría por la declaración de creación propia del usuario, con identidad jurídica aún pendiente. No se extiende esa declaración a todos los iconos de aplicación.

Los diseños HIS/UI quedan registrados como originales declarados a nivel de conjunto; confirmar correspondencia individual donde todavía sea ambigua. Los iconos sin coincidencia, posibles modificaciones de geometría, logos React/Vite/Tauri de plantilla, public/coso, variantes gráficas no identificadas y material incrustado en Illustrator permanecen pendientes. No obtener coincidencia con las variantes oficiales consultadas no demuestra autoría propia ni descarta un origen Google histórico.

La búsqueda de archivos WOFF/WOFF2/TTF/OTF/EOT en src, public y dist no encontró fuentes independientes. Acumin permanece como nombre CSS de fuente local; coincide con la declaración de no empaquetado consciente, sin certificar contenidos incrustados. No se inspeccionó un nuevo bundle ni se instaló ninguna fuente.

## HyperIDE: origen, propósito e inclusión

| Archivo / evidencia | Papel verificado |
| --- | --- |
| src/main.tsx, marca @hyperide-managed | Elige el modo de previsualización cuando la ruta contiene test-preview y existe el parámetro component. En caso contrario monta App. |
| src/__canvas_preview__.tsx, marca @hyperide-preview-schema:fallback-props-v15 | Registro de componentes, datos de ejemplo, manejo de errores y comunicación con el contenedor mediante mensajes hypercanvas. Propósito de previsualización de componentes. |
| .hyperide/project-structure.json, _generated: true | Clasifica rutas de componentes y pantallas para la herramienta. |
| .liveui.json | Estado del inspector/editor visual. No acredita por sí solo licencia ni fabricante jurídico. |
| live-ui-editor.babel-plugin.js | Plugin de transformación JSX: añade data-lui con ruta de archivo y posición codificadas. Su comentario dice dev only, pero no impone esa condición en el código. |
| vite.config.ts | Registra ese plugin sin condición de modo; por ello participa también en la configuración de compilación existente. |
| dist/assets/__canvas_preview__-1-ATvZ7z.js y referencia desde el JS principal existente | Evidencia de que la previsualización se incluye como chunk separado en ese dist, sin haberlo reconstruido. |

El historial sitúa esos archivos de tooling y la entrada modificada en el commit inicial `f0259d5`. Las marcas y archivos generados permiten atribuir su **origen técnico a la integración HyperIDE/Live UI**. No se encontró en el repositorio un contrato, licencia o versión del proveedor que determine derechos de redistribución; tampoco se identifica al autor jurídico a partir de nombres de commits. No se adjudica el prototipo hisfuture-design-proto.jsx a HyperIDE sin evidencia específica.

**Por qué está en dist:** la importación dinámica de un módulo local en main.tsx es una dependencia que el compilador puede resolver; la condición es una URL evaluada en ejecución, sin exclusión de producción. La presencia del chunk y su referencia en el dist existente respaldan esa explicación. No se confunde presencia con ejecución incondicional: en el arranque habitual se monta App; la previsualización se activa por la condición descrita. Es tooling por propósito con código disponible en el runtime del frontend, no una dependencia exclusivamente de desarrollo efectivamente excluida. El plugin Babel, en cambio, opera al transformar código; sus atributos quedan en el resultado.

La previsualización puede cargar ejemplos de Picsum y enviar a window.parent errores, rutas y eventos de renderizado, como ya describe PRIVACY.md. No se prueba con ello una conexión a servidores propios de HyperIDE. No se elimina, desactiva ni modifica nada.

## PDF.js y demás terceros

Sin cambios de código, paquetes o configuración por precaución. Se mantienen los avisos de V0 y la verificación pendiente contra el bundle real de Distribution V0 por plataforma. Los recursos opcionales de PDF.js, fuentes Liberation con GPLv2/excepciones y componentes MPL deben evaluarse según lo realmente incorporado. **No hay evidencia para concluir que HIS herede GPL o MPL globalmente.** Esta revisión no cierra la composición del futuro paquete ni inicia esa fase.

## Pendientes y alcance de la validación

Pendientes: identidad/cadena de derechos y avisos del licenciante; identificación de assets no resueltos y modificaciones de terceros; cumplimiento de avisos en los archivos Material modificados; términos del código HyperIDE; composición y avisos del paquete futuro, fuentes cubiertas si corresponde y política de contribuciones compatible con alternativas comerciales.

Al comenzar V0.1, Git ya mostraba `D src/assets/New Interface.ai`, además de los documentos de V0 sin commit. Se registró esa ausencia como estado preexistente, sin restaurarla ni atribuirla a esta revisión. La comparación de integridad de V0.1 usa el estado inicial de esta revisión, no supone que el archivo siga presente como en V0.

Validación completada: 83 enlaces locales válidos; ambas licencias PolyForm y el LICENSE de Google idénticos byte a byte a una segunda descarga oficial; 232 entradas no documentales comparadas contra el estado inicial sin cambios, incluida la ausencia preexistente de New Interface.ai y los archivos de dist. El JS principal existente contiene la referencia al chunk de previsualización, la condición test-preview y atributos data-lui. SHA-256 del LICENSE de Google conservado: `58d1e17ffe5109a7ae296caafcadfdbe6a7d176f0bc4ab01e12a689b0499d8bd`.

`git diff --check` terminó con código 0, sin errores. Git solo advirtió de conversión habitual LF/CRLF del README. Como hay documentos nuevos sin versionar, se comprobaron además sus enlaces y espacios finales propios, sin añadirlos al índice; los textos legales copiados se comprobaron contra las fuentes, conservando su formato original.

No se cambió funcionalidad, UI, arquitectura Nodal, persistencia, dependencias ni configuración. No se ejecutó build ni se modificó dist. Sin installer, updater, release, commit o push. El trabajo se detiene en Legal V0.1.
