import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api, errorText } from "../../api/client";
import type { ParticipantState } from "../../api/types";
import { StationList, formatTime } from "../../components/StationList";
import { beep, unlockAudio } from "../../lib/feedback";
import type { DetectedMarker } from "../../scanner/detector";
import { DetectorStatus, ScannerView } from "../../scanner/ScannerView";
import { logoutStaff } from "../RequireRole";
import staffStyles from "../Staff.module.css";
import styles from "./Prize.module.css";

/** A marker that was just handled is ignored for a moment, so it is not re-read right away. */
const IGNORE_MS = 3000;

type View =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "loading"; marker: number }
  | { kind: "detail"; marker: number; state: ParticipantState }
  | { kind: "unknown"; marker: number }
  | { kind: "error"; marker: number; message: string }
  | { kind: "granted"; marker: number; forced: boolean };

export default function PrizePage() {
  const [view, setView] = useState<View>({ kind: "idle" });
  const [confirmForce, setConfirmForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const ignore = useRef(new Map<number, number>());
  const picked = useRef(false);

  const rescan = useCallback((marker?: number) => {
    if (marker !== undefined) ignore.current.set(marker, Date.now() + IGNORE_MS);
    setConfirmForce(false);
    picked.current = false;
    setView({ kind: "scanning" });
  }, []);

  const lookup = useCallback(async (marker: number) => {
    setView({ kind: "loading", marker });
    try {
      const state = await api<ParticipantState>(`staff/markers/${marker}`, { auth: "staff" });
      setView({ kind: "detail", marker, state });
    } catch (err) {
      if (err instanceof ApiError && err.code === "unknown_marker") setView({ kind: "unknown", marker });
      else setView({ kind: "error", marker, message: errorText(err) });
    }
  }, []);

  const onMarkers = useCallback(
    (markers: DetectedMarker[]) => {
      if (picked.current) return;
      const now = Date.now();
      const marker = markers.find((m) => (ignore.current.get(m.id) ?? 0) < now);
      if (marker) {
        picked.current = true;
        beep(660);
        lookup(marker.id);
      }
    },
    [lookup],
  );

  const grant = async (marker: number, force: boolean) => {
    setBusy(true);
    try {
      const state = await api<ParticipantState>(`staff/markers/${marker}/prize`, {
        method: "POST",
        body: { force },
        auth: "staff",
      });
      beep(1040, 160);
      setView({ kind: "granted", marker, forced: state.participant.prize_forced });
    } catch (err) {
      if (err instanceof ApiError && (err.code === "already_granted" || err.code === "not_complete")) lookup(marker);
      else setView({ kind: "error", marker, message: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  // After a successful grant: green screen for 2 s, then straight back to the camera.
  useEffect(() => {
    if (view.kind !== "granted") return;
    const timer = window.setTimeout(() => rescan(view.marker), 2000);
    return () => window.clearTimeout(timer);
  }, [view, rescan]);

  const scanning = view.kind === "scanning";

  return (
    <div>
      <header className={staffStyles.topbar}>
        <h1>Выдача призов</h1>
        <button className={staffStyles.linkBtn} onClick={logoutStaff}>
          Выйти
        </button>
      </header>

      <div className={staffStyles.bigCenter}>
        {view.kind === "idle" && (
          <>
            <DetectorStatus />
            <button
              className={`btn btn-lg btn-block ${styles.bigBtn}`}
              onClick={() => {
                unlockAudio();
                rescan();
              }}
            >
              Сканировать
            </button>
          </>
        )}

        {view.kind === "loading" && <p className="muted">Маркер № {view.marker}…</p>}

        {view.kind === "unknown" && (
          <div className={`${styles.banner} ${styles.bad}`}>
            <h2>Маркер № {view.marker} не найден</h2>
            <p>Такой участник не зарегистрирован.</p>
          </div>
        )}

        {view.kind === "error" && (
          <div className={`${styles.banner} ${styles.bad}`}>
            <h2>Ошибка</h2>
            <p>{view.message}</p>
            <button className="btn btn-outline" onClick={() => lookup(view.marker)}>
              Повторить
            </button>
          </div>
        )}

        {view.kind === "detail" && <Detail view={view} />}

        {view.kind === "detail" && !view.state.participant.prize_at && (
          <div className={styles.actions}>
            {view.state.participant.all_done ? (
              <button className="btn btn-lg btn-block btn-success" disabled={busy} onClick={() => grant(view.marker, false)}>
                Выдать приз
              </button>
            ) : confirmForce ? (
              <button className="btn btn-lg btn-block btn-danger" disabled={busy} onClick={() => grant(view.marker, true)}>
                Точно выдать без всех станций?
              </button>
            ) : (
              <button className="btn btn-lg btn-block btn-outline" onClick={() => setConfirmForce(true)}>
                Выдать всё равно
              </button>
            )}
            <button className="btn btn-lg btn-block btn-ghost" onClick={() => rescan(view.marker)}>
              Отмена
            </button>
          </div>
        )}

        {(view.kind === "unknown" || view.kind === "error" || (view.kind === "detail" && view.state.participant.prize_at)) && (
          <button className="btn btn-lg btn-block" onClick={() => rescan(view.marker)}>
            Сканировать дальше
          </button>
        )}
      </div>

      {view.kind === "granted" && (
        <div className={styles.granted}>
          <div className={styles.grantedIcon}>✓</div>
          <h2>Приз выдан!</h2>
          <p>№ {view.marker}{view.forced ? " · без полного прохождения" : ""}</p>
        </div>
      )}

      {scanning && (
        <ScannerView active onMarkers={onMarkers} boxFor={() => ({ color: "#344ead" })}>
          <div className={styles.scanHint}>Наведите камеру на маркер участника</div>
          <div className={styles.scanBottom}>
            <button className="btn btn-lg btn-block btn-danger" onClick={() => setView({ kind: "idle" })}>
              Стоп
            </button>
          </div>
        </ScannerView>
      )}
    </div>
  );
}

function Detail({ view }: { view: { marker: number; state: ParticipantState } }) {
  const { participant, stations } = view.state;
  const missing = stations.filter((s) => !s.visited && !s.is_finish);
  return (
    <>
      <div className={styles.who}>
        <span className={styles.markerNum}>№ {participant.marker_id}</span>
        <h2>{participant.display_name}</h2>
      </div>
      {participant.prize_at ? (
        <div className={`${styles.banner} ${styles.gray}`}>
          <h2>Приз уже выдан в {formatTime(participant.prize_at)}</h2>
          {participant.prize_forced && <p>Выдан без полного прохождения.</p>}
        </div>
      ) : participant.all_done ? (
        <div className={`${styles.banner} ${styles.good}`}>
          <h2>Все станции пройдены ✓</h2>
        </div>
      ) : (
        <div className={`${styles.banner} ${styles.bad}`}>
          <h2>Пройдены не все станции</h2>
          <p>Не пройдены: {missing.map((s) => s.name).join(", ")}</p>
        </div>
      )}
      <StationList stations={stations.filter((s) => !s.is_finish)} />
    </>
  );
}
