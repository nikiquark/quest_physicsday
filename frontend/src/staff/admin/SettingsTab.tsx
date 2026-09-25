import { useEffect, useState } from "react";

import { api, errorText } from "../../api/client";
import type { AdminSettings, StaffRole } from "../../api/types";
import styles from "./Admin.module.css";

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Администратор",
  station: "Начальники станций",
  prize: "Выдача призов",
  help: "Экран помощи",
};

export function SettingsTab() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resetPin, setResetPin] = useState("");

  useEffect(() => {
    api<AdminSettings>("admin/settings", { auth: "staff" }).then((s) => {
      setSettings(s);
      setPins(s.pins);
    });
  }, []);

  const save = async (body: Partial<AdminSettings>, done: string) => {
    setError("");
    setMessage("");
    try {
      const s = await api<AdminSettings>("admin/settings", { method: "PATCH", body, auth: "staff" });
      setSettings(s);
      setPins(s.pins);
      setMessage(done);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const reset = async () => {
    setError("");
    setMessage("");
    if (!confirm("Удалить всех участников и все отметки? Станции и PIN-коды сохранятся.")) return;
    try {
      await api("admin/reset", { method: "POST", body: { pin: resetPin }, auth: "staff" });
      setResetPin("");
      setMessage("Данные квеста сброшены.");
    } catch (err) {
      setError(errorText(err));
    }
  };

  if (!settings) return <p className="muted">Загрузка…</p>;

  return (
    <div className={styles.settings}>
      {message && <p className={styles.ok}>{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <section className="card">
        <h3>Регистрация участников</h3>
        <p className="muted">{settings.registration_open ? "Открыта — новые участники могут регистрироваться." : "Закрыта."}</p>
        <button
          className={`btn ${settings.registration_open ? "btn-outline" : ""}`}
          onClick={() =>
            save({ registration_open: !settings.registration_open }, settings.registration_open ? "Регистрация закрыта" : "Регистрация открыта")
          }
        >
          {settings.registration_open ? "Закрыть регистрацию" : "Открыть регистрацию"}
        </button>
      </section>

      <section className="card">
        <h3>PIN-коды</h3>
        <p className="muted">4–8 цифр, у каждой роли свой. После смены все, кто вошёл со старым PIN, будут разлогинены.</p>
        <form
          className={styles.pins}
          onSubmit={(e) => {
            e.preventDefault();
            save({ pins } as Partial<AdminSettings>, "PIN-коды сохранены");
          }}
        >
          {(Object.keys(ROLE_LABEL) as StaffRole[]).map((role) => (
            <label key={role} className={styles.pinRow}>
              <span>{ROLE_LABEL[role]}</span>
              <input
                className="input"
                inputMode="numeric"
                maxLength={8}
                value={pins[role] ?? ""}
                onChange={(e) => setPins({ ...pins, [role]: e.target.value.replace(/\D/g, "") })}
              />
            </label>
          ))}
          <button className="btn">Сохранить PIN-коды</button>
        </form>
      </section>

      <section className={`card ${styles.danger}`}>
        <h3>Сброс квеста</h3>
        <p className="muted">
          Удаляет участников с телефонов, все отметки и выдачи призов, сбрасывает бумажные маркеры. Станции, карта и PIN-коды
          остаются. Нужен PIN администратора.
        </p>
        <div className={styles.formRow}>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            placeholder="PIN администратора"
            value={resetPin}
            onChange={(e) => setResetPin(e.target.value.replace(/\D/g, ""))}
          />
          <button className="btn btn-danger" disabled={resetPin.length < 4} onClick={reset}>
            Сбросить
          </button>
        </div>
      </section>
    </div>
  );
}
