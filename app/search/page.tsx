"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Job } from "@/lib/types";
import JobCard from "@/components/features/JobCard";
import styles from "./page.module.css";

export default function SearchPage() {
  const router = useRouter();

  const [activeSearchTab, setActiveSearchTab] = useState<"market" | "direct">("market");

  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [area, setArea] = useState("");
  const [directUrl, setDirectUrl] = useState("");
  const [directKeywords, setDirectKeywords] = useState("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");

  const [searchedRole, setSearchedRole] = useState("");
  const [searchedLoc, setSearchedLoc] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [extractedJobs, setExtractedJobs] = useState<Job[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [actionStatus, setActionStatus] = useState<string>("");
  const [fetchingMore, setFetchingMore] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [keywordFilter, setKeywordFilter] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "recent">("score");
  const [hrOnly, setHrOnly] = useState(false);
  const [lastExtractedId, setLastExtractedId] = useState<number | string | null>(null);
  const [userExperienceYears, setUserExperienceYears] = useState<number>(0);

  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showStatus(msg: string, durationMs = 6000) {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setActionStatus(msg);
    statusTimer.current = setTimeout(() => setActionStatus(""), durationMs);
  }

  const refreshJobs = useCallback(
    async (currentRole: string, currentLoc: string) => {
      if (activeSearchTab === "market") {
        if (!currentRole) return;
        const res = await api.listJobs({
          limit: 150,
          min_score: minScore,
          remote_only: remoteOnly,
          exclude_saved: true,
          search_query: `${currentRole} ${currentLoc}`.trim(),
        });
        if (res.success && res.data) {
          const fetched = (res.data as { jobs: Job[] }).jobs;
          setJobs(fetched.filter((j) => j.source !== "direct_extract" && j.source !== "direct"));
        }
      } else if (activeSearchTab === "direct") {
        const res = await api.listJobs({ limit: 50, source: "direct_extract" });
        if (res.success && res.data) {
          setExtractedJobs((res.data as { jobs: Job[] }).jobs);
        }
      }
    },
    [minScore, remoteOnly, activeSearchTab]
  );

  useEffect(() => {
    if (showResults || activeSearchTab === "direct") {
      refreshJobs(searchedRole, searchedLoc);
    }
  }, [showResults, minScore, remoteOnly, activeSearchTab, refreshJobs, searchedRole, searchedLoc]);

  useEffect(() => {
    api.getProfile().then((res) => {
      if (res.success && res.data) {
        setUserExperienceYears(Number((res.data as any).experience_years || 0));
      }
    });

    const params = new URLSearchParams(window.location.search);
    const urlRole = params.get("role");
    const urlLoc = params.get("location");
    const urlArea = params.get("area");

    const storedRole = localStorage.getItem("lastSearchRole");
    const storedLoc = localStorage.getItem("lastSearchLocation");
    const storedArea = localStorage.getItem("lastSearchArea") || "";

    if (urlRole) {
      const combinedLoc = urlArea ? `${urlArea}, ${urlLoc || ""}` : (urlLoc || "");
      setRole(urlRole);
      setLocation(urlLoc || "");
      setArea(urlArea || "");
      setSearchedRole(urlRole);
      setSearchedLoc(combinedLoc.trim() || "Remote");
      setShowResults(true);
    } else if (storedRole) {
      const combinedLoc = storedArea ? `${storedArea}, ${storedLoc || ""}` : (storedLoc || "");
      setRole(storedRole);
      setLocation(storedLoc || "");
      setArea(storedArea);
      setSearchedRole(storedRole);
      setSearchedLoc(combinedLoc.trim() || "Remote");
      setShowResults(true);
    }
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!role.trim()) {
      setError("Job role is required");
      setJobs([]);
      setShowResults(false);
      localStorage.removeItem("lastSearchRole");
      localStorage.removeItem("lastSearchLocation");
      localStorage.removeItem("lastSearchArea");
      return;
    }
    setError("");
    setLoading(true);
    setJobs([]);
    setShowResults(false);
    setSearchPage(1);

    const cleanRole = role.trim();
    const cleanLocation = location.trim() || "Remote";
    const cleanArea = area.trim();
    const combinedLoc = cleanArea ? `${cleanArea}, ${cleanLocation}` : cleanLocation;

    const params = new URLSearchParams();
    params.set("role", cleanRole);
    params.set("location", cleanLocation);
    if (cleanArea) params.set("area", cleanArea);
    router.replace(`/search?${params.toString()}`, { scroll: false });

    localStorage.setItem("lastSearchRole", cleanRole);
    localStorage.setItem("lastSearchLocation", cleanLocation);
    localStorage.setItem("lastSearchArea", cleanArea);

    const res = await api.searchJobs(cleanRole, combinedLoc, 50, 1);
    if (!res.success) {
      setError(res.error || "Search failed");
      setLoading(false);
      return;
    }

    const initialJobs = ((res.data as { jobs: Job[] } | null)?.jobs || []).filter(
      (j) => j.source !== "direct_extract" && j.source !== "direct"
    );

    setSearchedRole(cleanRole);
    setSearchedLoc(combinedLoc);
    setJobs(initialJobs);
    setLoading(false);
    setShowResults(true);
  }

  async function handleExtract() {
    if (!directUrl) return;
    setExtracting(true);
    setError("");
    const res = await api.directExtractJob(directUrl, directKeywords);
    if (res.success && res.data) {
      const data = res.data as any;
      showStatus(`Extracted "${data.job.title}" at ${data.job.company} — saved to your jobs.`, 8000);
      setDirectUrl("");
      setShowResults(true);

      const newJob: Job = {
        ...data.job,
        score: data.score,
        score_reason: data.reason,
        is_saved: true,
        created_at: new Date().toISOString(),
        source: "direct_extract",
      };
      const newId = newJob.id || newJob.hash;
      setLastExtractedId(newId ?? null);
      setExtractedJobs((prev) => {
        const filtered = prev.filter((j) => j.id !== newJob.id && j.hash !== newJob.hash);
        return [newJob, ...filtered];
      });
    } else {
      setError(res.error || "Extraction failed. The page might be protected or have too little text.");
    }
    setExtracting(false);
  }

  async function handleFetchMore() {
    if (!role.trim() || fetchingMore) return;
    setFetchingMore(true);

    const nextPage = searchPage + 1;
    setSearchPage(nextPage);

    const res = await api.searchJobs(searchedRole, searchedLoc, 50, nextPage);
    if (res.success && res.data) {
      const newJobs = (res.data as { jobs: Job[] }).jobs.filter(
        (j: Job) => !jobs.some((existing) => existing.id === j.id)
      );
      setJobs((prev) => [...prev, ...newJobs]);
    }
    setFetchingMore(false);
  }

  async function handleApply(job: Job) {
    const res = await api.applyToJob(job.id, "manual");
    if (res.success) {
      showStatus(`Applied to ${job.title} at ${job.company} — check Applications tab`);
    } else {
      showStatus(res.error || "Apply failed");
    }
  }

  function handleTailor(job: Job) {
    router.push(`/resume?job_id=${job.id}`);
  }

  function handleView(job: Job) {
    router.push(`/job/${job.id}`);
  }

  async function handleToggleSave(job: Job) {
    const res = await api.toggleSaveJob(job.id);
    if (res.success) {
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, is_saved: !j.is_saved } : j)));
      setExtractedJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, is_saved: !j.is_saved } : j)));
    }
  }

  const filteredJobs = jobs
    .filter((j) => {
      const kw = keywordFilter.toLowerCase();
      const matchesScore = (j.score ?? 0) >= minScore;
      const matchesRemote = !remoteOnly || (j.location || "").toLowerCase().includes("remote");
      const matchesKw =
        !kw ||
        j.title.toLowerCase().includes(kw) ||
        j.company.toLowerCase().includes(kw) ||
        (j.description || "").toLowerCase().includes(kw);
      const matchesHr = !hrOnly || !!j.hr_email;
      const matchesSaved = !j.is_saved;
      return matchesScore && matchesRemote && matchesKw && matchesHr && matchesSaved;
    })
    .sort((a, b) =>
      sortBy === "score" ? (b.score ?? 0) - (a.score ?? 0) : b.id - a.id
    );

  return (
    <div className="page-body">
      <div className="page-header">
        <h1 className="page-title">Job Search</h1>
        <p className="page-subtitle">Search across multiple job platforms simultaneously</p>
      </div>

      <div
        className={styles.tabs}
        style={{ marginBottom: 24, display: "flex", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 2 }}
      >
        <button
          className={`btn ${activeSearchTab === "market" ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setActiveSearchTab("market")}
          style={{ borderRadius: "8px 8px 0 0", padding: "10px 20px" }}
        >
          Market Search
        </button>
        <button
          className={`btn ${activeSearchTab === "direct" ? "btn--primary" : "btn--ghost"}`}
          onClick={() => setActiveSearchTab("direct")}
          style={{ borderRadius: "8px 8px 0 0", padding: "10px 20px" }}
        >
          Direct Extract
        </button>
      </div>

      <div className={styles.searchCard}>
        {activeSearchTab === "market" ? (
          <form onSubmit={handleSearch} className={styles.form}>
            <div className={styles.formRow}>
              <div className="form-group" style={{ flex: 1.5 }}>
                <label className="label" htmlFor="role-input">Job Role</label>
                <input
                  id="role-input"
                  className="input"
                  type="text"
                  placeholder="e.g. SOC Analyst"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="label" htmlFor="location-input">City</label>
                <input
                  id="location-input"
                  className="input"
                  type="text"
                  placeholder="Mumbai, Remote"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="label" htmlFor="area-input">Specific Area (Optional)</label>
                <input
                  id="area-input"
                  className="input"
                  type="text"
                  placeholder="e.g. Malad, Andheri"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            {error && <div className="alert alert--error" style={{ marginBottom: 16 }}>{error}</div>}

            <button
              type="submit"
              className="btn btn--primary btn--lg"
              disabled={loading}
              id="search-submit-btn"
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Searching platforms...
                </>
              ) : (
                "Search & Score"
              )}
            </button>
          </form>
        ) : (
          <div className={styles.form}>
            <div className="form-group">
              <label className="label" htmlFor="url-input">Direct Job URL (Company Career Page)</label>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  id="url-input"
                  className="input"
                  type="url"
                  placeholder="https://careers.company.com/jobs/123"
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  disabled={extracting}
                />
                <button
                  className="btn btn--primary"
                  onClick={handleExtract}
                  disabled={!directUrl || extracting}
                >
                  {extracting ? "Extracting..." : "Extract & Save"}
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="label" htmlFor="keywords-input">
                Job Keywords <span style={{ fontWeight: 400, opacity: 0.6 }}>(helps find the right content on the page)</span>
              </label>
              <input
                id="keywords-input"
                className="input"
                type="text"
                placeholder="e.g. Python Developer Backend, SOC Analyst, Data Engineer..."
                value={directKeywords}
                onChange={(e) => setDirectKeywords(e.target.value)}
                disabled={extracting}
              />
            </div>

            {extracting && (
              <div style={{ marginTop: 8, fontSize: "13px", color: "var(--accent)", display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="spinner" style={{ width: 14, height: 14 }} />
                Extracting job details from page… this usually takes 20–35 seconds.
              </div>
            )}

            {error && <div className="alert alert--error" style={{ marginTop: 16 }}>{error}</div>}

            <p className={styles.infoTitle} style={{ marginTop: 10, fontSize: "12px", opacity: 0.7 }}>
              Paste a link to any job post. Our AI will scrape the details, score it against your profile, and save it to your collection.
            </p>
          </div>
        )}
      </div>

      {showResults && (
        <div className={styles.resultsContainer}>
          {activeSearchTab === "market" ? (
            <>
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

                  <label className={styles.checkLabel}>
                    <input
                      id="hr-only-toggle"
                      type="checkbox"
                      checked={hrOnly}
                      onChange={(e) => setHrOnly(e.target.checked)}
                    />
                    HR Contact only
                  </label>

                  <div style={{ width: 1, height: 24, background: "var(--border)", margin: "0 8px" }} />

                  <label className={styles.filterLabel}>Keyword</label>
                  <input
                    type="text"
                    className="input input--sm"
                    placeholder="Filter by keyword..."
                    value={keywordFilter}
                    onChange={(e) => setKeywordFilter(e.target.value)}
                    style={{ width: 160 }}
                  />

                  <label className={styles.filterLabel} style={{ marginLeft: 12 }}>Sort</label>
                  <select
                    className="input input--sm"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "score" | "recent")}
                    style={{ width: 120 }}
                  >
                    <option value="score">Highest Score</option>
                    <option value="recent">Most Recent</option>
                  </select>
                </div>
                <p className={styles.countLabel}>
                  {filteredJobs.length} jobs found for &quot;{searchedRole}&quot;
                </p>
              </div>

              {actionStatus && (
                <div className={`alert alert--info ${styles.statusAlert}`}>{actionStatus}</div>
              )}

              {filteredJobs.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-state-title">No jobs found</p>
                  <p className="empty-state-desc">
                    Try lowering the minimum score, clearing keyword filters, or searching for a different role.
                  </p>
                </div>
              ) : (
                <>
                  <div className={styles.jobGrid}>
                    {filteredJobs.map((job) => (
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
                  <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                    <button
                      className="btn btn--ghost"
                      onClick={handleFetchMore}
                      disabled={fetchingMore}
                      style={{ minWidth: 180 }}
                    >
                      {fetchingMore ? (
                        <><span className="spinner" /> Fetching more...</>
                      ) : (
                        "+ Fetch More Jobs"
                      )}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className={styles.resultsHeader} style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 className={styles.resultsTitle}>
                  {extractedJobs.length} saved extraction{extractedJobs.length !== 1 ? 's' : ''}
                </h3>
                {extractedJobs.length > 0 && (
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => { setExtractedJobs([]); setLastExtractedId(null); }}
                    style={{ fontSize: 12 }}
                  >
                    Clear History
                  </button>
                )}
              </div>

              {actionStatus && (
                <div className={`alert alert--info ${styles.statusAlert}`}>{actionStatus}</div>
              )}

              {extractedJobs.length === 0 ? (
                <div className="empty-state" style={{ padding: "40px 0" }}>
                  <div style={{ fontSize: "40px", marginBottom: "10px" }}>📄</div>
                  <p className="empty-state-title">No Extractions Yet</p>
                  <p className="empty-state-desc">Paste a job URL above and click Extract & Save.</p>
                </div>
              ) : (
                <div className={styles.jobGrid}>
                  {extractedJobs.map((job) => {
                    const jobId = job.id || job.hash;
                    const isNew = jobId === lastExtractedId;
                    return (
                      <div key={jobId} style={{ position: 'relative' }}>
                        {isNew && (
                          <div style={{
                            position: 'absolute', top: -8, left: 12, zIndex: 2,
                            background: 'var(--accent)', color: 'var(--text-on-accent)',
                            fontSize: 11, fontWeight: 700, padding: '2px 10px',
                            borderRadius: 20, letterSpacing: '0.5px',
                          }}>✓ Just Extracted</div>
                        )}
                        <JobCard
                          job={job}
                          userExperienceYears={userExperienceYears}
                          onView={handleView}
                          onApply={handleApply}
                          onTailor={handleTailor}
                          onToggleSave={handleToggleSave}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!showResults && !loading && (
        <div className={styles.infoSection}>
          <h2 className={styles.infoTitle}>How it works</h2>
          <div className="grid-3">
            {[
              {
                step: "1",
                title: "Query Expansion",
                desc: "Your role is automatically expanded into related titles for broader coverage.",
              },
              {
                step: "2",
                title: "Multi-source Scraping",
                desc: "Results are fetched from Indeed, Naukri, LinkedIn, Internshala, and Wellfound simultaneously.",
              },
              {
                step: "3",
                title: "AI Scoring",
                desc: "Each job is scored against your profile for role fit, skills, location, and experience level.",
              },
            ].map((item) => (
              <div key={item.step} className={`card ${styles.stepCard}`}>
                <div className={styles.stepNum}>{item.step}</div>
                <h3 className={styles.stepTitle}>{item.title}</h3>
                <p className={styles.stepDesc}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
