import { useEffect, useState } from "react";

import { api, errorText } from "../api/client";
import type { ParticipantState } from "../api/types";
import styles from "./Participant.module.css";

interface Props {
  onDone: (me: { token: string; state: ParticipantState }) => void;
}

export function Register({ onDone }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(true);

  useEffect(() => {
    api<{ registration_open: boolean }>("public/status")
      .then((s) => setOpen(s.registration_open))
      .catch(() => {});
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      onDone(await api("participants/register", { method: "POST", body: { name: name.trim() }, auth: "participant" }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.register}>
      <div className={styles.logo}>
        <span className={styles.logoMark}>Ф</span>
        <h1>ФизКвест</h1>
      </div>
      {open ? (
        <form onSubmit={submit} className={styles.registerForm}>
          <label htmlFor="name" className={styles.registerLabel}>
            Как тебя зовут?
          </label>
          <input
            id="name"
            className="input"
            value={name}
            maxLength={50}
            autoComplete="given-name"
            autoFocus
            placeholder="Имя"
            onChange={(e) => setName(e.target.value)}
          />
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-lg btn-block" disabled={!name.trim() || busy}>
            {busy ? "Секунду…" : "Начать квест"}
          </button>
        </form>
      ) : (
        <p className={styles.closed}>Регистрация закрыта. Подойдите к организаторам.</p>
      )}
    </div>
  );
}
