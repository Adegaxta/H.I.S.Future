import { normalizeSearchText } from "../../utils/searchText";

// Shared concepts, not icon-by-icon translations. Official provider tags remain
// the source of truth; these groups only bridge common English/Spanish queries.
const SEMANTIC_CONCEPTS: readonly (readonly string[])[] = [
  ["interface", "ui", "layout", "panel", "window", "controls", "navigation", "design", "interfaz", "diseno", "paneles", "ventana", "controles", "navegacion"],
  ["home", "house", "start", "inicio", "casa", "principal"],
  ["settings", "configuration", "preferences", "options", "gear", "configuracion", "ajustes", "preferencias", "opciones", "engranaje"],
  ["search", "find", "magnifier", "buscar", "busqueda", "encontrar", "lupa"],
  ["image", "photo", "picture", "camera", "imagen", "foto", "fotografia", "camara"],
  ["calendar", "date", "event", "schedule", "calendario", "fecha", "evento", "agenda", "horario"],
  ["time", "clock", "timer", "watch", "tiempo", "hora", "reloj", "temporizador"],
  ["user", "person", "account", "profile", "people", "usuario", "persona", "cuenta", "perfil", "gente"],
  ["file", "document", "page", "archivo", "documento", "pagina"],
  ["folder", "directory", "archive", "carpeta", "directorio", "archivo"],
  ["edit", "write", "pen", "pencil", "modify", "editar", "escribir", "lapiz", "modificar"],
  ["delete", "trash", "remove", "erase", "eliminar", "borrar", "quitar", "papelera"],
  ["add", "plus", "create", "new", "anadir", "agregar", "crear", "nuevo"],
  ["close", "cancel", "dismiss", "cerrar", "cancelar"],
  ["menu", "list", "navigation", "sidebar", "menu", "lista", "navegacion", "barra lateral"],
  ["notification", "alert", "bell", "warning", "notificacion", "alerta", "campana", "advertencia"],
  ["message", "chat", "mail", "communication", "mensaje", "conversacion", "correo", "comunicacion"],
  ["security", "shield", "protect", "privacy", "seguridad", "escudo", "proteger", "privacidad"],
  ["lock", "key", "password", "unlock", "bloqueo", "candado", "llave", "clave", "desbloquear"],
  ["video", "movie", "film", "play", "camera", "pelicula", "reproducir", "camara"],
  ["audio", "music", "sound", "volume", "speaker", "musica", "sonido", "volumen", "altavoz"],
  ["location", "map", "pin", "place", "navigation", "ubicacion", "mapa", "lugar", "navegacion"],
  ["upload", "cloud", "import", "subir", "nube", "importar"],
  ["download", "save", "export", "descargar", "guardar", "exportar"],
  ["link", "chain", "attach", "url", "enlace", "vinculo", "adjuntar"],
  ["favorite", "heart", "star", "bookmark", "favorito", "corazon", "estrella", "marcador"],
  ["visibility", "view", "eye", "show", "hide", "visibilidad", "vista", "ojo", "mostrar", "ocultar"],
  ["color", "theme", "palette", "paint", "appearance", "tema", "paleta", "pintura", "apariencia"],
  ["chart", "graph", "analytics", "statistics", "grafico", "analitica", "estadistica"],
  ["money", "finance", "payment", "wallet", "bank", "dinero", "finanzas", "pago", "billetera", "banco"],
  ["shop", "cart", "store", "bag", "shopping", "tienda", "carrito", "bolsa", "compras"],
  ["travel", "transport", "car", "plane", "train", "viaje", "transporte", "auto", "avion", "tren"],
  ["weather", "sun", "rain", "cloud", "snow", "clima", "sol", "lluvia", "nube", "nieve"],
];

const CONCEPT_BY_TERM = new Map<string, readonly string[]>();
for (const concept of SEMANTIC_CONCEPTS) {
  const normalized = [...new Set(concept.map(normalizeSearchText))];
  for (const term of normalized) CONCEPT_BY_TERM.set(term, normalized);
}

export function getSemanticQueryGroups(query: string): readonly (readonly string[])[] {
  return normalizeSearchText(query).trim().split(/\s+/).filter(Boolean).map((term) => CONCEPT_BY_TERM.get(term) ?? [term]);
}

export function matchesSemanticQuery(searchableText: string, query: string): boolean {
  const searchable = normalizeSearchText(searchableText).replace(/[-_]/g, " ");
  const paddedSearchable = ` ${searchable} `;
  return getSemanticQueryGroups(query).every((alternatives) => alternatives.length === 1
    ? searchable.includes(alternatives[0])
    : alternatives.some((term) => paddedSearchable.includes(` ${term} `)));
}

function bestGroupScore(text: string, alternatives: readonly string[], semantic: boolean, weight: number): number {
  const padded = ` ${text} `;
  let score = 0;
  for (const term of alternatives) {
    const matches = semantic ? padded.includes(` ${term} `) : text.includes(term);
    if (matches) score = Math.max(score, weight + Math.min(term.length, 20));
  }
  return score;
}

export function scoreSemanticQuery(name: string, metadata: string, query: string): number | null {
  const normalizedName = normalizeSearchText(name).replace(/[-_]/g, " ");
  const normalizedMetadata = normalizeSearchText(metadata).replace(/[-_]/g, " ");
  const groups = getSemanticQueryGroups(query);
  let score = 0;

  for (const alternatives of groups) {
    const semantic = alternatives.length > 1;
    const nameScore = bestGroupScore(normalizedName, alternatives, semantic, 100);
    const metadataScore = bestGroupScore(normalizedMetadata, alternatives, semantic, 10);
    const groupScore = Math.max(nameScore, metadataScore);
    if (groupScore === 0) return null;
    score += groupScore;
  }

  const literalQuery = normalizeSearchText(query).replace(/[-_]/g, " ").trim();
  if (literalQuery && normalizedName.includes(literalQuery)) score += 1_000;
  return score;
}
