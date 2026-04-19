"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { DashboardStats, Application } from "@/lib/types";
import styles from "./page.module.css";

const STAT_ITEMS = [
  {
    key: "total_jobs",
    label: "Jobs Found",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
  },
  {
    key: "total_applications",
    label: "Applications",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    key: "sent",
    label: "Emails Sent",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
      </svg>
    ),
  },
  {
    key: "applied_job",
    label: "Applied Jobs",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
  },
];

const STATUS_COLOR: Record<string, string> = {
  pending: "badge--gray",
  sent: "badge--info",
  viewed: "badge--warning",
  interview: "badge--purple",
  rejected: "badge--danger",
  offer: "badge--success",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentApps, setRecentApps] = useState<Application[]>([]);
  const [recentScams, setRecentScams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getStats(), api.getApplications(), api.getScams()]).then(([sRes, aRes, scRes]) => {
      if (sRes.success && sRes.data) setStats(sRes.data as DashboardStats);
      if (aRes.success && aRes.data) {
        setRecentApps((aRes.data as { applications: Application[] }).applications.slice(0, 6));
      }
      if (scRes.success && scRes.data) {
        setRecentScams((scRes.data as any[]).slice(0, 3));
      }
      setLoading(false);
    });
  }, []);

  const statValues: Record<string, number> = {
    total_jobs: stats?.total_jobs ?? 0,
    total_applications: stats?.total_applications ?? 0,
    sent: stats?.sent ?? 0,
    applied_job: stats?.total_applications ?? 0,
  };

  return (
    <div className="page-body">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Welcome back — here is your job search overview</p>
      </div>

      {/* Stat Cards */}
      <div className={`grid-4 ${styles.statsGrid}`}>
        {STAT_ITEMS.map((item) => (
          <div key={item.key} className="stat-card">
            <div>
              <div className="stat-value">
                {loading ? "--" : statValues[item.key].toLocaleString()}
              </div>
              <div className="stat-label">{item.label}</div>
            </div>
            <div className="stat-icon">{item.icon}</div>
          </div>
        ))}
      </div>

      {/* Main Body */}
      <div className={styles.body}>
        {/* Quick Actions */}
        <div className={styles.leftCol}>
          <div className={`card ${styles.actionsCard}`}>
            <h2 className={styles.sectionTitle}>Quick Actions</h2>
            <div className={styles.actionsList}>
              {[
                { href: "/search", label: "Start New Search", desc: "Search jobs across all platforms", color: "var(--accent)" },
                { href: "/results", label: "View Job Results", desc: "Browse and filter discovered jobs", color: "#3b82f6" },
                { href: "/resume", label: "Tailor My Resume", desc: "AI-optimize your resume for a job", color: "#8b5cf6" },
                { href: "/settings", label: "Complete Profile", desc: "Add skills, roles, and resume text", color: "#f59e0b" },
              ].map((a) => (
                <Link key={a.href} href={a.href} className={styles.actionItem}>
                  <div className={styles.actionDot} style={{ background: a.color }} />
                  <div>
                    <p className={styles.actionLabel}>{a.label}</p>
                    <p className={styles.actionDesc}>{a.desc}</p>
                  </div>
                  <svg className={styles.actionArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Applications */}
        <div className={styles.rightCol}>
          <div className={`card ${styles.recentCard}`} style={{ marginBottom: 20 }}>
            <div className={styles.cardHeader}>
              <h2 className={styles.sectionTitle}>Recent Applications</h2>
              <Link href="/applications" className="btn btn--ghost btn--sm">View all</Link>
            </div>

            {loading ? (
              <div className="empty-state" style={{ padding: "32px 0" }}>
                <div className="spinner" style={{ width: 24, height: 24 }} />
              </div>
            ) : recentApps.length === 0 ? (
              <div className="empty-state" style={{ padding: "32px 0" }}>
                <p className="empty-state-title">No applications yet</p>
                <p className="empty-state-desc">Apply to jobs to track them here.</p>
              </div>
            ) : (
              <div className={styles.appList}>
                {recentApps.map((app) => (
                  <div key={app.id} className={styles.appRow}>
                    <div className={styles.appIcon}>
                      {app.company.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.appInfo}>
                      <p className={styles.appRole}>{app.role}</p>
                      <p className={styles.appCompany}>{app.company}</p>
                    </div>
                    <span className={`badge ${STATUS_COLOR[app.status] || "badge--gray"}`}>
                      {app.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`card ${styles.recentCard}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.sectionTitle}>Safety Scan</h2>
              <Link href="/scams" className="btn btn--ghost btn--sm">Full Feed</Link>
            </div>
            <div className={styles.scamMiniList}>
               {recentScams.map((s, i) => (
                 <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className={styles.scamItem}>
                   <div className={styles.scamDot}>⚠️</div>
                   <div style={{ flex: 1 }}>
                     <p className={styles.scamTitle}>{s.title}</p>
                     <p className={styles.scamMeta}>{s.source}</p>
                   </div>
                 </a>
               ))}
               {recentScams.length === 0 && !loading && (
                 <p style={{ fontSize: 13, color: '#666', padding: '10px' }}>No active alerts in your region.</p>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

