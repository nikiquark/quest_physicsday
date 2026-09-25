import { useEffect, useRef, useState } from "react";

import { MarkerSvg } from "../aruco/MarkerSvg";
import type { ParticipantState } from "../api/types";
import { StationList } from "../components/StationList";
import { useWakeLock } from "../lib/useWakeLock";
import { QuestMap } from "../map/QuestMap";
import styles from "./Participant.module.css";
import { Register } from "./Register";
import { useParticipant } from "./useParticipant";

type Tab = "list" | "code" | "map";

export default function ParticipantApp() {
  const { phase, state, status, registered } = useParticipant();

  if (phase === "register") return <Register onDone={registered} />;
  if (!state) {
    return (
      <div className={styles.center}>
        <p className="muted">{phase === "offline" ? "Нет связи с сервером, пробуем снова…" : "Загрузка…"}</p>
      </div>
    );
  }
  return <Quest state={state} online={status === "open"} />;
}

function Quest({ state, online }: { state: ParticipantState; online: boolean }) {
  const [tab, setTab] = useState<Tab>("list");
  const [flashId, setFlashId] = useState<number | null>(null);
  const visitedRef = useRef<Set<number> | null>(null);
  const { participant, stations } = state;

  // A station got confirmed: buzz, jump to the list and flash the new check mark.
  useEffect(() => {
    const visited = new Set(stations.filter((s) => s.visited).map((s) => s.id));
    const previous = visitedRef.current;
    visitedRef.current = visited;
    if (!previous) return;
    const fresh = [...visited].find((id) => !previous.has(id));
    if (fresh === undefined) return;
    navigator.vibrate?.([80, 60, 80]);
    setTab("list");
    setFlashId(fresh);
  }, [stations]);

  useEffect(() => {
    if (flashId === null) return;
    const timer = window.setTimeout(() => setFlashId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [flashId]);

  const currentIds = participant.current_station_id ? [participant.current_station_id] : [];
  const current = stations.find((s) => s.id === participant.current_station_id);
  const passed = stations.filter((s) => s.visited && !s.is_finish).length;
  const total = stations.filter((s) => !s.is_finish).length;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.hello}>{participant.name}</div>
          <div className={styles.progress}>
            Пройдено {passed} из {total}
          </div>
        </div>
        <span className={`${styles.net} ${online ? styles.netOn : ""}`} title={online ? "Онлайн" : "Нет связи"} />
      </header>

      <main className={styles.content}>
        {tab === "list" && (
          <>
            {participant.prize_at ? (
              <div className={styles.celebrate}>
                <div className={styles.celebrateIcon}>🎉</div>
                <h2>Квест пройден!</h2>
                <p>Спасибо за участие в ФизКвесте.</p>
              </div>
            ) : current ? (
              <div className={styles.nextCard}>
                <span className={styles.nextLabel}>{current.is_finish ? "Все станции пройдены! Иди на" : "Следующая станция"}</span>
                <span className={styles.nextName}>{current.name}</span>
              </div>
            ) : null}
            <StationList stations={stations} currentIds={currentIds} flashId={flashId} showDescription showNumbers={false} />
          </>
        )}
        {tab === "code" && <CodeTab markerId={participant.marker_id} />}
        {tab === "map" && (
          <div className={styles.mapTab}>
            <QuestMap stations={stations} highlightIds={currentIds} labelHighlighted />
            {current && (
              <p className={styles.mapHint}>
                Сейчас: <b>{current.name}</b>
              </p>
            )}
          </div>
        )}
      </main>

      <nav className={styles.tabbar}>
        <button className={`${styles.tab} ${tab === "list" ? styles.tabActive : ""}`} onClick={() => setTab("list")}>
          Список
        </button>
        <button
          className={`${styles.codeTab} ${tab === "code" ? styles.codeTabActive : ""}`}
          onClick={() => setTab("code")}
          aria-label="Мой код"
        >
          <CodeIcon />
        </button>
        <button className={`${styles.tab} ${tab === "map" ? styles.tabActive : ""}`} onClick={() => setTab("map")}>
          Карта
        </button>
      </nav>
    </div>
  );
}

function CodeTab({ markerId }: { markerId: number }) {
  useWakeLock(true);
  return (
    <div className={styles.codeTabBody}>
      <MarkerSvg id={markerId} quietZone={1} className={styles.marker} />
      <div className={styles.markerNumber}>№ {markerId}</div>
      <p className={styles.codeHint}>Покажи этот код начальнику станции. Сделай экран поярче.</p>
    </div>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 14h3M14 18v3" />
    </svg>
  );
}
