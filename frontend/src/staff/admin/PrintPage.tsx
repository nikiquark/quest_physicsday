import { useState } from "react";
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

const INSTRUCTION = [
  "Подойди на станцию",
  "Выполни задание",
  "Покажи свой код",
  "Пройди все станции — получи приз",
];

const CELL_PADDING_MM = 8;
const GAP_MM = 4;
const PT_MM = 25.4 / 72;
const LINE_HEIGHT = 1.3;
// Conservative average glyph width of Cyrillic text, in em.
const CHAR_EM = 0.6;
// Left indent of the numbered list that holds the "1." markers, in em.
const LIST_INDENT_EM = 1.4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Layout {
  marker: number; // mm
  instructionPt: number;
  numberPt: number;
}

/** Fonts scaled to the card, and the largest marker that fits under the instruction. */
function layout(paper: Paper, perPage: PerPage): Layout {
  const { w, h } = PAPER[paper];
  const { cols, rows } = GRID[perPage];
  const innerW = w / cols - 2 * CELL_PADDING_MM;
  const innerH = h / rows - 2 * CELL_PADDING_MM;
  const base = Math.min(innerW, innerH * 0.65);
  const instructionPt = clamp(Math.round(base / 7), 9, 20);
  const numberPt = clamp(Math.round(base / 5), 12, 36);
  const numberH = numberPt * PT_MM * LINE_HEIGHT;

  // The list is as wide as the marker, so a smaller marker wraps more lines:
  // shrink the marker until the wrapped text fits above it.
  let marker = Math.floor(innerW);
  for (let i = 0; i < 5; i++) {
    const textW = marker - LIST_INDENT_EM * instructionPt * PT_MM;
    const charsPerLine = Math.floor(textW / (CHAR_EM * instructionPt * PT_MM));
    const lines = INSTRUCTION.reduce((n, line) => n + Math.ceil(line.length / charsPerLine), 0);
    const instructionH = lines * instructionPt * PT_MM * LINE_HEIGHT;
    const next = Math.floor(Math.min(innerW, innerH - instructionH - numberH - 2 * GAP_MM)) - 1;
    if (next >= marker) break;
    marker = next;
  }
  return { marker, instructionPt, numberPt };
}

/** Printable paper markers: A4/A5 sheets with 1, 2 or 4 cards (instruction + marker + number). */
export default function PrintPage() {
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(249);
  const [paper, setPaper] = useState<Paper>("A4");
  const [perPage, setPerPage] = useState<PerPage>(4);

  const ids: number[] = [];
  for (let id = Math.max(0, from); id <= Math.min(249, to); id++) ids.push(id);
  const pages: number[][] = [];
  for (let i = 0; i < ids.length; i += perPage) pages.push(ids.slice(i, i + perPage));

  const { w, h } = PAPER[paper];
  const { cols, rows } = GRID[perPage];
  const { marker: size, instructionPt, numberPt } = layout(paper, perPage);
  const sheetStyle = {
    width: `${w}mm`,
    height: `${h}mm`,
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
  };
  const cardStyle = { padding: `${CELL_PADDING_MM}mm`, gap: `${GAP_MM}mm` };

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
        <span className="muted">
          {ids.length} маркеров, {pages.length} листов {paper}, маркер {Math.round(size / 10)} см
        </span>
        <button className="btn" onClick={() => window.print()}>
          Печать / PDF
        </button>
      </div>
      {pages.map((page) => (
        <section key={page[0]} className={styles.sheet} style={sheetStyle}>
          {page.map((id) => (
            <div key={id} className={perPage > 1 ? `${styles.card} ${styles.cut}` : styles.card} style={cardStyle}>
              <ol className={styles.instruction} style={{ width: `${size}mm`, fontSize: `${instructionPt}pt` }}>
                {INSTRUCTION.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
              <MarkerSvg id={id} quietZone={0} style={{ width: `${size}mm`, height: `${size}mm` }} />
              <div className={styles.number} style={{ fontSize: `${numberPt}pt` }}>
                № {id}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
