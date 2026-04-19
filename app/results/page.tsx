"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";
import JobCard from "@/components/features/JobCard";
import styles from "./page.module.css";

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [minScore, setMinScore] = useState(0);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [actionStatus, setActionStatus] = useState<string>("");
  const [userExperienceYears, setUserExperienceYears] = useState<number>(0);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    const res = await api.listJobs({ limit: 100, min_score: minScore, remote_only: remoteOnly, saved_only: true });
    if (res.success && res.data) {
      setJobs((res.data as { jobs: Job[] }).jobs);
    }
    setLoading(false);
  }, [minScore, remoteOnly]);

  useEffect(() => {
    loadJobs();
    api.getProfile().then((res) => {
      if (res.success && res.data) {
        setUserExperienceYears(Number((res.data as any).experience_years || 0));
      }
    });
  }, [loadJobs]);

  async function handleToggleSave(job: Job) {
    const res = await api.toggleSaveJob(job.id);
    if (res.success) {
      // Remove from list if we just unsaved it on the saved page
      setJobs(jobs.filter(j => j.id !== job.id));
    }
  }

  async function handleApply(job: Job) {
    const res = await api.applyToJob(job.id, "manual");
    if (res.success) {
      setActionStatus(`Applied to ${job.title} at ${job.company} — check Applications tab`);
    } else {
      setActionStatus(res.error || "Apply failed");
    }
  }

  async function handleTailor(job: Job) {
    router.push(`/resume?job_id=${job.id}`);
  }

  function handleView(job: Job) {
    router.push(`/job/${job.id}`);
  }

  return (
    <div className="page-body">
      <div className="page-header">
        <h1 className="page-title">Saved Jobs</h1>
        <p className="page-subtitle">
          {jobs.length} jobs in your collection
        </p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <label className={styles.filterLabel}>Min Score</label>
          <input
            id="min-score-filter"
            type="range"
            min={0}
            max={100}
            step={10}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className={styles.rangeInput}
          />
          <span className={styles.scoreLabel}>{minScore}%</span>

          <label className={styles.checkLabel}>
            <input
              id="remote-only-toggle"
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
            />
            Remote only
          </label>
        </div>

        <button className="btn btn--secondary btn--sm" onClick={loadJobs} id="refresh-results-btn">
          Refresh List
        </button>
      </div>

      {actionStatus && (
        <div className={`alert alert--info ${styles.statusAlert}`}>{actionStatus}</div>
      )}

      {loading ? (
        <div className="empty-state">
          <div className="spinner" style={{ width: 32, height: 32 }} />
          <p>Loading your collection...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No saved jobs yet</p>
          <p className="empty-state-desc">
            Go to the Search page to discover and bookmark interesting opportunities.
          </p>
        </div>
      ) : (
        <div className={styles.jobGrid}>
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              userExperienceYears={userExperienceYears}
              onView={handleView}
              onApply={handleApply}
              onTailor={handleTailor}
              onToggleSave={handleToggleSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense>
      <ResultsContent />
    </Suspense>
  );
}

