import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { MarkerSvg } from "../../aruco/MarkerSvg";
import styles from "./Print.module.css";

type Paper = "A4" | "A5";
type PerPage = 1 | 2 | 4;

// Portrait sheet sizes, mm.
const PAPER: Record<Paper, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
};

// Grid for each cards-per-page option: two cards are stacked, four form 2×2.
const GRID: Record<PerPage, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 1, rows: 2 },
  4: { cols: 2, rows: 2 },
};

// "\n" is a forced line break inside an item.
const INSTRUCTION = [
  "Посети станции ФизКвеста",
  "Пройди испытание",
  "Покажи свой код",
  "Когда пройдешь все станции,\nполучи приз",
];

const CELL_PADDING_MM = 8;
const GAP_MM = 4;
const PT_MM = 25.4 / 72;
const PX_PER_MM = 96 / 25.4;
const LINE_HEIGHT = 1.3;
// Left indent of the numbered list that holds the "1." markers, in em.
const LIST_INDENT_EM = 1.4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Marker size options, % of the largest marker that fits the card.
const SCALES = [100, 90, 80, 70, 60, 50];

let measureCtx: CanvasRenderingContext2D | null = null;

/** Canvas context set to the page font at `pt`, for measuring text. */
function measurer(pt: number): CanvasRenderingContext2D | null {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (measureCtx) measureCtx.font = `${pt}pt ${getComputedStyle(document.body).fontFamily}`;
  return measureCtx;
}

const PARAGRAPHS = INSTRUCTION.flatMap((item) => item.split("\n"));

/** Width of the longest unwrapped instruction line, mm. */
function instructionWidth(pt: number): number {
  const ctx = measurer(pt);
  if (!ctx) return Infinity;
  return Math.max(...PARAGRAPHS.map((p) => ctx.measureText(p).width)) / PX_PER_MM;
}

/** Lines the instruction takes when word-wrapped to `widthMm`. */
function instructionLines(widthMm: number, pt: number): number {
  const ctx = measurer(pt);
  if (!ctx) return PARAGRAPHS.length * 2;
  const maxPx = widthMm * PX_PER_MM;
  let lines = 0;
  for (const paragraph of PARAGRAPHS) {
    let current = "";
    lines++;
    for (const word of paragraph.split(" ")) {
      const next = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(next).width > maxPx) {
        lines++;
        current = word;
      } else {
        current = next;
      }
    }
  }
  return lines;
}

interface Layout {
  marker: number; // mm
  column: number; // mm, width of the instruction column; the marker is left-aligned in it
  instructionPt: number;
  numberPt: number;
}

/** Fonts scaled to the card, and the marker at `scale`% of the largest that fits under the instruction. */
function layout(paper: Paper, perPage: PerPage, scale: number): Layout {
  const { w, h } = PAPER[paper];
  const { cols, rows } = GRID[perPage];
  const innerW = w / cols - 2 * CELL_PADDING_MM;
  const innerH = h / rows - 2 * CELL_PADDING_MM;
  const base = Math.min(innerW, innerH * 0.65);
  const instructionPt = clamp(Math.round(base / 7), 9, 20);
  const numberPt = clamp(Math.round(base / 5), 12, 36);
  const numberH = numberPt * PT_MM * LINE_HEIGHT;
  const indent = LIST_INDENT_EM * instructionPt * PT_MM;

  // With the column as wide as the marker, a smaller marker wraps more lines:
  // shrink it until the wrapped text fits above it.
  let largest = Math.floor(innerW);
  for (let i = 0; i < 5; i++) {
    const lines = instructionLines(largest - indent, instructionPt);
    const instructionH = lines * instructionPt * PT_MM * LINE_HEIGHT;
    const next = Math.floor(Math.min(innerW, innerH - instructionH - numberH - 2 * GAP_MM)) - 1;
    if (next >= largest) break;
    largest = next;
  }

  // A scaled-down marker keeps the column wide enough for unwrapped text (or
  // the whole card), so the text never takes more lines than it did above.
  const marker = Math.floor((largest * scale) / 100);
  const column = Math.min(innerW, Math.max(marker, Math.ceil(instructionWidth(instructionPt) + indent) + 1));
  return { marker, column, instructionPt, numberPt };
}

/** Printable paper markers: A4/A5 sheets with 1, 2 or 4 cards (instruction + marker + number). */
export default function PrintPage() {
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(249);
  const [paper, setPaper] = useState<Paper>("A4");
  const [perPage, setPerPage] = useState<PerPage>(4);
  const [scale, setScale] = useState(70);

  const ids: number[] = [];
  for (let id = Math.max(0, from); id <= Math.min(249, to); id++) ids.push(id);
  const pages: number[][] = [];
  for (let i = 0; i < ids.length; i += perPage) pages.push(ids.slice(i, i + perPage));

  const { w, h } = PAPER[paper];
  const { cols, rows } = GRID[perPage];
  const { marker: size, column, instructionPt, numberPt } = useMemo(
    () => layout(paper, perPage, scale),
    [paper, perPage, scale],
  );
  const sheetStyle = {
    width: `${w}mm`,
    height: `${h}mm`,
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
  };
  const cardStyle = { padding: `${CELL_PADDING_MM}mm` };
  const columnStyle = { width: `${column}mm`, gap: `${GAP_MM}mm` };

  return (
    <div>
      <style>{`@page { size: ${paper}; margin: 0; }`}</style>
      <div className={styles.controls}>
        <Link to="/staff/admin">← Назад</Link>
        <label>
          с №
          <input className="input" type="number" min={0} max={249} value={from} onChange={(e) => setFrom(Number(e.target.value))} />
        </label>
        <label>
          по №
          <input className="input" type="number" min={0} max={249} value={to} onChange={(e) => setTo(Number(e.target.value))} />
        </label>
        <label>
          Формат
          <select className="input" value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
            <option value="A4">A4</option>
            <option value="A5">A5</option>
          </select>
        </label>
        <label>
          На листе
          <select className="input" value={perPage} onChange={(e) => setPerPage(Number(e.target.value) as PerPage)}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label>
          Маркер
          <select className="input" value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            {SCALES.map((s) => (
              <option key={s} value={s}>
                {s}%
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          {ids.length} маркеров, {pages.length} листов {paper}, маркер {(size / 10).toFixed(1).replace(".", ",")} см
        </span>
        <button className="btn" onClick={() => window.print()}>
          Печать / PDF
        </button>
      </div>
      {pages.map((page) => (
        <section key={page[0]} className={styles.sheet} style={sheetStyle}>
          {page.map((id) => (
            <div key={id} className={perPage > 1 ? `${styles.card} ${styles.cut}` : styles.card} style={cardStyle}>
              <div className={styles.column} style={columnStyle}>
                <ol className={styles.instruction} style={{ fontSize: `${instructionPt}pt` }}>
                  {INSTRUCTION.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
                <div style={{ width: `${size}mm` }}>
                  <MarkerSvg id={id} quietZone={0} style={{ display: "block", width: `${size}mm`, height: `${size}mm` }} />
                  <div className={styles.number} style={{ fontSize: `${numberPt}pt`, marginTop: `${GAP_MM}mm` }}>
                    № {id}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
