import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDismissibleLayer } from "../hooks/useDismissibleLayer";
import ColorOptions, { type ColorTarget } from "./ColorOptions";
import searchIcon from "../assets/third-party/google-material/icons/search.svg";
import typeIcon from "../assets/third-party/Lucide.dev/icons/type.svg";
import textColorIcon from "../assets/third-party/google-material/icons/format_color.svg";
import fillColorIcon from "../assets/third-party/google-material/icons/format_color_fill.svg";
import borderColorIcon from "../assets/third-party/google-material/icons/border_color.svg";
import resetColorIcon from "../assets/third-party/google-material/icons/format_color_reset.svg";
import headerIcon from "../assets/third-party/Lucide.dev/icons/table-2.svg";
import symmetryIcon from "../assets/third-party/Lucide.dev/icons/equal.svg";
import reorderHorizontalIcon from "../assets/third-party/Lucide.dev/icons/arrow-left-right.svg";
import reorderVerticalIcon from "../assets/third-party/Lucide.dev/icons/arrow-down-up.svg";
import insertIcon from "../assets/third-party/Lucide.dev/icons/grid-2x2-plus.svg";
import upIcon from "../assets/third-party/Lucide.dev/icons/arrow-up-from-line.svg";
import downIcon from "../assets/third-party/Lucide.dev/icons/arrow-down-from-line.svg";
import leftIcon from "../assets/third-party/Lucide.dev/icons/arrow-left-from-line.svg";
import rightIcon from "../assets/third-party/Lucide.dev/icons/arrow-right-from-line.svg";
import duplicateIcon from "../assets/third-party/Lucide.dev/icons/file-stack.svg";
import verticalIcon from "../assets/third-party/Lucide.dev/icons/align-vertical-justify-center.svg";
import verticalStartIcon from "../assets/third-party/Lucide.dev/icons/align-vertical-justify-start.svg";
import verticalEndIcon from "../assets/third-party/Lucide.dev/icons/align-vertical-justify-end.svg";
import alignStartIcon from "../assets/third-party/Lucide.dev/icons/text-align-start.svg";
import alignCenterIcon from "../assets/third-party/Lucide.dev/icons/text-align-center.svg";
import alignEndIcon from "../assets/third-party/Lucide.dev/icons/text-align-end.svg";
import alignJustifyIcon from "../assets/third-party/Lucide.dev/icons/text-align-justify.svg";
import clearIcon from "../assets/third-party/Lucide.dev/icons/square-dashed-x.svg";
import deleteIcon from "../assets/third-party/Lucide.dev/icons/square-dashed-x-corner.svg";
import chevronRightIcon from "../assets/third-party/Lucide.dev/icons/chevron-right.svg";
import chevronLeftIcon from "../assets/third-party/Lucide.dev/icons/chevron-left.svg";
import headerToggleTrack from "../assets/original/icons/container_button.svg";
import headerToggleThumb from "../assets/original/icons/circle_button_generic.svg";
import {
  applyTextAlignment,
  applyTableColor,
  applyVerticalAlignment,
  cellsForContext,
  clearTableContent,
  deleteTableColumn,
  deleteTableRow,
  fitTableColumns,
  insertTableColumn,
  insertTableRow,
  moveTableColumn,
  moveTableRow,
  reorderCell,
  resetTableColors,
  toggleTableHeader,
  type TableContext,
  type TableTarget,
} from "./tableActions";

export interface TableMenuState {
  context: TableContext;
  target: TableTarget;
  x: number;
  y: number;
}

interface Props {
  state: TableMenuState;
  selectedCells: readonly HTMLElement[];
  onClose: () => void;
  onMutate: (mutation: () => void) => void;
  onFormat: (command: "bold" | "italic" | "underline" | "strikeThrough", cells: HTMLElement[]) => void;
}

type Submenu = "format" | "vertical" | "text" | "row" | "column" | "color-text" | "color-background" | "color-border" | null;

function Icon({ src }: { src: string }) {
  return <img className="his-table-menu__icon" src={src} alt="" aria-hidden="true" />;
}

function Tool({ src, label, active, onClick }: { src: string; label: string; active?: boolean; onClick: () => void }) {
  return <button type="button" className={active ? "is-active" : ""} aria-label={label} title={label} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onClick(); }}><Icon src={src} /></button>;
}

function Action({ icon, label, children, onClick, onEnter, submenu, dangerous }: { icon: string; label: string; children?: React.ReactNode; onClick?: () => void; onEnter?: () => void; submenu?: boolean; dangerous?: boolean }) {
  const className = `his-table-menu__action${dangerous ? " is-dangerous" : ""}`;
  if (children) return <div className={className} role="group" aria-label={label}><Icon src={icon} /><span>{label}</span><span className="his-table-menu__actions">{children}</span></div>;
  return <button type="button" className={className} onPointerEnter={onEnter} onClick={onClick} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}><Icon src={icon} /><span>{label}</span><span className="his-table-menu__actions">{submenu && <Icon src={chevronRightIcon} />}</span></button>;
}

function DirectionButton({ src, label, onClick }: { src: string; label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onClick(); }}><Icon src={src} /></button>;
}

function HeaderToggle({ active, label, onToggle }: { active: boolean; label: string; onToggle: () => void }) {
  return <button
    type="button"
    className={`his-table-header-toggle${active ? " is-active" : ""}`}
    aria-label={label}
    title={label}
    aria-pressed={active}
    onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
    onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggle(); }}
  >
    <img className="his-table-header-toggle__track" src={headerToggleTrack} alt="" aria-hidden="true" />
    <img className="his-table-header-toggle__thumb" src={headerToggleThumb} alt="" aria-hidden="true" />
  </button>;
}

export default function TableOptionsMenu({ state, selectedCells, onClose, onMutate, onFormat }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: state.x, top: state.y });
  const [query, setQuery] = useState("");
  const [submenu, setSubmenu] = useState<Submenu>(null);
  useDismissibleLayer(rootRef, onClose);
  useLayoutEffect(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ left: Math.max(8, Math.min(state.x, window.innerWidth - rect.width - 8)), top: Math.max(52, Math.min(state.y, window.innerHeight - rect.height - 8)) });
  }, [state.x, state.y, query, submenu]);
  const context = state.context;
  const cells = useMemo(() => cellsForContext(state.target, context, selectedCells), [state, selectedCells]);
  const mutate = (action: () => void, close = true) => {
    onMutate(action);
    if (close) onClose();
  };
  const matches = (label: string) => !query.trim() || label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const isCell = context === "cell";
  const panelOnLeft = position.left + (isCell ? 252 : 360) + 240 > window.innerWidth;
  const colorKind = submenu?.startsWith("color-") ? submenu.slice(6) as ColorTarget : null;
  const openColor = (kind: "text" | "background" | "border") => {
    setSubmenu(submenu === `color-${kind}` ? null : `color-${kind}`);
  };

  const compactSubmenu = submenu && <div className={`his-table-menu__submenu ${panelOnLeft ? "is-left" : "is-right"}`}>
    <header><Icon src={panelOnLeft ? chevronLeftIcon : chevronRightIcon} /><span>{colorKind ? { text: "Color de texto", background: "Color de celda", border: "Color de borde" }[colorKind] : submenu === "vertical" ? "Alineación vertical" : submenu === "text" ? "Alinear texto" : submenu === "format" ? "Estilo de texto" : submenu === "row" ? "Fila" : "Columna"}</span></header>
    {colorKind && <ColorOptions key={colorKind} kind={colorKind} onApply={(color) => mutate(() => applyTableColor(cells, colorKind, color), false)} />}
    {submenu === "format" && <div className="his-table-menu__format-grid">
      {([['bold', 'B'], ['italic', 'I'], ['underline', 'U'], ['strikeThrough', 'S']] as const).map(([command, label]) => <button key={command} type="button" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onFormat(command, cells); onClose(); }}>{label}</button>)}
    </div>}
    {submenu === "vertical" && <>
      <Action icon={verticalStartIcon} label="Arriba" onClick={() => mutate(() => applyVerticalAlignment(cells, "start"))} />
      <Action icon={verticalIcon} label="Centro" onClick={() => mutate(() => applyVerticalAlignment(cells, "center"))} />
      <Action icon={verticalEndIcon} label="Abajo" onClick={() => mutate(() => applyVerticalAlignment(cells, "end"))} />
    </>}
    {submenu === "text" && <>
      <Action icon={alignStartIcon} label="Inicio" onClick={() => mutate(() => applyTextAlignment(cells, "left"))} />
      <Action icon={alignCenterIcon} label="Centro" onClick={() => mutate(() => applyTextAlignment(cells, "center"))} />
      <Action icon={alignEndIcon} label="Final" onClick={() => mutate(() => applyTextAlignment(cells, "right"))} />
      <Action icon={alignJustifyIcon} label="Justificado" onClick={() => mutate(() => applyTextAlignment(cells, "justify"))} />
    </>}
    {(submenu === "row" || submenu === "column") && <ContextActions context={submenu} state={state} matches={() => true} mutate={mutate} />}
  </div>;

  return <div ref={rootRef} className="his-table-menu-layer" style={position} data-editor-ui="true" onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
    <div className={`his-table-menu${isCell ? " is-compact" : ""}`} role="menu" aria-label={`Opciones de ${context === "row" ? "fila" : context === "column" ? "columna" : "celda"}`}>
      <div className="his-table-menu__title">Opciones de {context === "row" ? "fila" : context === "column" ? "columna" : "celda"}</div>
      <div className="his-table-menu__toolbar">
        {!isCell && <label><Icon src={searchIcon} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar opciones" /></label>}
        <div>
          <Tool src={typeIcon} label="Estilo de texto" active={submenu === "format"} onClick={() => setSubmenu(submenu === "format" ? null : "format")} />
          <Tool src={textColorIcon} label="Color de texto" active={colorKind === "text"} onClick={() => openColor("text")} />
          <Tool src={fillColorIcon} label="Color de celda" active={colorKind === "background"} onClick={() => openColor("background")} />
          <Tool src={borderColorIcon} label="Color de borde" active={colorKind === "border"} onClick={() => openColor("border")} />
          <Tool src={resetColorIcon} label="Restablecer colores" onClick={() => mutate(() => resetTableColors(cells))} />
        </div>
      </div>
      {isCell ? <div className="his-table-menu__section">
        <Action icon={verticalIcon} label="Alineación vertical" submenu onEnter={() => setSubmenu("vertical")} onClick={() => setSubmenu(submenu === "vertical" ? null : "vertical")} />
        <Action icon={alignStartIcon} label="Alinear texto" submenu onEnter={() => setSubmenu("text")} onClick={() => setSubmenu(submenu === "text" ? null : "text")} />
        <Action icon={headerIcon} label="Fila" submenu onEnter={() => setSubmenu("row")} onClick={() => setSubmenu(submenu === "row" ? null : "row")} />
        <Action icon={headerIcon} label="Columna" submenu onEnter={() => setSubmenu("column")} onClick={() => setSubmenu(submenu === "column" ? null : "column")} />
        <Action dangerous icon={clearIcon} label="Borrar contenido" onClick={() => mutate(() => clearTableContent(cells))} />
      </div> : <ContextActions context={context} state={state} matches={matches} mutate={mutate} cells={cells} />}
    </div>
    {compactSubmenu}
  </div>;
}

function ContextActions({ context, state, matches, mutate, cells }: {
  context: "row" | "column";
  state: TableMenuState;
  matches: (label: string) => boolean;
  mutate: (action: () => void, close?: boolean) => void;
  cells?: HTMLElement[];
}) {
  const row = context === "row";
  const targetCells = cells ?? cellsForContext(state.target, context);
  const marker = context === "row" ? "hisTableHeaderRow" : "hisTableHeaderColumn";
  const headerActive = targetCells.length > 0 && targetCells.every((cell) => {
    if (cell.dataset[marker] === "true") return true;
    if (context === "row") return state.target.row.dataset.hisTableHeader === "true";
    return cell.dataset.hisTableHeader === "true" && cell.dataset.hisTableHeaderRow !== "true";
  });
  const action = (label: string, node: React.ReactNode) => matches(label) ? node : null;
  return <>
    <div className="his-table-menu__section">
      {action(row ? "Fila de encabezado" : "Columna de encabezado", <Action icon={headerIcon} label={row ? "Fila de encabezado" : "Columna de encabezado"}><HeaderToggle active={headerActive} label={row ? "Alternar fila de encabezado" : "Alternar columna de encabezado"} onToggle={() => mutate(() => toggleTableHeader(state.target, context), false)} /></Action>)}
      {action("Ajustar simetría de celdas", <Action icon={symmetryIcon} label="Ajustar simetría de celdas" onClick={() => mutate(() => fitTableColumns(state.target.table))} />)}
      {action("Ordenar celdas", <Action icon={row ? reorderHorizontalIcon : reorderVerticalIcon} label="Ordenar celdas">{row ? <><DirectionButton src={leftIcon} label="Mover celda a la izquierda" onClick={() => mutate(() => reorderCell(state.target, "left"))} /><DirectionButton src={rightIcon} label="Mover celda a la derecha" onClick={() => mutate(() => reorderCell(state.target, "right"))} /></> : <><DirectionButton src={upIcon} label="Mover celda arriba" onClick={() => mutate(() => reorderCell(state.target, "up"))} /><DirectionButton src={downIcon} label="Mover celda abajo" onClick={() => mutate(() => reorderCell(state.target, "down"))} /></>}</Action>)}
      {action("Insertar fila", <Action icon={insertIcon} label="Insertar fila"><DirectionButton src={upIcon} label="Insertar arriba" onClick={() => mutate(() => { insertTableRow(state.target, false); })} /><DirectionButton src={downIcon} label="Insertar abajo" onClick={() => mutate(() => { insertTableRow(state.target, true); })} /></Action>)}
      {action("Insertar columna", <Action icon={insertIcon} label="Insertar columna"><DirectionButton src={leftIcon} label="Insertar izquierda" onClick={() => mutate(() => { insertTableColumn(state.target, false); })} /><DirectionButton src={rightIcon} label="Insertar derecha" onClick={() => mutate(() => { insertTableColumn(state.target, true); })} /></Action>)}
    </div>
    <div className="his-table-menu__section">
      {row ? <>
        {action("Subir fila", <Action icon={upIcon} label="Subir fila" onClick={() => mutate(() => { moveTableRow(state.target, "up"); })} />)}
        {action("Bajar fila", <Action icon={downIcon} label="Bajar fila" onClick={() => mutate(() => { moveTableRow(state.target, "down"); })} />)}
      </> : <>
        {action("Mover columna izquierda", <Action icon={leftIcon} label="Mover columna izquierda" onClick={() => mutate(() => { moveTableColumn(state.target, "left"); })} />)}
        {action("Mover columna derecha", <Action icon={rightIcon} label="Mover columna derecha" onClick={() => mutate(() => { moveTableColumn(state.target, "right"); })} />)}
      </>}
    </div>
    <div className="his-table-menu__section">
      {action("Duplicar", <Action icon={duplicateIcon} label="Duplicar"><DirectionButton src={leftIcon} label="Duplicar columna a la izquierda" onClick={() => mutate(() => { insertTableColumn(state.target, false, true); })} /><DirectionButton src={rightIcon} label="Duplicar columna a la derecha" onClick={() => mutate(() => { insertTableColumn(state.target, true, true); })} /><DirectionButton src={upIcon} label="Duplicar fila arriba" onClick={() => mutate(() => { insertTableRow(state.target, false, true); })} /><DirectionButton src={downIcon} label="Duplicar fila abajo" onClick={() => mutate(() => { insertTableRow(state.target, true, true); })} /></Action>)}
    </div>
    <div className="his-table-menu__section">
      {action("Alineación vertical", <Action icon={verticalIcon} label="Alineación vertical">{[verticalStartIcon, verticalIcon, verticalEndIcon].map((icon, index) => <DirectionButton key={icon} src={icon} label={["Arriba", "Centro", "Abajo"][index]} onClick={() => mutate(() => applyVerticalAlignment(targetCells, (["start", "center", "end"] as const)[index]))} />)}</Action>)}
      {action("Alinear texto", <Action icon={alignStartIcon} label="Alinear texto">{[alignStartIcon, alignCenterIcon, alignEndIcon, alignJustifyIcon].map((icon, index) => <DirectionButton key={icon} src={icon} label={["Inicio", "Centro", "Final", "Justificado"][index]} onClick={() => mutate(() => applyTextAlignment(targetCells, (["left", "center", "right", "justify"] as const)[index]))} />)}</Action>)}
    </div>
    <div className="his-table-menu__section">
      {action("Borrar contenido", <Action dangerous icon={clearIcon} label="Borrar contenido" onClick={() => mutate(() => clearTableContent(targetCells))} />)}
      {action(row ? "Eliminar fila" : "Eliminar columna", <Action dangerous icon={deleteIcon} label={row ? "Eliminar fila" : "Eliminar columna"} onClick={() => mutate(() => { row ? deleteTableRow(state.target) : deleteTableColumn(state.target); })} />)}
    </div>
  </>;
}
