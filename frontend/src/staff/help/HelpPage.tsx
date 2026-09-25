import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "../../api/client";
import type { ParticipantState } from "../../api/types";
import { StationList } from "../../components/StationList";
import { QuestMap } from "../../map/QuestMap";
import type { DetectedMarker } from "../../scanner/detector";
import { ScannerView, type Box } from "../../scanner/ScannerView";
import { logoutStaff } from "../RequireRole";
import styles from "./Help.module.css";

/** Keep showing a marker until it has been out of view this long. */
const LOST_AFTER_MS = 1500;
const REFRESH_MS = 5000;

type Info = { marker: number; state: ParticipantState | null; unknown: boolean };

function perimeter(c: number[]): number {
  let p = 0;
  for (let i = 0; i < 8; i += 2) p += Math.hypot(c[(i + 2) % 8] - c[i], c[(i + 3) % 8] - c[i + 1]);
  return p;
}

export default function HelpPage() {
  const [tracked, setTracked] = useState<number | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const trackedRef = useRef<number | null>(null);
  const lastSeen = useRef(new Map<number, number>());

  const onMarkers = useCallback((markers: DetectedMarker[]) => {
    const now = performance.now();
    markers.forEach((m) => lastSeen.current.set(m.id, now));
    const current = trackedRef.current;
    if (current !== null && now - (lastSeen.current.get(current) ?? 0) < LOST_AFTER_MS) return;
    const biggest = markers.reduce<DetectedMarker | null>(
      (best, m) => (!best || perimeter(m.corners) > perimeter(best.corners) ? m : best),
      null,
    );
    const next = biggest?.id ?? null;
    if (next !== current) {
      trackedRef.current = next;
      setTracked(next);
    }
  }, []);

  useEffect(() => {
    if (tracked === null) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const state = await api<ParticipantState>(`staff/markers/${tracked}`, { auth: "staff" });
        if (!cancelled) setInfo({ marker: tracked, state, unknown: false });
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.code === "unknown_marker")
          setInfo({ marker: tracked, state: null, unknown: true });
      }
    };
    setInfo({ marker: tracked, state: null, unknown: false });
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tracked]);

  const boxFor = useCallback(
    (id: number): Box => (id === trackedRef.current ? { color: "#344ead", label: `№ ${id}`, width: 7 } : { color: "#ffffff", width: 2 }),
    [],
  );

  return (
    <ScannerView active onMarkers={onMarkers} boxFor={boxFor}>
      <button className={styles.logout} onClick={logoutStaff}>
        Выйти
      </button>
      <aside className={styles.panel}>{info ? <Panel info={info} /> : <Idle />}</aside>
    </ScannerView>
  );
}

function Idle() {
  return (
    <div className={styles.idle}>
      <h1>Где я в квесте?</h1>
      <p>Поднеси свой маркер к камере — здесь появится список станций и карта.</p>
    </div>
  );
}

function Panel({ info }: { info: Info }) {
  if (info.unknown) {
    return (
      <div className={styles.idle}>
        <h1>№ {info.marker}</h1>
        <p>Этот маркер не зарегистрирован. Подойди к организаторам.</p>
      </div>
    );
  }
  if (!info.state) return <p className={styles.loading}>№ {info.marker}…</p>;

  const { participant, stations } = info.state;
  const highlight =
    participant.kind === "paper"
      ? stations.filter((s) => !s.visited && !s.is_finish).map((s) => s.id)
      : participant.current_station_id
        ? [participant.current_station_id]
        : [];
  if (participant.kind === "paper" && participant.all_done && !participant.prize_at && participant.current_station_id) {
    highlight.push(participant.current_station_id);
  }
  const passed = stations.filter((s) => s.visited && !s.is_finish).length;
  const total = stations.filter((s) => !s.is_finish).length;

  return (
    <div className={styles.info}>
      <div>
        <div className={styles.num}>№ {participant.marker_id}</div>
        <h1>{participant.display_name}</h1>
        <div className={styles.progress}>
          {participant.prize_at ? "Квест пройден, приз получен 🎉" : `Пройдено ${passed} из ${total}`}
        </div>
      </div>
      <div className={styles.list}>
        <StationList stations={stations} currentIds={highlight} showNumbers={false} />
      </div>
      <QuestMap stations={stations} highlightIds={highlight} />
    </div>
  );
}
