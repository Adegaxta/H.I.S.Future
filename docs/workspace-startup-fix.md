# Recuperación del arranque del espacio de trabajo

Se reprodujo la ventana vacía en el ejecutable Tauri con un perfil WebView temporal. El backend abría el proyecto, pero algunas descargas de módulos de desarrollo fallaban con `net::ERR_NETWORK_CHANGED`. El rechazo de la importación diferida del espacio de trabajo llegaba a React sin un límite de errores y desmontaba la interfaz.

La importación estática del catálogo completo de Lucide compartía fragmentos con las importaciones dinámicas de iconos. En desarrollo esto obligaba a solicitar miles de fragmentos al abrir el espacio de trabajo. Los cinco iconos estáticos utilizados por el espacio de trabajo y las pestañas ahora se importan por sus entradas individuales. Los selectores de iconos mantienen el catálogo dinámico.

La carga del espacio de trabajo comparte una única promesa entre la precarga y React. Un fallo de descarga anterior al montaje permite una sola recarga del documento: el proyecto nativo sigue abierto. Si el fallo persiste, o aparece un error al renderizar, se muestra una pantalla con «Volver a cargar». Los rechazos de precarga ya no quedan sin manejar. No se añaden recargas automáticas durante la edición.

## Verificación

- Comprobación de tipos, catálogos de idiomas y compilación de producción correctas.
- Ejecutable Tauri real, perfil temporal: Inicio → baúl DEV → nodo Proyecto → editor. La prueba registra 315 solicitudes, sin solicitar el catálogo estático completo de Lucide.
- Descarga del espacio de trabajo interrumpida deliberadamente: recuperación automática y apertura del editor.
- Fallo persistente deliberado: pantalla de recuperación tras un único intento automático; botón de recarga recupera el editor al restablecer la descarga.
- Prueba reproducible: `node tests/workspace-startup.browser.mjs --native`, con Vite en el puerto 1420 y el ejecutable de depuración compilado. Opciones `--fail-import` y `--persistent-failure` verifican la recuperación. Usa un perfil temporal independiente y un baúl DEV del proceso de prueba.

No se modificó el baúl del usuario ni se detuvo su proceso de HIS. Se conservaron los cambios locales anteriores.
