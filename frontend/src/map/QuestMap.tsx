import { useRef, useState } from "react";

import buildingUrl from "./building.svg";
import styles from "./QuestMap.module.css";

export interface MapStation {
  id: number;
  number: number;
  name: string;
  x: number;
  y: number;
  is_finish: boolean;
  visited?: boolean;
  enabled?: boolean;
}

interface Props {
  stations: MapStation[];
  /** Stations to highlight with a pulse (current / not yet passed). */
  highlightIds?: number[];
  /** Show the name label next to highlighted pins. */
  labelHighlighted?: boolean;
  editable?: boolean;
  onMove?: (id: number, x: number, y: number) => void;
  className?: string;
}

/** Must match the viewBox of building.svg: pin coordinates are fractions of it. */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 1020;

const clamp = (v: number) => Math.min(1, Math.max(0, v));

export function QuestMap({ stations, highlightIds = [], labelHighlighted, editable, onMove, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null);

  const toFraction = (event: React.PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
  };

  return (
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${className ?? ""}`}
      style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
    >
      <img src={buildingUrl} alt="Карта здания" className={styles.building} draggable={false} />
      {stations.map((station) => {
        const pos = drag?.id === station.id ? drag : station;
        const highlighted = highlightIds.includes(station.id);
        const classes = [
          styles.pin,
          station.is_finish && styles.finish,
          station.visited && styles.visited,
          highlighted && styles.current,
          station.enabled === false && styles.disabled,
          editable && styles.editable,
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={station.id}
            className={classes}
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
            title={station.name}
            onPointerDown={
              editable
                ? (e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDrag({ id: station.id, ...toFraction(e) });
                  }
                : undefined
            }
            onPointerMove={editable && drag?.id === station.id ? (e) => setDrag({ id: station.id, ...toFraction(e) }) : undefined}
            onPointerUp={
              editable && drag?.id === station.id
                ? (e) => {
                    const { x, y } = toFraction(e);
                    setDrag(null);
                    onMove?.(station.id, x, y);
                  }
                : undefined
            }
          >
            {highlighted && <span className={styles.pulse} />}
            <span className={styles.dot}>{station.visited ? "✓" : station.is_finish ? "🏁" : station.number}</span>
            {(editable || (labelHighlighted && highlighted)) && <span className={styles.label}>{station.name}</span>}
          </div>
        );
      })}
    </div>
  );
}
