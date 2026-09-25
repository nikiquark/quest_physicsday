import { useCallback, useEffect, useRef, useState } from "react";

import { api, errorText, staffSession, storageGet, storageSet, wsUrl } from "../../api/client";
import type { ScanStatus, Station } from "../../api/types";
import { beep, unlockAudio } from "../../lib/feedback";
import { LiveSocket, type SocketStatus } from "../../lib/socket";
import type { DetectedMarker } from "../../scanner/detector";
import { DetectorStatus, ScannerView, type Box } from "../../scanner/ScannerView";
import { logoutStaff } from "../RequireRole";
import staffStyles from "../Staff.module.css";
import { newBatchId, scanQueue } from "./scanQueue";
import styles from "./Station.module.css";

const STATION_KEY = "pq_station";
/** Unknown markers are retried after this delay (e.g. a kid who registered a second ago). */
const UNKNOWN_RETRY_MS = 4000;

type MarkerStatus = ScanStatus | "pending";

const BOX: Record<MarkerStatus, string> = {
  accepted: "#1e9e4a",
  already: "#8a8f99",
  unknown: "#d33a2c",
  disabled: "#d33a2c",
  pending: "#e0a100",
};

export default function StationPage() {
  const [stations, setStations] = useState<Station[] | null>(null);
  const [stationId, setStationId] = useState<number | null>(() => Number(storageGet(STATION_KEY)) || null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api<Station[]>("staff/stations", { auth: "staff" })
      .then((list) => setStations(list.filter((s) => !s.is_finish && s.enabled)))
      .catch((err) => setLoadError(errorText(err)));
  }, []);

  const choose = (id: number | null) => {
    storageSet(STATION_KEY, id ? String(id) : null);
    setStationId(id);
  };

  const station = stations?.find((s) => s.id === stationId);

  useEffect(() => {
    // The saved station was disabled meanwhile.
    if (stations && stationId && !station) choose(null);
  }, [stations, stationId, station]);

  if (!station) {
    return (
      <div>
        <header className={staffStyles.topbar}>
          <h1>Выберите станцию</h1>
          <button className={staffStyles.linkBtn} onClick={logoutStaff}>
            Выйти
          </button>
        </header>
        <div className={staffStyles.bigCenter}>
          <DetectorStatus />
          {loadError && <p className="error-text">{loadError}</p>}
          {!stations && !loadError && <p className="muted">Загрузка…</p>}
          {stations?.length === 0 && <p className="muted">Станций пока нет. Их добавляет администратор.</p>}
          {stations?.map((s) => (
            <button key={s.id} className={`btn btn-outline btn-lg btn-block ${styles.stationBtn}`} onClick={() => choose(s.id)}>
              <span className={styles.stationNum}>{s.number}</span> {s.name}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return <StationScanner station={station} onChange={() => choose(null)} />;
}

function StationScanner({ station, onChange }: { station: Station; onChange: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [conn, setConn] = useState<SocketStatus>("connecting");
  const [queued, setQueued] = useState(0);
  const [accepted, setAccepted] = useState<number[]>([]);
  const [, setTick] = useState(0);
  const statuses = useRef(new Map<number, MarkerStatus>());
  const socketRef = useRef<LiveSocket | null>(null);

  const refreshQueued = useCallback(async () => setQueued((await scanQueue.list(station.id)).length), [station.id]);

  const flush = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket?.isOpen) return;
    for (const b of await scanQueue.list(station.id)) socket.send({ type: "scan", batch: b.batch, ids: b.ids });
  }, [station.id]);

  useEffect(() => {
    const session = staffSession.get();
    // Restore unconfirmed scans from a previous page load.
    scanQueue.list(station.id).then((batches) => {
      batches.forEach((b) => b.ids.forEach((id) => statuses.current.set(id, "pending")));
      setQueued(batches.length);
    });

    const socket = new LiveSocket(wsUrl(`station/${station.id}/?token=${encodeURIComponent(session?.token ?? "")}`), {
      onStatus: setConn,
      onOpen: flush,
      onInvalid: () => {
        // Either the PIN changed (api() redirects to login) or the station was disabled.
        api("staff/me", { auth: "staff" }).then(onChange, () => {});
      },
      onMessage: async (msg) => {
        if (msg.type !== "scan_result") return;
        const fresh: number[] = [];
        for (const { id, status } of msg.results as { id: number; status: ScanStatus }[]) {
          statuses.current.set(id, status);
          if (status === "accepted") fresh.push(id);
          if (status === "unknown") window.setTimeout(() => statuses.current.delete(id), UNKNOWN_RETRY_MS);
        }
        if (fresh.length) {
          beep();
          setAccepted((prev) => [...fresh, ...prev]);
        }
        await scanQueue.remove(msg.batch);
        refreshQueued();
        setTick((t) => t + 1);
      },
    });
    socketRef.current = socket;
    return () => socket.close();
  }, [station.id, flush, onChange, refreshQueued]);

  const onMarkers = useCallback(
    async (markers: DetectedMarker[]) => {
      const fresh = markers.map((m) => m.id).filter((id) => !statuses.current.has(id));
      if (!fresh.length) return;
      fresh.forEach((id) => statuses.current.set(id, "pending"));
      const batch = { batch: newBatchId(), stationId: station.id, ids: fresh, createdAt: Date.now() };
      await scanQueue.put(batch);
      socketRef.current?.send({ type: "scan", batch: batch.batch, ids: batch.ids });
      refreshQueued();
    },
    [station.id, refreshQueued],
  );

  const boxFor = useCallback((id: number): Box | null => {
    const status = statuses.current.get(id) ?? "pending";
    return { color: BOX[status], label: String(id) };
  }, []);

  const alreadyCount = [...statuses.current.values()].filter((s) => s === "already").length;

  const connBadge = (
    <span className={`${styles.conn} ${styles[conn]}`}>
      {conn === "open" ? "онлайн" : conn === "connecting" ? "подключение…" : "нет связи"}
      {queued > 0 && ` · в очереди: ${queued}`}
    </span>
  );

  return (
    <div>
      <header className={staffStyles.topbar}>
        <button className={staffStyles.linkBtn} onClick={onChange}>
          ← Сменить станцию
        </button>
        <button className={staffStyles.linkBtn} onClick={logoutStaff}>
          Выйти
        </button>
      </header>
      <div className={staffStyles.bigCenter}>
        <div className={styles.stationTitle}>
          <span className={styles.stationNumBig}>{station.number}</span>
          <h1>{station.name}</h1>
        </div>
        {connBadge}
        <DetectorStatus />
        <button
          className={`btn btn-lg btn-block ${styles.scanBtn}`}
          onClick={() => {
            unlockAudio();
            setScanning(true);
          }}
        >
          Сканировать
        </button>
        <p className="muted">Отмечено за смену: {accepted.length}</p>
      </div>

      {scanning && (
        <ScannerView active={scanning} onMarkers={onMarkers} boxFor={boxFor} fit="contain">
          <div className={styles.scanTop}>
            <b>{station.name}</b>
            {connBadge}
          </div>
          <div className={styles.scanBottom}>
            <div className={styles.counter}>
              <span className={styles.counterNum}>{accepted.length}</span> отмечено
              {alreadyCount > 0 && <span className={styles.already}>· уже были отмечены: {alreadyCount}</span>}
              {accepted.length > 0 && <span className={styles.lastIds}>последние: {accepted.slice(0, 8).join(", ")}</span>}
            </div>
            <div className={styles.legend}>
              <span style={{ color: BOX.accepted }}>■ засчитано</span>
              <span style={{ color: BOX.already }}>■ уже было</span>
              <span style={{ color: BOX.unknown }}>■ неизвестный</span>
              <span style={{ color: BOX.pending }}>■ отправка</span>
            </div>
            <button className="btn btn-lg btn-block btn-danger" onClick={() => setScanning(false)}>
              Стоп
            </button>
          </div>
        </ScannerView>
      )}
    </div>
  );
}
