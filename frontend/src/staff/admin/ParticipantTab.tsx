import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { api, errorText } from "../../api/client";
import type { ParticipantDetail, StationProgress } from "../../api/types";
import { StationList, formatTime } from "../../components/StationList";
import styles from "./Admin.module.css";

const EVENT_TEXT: Record<string, string> = {
  prize: "Приз выдан",
  prize_forced: "Приз выдан без полного прохождения",
  visit_added: "Станция отмечена вручную",
  visit_removed: "Отметка станции снята",
};

export function ParticipantTab() {
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<ParticipantDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (marker: number) => {
    setError("");
    try {
      setDetail(await api<ParticipantDetail>(`admin/participants/${marker}`, { auth: "staff" }));
    } catch (err) {
      setDetail(null);
      setError(errorText(err));
    }
  };

  const toggle = async (station: StationProgress) => {
    if (!detail) return;
    const marker = detail.state.participant.marker_id;
    setBusy(true);
    try {
      setDetail(
        station.visited
          ? await api<ParticipantDetail>(`admin/participants/${marker}/visits/${station.id}`, { method: "DELETE", auth: "staff" })
          : await api<ParticipantDetail>(`admin/participants/${marker}/visits`, {
              method: "POST",
              body: { station_id: station.id },
              auth: "staff",
            }),
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const p = detail?.state.participant;

  return (
    <div className={styles.stack}>
      <form
        className={styles.formRow}
        onSubmit={(e) => {
          e.preventDefault();
          const marker = Number(query);
          if (Number.isInteger(marker) && marker >= 0) load(marker);
        }}
      >
        <input
          className={`input ${styles.searchInput}`}
          inputMode="numeric"
          placeholder="Номер маркера"
          value={query}
          onChange={(e) => setQuery(e.target.value.replace(/\D/g, ""))}
        />
        <button className="btn">Найти</button>
      </form>
      {error && <p className="error-text">{error}</p>}

      {detail && p && (
        <div className={styles.split}>
          <section className={styles.stack}>
            <div>
              <div className="muted">
                № {p.marker_id} · {p.kind === "phone" ? "телефон" : "бумажный маркер"}
              </div>
              <h2>{p.display_name}</h2>
              <div className="muted">
                {p.activated ? `Начал: ${formatTime(detail.activated_at)}` : "Ещё не сканировался"}
                {p.prize_at && ` · приз в ${formatTime(p.prize_at)}${p.prize_forced ? " (без полного прохождения)" : ""}`}
                {!p.prize_at && p.all_done && " · прошёл все станции"}
              </div>
            </div>
            <StationList
              stations={detail.state.stations.filter((s) => !s.is_finish)}
              currentIds={p.current_station_id ? [p.current_station_id] : []}
              action={(station) => (
                <button className={`btn ${station.visited ? "btn-ghost" : "btn-outline"}`} disabled={busy} onClick={() => toggle(station)}>
                  {station.visited ? "Снять" : "Отметить"}
                </button>
              )}
            />
            {detail.events.length > 0 && (
              <>
                <h3>Журнал</h3>
                <ul className={styles.events}>
                  {detail.events.map((e, i) => (
                    <li key={i}>
                      {formatTime(e.created_at)} — {EVENT_TEXT[e.kind] ?? e.kind}
                      {e.station && `: ${e.station}`}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          {detail.token && (
            <section className={styles.stack}>
              <h3>Перенос на другой телефон</h3>
              <p className="muted">Участник сканирует этот QR-код своим телефоном — откроется его квест с тем же маркером.</p>
              <RestoreQr token={detail.token} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function RestoreQr({ token }: { token: string }) {
  const [src, setSrc] = useState("");
  const url = `${window.location.origin}/restore/${token}`;
  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 2 }).then(setSrc);
  }, [url]);
  return src ? <img src={src} alt="QR для переноса сессии" className={styles.qr} /> : null;
}
