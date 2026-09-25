import { describe, expect, it } from "vitest";

import fixture from "./fixture.json";
import { MARKER_COUNT, markerCells } from "./marker";

const toRows = (cells: boolean[][]) => cells.map((row) => row.map((white) => (white ? "1" : "0")).join(""));

describe("markerCells", () => {
  it("covers the whole dictionary", () => {
    expect(MARKER_COUNT).toBe(1000);
  });

  it.each(Object.entries(fixture as Record<string, string[]>))("matches OpenCV rendering of marker %s", (id, rows) => {
    expect(toRows(markerCells(Number(id)))).toEqual(rows);
  });

  it("has a solid black border", () => {
    const cells = markerCells(123);
    for (let i = 0; i < 7; i++) {
      expect([cells[0][i], cells[6][i], cells[i][0], cells[i][6]]).toEqual([false, false, false, false]);
    }
  });

  it("rejects ids outside the dictionary", () => {
    expect(() => markerCells(1000)).toThrow();
    expect(() => markerCells(-1)).toThrow();
  });
});
