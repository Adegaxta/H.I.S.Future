import { mutedEditorBackground } from "./blockColors";
import {
  TABLE_MIN_COLUMN_WIDTH_PX,
  getTableColumnCount,
  getTableRootFromNode,
  updateTableOverflowState,
} from "./table";

export type TableContext = "cell" | "row" | "column";
export type TableDirection = "left" | "right" | "up" | "down";
export type TableVerticalAlign = "start" | "center" | "end";
export type TableTextAlign = "left" | "center" | "right" | "justify";

const ROW = ":scope > [data-his-table-row]";
const CELL = ":scope > [data-his-table-cell]";

export interface TableTarget {
  table: HTMLElement;
  cell: HTMLElement;
  row: HTMLElement;
  rowIndex: number;
  columnIndex: number;
}

export function resolveTableTarget(source: Node | null): TableTarget | null {
  const element = source?.nodeType === Node.ELEMENT_NODE ? source as Element : source?.parentElement;
  const columnHandle = element?.closest<HTMLElement>("[data-his-table-handle=column]");
  if (columnHandle) {
    const table = getTableRootFromNode(columnHandle);
    const tableRows = table ? rows(table) : [];
    const columnIndex = Number.parseInt(columnHandle.dataset.hisTableColumnIndex ?? "", 10);
    const cell = tableRows[0] && Number.isInteger(columnIndex) ? cellAt(tableRows[0], columnIndex) : null;
    if (!table || !cell || !tableRows[0]) return null;
    return { table, cell, row: tableRows[0], rowIndex: 0, columnIndex };
  }
  const containingRow = element?.closest<HTMLElement>("[data-his-table-row]");
  const cell = element?.closest<HTMLElement>("[data-his-table-cell]") ?? containingRow?.querySelector<HTMLElement>(CELL);
  const row = cell?.closest<HTMLElement>("[data-his-table-row]");
  const table = getTableRootFromNode(cell ?? null);
  const grid = row?.parentElement;
  if (!cell || !row || !table || !grid) return null;
  return {
    table,
    cell,
    row,
    rowIndex: Array.from(grid.querySelectorAll<HTMLElement>(ROW)).indexOf(row),
    columnIndex: Array.from(row.querySelectorAll<HTMLElement>(CELL)).indexOf(cell),
  };
}

export function cellsForContext(target: TableTarget, context: TableContext, selected: readonly HTMLElement[] = []): HTMLElement[] {
  if (context === "cell" && selected.length) return selected.filter((cell) => getTableRootFromNode(cell) === target.table);
  if (context === "row") return Array.from(target.row.querySelectorAll<HTMLElement>(CELL));
  if (context === "column") return rows(target.table).flatMap((row) => cellAt(row, target.columnIndex) ?? []);
  return [target.cell];
}

function grid(table: HTMLElement): HTMLElement | null {
  return table.querySelector<HTMLElement>(":scope > [data-his-table-grid]");
}

function rows(table: HTMLElement): HTMLElement[] {
  return Array.from(grid(table)?.querySelectorAll<HTMLElement>(ROW) ?? []);
}

function cells(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>(CELL));
}

function cellAt(row: HTMLElement, index: number): HTMLElement | null {
  return cells(row)[index] ?? null;
}

function createCellLike(source?: HTMLElement): HTMLElement {
  const cell = source?.cloneNode(true) as HTMLElement | undefined ?? document.createElement("span");
  cell.dataset.hisTableCell = "true";
  cell.setAttribute("role", "cell");
  cell.removeAttribute("data-his-table-active");
  cell.removeAttribute("data-his-table-selected");
  cell.querySelectorAll("[data-editor-ui]").forEach((item) => item.remove());
  if (!source) cell.innerHTML = "<p><br></p>";
  return cell;
}

function createRowLike(source: HTMLElement, copyContent: boolean): HTMLElement {
  const row = document.createElement("span");
  row.dataset.hisTableRow = "true";
  row.setAttribute("role", "row");
  cells(source).forEach((cell) => row.appendChild(copyContent ? createCellLike(cell) : createCellLike()));
  return row;
}

export function readColumnWidths(table: HTMLElement): number[] {
  const tableGrid = grid(table);
  if (!tableGrid) return [];
  const raw = tableGrid.style.getPropertyValue("--his-table-columns-template");
  const parsed = raw.split(/\s+/).map((part) => Number.parseFloat(part)).filter(Number.isFinite);
  if (parsed.length === getTableColumnCount(table)) return parsed;
  const first = rows(table)[0];
  return first ? cells(first).map((cell) => Math.max(TABLE_MIN_COLUMN_WIDTH_PX, cell.getBoundingClientRect().width)) : [];
}

export function writeColumnWidths(table: HTMLElement, widths: readonly number[]): void {
  const tableGrid = grid(table);
  if (!tableGrid || !widths.length) return;
  const safe = widths.map((width) => Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(width)));
  tableGrid.style.setProperty("--his-table-columns", String(safe.length));
  tableGrid.style.setProperty("--his-table-columns-template", safe.map((width) => `${width}px`).join(" "));
  table.style.setProperty("--his-table-content-width", `${safe.reduce((sum, width) => sum + width, 0)}px`);
  updateTableOverflowState(table);
}

export function insertTableRow(target: TableTarget, after: boolean, copy = false): HTMLElement {
  const next = createRowLike(target.row, copy);
  target.row.parentElement?.insertBefore(next, after ? target.row.nextSibling : target.row);
  return next;
}

export function insertTableColumn(target: TableTarget, after: boolean, copy = false): HTMLElement[] {
  const index = target.columnIndex + (after ? 1 : 0);
  const inserted: HTMLElement[] = [];
  rows(target.table).forEach((row) => {
    const source = copy ? cellAt(row, target.columnIndex) ?? undefined : undefined;
    const next = createCellLike(source);
    const reference = cellAt(row, index);
    row.insertBefore(next, reference);
    inserted.push(next);
  });
  const widths = readColumnWidths(target.table);
  const sourceWidth = widths[target.columnIndex] ?? TABLE_MIN_COLUMN_WIDTH_PX;
  widths.splice(index, 0, sourceWidth);
  writeColumnWidths(target.table, widths);
  return inserted;
}

export function moveTableRow(target: TableTarget, direction: "up" | "down"): boolean {
  const sibling = direction === "up" ? target.row.previousElementSibling : target.row.nextElementSibling;
  if (!(sibling instanceof HTMLElement) || !sibling.matches("[data-his-table-row]")) return false;
  if (direction === "up") sibling.before(target.row);
  else sibling.after(target.row);
  return true;
}

export function moveTableColumn(target: TableTarget, direction: "left" | "right"): boolean {
  const destination = target.columnIndex + (direction === "left" ? -1 : 1);
  if (destination < 0 || destination >= getTableColumnCount(target.table)) return false;
  rows(target.table).forEach((row) => {
    const source = cellAt(row, target.columnIndex);
    const destinationCell = cellAt(row, destination);
    if (!source || !destinationCell) return;
    if (direction === "left") destinationCell.before(source);
    else destinationCell.after(source);
  });
  const widths = readColumnWidths(target.table);
  const [width] = widths.splice(target.columnIndex, 1);
  widths.splice(destination, 0, width);
  writeColumnWidths(target.table, widths);
  return true;
}

export function moveTableRowTo(source: TableTarget, destination: TableTarget): boolean {
  if (source.table !== destination.table || source.row === destination.row) return false;
  const sourceIndex = rows(source.table).indexOf(source.row);
  const destinationIndex = rows(source.table).indexOf(destination.row);
  if (sourceIndex < destinationIndex) destination.row.after(source.row);
  else destination.row.before(source.row);
  return true;
}

export function moveTableColumnTo(source: TableTarget, destination: TableTarget): boolean {
  if (source.table !== destination.table || source.columnIndex === destination.columnIndex) return false;
  const sourceIndex = source.columnIndex;
  const destinationIndex = destination.columnIndex;
  rows(source.table).forEach((row) => {
    const sourceCell = cellAt(row, sourceIndex);
    const destinationCell = cellAt(row, destinationIndex);
    if (!sourceCell || !destinationCell) return;
    if (sourceIndex < destinationIndex) destinationCell.after(sourceCell);
    else destinationCell.before(sourceCell);
  });
  const widths = readColumnWidths(source.table);
  const [width] = widths.splice(sourceIndex, 1);
  widths.splice(destinationIndex, 0, width);
  writeColumnWidths(source.table, widths);
  return true;
}

export function markTableDropTarget(target: TableTarget, context: "row" | "column"): void {
  target.table.querySelectorAll<HTMLElement>("[data-his-table-drop-target]").forEach((item) => item.removeAttribute("data-his-table-drop-target"));
  if (context === "row") {
    target.row.dataset.hisTableDropTarget = "row";
    return;
  }
  rows(target.table).forEach((row) => cellAt(row, target.columnIndex)?.setAttribute("data-his-table-drop-target", "column"));
}

export function reorderCell(target: TableTarget, direction: TableDirection): boolean {
  if (direction === "left" || direction === "right") {
    const sibling = direction === "left" ? target.cell.previousElementSibling : target.cell.nextElementSibling;
    if (!(sibling instanceof HTMLElement) || !sibling.matches("[data-his-table-cell]")) return false;
    if (direction === "left") sibling.before(target.cell);
    else sibling.after(target.cell);
    return true;
  }
  const destination = target.rowIndex + (direction === "up" ? -1 : 1);
  const other = rows(target.table)[destination] ? cellAt(rows(target.table)[destination], target.columnIndex) : null;
  if (!other) return false;
  const marker = document.createComment("his-cell-swap");
  target.cell.replaceWith(marker);
  other.replaceWith(target.cell);
  marker.replaceWith(other);
  return true;
}

export function deleteTableRow(target: TableTarget): boolean {
  if (rows(target.table).length <= 1) return false;
  target.row.remove();
  return true;
}

export function deleteTableColumn(target: TableTarget): boolean {
  if (getTableColumnCount(target.table) <= 1) return false;
  rows(target.table).forEach((row) => cellAt(row, target.columnIndex)?.remove());
  const widths = readColumnWidths(target.table);
  widths.splice(target.columnIndex, 1);
  writeColumnWidths(target.table, widths);
  return true;
}

export function toggleTableHeader(target: TableTarget, context: "row" | "column"): boolean {
  const rowMarker = "hisTableHeaderRow";
  const columnMarker = "hisTableHeaderColumn";
  const marker = context === "row" ? rowMarker : columnMarker;
  const tableRows = rows(target.table);

  // Preserve old documents that only stored the combined header flag.
  tableRows.forEach((row) => {
    const rowWasHeader = row.dataset.hisTableHeader === "true";
    Array.from(row.querySelectorAll<HTMLElement>(":scope > [data-his-table-cell]")).forEach((cell) => {
      if (rowWasHeader) cell.dataset[rowMarker] = "true";
      if (cell.dataset.hisTableHeader === "true" && !rowWasHeader && !cell.dataset[columnMarker]) {
        cell.dataset[columnMarker] = "true";
      }
    });
  });

  const targets = cellsForContext(target, context);
  const enable = targets.some((cell) => cell.dataset[marker] !== "true");
  targets.forEach((cell) => {
    if (enable) cell.dataset[marker] = "true";
    else delete cell.dataset[marker];
  });
  tableRows.forEach((row) => {
    const rowCells = Array.from(row.querySelectorAll<HTMLElement>(":scope > [data-his-table-cell]"));
    const isHeaderRow = rowCells.some((cell) => cell.dataset[rowMarker] === "true");
    if (isHeaderRow) row.dataset.hisTableHeader = "true";
    else delete row.dataset.hisTableHeader;
    rowCells.forEach((cell) => {
      const isRowHeader = cell.dataset[rowMarker] === "true";
      const isColumnHeader = cell.dataset[columnMarker] === "true";
      if (isRowHeader || isColumnHeader) cell.dataset.hisTableHeader = "true";
      else delete cell.dataset.hisTableHeader;
      cell.setAttribute("role", isColumnHeader ? "rowheader" : isRowHeader ? "columnheader" : "cell");
    });
  });
  return enable;
}

export function fitTableColumns(table: HTMLElement): boolean {
  const count = getTableColumnCount(table);
  const editor = table.closest<HTMLElement>(".editor-content");
  const available = Math.floor((editor?.clientWidth ?? table.clientWidth) - 32);
  if (available <= 0) return false;
  const width = Math.max(TABLE_MIN_COLUMN_WIDTH_PX, available / count);
  writeColumnWidths(table, Array.from({ length: count }, () => width));
  return count * TABLE_MIN_COLUMN_WIDTH_PX <= available;
}

export function applyVerticalAlignment(targets: readonly HTMLElement[], value: TableVerticalAlign): void {
  targets.forEach((cell) => cell.style.setProperty("--his-table-cell-align", value));
}

export function applyTextAlignment(targets: readonly HTMLElement[], value: TableTextAlign): void {
  targets.forEach((cell) => cell.style.textAlign = value);
}

export function applyTableColor(targets: readonly HTMLElement[], kind: "text" | "background" | "border", color: string): void {
  const property = kind === "text" ? "color" : kind === "background" ? "background-color" : "border-color";
  targets.forEach((cell) => color ? cell.style.setProperty(property, kind === "background" ? mutedEditorBackground(color) : color) : cell.style.removeProperty(property));
}

export function resetTableColors(targets: readonly HTMLElement[]): void {
  targets.forEach((cell) => ["color", "background-color", "border-color"].forEach((property) => cell.style.removeProperty(property)));
}

export function clearTableContent(targets: readonly HTMLElement[]): void {
  targets.forEach((cell) => {
    cell.querySelectorAll(":scope > :not([data-editor-ui])").forEach((content) => content.remove());
    const paragraph = document.createElement("p");
    paragraph.appendChild(document.createElement("br"));
    cell.prepend(paragraph);
  });
}
