import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { staffSession, wsUrl } from "../../api/client";
import type { DashboardStats } from "../../api/types";
import { LiveSocket, type SocketStatus } from "../../lib/socket";
import { logoutStaff } from "../RequireRole";
import styles from "./Admin.module.css";
import { Dashboard } from "./Dashboard";
import { ParticipantTab } from "./ParticipantTab";
import { SettingsTab } from "./SettingsTab";
import { StationsTab } from "./StationsTab";

type Tab = "dashboard" | "stations" | "participant" | "settings";

const TABS: [Tab, string][] = [
  ["dashboard", "Обзор"],
  ["stations", "Станции и карта"],
  ["participant", "Участник"],
  ["settings", "Настройки"],
];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [conn, setConn] = useState<SocketStatus>("connecting");

  useEffect(() => {
    const token = staffSession.get()?.token ?? "";
    const socket = new LiveSocket(wsUrl(`admin/?token=${encodeURIComponent(token)}`), {
      onStatus: setConn,
      onInvalid: logoutStaff,
      onMessage: (msg) => {
        if (msg.type === "stats") setStats(msg.stats);
      },
    });
    return () => socket.close();
  }, []);

  return (
    <div className={styles.admin}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>Ф</span>
          <b>ФизКвест · администратор</b>
          <span className={`${styles.dot} ${conn === "open" ? styles.dotOn : ""}`} title={conn} />
        </div>
        <nav className={styles.tabs}>
          {TABS.map(([key, label]) => (
            <button key={key} className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
          <Link className={styles.tab} to="/staff/admin/print">
            Печать маркеров
          </Link>
          <Link className={styles.tab} to="/staff/station">
            Сканер станции
          </Link>
          <button className={styles.tab} onClick={logoutStaff}>
            Выйти
          </button>
        </nav>
      </header>
      <main className={styles.main}>
        {tab === "dashboard" && <Dashboard stats={stats} />}
        {tab === "stations" && <StationsTab stats={stats} />}
        {tab === "participant" && <ParticipantTab />}
        {tab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}
