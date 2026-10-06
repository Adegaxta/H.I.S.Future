import { EDITOR_TEXT_COLORS, PALETTE } from "../defs/palette";

export const TAG_COLOR_PALETTE = [
  PALETTE.pagina,
  PALETTE.categoria,
  PALETTE.paginaCarpeta,
  PALETTE.imagen,
  PALETTE.pdf,
  PALETTE.tempo,
  EDITOR_TEXT_COLORS.green,
  EDITOR_TEXT_COLORS.blue,
  EDITOR_TEXT_COLORS.purple,
  EDITOR_TEXT_COLORS.pink,
  EDITOR_TEXT_COLORS.orange,
  EDITOR_TEXT_COLORS.grey,
] as const;

export const DEFAULT_TAG_COLOR = PALETTE.pagina;
