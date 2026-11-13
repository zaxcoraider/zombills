/** A row is blank when every cell is empty or contains only whitespace. */
export function isBlankRow(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}
