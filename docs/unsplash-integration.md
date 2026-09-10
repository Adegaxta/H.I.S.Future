# Integracion de Unsplash

Unsplash es un proveedor opcional. La biblioteca local y los Nodos Imagen locales funcionan sin configurar el proveedor y sin conexion.

## Desarrollo local

1. Copia `.env.example` como `.env.local`.
2. Completa `VITE_UNSPLASH_ACCESS_KEY` con el Access Key de una aplicacion registrada en Unsplash.
3. Ajusta `VITE_UNSPLASH_APP_NAME` si el nombre publico de la aplicacion cambia.

`.env.local` esta excluido por `.gitignore`. No guardes un Secret Key en el repositorio, en un proyecto `.his`, en el frontend ni en logs.

## Resultados y consumo de API

La pestaña Unsplash muestra un lote inicial de fotos aleatorias para explorar. Cada busqueda carga 24 resultados y el scroll del selector carga la pagina siguiente cuando hace falta; el boton "Cargar mas" queda disponible como alternativa. Las recomendaciones aleatorias cargan lotes de 12 fotos adicionales. Cada lote consume una request independiente, por lo que no se solicitan miles de imagenes de una vez.

Durante la sesion activa, las recomendaciones ya cargadas y las paginas de busqueda se reutilizan al volver a abrir el selector o repetir una consulta. Tambien se bloquean cargas concurrentes y se evita repetir el tracking de la misma `download_location`. La cache se reinicia al cerrar o recargar la aplicacion.

El ultimo catalogo visible se guarda como metadatos ligeros en `localStorage`, con un maximo de 60 resultados. Al volver a abrir la aplicacion se restaura sin pedir recomendaciones nuevas. El boton de aleatorizar usa el endpoint de recomendaciones solo cuando el usuario lo solicita explicitamente.

El selector muestra `X-Ratelimit-Remaining` y `X-Ratelimit-Limit` de la ultima respuesta de Unsplash como `Requests restantes`. No se realiza una request extra para consultar la cuota. El indicador representa la Access Key configurada y puede quedar como no disponible si el entorno no expone esos headers.

## Persistencia y cumplimiento

Las fotos seleccionadas conservan la URL hotlinked de `photo.urls.regular` y su provenance en el HTML del Nodo Imagen. Se preservan los parametros de Unsplash, incluido `ixid`; la URL `photo.links.download_location` se conserva solo para el evento de tracking y nunca se usa como `src`.

La seleccion dispara de forma asincrona una peticion autenticada al `download_location`. La atribucion del fotografo y de Unsplash incluye enlaces con `utm_source` y `utm_medium=referral`.

Un recurso remoto puede no estar disponible sin red. Esto no bloquea el modo offline-first ni modifica la biblioteca local. Reemplazarlo por un archivo local elimina su provenance de Unsplash.

## Distribucion

Un Access Key embebido en una aplicacion desktop distribuida puede ser extraido; no debe describirse como secreto. Para una distribucion publica se necesita un proxy controlado por la aplicacion o Dynamic Client Registration de Unsplash. El Secret Key no pertenece a esta aplicacion cliente.