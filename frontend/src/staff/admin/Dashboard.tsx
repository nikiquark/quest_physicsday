import type { DashboardStats } from "../../api/types";
import styles from "./Admin.module.css";

export function Dashboard({ stats }: { stats: DashboardStats | null }) {
  if (!stats) return <p className="muted">Загрузка…</p>;
  const p = stats.participants;
  const cards: [string, number, string?][] = [
    ["Участников с телефоном", p.phone_total],
    ["Бумажных активировано", p.paper_activated],
    ["Всего участвует", p.phone_total + p.paper_activated],
    ["Прошли все станции", p.all_done],
    ["Ждут приз на финише", p.at_finish],
    ["Получили приз", p.prize_total, p.prize_forced ? `из них без полного прохождения: ${p.prize_forced}` : undefined],
  ];
  return (
    <div className={styles.stack}>
      {!stats.registration_open && <div className={styles.warn}>Регистрация закрыта</div>}
      <div className={styles.cards}>
        {cards.map(([label, value, note]) => (
          <div key={label} className={styles.statCard}>
            <span className={styles.statValue}>{value}</span>
            <span className={styles.statLabel}>{label}</span>
            {note && <span className={styles.statNote}>{note}</span>}
          </div>
        ))}
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>№</th>
            <th>Станция</th>
            <th className={styles.num}>Сейчас идут сюда</th>
            <th className={styles.num}>Прошли всего</th>
          </tr>
        </thead>
        <tbody>
          {stats.stations.map((s) => (
            <tr key={s.id} className={s.enabled ? "" : styles.disabledRow}>
              <td>{s.is_finish ? "🏁" : s.number}</td>
              <td>
                {s.name}
                {!s.enabled && <span className={styles.tag}>отключена</span>}
              </td>
              <td className={styles.num}>
                <b>{s.active}</b>
              </td>
              <td className={styles.num}>{s.visited_total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
