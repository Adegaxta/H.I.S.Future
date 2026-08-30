// Paleta central de colores de la app. Todo color que se use en más
// de un lugar debería vivir acá, no repetirse suelto por el código.

export const PALETTE = {
  categoria: "#D8B34D",
  pagina: "#4DD8C0",
  imagen: "#D878A8",
  paginaCarpeta: "#4D94D8",
  avatarExtra: "#8C7AD8",
} as const;

// Colores disponibles para elegir el avatar de un proyecto.
export const AVATAR_COLORS = [
  PALETTE.pagina,
  PALETTE.categoria,
  PALETTE.paginaCarpeta,
  PALETTE.imagen,
  PALETTE.avatarExtra,
] as const;