import { getTableCellFromNode, getTableRootFromNode } from "./table";
import type { TableTarget } from "./tableActions";

export const TABLE_ACTIVE = "data-his-table-active";
export const TABLE_SELECTED = "data-his-table-selected";
export const TABLE_SELECTION_EDGE = "data-his-table-selection-edge";
export const TABLE_UNIT_SELECTED = "data-his-table-unit-selected";
export const TABLE_UNIT_EDGE = "data-his-table-unit-edge";

export function getActiveTableCell(editor: HTMLElement): HTMLElement | null {
  return editor.querySelector<HTMLElement>(`[data-his-table-cell][${TABLE_ACTIVE}]`);
}

export function getSelectedTableCells(editor: HTMLElement, table?: HTMLElement | null): HTMLElement[] {
  return Array.from((table ?? editor).querySelectorAll<HTMLElement>(`[data-his-table-cell][${TABLE_SELECTED}]`));
}

export function setActiveTableCell(editor: HTMLElement, cell: HTMLElement | null): void {
  editor.querySelectorAll<HTMLElement>(`[data-his-table-cell][${TABLE_ACTIVE}]`).forEach((item) => {
    if (item !== cell) item.removeAttribute(TABLE_ACTIVE);
  });
  if (cell && editor.contains(cell)) cell.setAttribute(TABLE_ACTIVE, "true");
}

export function clearTableCellSelection(editor: HTMLElement): void {
  editor.querySelectorAll<HTMLElement>(`[data-his-table-cell][${TABLE_SELECTED}]`).forEach((cell) => {
    cell.removeAttribute(TABLE_SELECTED);
    cell.removeAttribute(TABLE_SELECTION_EDGE);
  });
  clearTableUnitSelection(editor);
}

function clearTableUnitSelection(editor: HTMLElement): void {
  editor.querySelectorAll<HTMLElement>(`[data-his-table-cell][${TABLE_UNIT_SELECTED}]`).forEach((cell) => {
    cell.removeAttribute(TABLE_UNIT_SELECTED);
    cell.removeAttribute(TABLE_UNIT_EDGE);
  });
  editor.querySelectorAll<HTMLElement>("[data-his-table-handle][data-his-table-selected-unit]").forEach((handle) => handle.removeAttribute("data-his-table-selected-unit"));
}

export function toggleTableCellSelection(editor: HTMLElement, cell: HTMLElement): boolean {
  clearTableUnitSelection(editor);
  const table = getTableRootFromNode(cell);
  editor.querySelectorAll<HTMLElement>(`[data-his-table-cell][${TABLE_SELECTED}]`).forEach((selected) => {
    if (getTableRootFromNode(selected) !== table) {
      selected.removeAttribute(TABLE_SELECTED);
      selected.removeAttribute(TABLE_SELECTION_EDGE);
    }
  });
  const selected = cell.hasAttribute(TABLE_SELECTED);
  if (selected) cell.removeAttribute(TABLE_SELECTED);
  else cell.setAttribute(TABLE_SELECTED, "true");
  syncMultiSelectionEdges(table);
  setActiveTableCell(editor, cell);
  return !selected;
}

function syncMultiSelectionEdges(table: HTMLElement | null): void {
  if (!table) return;
  const tableRows = Array.from(table.querySelectorAll<HTMLElement>(":scope > [data-his-table-grid] > [data-his-table-row]"));
  const matrix = tableRows.map((row) => Array.from(row.querySelectorAll<HTMLElement>(":scope > [data-his-table-cell]")));
  const selected = new Set(matrix.flat().filter((item) => item.hasAttribute(TABLE_SELECTED)));
  matrix.forEach((row, rowIndex) => row.forEach((item, columnIndex) => {
    item.removeAttribute(TABLE_SELECTION_EDGE);
    if (!selected.has(item)) return;
    const edges: string[] = [];
    if (!selected.has(matrix[rowIndex - 1]?.[columnIndex])) edges.push("top");
    if (!selected.has(matrix[rowIndex + 1]?.[columnIndex])) edges.push("bottom");
    if (!selected.has(row[columnIndex - 1])) edges.push("left");
    if (!selected.has(row[columnIndex + 1])) edges.push("right");
    item.setAttribute(TABLE_SELECTION_EDGE, edges.join(" "));
  }));
}

export function selectTableUnit(
  editor: HTMLElement,
  target: TableTarget,
  kind: "row" | "column",
  handle: HTMLElement,
): HTMLElement[] {
  clearTableCellSelection(editor);
  const selected = kind === "row"
    ? Array.from(target.row.querySelectorAll<HTMLElement>(":scope > [data-his-table-cell]"))
    : Array.from(target.table.querySelectorAll<HTMLElement>(":scope > [data-his-table-grid] > [data-his-table-row]"))
      .flatMap((row) => Array.from(row.querySelectorAll<HTMLElement>(":scope > [data-his-table-cell]"))[target.columnIndex] ?? []);
  selected.forEach((cell, index) => {
    cell.setAttribute(TABLE_UNIT_SELECTED, kind);
    if (selected.length === 1) cell.setAttribute(TABLE_UNIT_EDGE, "both");
    else if (index === 0) cell.setAttribute(TABLE_UNIT_EDGE, "start");
    else if (index === selected.length - 1) cell.setAttribute(TABLE_UNIT_EDGE, "end");
  });
  handle.dataset.hisTableSelectedUnit = "true";
  setActiveTableCell(editor, target.cell);
  return selected;
}

export function syncActiveTableCellFromSelection(editor: HTMLElement): HTMLElement | null {
  const selection = window.getSelection();
  const cell = selection?.rangeCount ? getTableCellFromNode(selection.focusNode) : null;
  setActiveTableCell(editor, cell && editor.contains(cell) ? cell : null);
  return cell;
}

export function focusTableCell(cell: HTMLElement, atEnd = false): void {
  const content = cell.querySelector<HTMLElement>(":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > blockquote, :scope > li, :scope > pre") ?? cell;
  (cell.closest(".editor-content") as HTMLElement | null)?.focus({ preventScroll: true });
  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(!atEnd);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function focusTableCellAtPoint(cell: HTMLElement, clientX: number, clientY: number): void {
  const editor = cell.closest<HTMLElement>(".editor-content");
  const content = cell.querySelector<HTMLElement>(":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > blockquote, :scope > li, :scope > pre");
  editor?.focus({ preventScroll: true });
  const documentWithCaret = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = documentWithCaret.caretPositionFromPoint?.(clientX, clientY);
  const range = document.createRange();
  if (position && content?.contains(position.offsetNode)) {
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
  } else {
    const pointRange = documentWithCaret.caretRangeFromPoint?.(clientX, clientY);
    if (!pointRange || !content?.contains(pointRange.startContainer)) {
      focusTableCell(cell, true);
      return;
    }
    range.setStart(pointRange.startContainer, pointRange.startOffset);
    range.collapse(true);
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function moveTableCellFocus(cell: HTMLElement, backwards: boolean): HTMLElement | null {
  const table = getTableRootFromNode(cell);
  if (!table) return null;
  const all = Array.from(table.querySelectorAll<HTMLElement>("[data-his-table-cell]"));
  const index = all.indexOf(cell);
  const next = all[index + (backwards ? -1 : 1)] ?? null;
  if (next) focusTableCell(next);
  return next;
}
