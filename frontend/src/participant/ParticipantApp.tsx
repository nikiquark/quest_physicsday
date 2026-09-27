import { useEffect, useRef, useState } from "react";

import { MarkerSvg } from "../aruco/MarkerSvg";
import type { ParticipantState } from "../api/types";
import { plural } from "../lib/plural";
import { useWakeLock } from "../lib/useWakeLock";
import { QuestMap } from "../map/QuestMap";
import styles from "./Participant.module.css";
import { Register } from "./Register";
import { useParticipant } from "./useParticipant";

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
  const [showCode, setShowCode] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const visitedRef = useRef<Set<number> | null>(null);
  const { participant, stations } = state;

  // A station got confirmed: buzz, leave the code screen and show what was counted.
  useEffect(() => {
    const visited = new Set(stations.filter((s) => s.visited).map((s) => s.id));
    const previous = visitedRef.current;
    visitedRef.current = visited;
    if (!previous) return;
    const fresh = stations.find((s) => s.visited && !previous.has(s.id));
    if (!fresh) return;
    navigator.vibrate?.([80, 60, 80]);
    setShowCode(false);
    setConfirmed(fresh.name);
  }, [stations]);

  useEffect(() => {
    if (confirmed === null) return;
    const timer = window.setTimeout(() => setConfirmed(null), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmed]);

  const currentIds = participant.current_station_id ? [participant.current_station_id] : [];
  const current = stations.find((s) => s.id === participant.current_station_id);
  const passed = stations.filter((s) => s.visited && !s.is_finish).length;
  const total = stations.filter((s) => !s.is_finish).length;
  const left = total - passed;

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
        {showCode ? (
          <CodeTab markerId={participant.marker_id} />
        ) : (
          <>
            {confirmed && (
              <div className={styles.confirmed} role="status">
                ✓ Станция «{confirmed}» засчитана
              </div>
            )}
            {participant.prize_at ? (
              <div className={styles.celebrate}>
                <div className={styles.celebrateIcon}>🎉</div>
                <h2>Квест пройден!</h2>
                <p>Спасибо за участие в ФизКвесте.</p>
              </div>
            ) : current ? (
              <div className={styles.nextCard}>
                <span className={styles.nextLabel}>{current.is_finish ? "Все станции пройдены! Иди на" : "Текущая станция"}</span>
                <span className={styles.nextName}>{current.name}</span>
                {current.description && <span className={styles.nextDescription}>{current.description}</span>}
              </div>
            ) : null}
            {left > 0 && !participant.prize_at && (
              <div className={styles.left}>
                Осталось пройти: <b>{left}</b> {plural(left, "станция", "станции", "станций")}
              </div>
            )}
            <QuestMap stations={stations} highlightIds={currentIds} labelHighlighted showNumbers={false} />
          </>
        )}
      </main>

      <button
        className={`${styles.codeButton} ${showCode ? styles.codeButtonOpen : ""}`}
        onClick={() => setShowCode((open) => !open)}
        aria-label={showCode ? "Закрыть код" : "Мой код"}
      >
        {!showCode && (
          <>
            <span className={styles.wave} />
            <span className={styles.wave} />
          </>
        )}
        {showCode ? <CloseIcon /> : <CodeIcon />}
      </button>
    </div>
  );
}

function CodeTab({ markerId }: { markerId: number }) {
  useWakeLock(true);
  return (
    <div className={styles.codeTabBody}>
      <MarkerSvg id={markerId} quietZone={1} className={styles.marker} />
      <div className={styles.markerNumber}>№ {markerId}</div>
      <p className={styles.codeHint}>Покажи этот код организатору на станции. Сделай экран поярче.</p>
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

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
