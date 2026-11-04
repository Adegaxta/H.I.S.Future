import { useEffect, useRef, useState, type ReactNode } from "react";

export type BlockFormatType =
  | "p"
  | "h1"
  | "h2"
  | "h3"
  | "highlighted"
  | "globe"
  | "todo"
  | "bullets"
  | "numbered"
  | "dropdown"
  | "toggle-h1"
  | "toggle-h2"
  | "toggle-h3";

interface FormatItem {
  id: BlockFormatType;
  label: string;
  prefix?: string;
  icon?: string;
  description: string;
  category: "text" | "aesthetic" | "list";
  preview: ReactNode;
}

const FORMAT_ITEMS: FormatItem[] = [
  {
    id: "p",
    label: "Texto normal",
    category: "text",
    description: "Párrafo estándar de texto continuo.",
    preview: (
      <div className="block-format-preview__box">
        <p style={{ margin: 0, fontSize: "11px", color: "#d0d4dc" }}>Texto estándar y fluido...</p>
      </div>
    ),
  },
  {
    id: "h1",
    label: "Título 1",
    category: "text",
    description: "Encabezado de sección principal de mayor jerarquía.",
    preview: (
      <div className="block-format-preview__box">
        <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#ffffff" }}>Título Principal</h1>
      </div>
    ),
  },
  {
    id: "h2",
    label: "Título 2",
    category: "text",
    description: "Subtítulo para divisiones temáticas medianas.",
    preview: (
      <div className="block-format-preview__box">
        <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 650, color: "#ffffff" }}>Subtítulo Seccional</h2>
      </div>
    ),
  },
  {
    id: "h3",
    label: "Título 3",
    category: "text",
    description: "Subencabezado menor para grupos concretos de contenido.",
    preview: (
      <div className="block-format-preview__box">
        <h3 style={{ margin: 0, fontSize: "12.5px", fontWeight: 600, color: "#ffffff" }}>Encabezado Menor</h3>
      </div>
    ),
  },
  {
    id: "highlighted",
    label: "Destacado",
    prefix: "Aa",
    category: "aesthetic",
    description: "Resalta el bloque con borde y tipografía acentuada.",
    preview: (
      <div className="block-format-preview__box" style={{ borderLeft: "3px solid var(--his-accent, #9d7bff)", paddingLeft: "8px" }}>
        <span style={{ fontSize: "11px", color: "#e0e4ec" }}>Bloque con énfasis visual destacado.</span>
      </div>
    ),
  },
  {
    id: "globe",
    label: "Globo",
    prefix: "Aa",
    category: "aesthetic",
    description: "Bloque de referencia externa con icono y fondo resaltado.",
    preview: (
      <div className="block-format-preview__box" style={{ background: "#1c1f24", borderRadius: "6px", padding: "6px 8px", display: "flex", gap: "6px", alignItems: "center" }}>
        <span style={{ fontSize: "12px" }}>📄</span>
        <span style={{ fontSize: "11px", color: "#e0e4ec" }}>Nota enmarcada con icono.</span>
      </div>
    ),
  },
  {
    id: "todo",
    label: "Casilla",
    prefix: "☑",
    category: "list",
    description: "Lista de verificación para seguimiento de tareas.",
    preview: (
      <div className="block-format-preview__box" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <input type="checkbox" checked readOnly style={{ accentColor: "var(--his-accent)" }} />
        <span style={{ fontSize: "11px", textDecoration: "line-through", color: "#8a9099" }}>Tarea completada</span>
      </div>
    ),
  },
  {
    id: "bullets",
    label: "Lista con viñetas",
    prefix: "•",
    category: "list",
    description: "Lista ordenada por puntos clave no jerárquicos.",
    preview: (
      <div className="block-format-preview__box" style={{ fontSize: "11px", color: "#d0d4dc" }}>
        <div>• Primer elemento clave</div>
        <div>• Segundo elemento subordinado</div>
      </div>
    ),
  },
  {
    id: "numbered",
    label: "Lista numerada",
    prefix: "1.",
    category: "list",
    description: "Lista secuencial ordenada paso a paso.",
    preview: (
      <div className="block-format-preview__box" style={{ fontSize: "11px", color: "#d0d4dc" }}>
        <div>1. Primer paso</div>
        <div>2. Segundo paso siguiente</div>
      </div>
    ),
  },
  {
    id: "dropdown",
    label: "Desplegable",
    prefix: ">",
    category: "list",
    description: "Oculta o muestra contenido anidado con un clic.",
    preview: (
      <div className="block-format-preview__box" style={{ fontSize: "11px", color: "#d0d4dc" }}>
        <div style={{ color: "var(--his-accent)" }}>▶ Cabecera colapsable</div>
        <div style={{ paddingLeft: "12px", opacity: 0.6 }}>└ Contenido ocultable</div>
      </div>
    ),
  },
  {
    id: "toggle-h1",
    label: "Título 1 desplegable",
    prefix: "> Aa",
    category: "list",
    description: "Encabezado principal H1 colapsable.",
    preview: (
      <div className="block-format-preview__box">
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff" }}>▶ Título Principal</div>
      </div>
    ),
  },
  {
    id: "toggle-h2",
    label: "Título 2 desplegable",
    prefix: "> Aa",
    category: "list",
    description: "Encabezado mediano H2 colapsable.",
    preview: (
      <div className="block-format-preview__box">
        <div style={{ fontSize: "13px", fontWeight: 650, color: "#ffffff" }}>▶ Subtítulo Seccional</div>
      </div>
    ),
  },
  {
    id: "toggle-h3",
    label: "Título 3 desplegable",
    prefix: "> Aa",
    category: "list",
    description: "Encabezado menor H3 colapsable.",
    preview: (
      <div className="block-format-preview__box">
        <div style={{ fontSize: "12px", fontWeight: 600, color: "#ffffff" }}>▶ Subencabezado Menor</div>
      </div>
    ),
  },
];

interface Props {
  currentFormat: BlockFormatType;
  position: { top: number; left: number };
  onSelect: (format: BlockFormatType) => void;
  onClose: () => void;
}

export function BlockFormatMenu({ currentFormat, position, onSelect, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [hoveredItem, setHoveredItem] = useState<FormatItem>(
    () => FORMAT_ITEMS.find((item) => item.id === currentFormat) || FORMAT_ITEMS[0],
  );

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="block-format-container"
      style={{
        position: "fixed",
        top: Math.min(position.top, window.innerHeight - 440),
        left: Math.min(position.left, window.innerWidth - 420),
        zIndex: 50,
        display: "flex",
        gap: "8px",
        alignItems: "flex-start",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="block-format-menu" role="menu">
        {FORMAT_ITEMS.map((item, index) => {
          const isSelected = item.id === currentFormat;
          const showSeparatorBefore =
            (index === 4 || index === 6) && index > 0;

          return (
            <div key={item.id}>
              {showSeparatorBefore && <div className="block-format-menu__divider" />}
              <button
                type="button"
                className={`block-format-menu__item${isSelected ? " is-active" : ""}`}
                onMouseEnter={() => setHoveredItem(item)}
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
              >
                {item.prefix && (
                  <span className="block-format-menu__prefix">{item.prefix}</span>
                )}
                <span className="block-format-menu__label">{item.label}</span>
                {isSelected && (
                  <span className="block-format-menu__check">✓</span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {hoveredItem && (
        <div className="block-format-preview-card" role="tooltip">
          <div className="block-format-preview-card__screen">
            {hoveredItem.preview}
          </div>
          <div className="block-format-preview-card__title">
            {hoveredItem.label}
          </div>
          <div className="block-format-preview-card__desc">
            {hoveredItem.description}
          </div>
        </div>
      )}
    </div>
  );
}
