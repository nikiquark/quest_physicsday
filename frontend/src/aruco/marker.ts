import { DICT_5X5_1000 } from "./dict5x5_1000";

export const MARKER_BITS = 5;
export const MARKER_COUNT = DICT_5X5_1000.length / 7;

/**
 * Cell matrix of a DICT_5X5_1000 marker including its 1-cell black border (7x7).
 * true = white cell.
 */
export function markerCells(id: number): boolean[][] {
  if (!Number.isInteger(id) || id < 0 || id >= MARKER_COUNT) throw new RangeError(`bad marker id ${id}`);
  const code = parseInt(DICT_5X5_1000.slice(id * 7, id * 7 + 7), 16);
  const size = MARKER_BITS + 2;
  const cells: boolean[][] = [];
  for (let row = 0; row < size; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < size; col++) {
      const inner = row > 0 && col > 0 && row < size - 1 && col < size - 1;
      const bitIndex = (row - 1) * MARKER_BITS + (col - 1);
      line.push(inner && ((code >> (MARKER_BITS * MARKER_BITS - 1 - bitIndex)) & 1) === 1);
    }
    cells.push(line);
  }
  return cells;
}
