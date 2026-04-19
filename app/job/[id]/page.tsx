"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Job, GeneratedEmail } from "../../../lib/types";
import { descriptionToBlocks, getExperienceFit } from "@/lib/job-utils";
import styles from "./page.module.css";

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = Number(params.id);

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<GeneratedEmail | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<any>(null);

  const [fetchingDesc, setFetchingDesc] = useState(false);

  useEffect(() => {
    async function loadJob() {
      const [res, profileRes] = await Promise.all([api.getJob(jobId), api.getProfile()]);
      if (res.success && res.data) {
        const jobData = res.data as Job;
        setJob(jobData);
        // If description is missing, try to fetch it automatically
        if (!jobData.description) {
          handleFetchDescription();
        }
      }
      if (profileRes.success && profileRes.data) {
        setProfile(profileRes.data);
      }
      setLoading(false);
    }
    loadJob();
  }, [jobId]);

  async function handleFetchDescription() {
    setFetchingDesc(true);
    const res = await api.refreshJob(jobId);
    if (res.success && res.data) {
      setJob(res.data as Job);
    }
    setFetchingDesc(false);
  }

  async function handleGenerateEmail() {
    if (!job?.description && !fetchingDesc) {
      const confirmed = window.confirm("Job description is missing. Generate email anyway?");
      if (!confirmed) return;
    }
    setEmailLoading(true);
    setError("");
    const res = await api.generateEmail(jobId);
    if (res.success && res.data) {
      setEmail(res.data as GeneratedEmail);
    } else {
      setError(res.error || "Email generation failed");
    }
    setEmailLoading(false);
  }

  async function handleApply() {
    setApplyLoading(true);
    const res = await api.applyToJob(jobId, "manual");
    if (res.success) {
      setStatusMsg("Application saved. Open the apply link to submit manually.");
    } else {
      setError(res.error || "Apply failed");
    }
    setApplyLoading(false);
  }

  if (loading) {
    return (
      <div className="page-body">
        <div className="empty-state">
          <div className="spinner" style={{ width: 32, height: 32 }} />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page-body">
        <div className="alert alert--error">Job not found</div>
      </div>
    );
  }

  const experienceFit = getExperienceFit(job, Number(profile?.experience_years ?? 0));
  const descriptionBlocks = descriptionToBlocks(job.description || "");

  return (
    <div className="page-body">
      <button className="btn btn--ghost btn--sm" onClick={() => router.back()} style={{ marginBottom: 20 }}>
        Back
      </button>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={`score-ring ${job.score >= 70 ? "score-ring--high" : job.score >= 40 ? "score-ring--mid" : "score-ring--low"}`} style={{ width: 56, height: 56, fontSize: 16 }}>
            {job.score || "--"}
          </div>
          <div>
            <h1 className={styles.title}>{job.title}</h1>
            <p className={styles.company}>{job.company} — {job.location}</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className="btn btn--secondary" onClick={() => router.push(`/resume?job_id=${job.id}`)} id="tailor-resume-btn">
            Tailor Resume
          </button>
          {job.apply_link && (
            <a href={job.apply_link} target="_blank" rel="noopener noreferrer" className="btn btn--primary" id="open-apply-link">
              Open Apply Link
            </a>
          )}
          <button className="btn btn--secondary" onClick={handleApply} disabled={applyLoading} id="mark-applied-btn">
            {applyLoading ? <span className="spinner" /> : "Mark as Applied"}
          </button>
        </div>
      </div>

      <div className={styles.tags}>
        {job.source && <span className={`source-pill source-pill--${job.source}`}>{job.source}</span>}
        {job.posted_date && <span className="badge badge--gray">{job.posted_date}</span>}
        {experienceFit && (
          <span className={`badge ${experienceFit.tone === "warn" ? styles.expWarn : experienceFit.tone === "ok" ? styles.expOk : styles.expNeutral}`}>
            {experienceFit.message}
          </span>
        )}
        {job.score_reason && <span className="badge badge--purple">{job.score_reason}</span>}
      </div>

      {statusMsg && <div className="alert alert--success" style={{ marginBottom: 16 }}>{statusMsg}</div>}
      {error && <div className="alert alert--error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="divider" />

      <div className={styles.body}>
        <div className={styles.descSection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionLabel}>Job Description</h2>
            <button 
              className="btn btn--ghost btn--xs" 
              onClick={handleFetchDescription} 
              disabled={fetchingDesc}
            >
              {fetchingDesc ? <span className="spinner spinner--xs" /> : job.description ? "Refetch & Reformat" : "Fetch Full Description"}
            </button>
          </div>
          <div className={styles.descText}>
            {fetchingDesc ? (
              <div className={styles.placeholder}>
                <span className="spinner" />
                Fetching full details from {job.source}...
              </div>
            ) : job.description ? (
              <div className={styles.descBlocks}>
                {descriptionBlocks.map((block, index) => (
                  block.type === "heading" ? (
                    <h3 key={index} className={styles.descHeading}>{block.text}</h3>
                  ) : block.type === "bullet" ? (
                    <div key={index} className={styles.descBullet}>{block.text}</div>
                  ) : (
                    <p key={index} className={styles.descParagraph}>{block.text}</p>
                  )
                ))}
              </div>
            ) : (
              "No description available. Visit the apply link for full details."
            )}
          </div>
        </div>

        <div className={styles.emailSection}>
          <div className={styles.emailHeader}>
            <h2 className={styles.sectionLabel}>Cold Email Generator</h2>
            <button
              className="btn btn--secondary btn--sm"
              onClick={handleGenerateEmail}
              disabled={emailLoading}
              id="generate-email-btn"
            >
              {emailLoading ? <><span className="spinner" /> Generating...</> : "Generate Email"}
            </button>
          </div>

          {email && (
            <div className={styles.emailPreview}>
              <div className={styles.emailField}>
                <span className={styles.emailFieldLabel}>Subject</span>
                <p className={styles.emailFieldValue}>{email.subject}</p>
              </div>
              <div className={styles.emailField}>
                <span className={styles.emailFieldLabel}>Body</span>
                <pre className={styles.emailBody}>{email.body}</pre>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`)}
                  id="copy-email-btn"
                >
                  Copy to Clipboard
                </button>
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set('compose', 'true');
                    if (job?.hr_email) params.set('to', job.hr_email);
                    params.set('subject', email.subject);
                    params.set('body', email.body);
                    router.push(`/emails?${params.toString()}`);
                  }}
                  id="compose-email-btn"
                >
                  Compose
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
