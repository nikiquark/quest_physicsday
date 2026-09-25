import { useState } from "react";
import { Link } from "react-router-dom";

import { MarkerSvg } from "../../aruco/MarkerSvg";
import styles from "./Print.module.css";

const PER_PAGE = 4;

/** Printable paper markers: A4 pages with 4 cards (≈8 cm marker + number). */
export default function PrintPage() {
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(249);

  const ids: number[] = [];
  for (let id = Math.max(0, from); id <= Math.min(249, to); id++) ids.push(id);
  const pages: number[][] = [];
  for (let i = 0; i < ids.length; i += PER_PAGE) pages.push(ids.slice(i, i + PER_PAGE));

  return (
    <div>
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
        <span className="muted">
          {ids.length} маркеров, {pages.length} листов A4
        </span>
        <button className="btn" onClick={() => window.print()}>
          Печать / PDF
        </button>
      </div>
      {pages.map((page) => (
        <section key={page[0]} className={styles.sheet}>
          {page.map((id) => (
            <div key={id} className={styles.card}>
              <MarkerSvg id={id} quietZone={0} className={styles.marker} />
              <div className={styles.number}>№ {id}</div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
