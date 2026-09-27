import { useEffect, useRef, useState } from "react";

import { FloorPlan, MAP_HEIGHT, MAP_WIDTH } from "./FloorPlan";
import styles from "./QuestMap.module.css";

export const FLOORS = [1, 2, 3];

export interface MapStation {
  id: number;
  number: number;
  name: string;
  floor: number;
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

const clamp = (v: number) => Math.min(1, Math.max(0, v));

export function QuestMap({ stations, highlightIds = [], labelHighlighted, editable, onMove, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null);
  // Open the floor of the (first) highlighted station, and follow it when it moves to another floor.
  const defaultFloor = stations.find((s) => s.id === highlightIds[0])?.floor ?? FLOORS[0];
  const [floor, setFloor] = useState(defaultFloor);
  useEffect(() => setFloor(defaultFloor), [defaultFloor]);
  const highlightedFloors = new Set(stations.filter((s) => highlightIds.includes(s.id)).map((s) => s.floor));
  const onFloor = stations.filter((s) => s.floor === floor);

  const toFraction = (event: React.PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
  };

  return (
    <div className={`${styles.root} ${className ?? ""}`}>
      <div className={styles.floors} role="tablist" aria-label="Этаж">
        {FLOORS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={f === floor}
            className={`${styles.floorTab} ${f === floor ? styles.floorTabActive : ""}`}
            onClick={() => setFloor(f)}
          >
            {f} этаж
            {highlightedFloors.has(f) && <span className={styles.floorMark} />}
          </button>
        ))}
      </div>
      <div ref={wrapRef} className={styles.wrap} style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}>
        <FloorPlan floor={floor} className={styles.building} />
        {onFloor.map((station) => {
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
              onPointerMove={
                editable && drag?.id === station.id ? (e) => setDrag({ id: station.id, ...toFraction(e) }) : undefined
              }
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
    </div>
  );
}
