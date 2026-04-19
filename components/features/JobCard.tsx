import type { Job } from "@/lib/types";
import { getExperienceFit } from "@/lib/job-utils";
import styles from "./JobCard.module.css";

interface JobCardProps {
  job: Job;
  onView: (job: Job) => void;
  onApply: (job: Job) => void;
  onTailor: (job: Job) => void;
  onToggleSave?: (job: Job) => void;
  userExperienceYears?: number | null;
}

function getScoreClass(score: number): string {
  if (score >= 70) return "score-ring--high";
  if (score >= 40) return "score-ring--mid";
  return "score-ring--low";
}

function getSourceClass(source: string): string {
  if (source === "direct_extract") return "source-pill--direct";
  const known = ["indeed", "naukri", "linkedin", "internshala", "wellfound", "direct"];
  return known.includes(source) ? `source-pill--${source}` : "source-pill--default";
}

export default function JobCard({ job, onView, onApply, onTailor, onToggleSave, userExperienceYears }: JobCardProps) {
  const experienceFit = getExperienceFit(job, userExperienceYears);

  return (
    <div className={`card ${styles.jobCard}`}>
      <div className={styles.header}>
        <div className={`score-ring ${getScoreClass(job.score)}`} title="AI Match Score: Based on your skills, experience, and the job requirements.">
          {job.score || "--"}
        </div>
        <div className={styles.meta}>
          <h2 className={styles.title}>{job.title}</h2>
          <p className={styles.company}>{job.company}</p>
        </div>
        {onToggleSave && (
          <button 
            className={`${styles.saveBtn} ${job.is_saved ? styles.saved : ""}`}
            onClick={() => onToggleSave(job)}
            title={job.is_saved ? "Unsave" : "Save"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={job.is_saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
        )}
      </div>

      <div className={styles.tags}>
        <span className={`badge badge--gray`}>{job.location || "Location unknown"}</span>
        {job.source && (
          <span className={`source-pill ${getSourceClass(job.source)}`}>{job.source}</span>
        )}
        {job.salary && job.salary.toLowerCase() !== "not disclosed" && (
          <span className={`badge badge--success`}>{job.salary}</span>
        )}
        {job.experience && (
          <span className={`badge badge--info`} style={{ backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>{job.experience}</span>
        )}
        {experienceFit && (
          <span
            className={`badge ${experienceFit.tone === "warn" ? styles.expWarn : experienceFit.tone === "ok" ? styles.expOk : styles.expNeutral}`}
          >
            {experienceFit.message}
          </span>
        )}
        {job.posted_date && (
          <span className={`badge badge--gray`}>{job.posted_date}</span>
        )}
      </div>

      {job.score_reason && (
        <p className={styles.reason}>{job.score_reason}</p>
      )}

      {job.hr_email && (
        <div className={styles.hrContact}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
          <span>HR: {job.hr_email}</span>
        </div>
      )}

      <div className={styles.actions}>
        <button className="btn btn--ghost btn--sm" onClick={() => onView(job)}>
          View Details
        </button>
        <button className="btn btn--secondary btn--sm" onClick={() => onTailor(job)}>
          Tailor Resume
        </button>
        <button className="btn btn--primary btn--sm" onClick={() => onApply(job)}>
          Apply
        </button>
        <button 
          className="btn btn--secondary btn--sm" 
          onClick={(e) => {
            e.stopPropagation();
            window.open(`https://www.google.com/search?q=${encodeURIComponent(`${job.company} HR recruiter LinkedIn India`)}`, '_blank');
          }}
          title="Search for this company's HR on LinkedIn"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          Find HR on LinkedIn
        </button>
      </div>
    </div>
  );
}
