import { useEffect, useRef, useState } from "react";
import { NodeIcon } from "../nodes/NodeIcon";
import { PALETTE } from "../defs/palette";

function AlignStartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 5H3" />
      <path d="M15 12H3" />
      <path d="M17 19H3" />
    </svg>
  );
}

function AlignCenterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 5H3" />
      <path d="M17 12H7" />
      <path d="M19 19H5" />
    </svg>
  );
}

function AlignEndIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 5H3" />
      <path d="M21 12H9" />
      <path d="M21 19H7" />
    </svg>
  );
}

function AlignJustifyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h18" />
      <path d="M3 12h18" />
      <path d="M3 19h18" />
    </svg>
  );
}

interface Props {
  position: { top: number; left: number };
  onConvertToNode: (type: "pagina" | "categoria" | "proyecto") => void;
  onMoveLine: (before: boolean) => void;
  onAlign: (alignment: "left" | "center" | "right" | "justify") => void;
  onDeleteBlock: () => void;
  onClose: () => void;
}

type SubmenuKind = "convert" | "move" | "align" | null;

export function BlockMoreMenu({
  position,
  onConvertToNode,
  onMoveLine,
  onAlign,
  onDeleteBlock,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<SubmenuKind>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, [onClose]);

  const leftPosition = Math.min(position.left, window.innerWidth - 380);
  const topPosition = Math.min(position.top, window.innerHeight - 260);

  return (
    <div
      ref={menuRef}
      data-selection-toolbar="true"
      className="block-more-menu-container"
      style={{
        position: "fixed",
        top: Math.max(8, topPosition),
        left: Math.max(8, leftPosition),
        zIndex: 55,
        display: "flex",
        alignItems: "flex-start",
        gap: "4px",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="block-more-menu" role="menu">
        {/* 1. Convertir */}
        <button
          type="button"
          className={`block-more-menu__item${activeSubmenu === "convert" ? " is-active" : ""}`}
          onMouseEnter={() => setActiveSubmenu("convert")}
          onClick={() => setActiveSubmenu((curr) => (curr === "convert" ? null : "convert"))}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m16 3 4 4-4 4" />
            <path d="M20 7H4" />
            <path d="m8 21-4-4 4-4" />
            <path d="M4 17h16" />
          </svg>
          <span style={{ flex: 1 }}>Convertir</span>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        {/* 2. Mover a */}
        <button
          type="button"
          className={`block-more-menu__item${activeSubmenu === "move" ? " is-active" : ""}`}
          onMouseEnter={() => setActiveSubmenu("move")}
          onClick={() => setActiveSubmenu((curr) => (curr === "move" ? null : "move"))}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 9 4-4 4 4" />
            <path d="M7 5v14" />
            <path d="m21 15-4 4-4-4" />
            <path d="M17 19V5" />
          </svg>
          <span style={{ flex: 1 }}>Mover a</span>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        {/* 3. Alinear */}
        <button
          type="button"
          className={`block-more-menu__item${activeSubmenu === "align" ? " is-active" : ""}`}
          onMouseEnter={() => setActiveSubmenu("align")}
          onClick={() => setActiveSubmenu((curr) => (curr === "align" ? null : "align"))}
        >
          <AlignStartIcon />
          <span style={{ flex: 1 }}>Alinear</span>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>


        <div style={{ height: "1px", background: "rgba(255, 255, 255, 0.08)", margin: "3px 4px" }} />

        {/* 4. Eliminar */}
        <button
          type="button"
          className="block-more-menu__item block-more-menu__item--danger"
          onClick={() => {
            onDeleteBlock();
            onClose();
          }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          <span>Eliminar</span>
        </button>
      </div>

      {/* Submenu Panels */}
      {activeSubmenu === "convert" && (
        <div className="block-more-submenu" role="menu">
          <button
            type="button"
            className="block-more-menu__item"
            onClick={() => {
              onConvertToNode("pagina");
              onClose();
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "16px",
                height: "16px",
                color: PALETTE.pagina,
                flexShrink: 0,
              }}
            >
              <NodeIcon
                type="pagina"
                style={{
                  width: "16px",
                  height: "16px",
                  flex: "0 0 16px",
                  color: PALETTE.pagina,
                }}
              />
            </span>
            <span>Nodo Página</span>
          </button>
          <button
            type="button"
            className="block-more-menu__item"
            onClick={() => {
              onConvertToNode("categoria");
              onClose();
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "16px",
                height: "16px",
                color: PALETTE.categoria,
                flexShrink: 0,
              }}
            >
              <NodeIcon
                type="categoria"
                style={{
                  width: "16px",
                  height: "16px",
                  flex: "0 0 16px",
                  color: PALETTE.categoria,
                }}
              />
            </span>
            <span>Nodo Carpeta</span>
          </button>
          <button
            type="button"
            className="block-more-menu__item"
            onClick={() => {
              onConvertToNode("proyecto");
              onClose();
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "16px",
                height: "16px",
                color: PALETTE.proyecto,
                flexShrink: 0,
              }}
            >
              <NodeIcon
                type="proyecto"
                style={{
                  width: "16px",
                  height: "16px",
                  flex: "0 0 16px",
                  color: PALETTE.proyecto,
                }}
              />
            </span>
            <span>Nodo Proyecto</span>
          </button>
        </div>
      )}

      {activeSubmenu === "move" && (
        <div className="block-more-submenu" role="menu">
          <button
            type="button"
            className="block-more-menu__item"
            onClick={() => {
              onMoveLine(true);
              onClose();
            }}
          >
            <span>↑</span>
            <span>Subir bloque</span>
          </button>
          <button
            type="button"
            className="block-more-menu__item"
            onClick={() => {
              onMoveLine(false);
              onClose();
            }}
          >
            <span>↓</span>
            <span>Bajar bloque</span>
          </button>
        </div>
      )}

      {activeSubmenu === "align" && (
        <div className="block-more-submenu" role="menu">
          <button
            type="button"
            className="block-more-menu__item"
            onClick={() => {
              onAlign("left");
              onClose();
            }}
          >
            <AlignStartIcon />
            <span>Izquierda</span>
          </button>
          <button
            type="button"
            className="block-more-menu__item"
            onClick={() => {
              onAlign("center");
              onClose();
            }}
          >
            <AlignCenterIcon />
            <span>Centro</span>
          </button>
          <button
            type="button"
            className="block-more-menu__item"
            onClick={() => {
              onAlign("right");
              onClose();
            }}
          >
            <AlignEndIcon />
            <span>Derecha</span>
          </button>
          <button
            type="button"
            className="block-more-menu__item"
            onClick={() => {
              onAlign("justify");
              onClose();
            }}
          >
            <AlignJustifyIcon />
            <span>Justificado</span>
          </button>
        </div>
      )}
    </div>
  );
}

