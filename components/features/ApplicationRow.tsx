import type { Application } from "@/lib/types";
import styles from "./ApplicationRow.module.css";

interface ApplicationRowProps {
  application: Application;
  onStatusChange: (id: number, status: string) => void;
  onDelete: (id: number) => void;
}

const STATUS_OPTIONS = ["pending", "sent", "viewed", "interview", "rejected", "offer"];

function getStatusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    pending: "badge--gray",
    sent: "badge--info",
    viewed: "badge--warning",
    interview: "badge--purple",
    rejected: "badge--danger",
    offer: "badge--success",
  };
  return map[status] || "badge--gray";
}

export default function ApplicationRow({ application, onStatusChange, onDelete }: ApplicationRowProps) {
  const date = new Date(application.applied_at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className={styles.row}>
      <div className={styles.info}>
        <p className={styles.role}>{application.role}</p>
        <p className={styles.company}>{application.company}</p>
      </div>

      <div className={styles.date}>{date}</div>

      <span className={`badge ${getStatusBadgeClass(application.status)}`}>
        {application.status}
      </span>

      <select
        className={styles.statusSelect}
        value={application.status}
        onChange={(e) => onStatusChange(application.id, e.target.value)}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {application.apply_link && (
        <a
          href={application.apply_link}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--ghost btn--sm"
        >
          Open
        </a>
      )}

      <button className="btn btn--danger btn--sm" onClick={() => onDelete(application.id)}>
        Remove
      </button>
    </div>
  );
}
