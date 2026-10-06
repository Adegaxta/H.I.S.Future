import { getTableRootFromNode } from "./table";
import { getSelectedTableCells } from "./tableSelection";

export function selectedCellsToMatrix(editor: HTMLElement): Array<Array<HTMLElement | null>> {
  const selected = getSelectedTableCells(editor);
  if (!selected.length) return [];
  const table = getTableRootFromNode(selected[0]);
  if (!table) return [];
  const set = new Set(selected);
  const rows = Array.from(table.querySelectorAll<HTMLElement>(":scope > [data-his-table-grid] > [data-his-table-row]"));
  const coordinates = selected.flatMap((selectedCell) => {
    const row = selectedCell.closest<HTMLElement>("[data-his-table-row]");
    if (!row) return [];
    return [{ row: rows.indexOf(row), column: Array.from(row.querySelectorAll<HTMLElement>(":scope > [data-his-table-cell]")).indexOf(selectedCell) }];
  }).filter(({ row, column }) => row >= 0 && column >= 0);
  if (!coordinates.length) return [];
  const minRow = Math.min(...coordinates.map(({ row }) => row));
  const maxRow = Math.max(...coordinates.map(({ row }) => row));
  const minColumn = Math.min(...coordinates.map(({ column }) => column));
  const maxColumn = Math.max(...coordinates.map(({ column }) => column));
  return rows.slice(minRow, maxRow + 1).map((row) => {
    const cells = Array.from(row.querySelectorAll<HTMLElement>(":scope > [data-his-table-cell]"));
    return Array.from({ length: maxColumn - minColumn + 1 }, (_, offset) => {
      const cell = cells[minColumn + offset] ?? null;
      return cell && set.has(cell) ? cell : null;
    });
  });
}

export function writeCellMatrixToClipboard(event: ClipboardEvent, matrix: readonly (readonly (HTMLElement | null)[])[]): boolean {
  if (!matrix.length || !event.clipboardData) return false;
  const plain = matrix.map((row) => row.map((cell) => ((cell?.innerText || cell?.textContent || "").replace(/\t|\r?\n/g, " "))).join("\t")).join("\n");
  const html = `<table><tbody>${matrix.map((row) => `<tr>${row.map((cell) => `<td>${cell?.innerHTML ?? ""}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  event.clipboardData.setData("text/plain", plain);
  event.clipboardData.setData("text/html", html);
  event.preventDefault();
  return true;
}

export function clipboardToMatrix(data: DataTransfer): string[][] {
  const html = data.getData("text/html");
  if (html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const parsed = Array.from(template.content.querySelectorAll("tr")).map((row) =>
      Array.from(row.querySelectorAll("th, td")).map((cell) => (cell as HTMLElement).innerText || cell.textContent || ""),
    ).filter((row) => row.length);
    if (parsed.length) return parsed;
  }
  const plain = data.getData("text/plain");
  return plain ? plain.replace(/\r/g, "").split("\n").map((row) => row.split("\t")) : [];
}

export function pasteMatrixAtCell(cell: HTMLElement, matrix: readonly (readonly string[])[]): void {
  const table = getTableRootFromNode(cell);
  const row = cell.closest<HTMLElement>("[data-his-table-row]");
  const grid = row?.parentElement;
  if (!table || !row || !grid || !matrix.length) return;
  const tableRows = Array.from(grid.querySelectorAll<HTMLElement>(":scope > [data-his-table-row]"));
  const startRow = tableRows.indexOf(row);
  const startColumn = Array.from(row.querySelectorAll<HTMLElement>(":scope > [data-his-table-cell]")).indexOf(cell);
  matrix.forEach((values, rowOffset) => {
    const targetRow = tableRows[startRow + rowOffset];
    if (!targetRow) return;
    const targetCells = Array.from(targetRow.querySelectorAll<HTMLElement>(":scope > [data-his-table-cell]"));
    values.forEach((value, columnOffset) => {
      const target = targetCells[startColumn + columnOffset];
      if (!target) return;
      target.querySelectorAll(":scope > :not([data-editor-ui])").forEach((node) => node.remove());
      const paragraph = document.createElement("p");
      paragraph.textContent = value;
      if (!paragraph.firstChild) paragraph.appendChild(document.createElement("br"));
      target.prepend(paragraph);
    });
  });
}
