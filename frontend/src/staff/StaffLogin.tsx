import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, errorText, staffSession } from "../api/client";
import type { StaffRole } from "../api/types";
import { ROLE_HOME } from "./RequireRole";
import styles from "./Staff.module.css";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export default function StaffLogin() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Already logged in with a still-valid token: go straight to the role's page.
  useEffect(() => {
    const session = staffSession.get();
    if (!session) return;
    api<{ role: StaffRole }>("staff/me", { auth: "staff" })
      .then(({ role }) => navigate(ROLE_HOME[role], { replace: true }))
      .catch(() => {});
  }, [navigate]);

  const submit = async (value = pin) => {
    if (value.length < 4 || busy) return;
    setBusy(true);
    setError("");
    try {
      const session = await api<{ role: StaffRole; token: string }>("staff/login", { method: "POST", body: { pin: value } });
      staffSession.set(session);
      navigate(ROLE_HOME[session.role], { replace: true });
    } catch (err) {
      setError(errorText(err));
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const press = (key: string) => {
    if (key === "⌫") setPin((p) => p.slice(0, -1));
    else if (key && pin.length < 8) setPin((p) => p + key);
  };

  return (
    <div className={styles.login}>
      <h1>Вход для организаторов</h1>
      <form
        className={styles.loginForm}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className={`input ${styles.pinInput}`}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={8}
          placeholder="PIN-код"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
        />
        <div className={styles.keypad}>
          {KEYS.map((key, i) =>
            key ? (
              <button type="button" key={i} className={styles.key} onClick={() => press(key)}>
                {key}
              </button>
            ) : (
              <span key={i} />
            ),
          )}
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-lg btn-block" disabled={pin.length < 4 || busy}>
          Войти
        </button>
      </form>
    </div>
  );
}
