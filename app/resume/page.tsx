"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Job, TailoredResume, ResumeVersion } from "@/lib/types";
import ManualEditor from "@/components/features/ManualEditor";
import TemplateGallery from "@/components/features/TemplateGallery";
import styles from "./page.module.css";

function ResumeContent() {
  const searchParams = useSearchParams();
  const jobIdParam = searchParams.get("job_id");

  const [activeTab, setActiveTab] = useState<"tailor" | "manual" | "templates">("tailor");
  const [profile, setProfile] = useState<any>(null);
  const [prepopulatedYaml, setPrepopulatedYaml] = useState<string | undefined>(undefined);
  const [fromTemplate, setFromTemplate] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<number | null>(jobIdParam ? Number(jobIdParam) : null);
  const [selectedTemplate, setSelectedTemplate] = useState("classic");
  const [tailoring, setTailoring] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [tailored, setTailored] = useState<TailoredResume | null>(null);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [error, setError] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");
  const [generatingVersionId, setGeneratingVersionId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    api.getProfile().then((res) => {
      if (res.success && res.data) setProfile(res.data);
    });
    api.listJobs({ limit: 100, saved_only: true }).then((res) => {
      if (res.success && res.data) setJobs((res.data as { jobs: Job[] }).jobs);
    });
  }, []);

  useEffect(() => {
    if (!selectedJobId) return;
    api.getResumeVersions(selectedJobId).then((res) => {
      if (res.success && res.data)
        setVersions((res.data as { versions: ResumeVersion[] }).versions);
    });
    if (!jobs.find((j) => j.id === selectedJobId)) {
      api.getJob(selectedJobId).then((res) => {
        if (res.success && res.data) {
          setJobs((prev) => {
            if (prev.find((p) => p.id === selectedJobId)) return prev;
            return [res.data as Job, ...prev];
          });
        }
      });
    }
  }, [selectedJobId]);

  const filteredJobs = useMemo(() => {
    if (!searchQuery) return jobs;
    const q = searchQuery.toLowerCase();
    return jobs.filter(
      (j) => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
    );
  }, [jobs, searchQuery]);

  const selectedJob = useMemo(() => jobs.find((j) => j.id === selectedJobId), [jobs, selectedJobId]);

  async function handleTailor() {
    if (!selectedJobId) return;
    setTailoring(true);
    setError("");
    setPdfStatus("");
    setTailored(null);
    const res = await api.tailorResume(selectedJobId, 1, feedback.trim() || undefined);
    if (res.success && res.data) {
      setTailored(res.data as TailoredResume);
      const versRes = await api.getResumeVersions(selectedJobId);
      if (versRes.success && versRes.data)
        setVersions((versRes.data as { versions: ResumeVersion[] }).versions);
    } else {
      setError(res.error || "Tailoring failed");
    }
    setTailoring(false);
  }

  async function handleGeneratePdf(versionId: number) {
    setGenerating(true);
    setGeneratingVersionId(versionId);
    setPdfStatus("");
    setError("");
    const res = await api.generatePdf(versionId, selectedTemplate);
    if (res.success) {
      setPdfStatus("PDF generated successfully!");
      const versRes = await api.getResumeVersions(selectedJobId!);
      if (versRes.success && versRes.data)
        setVersions((versRes.data as { versions: ResumeVersion[] }).versions);
    } else {
      setError(res.error || "PDF generation failed");
    }
    setGenerating(false);
    setGeneratingVersionId(null);
  }

  function handleTemplateSelect(yaml: string, theme: string) {
    setPrepopulatedYaml(yaml);
    setSelectedTemplate(theme);
    setFromTemplate(true);
    setActiveTab("manual");
  }

  function handleChangeJob() {
    setSelectedJobId(null);
    setTailored(null);
    setVersions([]);
    setError("");
    setPdfStatus("");
    setFeedback("");
  }

  const atsColor = (score: number) => {
    if (score >= 80) return "var(--success, #22c55e)";
    if (score >= 60) return "var(--warning, #f59e0b)";
    return "var(--error, #ef4444)";
  };

  return (
    <div className="page-body">
      <div className="page-header">
        <h1 className="page-title">Resume Builder</h1>
        <p className="page-subtitle">Personalise your resume for any job or build one from scratch</p>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tabBtn} ${activeTab === "tailor" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("tailor")}
        >
          AI Tailoring
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "manual" ? styles.tabBtnActive : ""}`}
          onClick={() => { setActiveTab("manual"); setFromTemplate(false); }}
        >
          Manual Editor
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "templates" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("templates")}
        >
          Templates
        </button>
      </div>

      {activeTab === "tailor" && (
        <>
          {selectedJob ? (
            <div className={styles.selectionInfo}>
              <div>
                <span className={styles.selectedText}>Tailoring for:</span>
                <span className={styles.selectedLabel}>{selectedJob.title} at {selectedJob.company}</span>
                {selectedJob.score > 0 && (
                  <span
                    style={{
                      marginLeft: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      color: atsColor(selectedJob.score),
                    }}
                  >
                    {selectedJob.score}% profile fit
                  </span>
                )}
              </div>
              <button className="btn btn--ghost btn--sm" onClick={handleChangeJob}>
                Change Job
              </button>
            </div>
          ) : (
            <div className={styles.jobPicker}>
              <div className={styles.pickerHeader}>
                <h2 className={styles.pickerTitle}>Select a Saved Job to Tailor For</h2>
                <input
                  type="text"
                  className={`input ${styles.searchBox}`}
                  placeholder="Search by title or company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className={styles.jobGrid}>
                {filteredJobs.length === 0 ? (
                  <div className="empty-state">
                    <p>No saved jobs found. Bookmark jobs in Search to see them here.</p>
                  </div>
                ) : (
                  filteredJobs.map((job) => (
                    <div
                      key={job.id}
                      className={`card ${styles.pickerCard}`}
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <div className={styles.cardHeader}>
                        <div className={styles.cardMeta}>
                          <p className={styles.cardTitle}>{job.title}</p>
                          <p className={styles.cardCompany}>{job.company}</p>
                          {job.location && (
                            <p style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{job.location}</p>
                          )}
                        </div>
                        <div
                          className={styles.cardScore}
                          style={{ color: atsColor(job.score ?? 0) }}
                        >
                          {job.score ?? 0}%
                        </div>
                      </div>
                      {!job.description && (
                        <p style={{ fontSize: 11, color: "var(--warning, #f59e0b)", marginTop: 6 }}>
                          ⚠ No description — refresh the job first for best results
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {selectedJob && (
            <div className={styles.controls}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <button
                  className="btn btn--primary"
                  onClick={handleTailor}
                  disabled={tailoring}
                  id="tailor-btn"
                >
                  {tailoring ? (
                    <><span className="spinner" /> Tailoring…</>
                  ) : tailored ? (
                    "Re-tailor"
                  ) : (
                    "Generate Tailored Resume"
                  )}
                </button>
              </div>

              <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
                <label className="label" htmlFor="feedback-input">
                  {tailored ? "Re-tailor with feedback (optional)" : "Specific instructions (optional)"}
                </label>
                <textarea
                  id="feedback-input"
                  className="input"
                  rows={2}
                  placeholder={
                    tailored
                      ? "e.g. Emphasise Python more, remove the 2019 internship, add leadership keywords…"
                      : "e.g. Focus on security experience, drop unrelated projects, highlight certifications…"
                  }
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={tailoring}
                  style={{ resize: "vertical", minHeight: 56 }}
                />
              </div>

              {tailoring && (
                <p style={{ fontSize: 12, opacity: 0.65, marginTop: 8 }}>
                  Analysing job description and optimising resume for ATS… this takes 20–40 seconds.
                </p>
              )}
            </div>
          )}

          {error && <div className="alert alert--error" style={{ marginBottom: 16 }}>{error}</div>}
          {pdfStatus && <div className="alert alert--success" style={{ marginBottom: 16 }}>{pdfStatus}</div>}

          {tailored && (
            <div className={`card ${styles.tailoredResult}`}>
              <div className={styles.resultHeader}>
                <div style={{ flex: 1 }}>
                  <div
                    className={styles.atsScore}
                    style={{ color: atsColor(tailored.ats_score) }}
                  >
                    ATS Score: {tailored.ats_score}%
                  </div>
                  <p className={styles.changeSummary}>{tailored.change_summary}</p>
                </div>
                <div className={styles.resultActions}>
                  {versions.find((v) => v.id === tailored.resume_version_id)?.pdf_path ? (
                    <a
                      href={`http://localhost:8000/resume/download/${tailored.resume_version_id}?t=${Date.now()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn--primary"
                    >
                      Download PDF
                    </a>
                  ) : (
                    <button
                      className="btn btn--primary"
                      onClick={() => handleGeneratePdf(tailored.resume_version_id)}
                      disabled={generating}
                    >
                      {generating && generatingVersionId === tailored.resume_version_id ? (
                        <><span className="spinner" /> Generating PDF…</>
                      ) : (
                        "Generate PDF"
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {versions.length > 0 && (
            <div className={styles.versionsSection}>
              <h2 className={styles.sectionTitle}>Version History for this Job</h2>
              <div className={styles.versionList}>
                {versions.map((v) => (
                  <div key={v.id} className={`card ${styles.versionCard}`}>
                    <div className={styles.versionInfo}>
                      <div
                        className={styles.versionScore}
                        style={{ color: atsColor(v.ats_score) }}
                      >
                        {v.ats_score}%
                      </div>
                      <div>
                        <p className={styles.versionSummary}>{v.change_summary}</p>
                        <p className={styles.versionDate}>
                          {new Date(v.created_at).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className={styles.versionActions}>
                      {v.pdf_path ? (
                        <a
                          href={`http://localhost:8000/resume/download/${v.id}?t=${Date.now()}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn--primary btn--sm"
                        >
                          Download
                        </a>
                      ) : (
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => handleGeneratePdf(v.id)}
                          disabled={generating}
                        >
                          {generating && generatingVersionId === v.id ? (
                            <><span className="spinner" /> Generating…</>
                          ) : (
                            "Generate PDF"
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "manual" && (
        <ManualEditor
          initialData={profile}
          prepopulatedYaml={prepopulatedYaml}
          fromTemplate={fromTemplate}
        />
      )}

      {activeTab === "templates" && (
        <TemplateGallery onSelect={handleTemplateSelect} />
      )}
    </div>
  );
}

export default function ResumePage() {
  return (
    <Suspense>
      <ResumeContent />
    </Suspense>
  );
}
