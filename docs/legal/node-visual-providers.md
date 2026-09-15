# Proveedores del selector visual

El selector visual usa un único catálogo Unicode/CLDR y renderers locales. Ninguno de estos proveedores requiere red durante el uso normal.

| Componente | Versión incorporada | Uso | Licencia y procedencia |
| --- | --- | --- | --- |
| `lucide-react` | 1.45.0 | Catálogo e importación dinámica de iconos | ISC; algunos iconos derivados de Feather conservan MIT. Copyright Lucide Icons and Contributors y Cole Bemis. Fuente: <https://github.com/lucide-icons/lucide> |
| `lucide-static` | 1.45.0 | Metadatos oficiales de etiquetas usados para generar el índice de búsqueda semántica; dependencia sólo de desarrollo | ISC; misma procedencia que Lucide. No se empaquetan sus copias SVG. |
| `@material-symbols/font-400` | 0.47.2 | Fuente local Material Symbols Rounded a peso 400 y catálogo de ligaduras generado automáticamente desde sus tipos | Apache-2.0. El paquete se actualiza desde los recursos Material Symbols de Google. Fuente: <https://github.com/marella/material-symbols> y origen oficial: <https://github.com/google/material-design-icons> |
| `emojibase-data` | 17.0.0 | Dataset común de Unicode 17 / CLDR 48, nombres, palabras clave y categorías | MIT. Copyright Miles Johnson. Fuente: <https://github.com/milesj/emojibase> |
| `@fontsource/noto-color-emoji` | 5.3.1 | Renderer Noto Emoji offline | SIL Open Font License 1.1. Copyright Google Inc. Fuente tipográfica: <https://github.com/googlefonts/noto-emoji> |
| `@sableclient/twemoji-font` | 1.0.4 | Renderer Twemoji COLR offline, construido desde Twemoji 17.0.2 | El paquete declara Apache-2.0; los gráficos Twemoji de origen requieren atribución CC-BY-4.0. Fuente fijada por el paquete: <https://github.com/jdecked/twemoji/tree/40c2213f8f9bc53b1188fdae325a63a82ffb5bec/v/17.0.2/svg> |

Twemoji graphics are licensed under CC-BY 4.0: <https://creativecommons.org/licenses/by/4.0/>. Copyright 2021 Twitter, Inc. and other contributors. El código de Twemoji se publica bajo MIT.

Las copias completas de las licencias de Lucide, Material Symbols, Emojibase y Noto se distribuyen en sus respectivos paquetes npm. Este aviso conserva además la atribución requerida por los gráficos Twemoji incorporados a la fuente local.

Los índices semánticos se guardan como instantáneas locales. `npm run update:icon-search-metadata` los regenera desde `lucide-static/tags.json` y desde el endpoint de metadatos de Google Fonts; HIS no consulta esos servicios durante el uso normal.
