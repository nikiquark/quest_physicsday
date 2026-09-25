import type { ReactNode } from "react";

import type { StationProgress } from "../api/types";
import styles from "./StationList.module.css";

interface Props {
  stations: StationProgress[];
  currentIds?: number[];
  flashId?: number | null;
  showDescription?: boolean;
  /** Station numbers (as on the map). Hidden for participants: in route order they look random. */
  showNumbers?: boolean;
  action?: (station: StationProgress) => ReactNode;
}

export function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function StationList({ stations, currentIds = [], flashId, showDescription, showNumbers = true, action }: Props) {
  return (
    <ol className={styles.list}>
      {stations.map((station) => {
        const current = currentIds.includes(station.id);
        const classes = [
          styles.item,
          station.visited && styles.visited,
          current && styles.current,
          station.is_finish && styles.finish,
          flashId === station.id && styles.flash,
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <li key={station.id} className={classes}>
            {showNumbers && <span className={styles.index}>{station.is_finish ? "🏁" : station.number}</span>}
            <span className={styles.body}>
              <span className={styles.name}>{station.name}</span>
              {current && !station.visited && <span className={styles.badge}>Сейчас сюда</span>}
              {showDescription && station.description && <span className={styles.desc}>{station.description}</span>}
              {station.visited && station.visited_at && (
                <span className={styles.time}>{station.is_finish ? "Приз получен" : "Пройдено"} в {formatTime(station.visited_at)}</span>
              )}
            </span>
            {action ? action(station) : <span className={styles.check}>{station.visited ? "✓" : ""}</span>}
          </li>
        );
      })}
    </ol>
  );
}
