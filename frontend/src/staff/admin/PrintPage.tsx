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

const CELL_PADDING_MM = 12;
const LABEL_MM = 16;

/** Largest marker side (mm) that fits a card together with its number. */
function markerSize(paper: Paper, perPage: PerPage): number {
  const { w, h } = PAPER[paper];
  const { cols, rows } = GRID[perPage];
  const fitW = w / cols - 2 * CELL_PADDING_MM;
  const fitH = h / rows - 2 * CELL_PADDING_MM - LABEL_MM;
  return Math.floor(Math.min(fitW, fitH));
}

/** Printable paper markers: A4/A5 sheets with 1, 2 or 4 cards (marker + number). */
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
  const size = markerSize(paper, perPage);
  const sheetStyle = {
    width: `${w}mm`,
    height: `${h}mm`,
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
  };
  // 80 mm marker ↔ 16 pt number, as on the original A4×4 layout.
  const numberStyle = { fontSize: `${Math.max(12, Math.round(size / 5))}pt` };

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
            <div key={id} className={perPage > 1 ? `${styles.card} ${styles.cut}` : styles.card}>
              <MarkerSvg id={id} quietZone={0} style={{ width: `${size}mm`, height: `${size}mm` }} />
              <div className={styles.number} style={numberStyle}>
                № {id}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
