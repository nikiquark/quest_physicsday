import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { storageGet, storageSet } from "../../api/client";
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

const INSTRUCTION_KEY = "pq_print_instruction";

const DEFAULT_INSTRUCTION = `<ol>
  <li>Посети станции ФизКвеста</li>
  <li>Пройди испытание на каждой станции</li>
  <li>Не забудь показать свой код организатору на каждой станции</li>
  <li>Когда пройдешь все станции,<br>получи приз</li>
</ol>`;

const CELL_PADDING_MM = 8;
const GAP_MM = 4;
const PT_MM = 25.4 / 72;
const PX_PER_MM = 96 / 25.4;
const LINE_HEIGHT = 1.3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Marker size options, % of the largest marker that fits the card.
const SCALES = [100, 90, 80, 70, 60, 50];

let measureBox: HTMLDivElement | null = null;

/** Size of the instruction HTML at `pt`, mm: unwrapped when `widthMm` is omitted, else wrapped to it. */
function measureInstruction(html: string, pt: number, widthMm?: number): { width: number; height: number } {
  if (!measureBox) {
    measureBox = document.createElement("div");
    measureBox.className = styles.instruction;
    Object.assign(measureBox.style, { position: "absolute", left: "-10000px", top: "0", visibility: "hidden" });
    document.body.appendChild(measureBox);
  }
  measureBox.style.fontSize = `${pt}pt`;
  measureBox.style.width = widthMm === undefined ? "max-content" : `${widthMm}mm`;
  measureBox.innerHTML = html;
  const rect = measureBox.getBoundingClientRect();
  return { width: rect.width / PX_PER_MM, height: rect.height / PX_PER_MM };
}

interface Layout {
  marker: number; // mm
  column: number; // mm, width of the instruction column; the marker is centered in it
  instructionPt: number;
  numberPt: number;
}

/** Fonts scaled to the card, and the marker at `scale`% of the largest that fits under the instruction. */
function layout(paper: Paper, perPage: PerPage, scale: number, html: string): Layout {
  const { w, h } = PAPER[paper];
  const { cols, rows } = GRID[perPage];
  const innerW = w / cols - 2 * CELL_PADDING_MM;
  const innerH = h / rows - 2 * CELL_PADDING_MM;
  const base = Math.min(innerW, innerH * 0.65);
  const instructionPt = clamp(Math.round(base / 7), 9, 20);
  const numberPt = clamp(Math.round(base / 5), 12, 36);
  const numberH = numberPt * PT_MM * LINE_HEIGHT;

  // The instruction column is as wide as its longest line, up to the card width;
  // the marker takes the height left under the wrapped text.
  const column = Math.min(innerW, Math.ceil(measureInstruction(html, instructionPt).width) + 1);
  const instructionH = measureInstruction(html, instructionPt, column).height;
  const largest = Math.floor(Math.min(innerW, innerH - instructionH - numberH - 2 * GAP_MM)) - 1;
  const marker = Math.floor((largest * scale) / 100);
  return { marker, column: Math.max(column, marker), instructionPt, numberPt };
}

/** Printable paper markers: A4/A5 sheets with 1, 2 or 4 cards (instruction + marker + number). */
export default function PrintPage() {
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(249);
  const [paper, setPaper] = useState<Paper>("A4");
  const [perPage, setPerPage] = useState<PerPage>(4);
  const [scale, setScale] = useState(70);
  // The instruction is applied (and remembered) only on "Сохранить"; the draft lives in the textarea.
  const [instruction, setInstruction] = useState(() => storageGet(INSTRUCTION_KEY) ?? DEFAULT_INSTRUCTION);
  const [draft, setDraft] = useState(instruction);

  const saveInstruction = () => {
    setInstruction(draft);
    storageSet(INSTRUCTION_KEY, draft === DEFAULT_INSTRUCTION ? null : draft);
  };

  const ids: number[] = [];
  for (let id = Math.max(0, from); id <= Math.min(249, to); id++) ids.push(id);
  const pages: number[][] = [];
  for (let i = 0; i < ids.length; i += perPage) pages.push(ids.slice(i, i + perPage));

  const { w, h } = PAPER[paper];
  const { cols, rows } = GRID[perPage];
  const { marker: size, column, instructionPt, numberPt } = useMemo(
    () => layout(paper, perPage, scale, instruction),
    [paper, perPage, scale, instruction],
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
    <div className={styles.layout}>
      <style>{`@page { size: ${paper}; margin: 0; }`}</style>
      <aside className={styles.controls}>
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
          На&nbsp;листе
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
        <div className={styles.text}>
          Текст (HTML)
          <textarea className="input" rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className={styles.textButtons}>
            <button className="btn" disabled={draft === instruction} onClick={saveInstruction}>
              Сохранить
            </button>
            <button className="btn btn-ghost" disabled={draft === DEFAULT_INSTRUCTION} onClick={() => setDraft(DEFAULT_INSTRUCTION)}>
              По умолчанию
            </button>
          </div>
        </div>
        <span className="muted">
          {ids.length} маркеров, {pages.length} листов {paper}, маркер {(size / 10).toFixed(1).replace(".", ",")} см
        </span>
        <button className="btn" onClick={() => window.print()}>
          Печать / PDF
        </button>
      </aside>
      <main className={styles.sheets}>
        {pages.map((page) => (
          <section key={page[0]} className={styles.sheet} style={sheetStyle}>
            {page.map((id) => (
              <div key={id} className={perPage > 1 ? `${styles.card} ${styles.cut}` : styles.card} style={cardStyle}>
                <div className={styles.column} style={columnStyle}>
                  <div
                    className={styles.instruction}
                    style={{ fontSize: `${instructionPt}pt` }}
                    dangerouslySetInnerHTML={{ __html: instruction }}
                  />
                  <div className={styles.markerBox} style={{ width: `${size}mm` }}>
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
      </main>
    </div>
  );
}
