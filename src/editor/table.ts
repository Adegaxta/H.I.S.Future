import addAsset from "../assets/third-party/google-material/icons/add.svg";
import dragIndicatorAsset from "../assets/third-party/google-material/icons/drag_indicator.svg";
import moreVertAsset from "../assets/third-party/google-material/icons/more_vert.svg";
import tableOptionActiveAsset from "../assets/original/icons/table_option_active.svg";
import tableOptionInactiveAsset from "../assets/original/icons/table_option_inactive.svg";
import "./table.css";

export type TableAxis = "row" | "column";

export interface TableControl {
  table: HTMLElement;
  axis: TableAxis;
  control: HTMLButtonElement;
}

const TABLE_SELECTOR = "[data-his-table]";
const TABLE_GRID_SELECTOR = ":scope > [data-his-table-grid]";
const TABLE_ROW_SELECTOR = ":scope > [data-his-table-row]";
const TABLE_CELL_SELECTOR = "[data-his-table-cell]";
const TABLE_RESIZE_EDGE_PX = 10;
const TABLE_MIN_TRACK_PX = 48;
const TABLE_MIN_WIDTH_PX = 180;
export const TABLE_MIN_COLUMN_WIDTH_PX = 100;
export const TABLE_DEFAULT_COLUMN_WIDTH_PX = 112;
export const TABLE_OVERFLOW_EPSILON_PX = 1.5;

export function createInitialTableColumnWidths(columnCount: number, availableWidth: number, preferredWidth = 0): number[] {
  const columns = Math.max(1, Math.round(columnCount) || 1);
  const usableWidth = Number.isFinite(availableWidth) && availableWidth > 0
    ? availableWidth
    : columns * TABLE_MIN_COLUMN_WIDTH_PX;
  const desiredWidth = Number.isFinite(preferredWidth) && preferredWidth > 0
    ? preferredWidth
    : columns * TABLE_DEFAULT_COLUMN_WIDTH_PX;
  const minimumWidth = columns * TABLE_MIN_COLUMN_WIDTH_PX;
  const tableWidth = usableWidth < minimumWidth
    ? minimumWidth
    : Math.min(usableWidth, Math.max(minimumWidth, desiredWidth));
  return Array.from({ length: columns }, () => tableWidth / columns);
}

export function createTableMarkup(rows: readonly (readonly string[])[], availableWidth: number, preferredWidth = 0): string {
  const columnCount = Math.max(1, rows.reduce((count, row) => Math.max(count, row.length), 0));
  const normalizedRows = rows.length ? rows : [Array.from({ length: columnCount }, () => "")];
  const widths = createInitialTableColumnWidths(columnCount, availableWidth, preferredWidth);
  const tableWidth = widths.reduce((total, width) => total + width, 0);
  const template = widths.map((width) => `${width}px`).join(" ");
  const rowMarkup = normalizedRows.map((row) => {
    const cells = Array.from({ length: columnCount }, (_, index) =>
      `<span data-his-table-cell="true" role="cell"><p>${row[index] || "<br>"}</p></span>`,
    ).join("");
    return `<span data-his-table-row="true" role="row">${cells}</span>`;
  }).join("");
  return `<span data-his-table="true" style="--his-table-content-width: ${tableWidth}px"><span data-his-table-grid="true" role="table" style="--his-table-columns: ${columnCount}; --his-table-columns-template: ${template}">${rowMarkup}</span></span>`;
}

export function isTableEditingTarget(source: Node | null): boolean {
  return Boolean(getTableRootFromNode(source));
}

export function getTableRootFromNode(source: Node | null): HTMLElement | null {
  const sourceElement = source?.nodeType === Node.ELEMENT_NODE
    ? source as HTMLElement
    : source?.parentElement ?? null;
  let element = source?.nodeType === Node.ELEMENT_NODE
    ? source as HTMLElement
    : source?.parentElement ?? null;
  while (element) {
    if (element.matches(TABLE_SELECTOR) && element.querySelector(TABLE_GRID_SELECTOR)) return element;
    element = element.parentElement;
  }
  const childTable = sourceElement?.querySelector<HTMLElement>(`:scope > ${TABLE_SELECTOR}`) ?? null;
  if (childTable?.querySelector(TABLE_GRID_SELECTOR)) return childTable;
  return null;
}

export function getTableCellFromNode(source: Node | null): HTMLElement | null {
  const element = source?.nodeType === Node.ELEMENT_NODE ? source as Element : source?.parentElement;
  return element?.closest<HTMLElement>(TABLE_CELL_SELECTOR) ?? null;
}

export function getEditableBlockFromTableCell(cell: HTMLElement): HTMLElement {
  const existing = cell.querySelector<HTMLElement>(":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > blockquote, :scope > li, :scope > pre");
  if (existing) return existing;
  const paragraph = document.createElement("p");
  while (cell.firstChild) paragraph.appendChild(cell.firstChild);
  if (!paragraph.firstChild) paragraph.appendChild(document.createElement("br"));
  cell.appendChild(paragraph);
  return paragraph;
}

export function getTableColumnCount(tableOrCell: HTMLElement): number {
  const table = getTableRootFromNode(tableOrCell);
  const grid = table?.querySelector<HTMLElement>(TABLE_GRID_SELECTOR);
  const rowCounts = Array.from(grid?.querySelectorAll<HTMLElement>(TABLE_ROW_SELECTOR) ?? [])
    .map((row) => row.querySelectorAll(`:scope > ${TABLE_CELL_SELECTOR}`).length);
  return Math.max(1, ...rowCounts);
}

export function hasMeaningfulHorizontalOverflow(table: HTMLElement): boolean {
  return table.scrollWidth - table.clientWidth > TABLE_OVERFLOW_EPSILON_PX;
}

export function updateTableOverflowState(table: HTMLElement): boolean {
  const value = String(hasMeaningfulHorizontalOverflow(table));
  if (table.dataset.hisTableOverflow === value) return false;
  table.dataset.hisTableOverflow = value;
  return true;
}

function tableCellFromNode(source: Node | null): HTMLElement | null {
  const element = source?.nodeType === Node.ELEMENT_NODE
    ? source as Element
    : source?.parentElement;
  return element?.closest<HTMLElement>(TABLE_CELL_SELECTOR) ?? null;
}

export function shouldPreventTableStructureDeletion(inputType: string, selection: Selection): boolean {
  if (inputType !== "deleteContentBackward" && inputType !== "deleteContentForward") return false;
  if (!selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  const startCell = tableCellFromNode(range.startContainer);
  const endCell = tableCellFromNode(range.endContainer);
  if (!startCell || !endCell) return false;
  if (startCell !== endCell) return true;
  if (!range.collapsed) return false;

  const contentBeforeCaret = document.createRange();
  contentBeforeCaret.selectNodeContents(startCell);
  contentBeforeCaret.setEnd(range.startContainer, range.startOffset);
  const contentAfterCaret = document.createRange();
  contentAfterCaret.selectNodeContents(startCell);
  contentAfterCaret.setStart(range.endContainer, range.endOffset);
  const atStart = contentBeforeCaret.toString() === "";
  const atEnd = contentAfterCaret.toString() === "";
  return inputType === "deleteContentBackward" ? atStart : atEnd;
}

export function installTableInputGuard(editor: HTMLElement): () => void {
  const handleBeforeInput = (event: InputEvent) => {
    const selection = window.getSelection();
    if (selection && shouldPreventTableStructureDeletion(event.inputType, selection)) {
      event.preventDefault();
    }
  };
  editor.addEventListener("beforeinput", handleBeforeInput, true);
  return () => editor.removeEventListener("beforeinput", handleBeforeInput, true);
}

function createTableCell(): HTMLSpanElement {
  const cell = document.createElement("span");
  cell.dataset.hisTableCell = "true";
  cell.setAttribute("role", "cell");
  const paragraph = document.createElement("p");
  paragraph.appendChild(document.createElement("br"));
  cell.appendChild(paragraph);
  return cell;
}

function createTableRow(columns: number): HTMLSpanElement {
  const row = document.createElement("span");
  row.dataset.hisTableRow = "true";
  row.setAttribute("role", "row");
  for (let index = 0; index < columns; index += 1) row.appendChild(createTableCell());
  return row;
}

function createTableControl(axis: TableAxis, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.contentEditable = "false";
  button.dataset.editorUi = "true";
  button.dataset.hisTableAdd = axis;
  button.setAttribute("aria-label", label);
  button.title = label;
  const icon = document.createElement("img");
  icon.src = addAsset;
  icon.alt = "";
  icon.dataset.editorUi = "true";
  button.appendChild(icon);
  return button;
}

function createUnitHandle(kind: "cell" | "row" | "column", label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.contentEditable = "false";
  button.dataset.editorUi = "true";
  button.dataset.hisTableHandle = kind;
  button.setAttribute("aria-label", label);
  button.title = label;
  const normalIcon = document.createElement("img");
  normalIcon.src = kind === "cell" ? moreVertAsset : tableOptionInactiveAsset;
  normalIcon.alt = "";
  normalIcon.draggable = false;
  normalIcon.dataset.editorUi = "true";
  normalIcon.dataset.hisTableHandleIcon = "normal";
  button.appendChild(normalIcon);
  if (kind !== "cell") {
    const activeIcon = document.createElement("img");
    activeIcon.src = tableOptionActiveAsset;
    activeIcon.alt = "";
    activeIcon.draggable = false;
    activeIcon.dataset.editorUi = "true";
    activeIcon.dataset.hisTableHandleIcon = "active";
    const dragIcon = document.createElement("img");
    dragIcon.src = dragIndicatorAsset;
    dragIcon.alt = "";
    dragIcon.draggable = false;
    dragIcon.dataset.editorUi = "true";
    dragIcon.dataset.hisTableHandleIcon = "drag";
    button.append(activeIcon, dragIcon);
  }
  return button;
}

function handleHasAssetVisual(handle: HTMLElement): boolean {
  const normal = handle.querySelector<HTMLImageElement>(":scope > [data-his-table-handle-icon=normal]");
  const kind = handle.dataset.hisTableHandle;
  const active = handle.querySelector<HTMLImageElement>(":scope > [data-his-table-handle-icon=active]");
  const drag = handle.querySelector<HTMLImageElement>(":scope > [data-his-table-handle-icon=drag]");
  return Boolean(normal && (kind === "cell" || (active && drag)));
}

function ensureHandleVisual(handle: HTMLElement, kind: "cell" | "row" | "column", label: string): boolean {
  if (handleHasAssetVisual(handle)) return false;
  const replacement = createUnitHandle(kind, label);
  handle.replaceChildren(...Array.from(replacement.childNodes));
  return true;
}

function ensureTableHandles(table: HTMLElement): boolean {
  const grid = table.querySelector<HTMLElement>(TABLE_GRID_SELECTOR);
  if (!grid) return false;
  let changed = false;
  const rows = Array.from(grid.querySelectorAll<HTMLElement>(TABLE_ROW_SELECTOR));
  rows.forEach((row) => {
    let rowHandle = row.querySelector<HTMLElement>(":scope > [data-his-table-handle=row]");
    if (!rowHandle) {
      row.appendChild(createUnitHandle("row", "Opciones de fila"));
      changed = true;
    } else if (ensureHandleVisual(rowHandle, "row", "Opciones de fila")) {
      changed = true;
    }
    Array.from(row.querySelectorAll<HTMLElement>(`:scope > ${TABLE_CELL_SELECTOR}`)).forEach((cell) => {
      cell.onmouseenter = () => {
        const editor = cell.closest<HTMLElement>(".editor-content");
        if (editor) setHoveredTableHandles(editor, cell);
      };
      cell.onmouseleave = (event) => {
        const editor = cell.closest<HTMLElement>(".editor-content");
        if (editor) setHoveredTableHandles(editor, event.relatedTarget as Node | null);
      };
      let cellHandle = cell.querySelector<HTMLElement>(":scope > [data-his-table-handle=cell]");
      if (!cellHandle) {
        cell.appendChild(createUnitHandle("cell", "Opciones de celda"));
        changed = true;
      } else if (ensureHandleVisual(cellHandle, "cell", "Opciones de celda")) {
        changed = true;
      }
      cell.querySelectorAll(":scope > [data-his-table-handle=column]").forEach((handle) => {
        handle.remove();
        changed = true;
      });
    });
  });
  const columnCount = rows[0]?.querySelectorAll(`:scope > ${TABLE_CELL_SELECTOR}`).length ?? 0;
  let columnHandles = grid.querySelector<HTMLElement>(":scope > [data-his-table-column-handles]");
  const handlesAreCurrent = columnHandles
    && columnHandles.querySelectorAll(":scope > [data-his-table-handle=column]").length === columnCount
    && Array.from(columnHandles.querySelectorAll<HTMLElement>(":scope > [data-his-table-handle=column]"))
      .every((handle, index) => handle.dataset.hisTableColumnIndex === String(index) && handleHasAssetVisual(handle));
  if (!handlesAreCurrent) {
    columnHandles?.remove();
    columnHandles = document.createElement("span");
    columnHandles.contentEditable = "false";
    columnHandles.dataset.editorUi = "true";
    columnHandles.dataset.hisTableColumnHandles = "true";
    for (let index = 0; index < columnCount; index += 1) {
      const handle = createUnitHandle("column", "Opciones de columna");
      handle.dataset.hisTableColumnIndex = String(index);
      columnHandles.appendChild(handle);
    }
    grid.prepend(columnHandles);
    changed = true;
  }
  return changed;
}

export function createTable(availableWidth: number): HTMLSpanElement {
  const wrapper = document.createElement("span");
  wrapper.dataset.hisTable = "true";

  const grid = document.createElement("span");
  grid.dataset.hisTableGrid = "true";
  grid.setAttribute("role", "table");
  const widths = createInitialTableColumnWidths(3, availableWidth);
  grid.style.setProperty("--his-table-columns", "3");
  grid.style.setProperty("--his-table-columns-template", widths.map((width) => `${width}px`).join(" "));
  wrapper.style.setProperty("--his-table-content-width", `${widths.reduce((total, width) => total + width, 0)}px`);
  grid.append(createTableRow(3), createTableRow(3), createTableRow(3));

  wrapper.append(
    grid,
    createTableControl("column", "Añadir columna"),
    createTableControl("row", "Añadir fila"),
  );
  ensureTableHandles(wrapper);
  return wrapper;
}

export function insertTableIntoBlock(block: HTMLElement, availableWidth: number): HTMLSpanElement {
  const table = createTable(availableWidth);
  block.replaceChildren(table);
  return table;
}

export function ensureTableRuntime(editor: HTMLElement): boolean {
  let changed = false;
  Array.from(editor.querySelectorAll<HTMLElement>(TABLE_SELECTOR))
    .filter((table) => getTableRootFromNode(table) === table)
    .forEach((table) => {
    if (table.hasAttribute("contenteditable")) {
      table.removeAttribute("contenteditable");
      changed = true;
    }
    if (!table.querySelector(":scope > [data-his-table-grid]")) return;
    table.querySelectorAll<HTMLElement>("[data-his-table-cell]").forEach((cell) => {
      if (cell.hasAttribute("contenteditable")) {
        cell.removeAttribute("contenteditable");
        changed = true;
      }
      getEditableBlockFromTableCell(cell);
    });
    if (!table.querySelector(":scope > [data-his-table-add=column]")) {
      table.appendChild(createTableControl("column", "Añadir columna"));
      changed = true;
    }
    if (!table.querySelector(":scope > [data-his-table-add=row]")) {
      table.appendChild(createTableControl("row", "Añadir fila"));
      changed = true;
    }
    if (ensureTableHandles(table)) changed = true;
    updateTableOverflowState(table);
  });
  return changed;
}

export function setHoveredTableHandles(editor: HTMLElement, source: Node | null): void {
  const hoveredAttribute = "data-his-table-hovered";
  const sourceElement = source?.nodeType === Node.ELEMENT_NODE
    ? source as HTMLElement
    : source?.parentElement ?? null;
  const sourceHandle = sourceElement?.closest<HTMLElement>("[data-his-table-handle]") ?? null;
  const cell = getTableCellFromNode(source);
  const activeHandles = new Set<HTMLElement>();

  if (cell && editor.contains(cell)) {
    const row = cell.closest<HTMLElement>(TABLE_ROW_SELECTOR);
    const grid = cell.closest<HTMLElement>("[data-his-table-grid]");
    const columnIndex = row
      ? Array.from(row.querySelectorAll<HTMLElement>(`:scope > ${TABLE_CELL_SELECTOR}`)).indexOf(cell)
      : -1;
    const rowHandle = row?.querySelector<HTMLElement>(":scope > [data-his-table-handle=row]") ?? null;
    const columnHandle = columnIndex >= 0
      ? grid?.querySelector<HTMLElement>(`:scope > [data-his-table-column-handles] > [data-his-table-handle=column][data-his-table-column-index="${columnIndex}"]`) ?? null
      : null;
    if (rowHandle) activeHandles.add(rowHandle);
    if (columnHandle) activeHandles.add(columnHandle);
  }
  if (sourceHandle) activeHandles.add(sourceHandle);

  editor.querySelectorAll<HTMLElement>(`[data-his-table-handle][${hoveredAttribute}]`).forEach((handle) => {
    if (!activeHandles.has(handle)) handle.removeAttribute(hoveredAttribute);
  });
  activeHandles.forEach((handle) => handle.setAttribute(hoveredAttribute, "true"));
}

export function addTableColumn(table: HTMLElement): void {
  const grid = table.querySelector<HTMLElement>(TABLE_GRID_SELECTOR);
  if (!grid) return;
  const widths = getColumnWidths(grid);
  const nextWidth = TABLE_MIN_COLUMN_WIDTH_PX;
  grid.querySelectorAll<HTMLElement>(TABLE_ROW_SELECTOR).forEach((row) => row.appendChild(createTableCell()));
  const columns = grid.querySelector(TABLE_ROW_SELECTOR)?.children.length ?? 1;
  grid.style.setProperty("--his-table-columns", String(columns));
  grid.style.setProperty("--his-table-columns-template", [...widths, nextWidth].map((width) => `${width}px`).join(" "));
  const contentWidth = widths.reduce((total, width) => total + width, 0) + nextWidth;
  table.style.setProperty("--his-table-content-width", `${Math.max(TABLE_MIN_WIDTH_PX - 32, contentWidth)}px`);
}

export function addTableRow(table: HTMLElement): void {
  const grid = table.querySelector<HTMLElement>(TABLE_GRID_SELECTOR);
  if (!grid) return;
  const columns = Math.max(1, grid.querySelector(TABLE_ROW_SELECTOR)?.querySelectorAll(`:scope > ${TABLE_CELL_SELECTOR}`).length ?? 1);
  grid.appendChild(createTableRow(columns));
}

export function setTableColumnCount(table: HTMLElement, count: number): void {
  const grid = table.querySelector<HTMLElement>(TABLE_GRID_SELECTOR);
  if (!grid) return;
  const current = getTableColumnCount(table);
  const target = Math.max(1, Math.round(count));
  if (target > current) {
    for (let index = current; index < target; index += 1) addTableColumn(table);
    return;
  }
  if (target < current) {
    grid.querySelectorAll<HTMLElement>(TABLE_ROW_SELECTOR).forEach((row) => {
      const rowCells = Array.from(row.querySelectorAll<HTMLElement>(`:scope > ${TABLE_CELL_SELECTOR}`));
      rowCells.slice(target).forEach((cell) => cell.remove());
    });
    const widths = getColumnWidths(grid).slice(0, target);
    grid.style.setProperty("--his-table-columns", String(target));
    grid.style.setProperty("--his-table-columns-template", widths.map((width) => `${width}px`).join(" "));
  }
}

export function findTableControl(target: Element): TableControl | null {
  const control = target.closest<HTMLButtonElement>("[data-his-table-add]");
  const table = getTableRootFromNode(control);
  if (!control || !table) return null;
  return {
    table,
    axis: control.dataset.hisTableAdd === "column" ? "column" : "row",
    control,
  };
}

export function addTableControl({ table, axis }: TableControl): void {
  if (axis === "column") addTableColumn(table);
  else addTableRow(table);
}

interface TableResizeEdge {
  axis: "column";
  index: number;
  selectedColumn: number;
  outerRight?: boolean;
}

function getResizeEdgeAtPoint(editor: HTMLElement, clientX: number, clientY: number): { cell: HTMLElement; edge: TableResizeEdge } | null {
  let closest: { cell: HTMLElement; edge: TableResizeEdge; distance: number } | null = null;
  editor.querySelectorAll<HTMLElement>("[data-his-table-grid]").forEach((grid) => {
    const gridRect = grid.getBoundingClientRect();
    if (clientY < gridRect.top || clientY > gridRect.bottom) return;
    const firstRow = grid.querySelector<HTMLElement>(TABLE_ROW_SELECTOR);
    const cells = firstRow
      ? Array.from(firstRow.querySelectorAll<HTMLElement>(`:scope > ${TABLE_CELL_SELECTOR}`))
      : [];
    cells.forEach((cell, index) => {
      const boundaryX = cell.getBoundingClientRect().right;
      const distance = Math.abs(clientX - boundaryX);
      if (distance > TABLE_RESIZE_EDGE_PX || (closest && distance >= closest.distance)) return;
      const outerRight = index === cells.length - 1;
      closest = {
        cell,
        edge: {
          axis: "column",
          index,
          selectedColumn: outerRight ? index : Math.min(Math.max(1, index + 1), cells.length - 2),
          outerRight,
        },
        distance,
      };
    });
  });
  return closest;
}

function markTableResizeBoundary(grid: HTMLElement, boundaryIndex: number, dragging = false): void {
  let guide = grid.querySelector<HTMLElement>(":scope > [data-his-table-resize-guide]");
  if (!guide) {
    guide = document.createElement("span");
    guide.dataset.editorUi = "true";
    guide.dataset.hisTableResizeGuide = "true";
    guide.contentEditable = "false";
    grid.appendChild(guide);
  }
  const firstRow = grid.querySelector<HTMLElement>(TABLE_ROW_SELECTOR);
  const boundaryCell = firstRow?.querySelectorAll<HTMLElement>(`:scope > ${TABLE_CELL_SELECTOR}`)[boundaryIndex];
  if (boundaryCell) guide.style.left = `${boundaryCell.offsetLeft + boundaryCell.offsetWidth}px`;
  grid.querySelectorAll<HTMLElement>(TABLE_ROW_SELECTOR).forEach((row) => {
    const cell = Array.from(row.querySelectorAll<HTMLElement>(`:scope > ${TABLE_CELL_SELECTOR}`))[boundaryIndex];
    if (!cell) return;
    cell.dataset.hisTableResizeEdge = "right";
    if (dragging) cell.dataset.hisTableResizeDragging = "true";
  });
}

function clearTableResizeBoundary(editor: HTMLElement): void {
  editor.querySelectorAll("[data-his-table-resize-guide]").forEach((guide) => guide.remove());
  editor.querySelectorAll<HTMLElement>("[data-his-table-resize-edge], [data-his-table-resize-dragging]").forEach((item) => {
    item.removeAttribute("data-his-table-resize-edge");
    item.removeAttribute("data-his-table-resize-dragging");
  });
}

function getColumnWidths(grid: HTMLElement): number[] {
  const firstRow = grid.querySelector<HTMLElement>(TABLE_ROW_SELECTOR);
  return firstRow
    ? Array.from(firstRow.querySelectorAll<HTMLElement>(`:scope > ${TABLE_CELL_SELECTOR}`)).map((cell) => Math.max(TABLE_MIN_TRACK_PX, Math.round(cell.getBoundingClientRect().width)))
    : [];
}

function resizeTableColumn(grid: HTMLElement, columnIndex: number, delta: number, initialWidths: number[]): void {
  const widths = [...initialWidths];
  if (!widths[columnIndex] || !widths[columnIndex + 1]) return;
  if (delta > 0) {
    const maximumDelta = widths.slice(columnIndex + 1).reduce(
      (total, width) => total + Math.max(0, width - TABLE_MIN_TRACK_PX),
      0,
    );
    let remaining = Math.min(delta, maximumDelta);
    widths[columnIndex] += remaining;
    for (let index = columnIndex + 1; index < widths.length && remaining > 0; index += 1) {
      const available = Math.max(0, widths[index] - TABLE_MIN_TRACK_PX);
      const reduction = Math.min(available, remaining);
      widths[index] -= reduction;
      remaining -= reduction;
    }
  } else if (delta < 0) {
    const maximumDelta = widths.slice(0, columnIndex + 1).reduce(
      (total, width) => total + Math.max(0, width - TABLE_MIN_TRACK_PX),
      0,
    );
    let remaining = Math.min(-delta, maximumDelta);
    widths[columnIndex + 1] += remaining;
    for (let index = columnIndex; index >= 0 && remaining > 0; index -= 1) {
      const available = Math.max(0, widths[index] - TABLE_MIN_TRACK_PX);
      const reduction = Math.min(available, remaining);
      widths[index] -= reduction;
      remaining -= reduction;
    }
  }
  grid.style.setProperty("--his-table-columns-template", widths.map((width) => `${width}px`).join(" "));
}

export function translateColumnWidthsForShift(
  initialWidths: number[],
  selectedColumn: number,
  delta: number,
): number[] {
  if (selectedColumn <= 0 || selectedColumn >= initialWidths.length - 1) return [...initialWidths];
  const widths = [...initialWidths];
  const leftNeighbor = selectedColumn - 1;
  const rightNeighbor = selectedColumn + 1;
  const maximumMovement = delta >= 0
    ? Math.max(0, widths[rightNeighbor] - TABLE_MIN_TRACK_PX)
    : Math.max(0, widths[leftNeighbor] - TABLE_MIN_TRACK_PX);
  const movement = Math.min(Math.abs(delta), maximumMovement);
  if (!movement) return widths;
  const signedMovement = delta >= 0 ? movement : -movement;
  widths[leftNeighbor] += signedMovement;
  widths[rightNeighbor] -= signedMovement;
  return widths;
}

function translateTableColumnWithShift(
  grid: HTMLElement,
  selectedColumn: number,
  delta: number,
  initialWidths: number[],
): void {
  const widths = translateColumnWidthsForShift(initialWidths, selectedColumn, delta);
  if (widths.every((width, index) => width === initialWidths[index])) return;
  grid.style.setProperty("--his-table-columns-template", widths.map((width) => `${width}px`).join(" "));
}

function resizeTableWidth(
  table: HTMLElement,
  grid: HTMLElement,
  initialWidths: number[],
  delta: number,
  rightWall: number,
): void {
  const widths = [...initialWidths];
  const tableLeft = table.getBoundingClientRect().left;
  const minimumContentWidth = TABLE_MIN_WIDTH_PX - 32;
  const availableContentWidth = Math.max(minimumContentWidth, rightWall - tableLeft - 32);
  const initialContentWidth = widths.reduce((total, width) => total + width, 0);
  const nextContentWidth = Math.min(
    availableContentWidth,
    Math.max(minimumContentWidth, initialContentWidth + delta),
  );
  const requestedDelta = nextContentWidth - initialContentWidth;
  if (requestedDelta >= 0) {
    if (widths.length) widths[widths.length - 1] += requestedDelta;
    grid.style.setProperty("--his-table-columns-template", widths.map((width) => `${width}px`).join(" "));
    table.style.setProperty("--his-table-content-width", `${Math.round(nextContentWidth)}px`);
    return;
  }
  let remainingReduction = -requestedDelta;
  for (let index = widths.length - 1; index >= 0 && remainingReduction > 0; index -= 1) {
    const availableReduction = Math.max(0, widths[index] - TABLE_MIN_TRACK_PX);
    const reduction = Math.min(availableReduction, remainingReduction);
    widths[index] -= reduction;
    remainingReduction -= reduction;
  }
  grid.style.setProperty("--his-table-columns-template", widths.map((width) => `${width}px`).join(" "));
  table.style.setProperty("--his-table-content-width", `${Math.round(nextContentWidth)}px`);
}

function scrollTableWithWheel(event: WheelEvent): void {
  const target = event.target as Element | null;
  const table = getTableRootFromNode(target);
  if (!table) return;
  if (!hasMeaningfulHorizontalOverflow(table)) return;
  const delta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  event.preventDefault();
  table.scrollLeft += delta;
}

export function installTableResizeHandlers(editor: HTMLElement): () => void {
  const isShiftPressed = (event: PointerEvent): boolean =>
    event.shiftKey || event.getModifierState("Shift");
  let drag: {
    axis: "column";
    cell: HTMLElement;
    grid: HTMLElement;
    table: HTMLElement;
    row: HTMLElement;
    boundaryIndex: number;
    selectedColumn: number;
    outerRight: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    initialWidths: number[];
    rightWall: number;
    shift: boolean;
  } | null = null;
  editor.addEventListener("wheel", scrollTableWithWheel, { passive: false });

  const updateCursor = (event: PointerEvent) => {
    if (drag) return;
    if (!(event.target instanceof Element) || !editor.contains(event.target) || event.target.closest("[data-editor-ui], button, input, .his-table-menu-layer, [data-color-picker]")) {
      clearTableResizeBoundary(editor);
      editor.dataset.tableResize = "";
      return;
    }
    const hit = getResizeEdgeAtPoint(editor, event.clientX, event.clientY);
    clearTableResizeBoundary(editor);
    if (!hit) {
      editor.dataset.tableResize = "";
      return;
    }
    const grid = hit.cell.closest<HTMLElement>("[data-his-table-grid]");
    if (grid) markTableResizeBoundary(grid, hit.edge.index);
    editor.dataset.tableResize = hit.edge.axis;
  };
  const startResize = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.target instanceof Element) || !editor.contains(event.target) || event.target.closest("[data-editor-ui], button, input, .his-table-menu-layer, [data-color-picker]")) return;
    const hit = getResizeEdgeAtPoint(editor, event.clientX, event.clientY);
    if (!hit) return;
    const { cell, edge } = hit;
    const grid = cell.closest<HTMLElement>("[data-his-table-grid]");
    const row = cell.closest<HTMLElement>("[data-his-table-row]");
    if (!grid || !row) return;
    editor.dispatchEvent(new CustomEvent("his-table-before-change"));
    drag = {
      axis: edge.axis,
      cell,
      grid,
      table: getTableRootFromNode(cell)!,
      row,
      boundaryIndex: edge.index,
      selectedColumn: edge.selectedColumn,
      outerRight: Boolean(edge.outerRight),
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialWidths: getColumnWidths(grid),
      rightWall: editor.getBoundingClientRect().right,
      shift: isShiftPressed(event),
    };
    event.preventDefault();
    event.stopPropagation();
    try {
      cell.setPointerCapture(event.pointerId);
    } catch {}
    clearTableResizeBoundary(editor);
    markTableResizeBoundary(grid, edge.index, true);
    editor.dataset.tableResize = edge.axis;
    document.body.style.cursor = edge.axis === "column" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  };
  const moveResize = (event: PointerEvent) => {
    if (!drag) return;
    const shift = isShiftPressed(event);
    if (shift !== drag.shift) {
      drag.initialWidths = getColumnWidths(drag.grid);
      drag.startX = event.clientX;
      drag.shift = shift;
      return;
    }
    const delta = event.clientX - drag.startX;
    if (drag.outerRight) resizeTableWidth(drag.table, drag.grid, drag.initialWidths, delta, drag.rightWall);
    else if (drag.shift) {
      translateTableColumnWithShift(
        drag.grid,
        drag.selectedColumn,
        delta,
        drag.initialWidths,
      );
    }
    else resizeTableColumn(drag.grid, drag.boundaryIndex, delta, drag.initialWidths);
    markTableResizeBoundary(drag.grid, drag.boundaryIndex, true);
  };
  const finishResize = () => {
    if (!drag) return;
    updateTableOverflowState(drag.table);
    drag = null;
    clearTableResizeBoundary(editor);
    editor.dataset.tableResize = "";
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    editor.dispatchEvent(new CustomEvent("his-table-change"));
  };

  document.addEventListener("pointermove", updateCursor, true);
  document.addEventListener("pointerdown", startResize, true);
  document.addEventListener("pointermove", moveResize, true);
  document.addEventListener("pointerup", finishResize, true);
  document.addEventListener("pointercancel", finishResize, true);
  const cancelResize = (event: KeyboardEvent) => { if (event.key === "Escape") finishResize(); };
  const cancelOnBlur = () => finishResize();
  document.addEventListener("keydown", cancelResize, true);
  window.addEventListener("blur", cancelOnBlur);
  return () => {
    editor.removeEventListener("wheel", scrollTableWithWheel);
    document.removeEventListener("pointermove", updateCursor, true);
    document.removeEventListener("pointerdown", startResize, true);
    document.removeEventListener("pointermove", moveResize, true);
    document.removeEventListener("pointerup", finishResize, true);
    document.removeEventListener("pointercancel", finishResize, true);
    document.removeEventListener("keydown", cancelResize, true);
    window.removeEventListener("blur", cancelOnBlur);
    finishResize();
  };
}
