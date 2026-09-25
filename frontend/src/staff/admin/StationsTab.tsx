import { useEffect, useState } from "react";

import { api, errorText } from "../../api/client";
import type { DashboardStats, Station } from "../../api/types";
import { QuestMap } from "../../map/QuestMap";
import styles from "./Admin.module.css";

type Draft = Pick<Station, "name" | "number" | "description">;

export function StationsTab({ stats }: { stats: DashboardStats | null }) {
  const [stations, setStations] = useState<Station[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);

  const reload = () =>
    api<Station[]>("staff/stations", { auth: "staff" })
      .then(setStations)
      .catch((err) => setError(errorText(err)));

  useEffect(() => {
    reload();
  }, []);

  const patch = async (id: number, data: Partial<Station>) => {
    setError("");
    try {
      const updated = await api<Station>(`admin/stations/${id}`, { method: "PATCH", body: data, auth: "staff" });
      setStations((list) => list.map((s) => (s.id === id ? updated : s)));
    } catch (err) {
      setError(errorText(err));
    }
  };

  const create = async (draft: Draft) => {
    setError("");
    try {
      await api<Station>("admin/stations", { method: "POST", body: draft, auth: "staff" });
      await reload();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const active = new Map(stats?.stations.map((s) => [s.id, s.active]) ?? []);
  const nextNumber = Math.max(0, ...stations.filter((s) => !s.is_finish).map((s) => s.number)) + 1;

  return (
    <div className={styles.split}>
      <section className={styles.stack}>
        <h2>Карта</h2>
        <p className="muted">Перетащите метку станции, чтобы изменить её место. Позиция сохраняется сразу.</p>
        <div className={styles.mapBox}>
          <QuestMap stations={stations} editable onMove={(id, x, y) => patch(id, { x, y })} />
        </div>
      </section>

      <section className={styles.stack}>
        <h2>Станции</h2>
        {error && <p className="error-text">{error}</p>}
        {stations.map((s) =>
          editing === s.id ? (
            <StationForm
              key={s.id}
              initial={s}
              finish={s.is_finish}
              submitLabel="Сохранить"
              onCancel={() => setEditing(null)}
              onSubmit={async (draft) => {
                await patch(s.id, draft);
                setEditing(null);
              }}
            />
          ) : (
            <div key={s.id} className={`${styles.stationRow} ${s.enabled ? "" : styles.disabledRow}`}>
              <span className={styles.stationNum}>{s.is_finish ? "🏁" : s.number}</span>
              <div className={styles.stationInfo}>
                <b>{s.name}</b>
                {s.description && <span className="muted">{s.description}</span>}
                <span className={styles.statNote}>сейчас идут: {active.get(s.id) ?? 0}</span>
              </div>
              <button className="btn btn-ghost" onClick={() => setEditing(s.id)}>
                Изменить
              </button>
              {!s.is_finish && (
                <button
                  className={`btn ${s.enabled ? "btn-outline" : ""}`}
                  onClick={() => {
                    if (!s.enabled || confirm(`Отключить «${s.name}»? Она пропадёт из маршрутов участников.`))
                      patch(s.id, { enabled: !s.enabled });
                  }}
                >
                  {s.enabled ? "Отключить" : "Включить"}
                </button>
              )}
            </div>
          ),
        )}
        <h3>Новая станция</h3>
        <StationForm
          key={nextNumber}
          initial={{ name: "", number: nextNumber, description: "" }}
          submitLabel="Добавить станцию"
          onSubmit={create}
        />
        <p className="muted">
          Новая станция появится на втором этаже по центру — перетащите её на нужное место. Участникам, которые ещё в пути, она
          добавится в случайное место среди непройденных.
        </p>
      </section>
    </div>
  );
}

function StationForm({
  initial,
  finish,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  finish?: boolean;
  submitLabel: string;
  onSubmit: (draft: Draft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!draft.name.trim()) return;
        setBusy(true);
        await onSubmit({ ...draft, name: draft.name.trim() });
        setBusy(false);
        if (!onCancel) setDraft({ name: "", number: draft.number + 1, description: "" });
      }}
    >
      <div className={styles.formRow}>
        {!finish && (
          <input
            className={`input ${styles.numInput}`}
            type="number"
            min={0}
            value={draft.number}
            onChange={(e) => setDraft({ ...draft, number: Number(e.target.value) })}
            aria-label="Номер"
          />
        )}
        <input
          className="input"
          placeholder="Название"
          maxLength={100}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </div>
      <input
        className="input"
        placeholder="Короткое описание (видно участнику)"
        maxLength={300}
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />
      <div className={styles.formRow}>
        <button className="btn" disabled={busy || !draft.name.trim()}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}
