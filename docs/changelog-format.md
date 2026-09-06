# Formato de las próximas versiones

Usar la estructura de v0.5.0, con traducciones completas como en v0.5.1:

- Versión, fecha y categoría.
- Título temático estilo Minecraft, seguido del nombre de la actualización cuando corresponda.
- Resumen breve del propósito de la versión.
- Secciones temáticas con títulos y listas de cambios concretos.
- Correcciones al final, marcadas con kind: "fix".

CURRENT_RELEASE en src/defs/changelog.ts exige resumen y secciones mediante ReleaseChangelogEntry. Cada título, resumen, encabezado y cambio nuevo utiliza claves con textos equivalentes en ES_TRANSLATIONS y EN_TRANSLATIONS. La versión anterior conserva su número literal al avanzar CURRENT_VERSION. El renderer admite las entradas históricas sin alterar su contenido.

Describir lo implementado, sin anunciar Audio ni otras capacidades hipotéticas como funcionalidades. No prometer recuperación automática, validación interactiva o garantías que todavía no se hayan implementado o comprobado. No reemplazar secciones por una lista plana en las próximas entradas.
