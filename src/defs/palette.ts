// Paleta central de colores de la app. Todo color que se use en más
// de un lugar debería vivir acá, no repetirse suelto por el código.

export const PALETTE = {
  categoria: "#D8B34D",
  pagina: "#4DD8C0",
  imagen: "#D878A8",
  pdf: "#D85F5F",
  documents: "#B84D4D",
  calendario: "#78A8D8",
  tempo: "#D88F5A",
  paginaCarpeta: "#4D94D8",
  avatarExtra: "#8C7AD8",
} as const;

export const EDITOR_TEXT_COLORS = {
  grey: "#7B7F85",
  gray: "#7B7F85",
  brown: "#8A5A3B",
  orange: "#E67E22",
  yellow: "#F1C40F",
  amber: "#C98900",
  teal: "#1ABC9C",
  green: "#2ECC71",
  blue: "#2F80ED",
  ice: "#5CC8FF",
  purple: "#8E5BE8",
  pink: "#E96DCC",
  red: "#E74C3C",
} as const;

export const EDITOR_BACKGROUND_COLORS = {
  gray: "#B8B9BF",
  grey: "#B8B9BF",
  brown: "#A5674D",
  orange: "#E9A65B",
  yellow: "#E9D77B",
  green: "#8CD98D",
  blue: "#7AB7FF",
  purple: "#A68AF5",
  pink: "#F3A7D7",
  red: "#F08C8C",
  ice: "#A9D6FF",
} as const;

// Colores disponibles para elegir el avatar de un proyecto.
export const AVATAR_COLORS = [
  PALETTE.pagina,
  PALETTE.categoria,
  PALETTE.paginaCarpeta,
  PALETTE.imagen,
  PALETTE.pdf,
  PALETTE.avatarExtra,
] as const;
