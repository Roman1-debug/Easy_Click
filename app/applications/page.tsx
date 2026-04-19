"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Application } from "@/lib/types";
import ApplicationRow from "@/components/features/ApplicationRow";
import styles from "./page.module.css";

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  async function loadApplications() {
    const res = await api.getApplications();
    if (res.success && res.data) {
      setApplications((res.data as { applications: Application[] }).applications);
    }
    setLoading(false);
  }

  useEffect(() => { loadApplications(); }, []);

  async function handleStatusChange(id: number, status: string) {
    await api.updateApplication(id, status);
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: status as Application["status"] } : a))
    );
  }

  async function handleDelete(id: number) {
    await api.deleteApplication(id);
    setApplications((prev) => prev.filter((a) => a.id !== id));
  }

  const STATUS_FILTERS = ["all", "pending", "sent", "viewed", "interview", "rejected", "offer"];

  const filtered = filter === "all" ? applications : applications.filter((a) => a.status === filter);

  const counts = applications.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page-body">
      <div className="page-header">
        <h1 className="page-title">Applications</h1>
        <p className="page-subtitle">{applications.length} total applications</p>
      </div>

      <div className={styles.filterBar}>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            id={`filter-${s}`}
            className={`btn btn--sm ${filter === s ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setFilter(s)}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== "all" && counts[s] ? ` (${counts[s]})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No applications yet</p>
          <p className="empty-state-desc">Search for jobs and use the Apply button to start tracking your applications.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map((app) => (
            <ApplicationRow
              key={app.id}
              application={app}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

