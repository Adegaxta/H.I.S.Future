import addAsset from "../assets/third-party/google-material/icons/add.svg";
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
const TABLE_INITIAL_CONTENT_WIDTH_PX = 360;

export function isTableEditingTarget(source: Node | null): boolean {
  const element = source?.nodeType === Node.ELEMENT_NODE
    ? source as Element
    : source?.parentElement;
  return Boolean(element?.closest(TABLE_SELECTOR));
}

function tableCellFromNode(source: Node | null): HTMLElement | null {
  const element = source?.nodeType === Node.ELEMENT_NODE
    ? source as Element
    : source?.parentElement;
  return element?.closest<HTMLElement>("[data-his-table-cell]") ?? null;
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
  cell.appendChild(document.createElement("br"));
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

export function createTable(): HTMLSpanElement {
  const wrapper = document.createElement("span");
  wrapper.dataset.hisTable = "true";

  const grid = document.createElement("span");
  grid.dataset.hisTableGrid = "true";
  grid.setAttribute("role", "table");
  grid.style.setProperty("--his-table-columns", "3");
  wrapper.style.setProperty("--his-table-content-width", `${TABLE_INITIAL_CONTENT_WIDTH_PX}px`);
  grid.append(createTableRow(3), createTableRow(3), createTableRow(3));

  wrapper.append(
    grid,
    createTableControl("column", "Añadir columna"),
    createTableControl("row", "Añadir fila"),
  );
  return wrapper;
}

export function insertTableIntoBlock(block: HTMLElement): HTMLSpanElement {
  const table = createTable();
  block.replaceChildren(table);
  return table;
}

export function ensureTableRuntime(editor: HTMLElement): boolean {
  let changed = false;
  editor.querySelectorAll<HTMLElement>("[data-his-table]").forEach((table) => {
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
    });
    if (!table.querySelector(":scope > [data-his-table-add=column]")) {
      table.appendChild(createTableControl("column", "Añadir columna"));
      changed = true;
    }
    if (!table.querySelector(":scope > [data-his-table-add=row]")) {
      table.appendChild(createTableControl("row", "Añadir fila"));
      changed = true;
    }
  });
  return changed;
}

export function addTableColumn(table: HTMLElement): void {
  const grid = table.querySelector<HTMLElement>(TABLE_GRID_SELECTOR);
  if (!grid) return;
  const widths = getColumnWidths(grid);
  const nextWidth = TABLE_MIN_TRACK_PX;
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
  const columns = Math.max(1, grid.querySelector(TABLE_ROW_SELECTOR)?.children.length ?? 1);
  grid.appendChild(createTableRow(columns));
}

export function findTableControl(target: Element): TableControl | null {
  const control = target.closest<HTMLButtonElement>("[data-his-table-add]");
  const table = control?.closest<HTMLElement>(TABLE_SELECTOR);
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

function getCellResizeEdge(cell: HTMLElement, clientX: number): TableResizeEdge | null {
  const rect = cell.getBoundingClientRect();
  const nearRight = Math.abs(clientX - rect.right) <= TABLE_RESIZE_EDGE_PX;
  const nearLeft = Math.abs(clientX - rect.left) <= TABLE_RESIZE_EDGE_PX;
  const row = cell.closest<HTMLElement>("[data-his-table-row]");
  if (!row) return null;
  const columnCount = row.querySelectorAll(TABLE_CELL_SELECTOR).length;
  const columnIndex = Array.from(row.querySelectorAll(TABLE_CELL_SELECTOR)).indexOf(cell);
  if (nearRight && columnIndex >= 0 && columnIndex < columnCount - 1) {
    return { axis: "column", index: columnIndex, selectedColumn: columnIndex };
  }
  if (nearRight && columnIndex === columnCount - 1) {
    return { axis: "column", index: columnIndex, selectedColumn: columnIndex, outerRight: true };
  }
  if (nearLeft && columnIndex > 0) {
    return { axis: "column", index: columnIndex - 1, selectedColumn: columnIndex };
  }
  return null;
}

function getResizeEdgeAtPoint(editor: HTMLElement, clientX: number, clientY: number): { cell: HTMLElement; edge: TableResizeEdge } | null {
  let closest: { cell: HTMLElement; edge: TableResizeEdge; distance: number } | null = null;
  editor.querySelectorAll<HTMLElement>(TABLE_CELL_SELECTOR).forEach((cell) => {
    const rect = cell.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (clientY >= rect.top && clientY <= rect.bottom) {
      if (Math.abs(clientX - rect.left) > TABLE_RESIZE_EDGE_PX && Math.abs(clientX - rect.right) > TABLE_RESIZE_EDGE_PX) return;
      const edge = getCellResizeEdge(cell, clientX);
      if (edge) {
        const distance = Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right));
        const isSharedInteriorBoundary = !edge.outerRight;
        if (
          !closest ||
          distance < closest.distance ||
          (distance === closest.distance && isSharedInteriorBoundary)
        ) {
          const row = cell.closest<HTMLElement>("[data-his-table-row]");
          const columnCount = row?.querySelectorAll(TABLE_CELL_SELECTOR).length ?? 0;
          const selectedColumn = isSharedInteriorBoundary
            ? Math.min(edge.index + 1, columnCount - 2)
            : edge.selectedColumn;
          closest = {
            cell,
            edge: { ...edge, selectedColumn },
            distance,
          };
        }
      }
    }
  });
  return closest;
}

function getColumnWidths(grid: HTMLElement): number[] {
  const firstRow = grid.querySelector<HTMLElement>(TABLE_ROW_SELECTOR);
  return firstRow
    ? Array.from(firstRow.children).map((cell) => Math.max(TABLE_MIN_TRACK_PX, Math.round(cell.getBoundingClientRect().width)))
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
  const table = target?.closest<HTMLElement>(TABLE_SELECTOR);
  if (!table) return;
  if (table.scrollWidth <= table.clientWidth) return;
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
    const hit = getResizeEdgeAtPoint(editor, event.clientX, event.clientY);
    if (!hit) {
      editor.dataset.tableResize = "";
      return;
    }
    editor.dataset.tableResize = hit.edge.axis;
  };
  const startResize = (event: PointerEvent) => {
    const hit = getResizeEdgeAtPoint(editor, event.clientX, event.clientY);
    if (!hit) return;
    const { cell, edge } = hit;
    const grid = cell.closest<HTMLElement>("[data-his-table-grid]");
    const row = cell.closest<HTMLElement>("[data-his-table-row]");
    if (!grid || !row) return;
    drag = {
      axis: edge.axis,
      cell,
      grid,
      table: cell.closest<HTMLElement>(TABLE_SELECTOR)!,
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
  };
  const finishResize = () => {
    if (!drag) return;
    drag = null;
    editor.dataset.tableResize = "";
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  document.addEventListener("pointermove", updateCursor, true);
  document.addEventListener("pointerdown", startResize, true);
  document.addEventListener("pointermove", moveResize, true);
  document.addEventListener("pointerup", finishResize, true);
  document.addEventListener("pointercancel", finishResize, true);
  return () => {
    editor.removeEventListener("wheel", scrollTableWithWheel);
    document.removeEventListener("pointermove", updateCursor, true);
    document.removeEventListener("pointerdown", startResize, true);
    document.removeEventListener("pointermove", moveResize, true);
    document.removeEventListener("pointerup", finishResize, true);
    document.removeEventListener("pointercancel", finishResize, true);
    finishResize();
  };
}