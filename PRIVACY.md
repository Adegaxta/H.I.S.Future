# H.I.S. Future — Privacidad V0

Versión: Pre-Distribution V0 · Fecha: 2026-09-06 · Aplicación auditada: 0.1.0, estado Alpha.

Este documento describe el código revisado para Legal V0. Es una revisión estática del repositorio, no una medición de tráfico de todas las plataformas ni una garantía sobre el sistema operativo, el navegador o servicios ajenos. La [auditoría de cierre](docs/pre-distribution-audit.md) enlaza la evidencia.

## Información local

HIS guarda proyectos en la ubicación que el usuario selecciona: archivos `.his` (contenedores ZIP) o carpetas de proyecto compatibles. Incluyen el manifiesto `hisfuture.project.json`, la base SQLite `lore.sqlite` y recursos asociados. La base conserva nombres, identificadores, jerarquía, orden, contenido de nodos, enlaces, metadatos de calendarios/cursos/tareas/vídeos, configuración del proyecto, nodos ocultos y contenido de la papelera. Las URLs que se introduzcan pueden formar parte de ese contenido.

Los PDFs importados se guardan en `resources/pdf/` dentro del proyecto. Sus metadatos incluyen nombre de archivo, tamaño, identificador y hash. Las imágenes importadas o pegadas pueden quedar incorporadas como datos en el HTML guardado, con metadatos como nombre, tamaño, hash y descripción; también pueden existir referencias de imagen a URLs. No todo recurso remoto se convierte automáticamente en una copia local.

Al trabajar con un `.his`, HIS utiliza una carpeta temporal del sistema denominada `hisfuture-project-…`; al guardar genera también un archivo temporal junto al archivo de destino. Hay limpieza de temporales en el código, pero no una garantía de eliminación tras fallos o cierres abruptos. No se encontró cifrado de proyectos ni borrado seguro implementado por HIS. La papelera permite conservar contenido eliminado de la vista habitual.

El almacenamiento local del navegador/WebView (`localStorage`) conserva la lista de proyectos recientes, nombres y rutas, preferencias de idioma, horario y vistas, apariencia/portada, avisos descartados y actividad reciente por identificadores de nodos y marcas de tiempo. El código también lee entradas antiguas de papelera. Su ubicación física depende del perfil del navegador/WebView; no todo está dentro del `.his`.

En Windows, HIS escribe el icono de proyecto en su directorio de datos de aplicación y registra la asociación `.his` en el registro del usuario. Las exportaciones de imágenes se escriben en la ubicación seleccionada. La consola puede mostrar errores, eventos de guardado y el nombre del proyecto a través de los comandos denominados Discord RPC.

Estas ubicaciones sirven para editar, reabrir y organizar proyectos y mantener preferencias. Si una carpeta está sincronizada por software externo, ese software puede tratar sus archivos conforme a su propia configuración y política; no se encontró sincronización propia de HIS.

## Telemetría, analytics y servidores

No se encontraron SDKs ni llamadas de telemetría o analytics propios en el flujo habitual de HIS, ni envío automático de proyectos a un backend propio. Tampoco se encontró infraestructura de servidores HIS implementada o configurada en el repositorio. Esto no acredita la inexistencia de infraestructura fuera de él.

Los comandos `set_discord_presence` y `clear_discord_presence` actualmente solo imprimen en consola local. No se encontró conexión RPC real ni envío a Discord. La actividad reciente guardada localmente no se remite a un servicio de analytics mediante el código revisado.

Existe instrumentación de previsualización en desarrollo, descrita más abajo y excluida del build de producción de prueba. Las funciones de medios y URLs siguen permitiendo conexiones externas.

## Operaciones que pueden conectar con Internet

- Al mostrar un nodo Vídeo con URL remota, el elemento de vídeo o iframe puede iniciar conexiones y solicitar metadatos incluso antes de pulsar reproducir. El código genera embeds de `www.youtube.com` y `player.vimeo.com`; los vídeos directos contactan al servidor de la URL.
- Abrir enlaces de nodos, cursos o recursos utiliza el navegador externo cuando está disponible, con alternativa mediante una ventana del navegador. Descargar un vídeo directo utiliza un enlace al recurso; exportar una imagen realiza `fetch` de su origen, que puede ser remoto.
- Mostrar contenido que contiene imágenes remotas, portadas o recursos HTML puede cargar sus direcciones. Reabrir un proyecto con esos contenidos también puede provocar conexiones; no se requiere volver a pegar la URL.
- El visor PDF actual lee los bytes importados del proyecto y utiliza un worker de PDF.js incluido con la aplicación. No configura un servicio remoto de conversión, ni URLs de CDN para fuentes o CMaps. Esto describe este flujo concreto, no toda capacidad potencial de PDF.js.

Los proveedores externos pueden recibir la dirección IP, la URL solicitada —incluidos parámetros que contenga— y datos técnicos de la conexión/navegador. Según el WebView, navegador y servicio, también pueden intervenir cookies, sesiones o información de referencia. Sus páginas incorporadas pueden realizar solicitudes adicionales a otros dominios y aplicar sus propias políticas de medición. HIS no controla ese tratamiento ni promete anonimato.

## Previsualización y desarrollo

El build de producción de prueba excluye la previsualización HyperIDE mediante una condición de desarrollo en la entrada. Se verificó en el frontend generado la ausencia del chunk de preview, Picsum de prueba y los identificadores data-lui. El plugin Live UI se activa únicamente en el servidor de desarrollo, no durante el build. El runtime normal monta HIS sin depender de esa previsualización.

En desarrollo se conserva el modo test-preview con parámetro component. Puede cargar ejemplos de picsum.photos y comunicar errores, rutas y resultados de renderizado a window.parent mediante postMessage con destino *. Ese comportamiento pertenece al entorno de previsualización; no se encontró en el frontend de producción de prueba. Live UI puede seguir añadiendo rutas/posiciones de código a elementos durante desarrollo.

El entorno de desarrollo usa Vite y conexiones de recarga en caliente; normalmente usa `localhost:1420` y puede usar el host configurado mediante `TAURI_DEV_HOST`. La instalación de dependencias y otras herramientas de desarrollo tiene sus propias conexiones, separadas del uso habitual de proyectos.

## Cambios y cuidado de los datos

Conserva backups independientes de información importante. No se garantiza retención, borrado absoluto ni recuperación. Futuras versiones pueden cambiar estos comportamientos y deberán revisar la fecha, versión y contenido de esta política, especialmente si añaden servicios o telemetría.
