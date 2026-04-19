"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import styles from "./page.module.css";

type YoutubeResource = {
  name: string;
  type: "youtube";
  youtube_id: string;
  channel: string;
  duration_mins?: number;
  search_query?: string;
};

type ArticleResource = {
  name: string;
  type: "article";
  url: string;
};

type Resource = YoutubeResource | ArticleResource;

type Project = {
  name: string;
  description: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
};

type Milestone = {
  id: number;
  title: string;
  duration: string;
  why_this_phase: string;
  skills_to_learn: string[];
  projects: Project[];
  resources: Resource[];
  status: "pending" | "completed";
};

type Certification = {
  name: string;
  provider: string;
  value: string;
  url?: string;
};

type Roadmap = {
  title: string;
  overview: string;
  total_duration: string;
  milestones: Milestone[];
  certifications: Certification[];
  salary_expectation: string;
  top_hiring_companies: string[];
};

const DIFFICULTY_COLOR = {
  Beginner: "var(--success)",
  Intermediate: "var(--warning)",
  Advanced: "var(--danger)",
};

function YoutubeThumbnail({ resource }: { resource: YoutubeResource }) {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    resource.search_query || `${resource.channel} ${resource.name}`
  )}`;
  const channelInitials = resource.channel
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "YT";

  return (
    <a
      href={searchUrl}
      className={styles.ytCard}
      target="_blank"
      rel="noopener noreferrer"
      title={resource.name}
    >
      <div className={styles.ytThumb}>
        <div className={styles.ytThumbFallback}>
          <div className={styles.ytInitials}>{channelInitials}</div>
          <div className={styles.ytSearchLabel}>YouTube Search</div>
        </div>
        <div className={styles.ytPlayOverlay}>Play</div>
        {resource.duration_mins && (
          <div className={styles.ytDuration}>{resource.duration_mins}m</div>
        )}
      </div>
      <div className={styles.ytInfo}>
        <div className={styles.ytTitle}>{resource.name}</div>
        <div className={styles.ytChannel}>{resource.channel}</div>
        <div className={styles.ytMeta}>Opens a valid search result instead of a brittle direct video link</div>
      </div>
    </a>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className={styles.statCard} style={{ borderColor: accent }}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}

export default function SkillRoadmapPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [expandedMilestone, setExpandedMilestone] = useState<number | null>(0);

  useEffect(() => {
    api.getProfile().then((res) => {
      if (res.success && res.data) setProfile(res.data);
    });
  }, []);

  const profileSummary = useMemo(() => {
    const targetRole = profile?.target_roles?.[0] || "your next role";
    const years = profile?.experience_years || 0;
    const skills = Array.isArray(profile?.skills) ? profile.skills.slice(0, 6) : [];
    return { targetRole, years, skills };
  }, [profile]);

  const generateRoadmap = async () => {
    if (!profile) return;
    setIsGenerating(true);
    setError(null);
    setExpandedMilestone(0);

    try {
      const res = await api.generateRoadmap({
        target_role: profile.target_roles?.[0] || "Software Engineer",
        current_skills: profile.skills || [],
        experience: `${profile.experience_years || 0} years`,
        country: profile.country || "India",
      });

      if (res.success && res.data) {
        setRoadmap(res.data as Roadmap);
      } else {
        setError((res as any).error || "Failed to generate roadmap. Check your API key in Settings.");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };

  const roadmapStats = useMemo(() => {
    if (!roadmap) return null;
    const totalProjects = roadmap.milestones?.reduce((sum, milestone) => sum + (milestone.projects?.length || 0), 0) || 0;
    const totalResources = roadmap.milestones?.reduce((sum, milestone) => sum + (milestone.resources?.length || 0), 0) || 0;
    const totalPhases = roadmap.milestones?.length || 0;
    return { totalProjects, totalResources, totalPhases };
  }, [roadmap]);

  if (!roadmap) {
    return (
      <div className="page-body">
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.heroEyebrow}>Personal Learning System</div>
            <h1 className={styles.heroTitle}>Roadmap for {profileSummary.targetRole}</h1>
            <p className={styles.heroSubtitle}>
              A sharper, profile-aware growth plan built from your current skill base, your experience level, and the role you want next.
            </p>
            <div className={styles.heroChips}>
              <span className={styles.heroChip}>{profileSummary.years} years experience</span>
              {profileSummary.skills.map((skill: string, index: number) => (
                <span key={index} className={styles.heroChipMuted}>{skill}</span>
              ))}
            </div>
          </div>
          <div className={styles.heroPanel}>
            <div className={styles.heroPanelLabel}>What you get</div>
            <div className={styles.heroPanelValue}>Phases, projects, docs, salary context, hiring radar</div>
            <div className={styles.heroPanelList}>
              <span className={styles.heroPanelItem}>Clear milestone plan</span>
              <span className={styles.heroPanelItem}>Hands-on project ideas</span>
              <span className={styles.heroPanelItem}>Reliable learning resources</span>
              <span className={styles.heroPanelItem}>Market and hiring context</span>
            </div>
          </div>
        </section>

        <div className={styles.emptyShell}>
          <div className={styles.emptyCard}>
            <div className={styles.emptyIcon}>Path</div>
            <h3 className={styles.emptyTitle}>Generate Your Next-Step Plan</h3>
            <p className={styles.emptyLead}>
              Target role: <strong>{profileSummary.targetRole || "Set a role in your profile"}</strong>
            </p>
            <p className={styles.emptyBody}>
              We’ll build a phase-by-phase roadmap with focused skills, practical projects, certification choices, compensation context, and reliable resource links.
            </p>
            {error && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>{error}</p>}
            <button
              className="btn btn--primary btn--lg"
              style={{ width: "100%" }}
              onClick={generateRoadmap}
              disabled={isGenerating || !profile}
            >
              {isGenerating ? "Building your roadmap..." : "Generate Roadmap"}
            </button>
            {!profile && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>Complete your Profile first.</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-body">
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroEyebrow}>Personalized Roadmap</div>
          <h1 className={styles.heroTitle}>{roadmap.title}</h1>
          <p className={styles.heroSubtitle}>{roadmap.overview}</p>
          <div className={styles.heroChips}>
            <span className={styles.heroChip}>{roadmap.total_duration}</span>
            <span className={styles.heroChip}>{profileSummary.years} years baseline</span>
            <span className={styles.heroChip}>Role: {profileSummary.targetRole}</span>
          </div>
        </div>
        <div className={styles.heroPanel}>
          <div className={styles.heroPanelLabel}>Current profile focus</div>
          <div className={styles.heroPanelValue}>{profileSummary.skills.slice(0, 4).join(" • ") || "Profile-driven planning"}</div>
          <p className={styles.heroPanelText}>
            The roadmap is now geared for clearer action, cleaner visuals, and links that are actually usable.
          </p>
          <button className="btn btn--secondary btn--sm" onClick={generateRoadmap} disabled={isGenerating}>
            {isGenerating ? "Regenerating..." : "Regenerate"}
          </button>
          {error && <div className={styles.heroError}>{error}</div>}
        </div>
      </section>

      {roadmapStats && (
        <section className={styles.statsGrid}>
          <StatCard label="Phases" value={String(roadmapStats.totalPhases)} accent="rgba(15, 118, 110, 0.22)" />
          <StatCard label="Hands-on Projects" value={String(roadmapStats.totalProjects)} accent="rgba(202, 138, 4, 0.22)" />
          <StatCard label="Resources" value={String(roadmapStats.totalResources)} accent="rgba(37, 99, 235, 0.22)" />
          <StatCard label="Target Compensation" value={roadmap.salary_expectation} accent="rgba(22, 163, 74, 0.22)" />
        </section>
      )}

      <div className={styles.layoutGrid}>
        <div className={styles.roadmap}>
          <div className={styles.roadmapLine} />

          {roadmap.milestones?.map((m, i) => {
            const isOpen = expandedMilestone === i;
            const ytResources = m.resources?.filter((r): r is YoutubeResource => r.type === "youtube") || [];
            const articleResources = m.resources?.filter((r): r is ArticleResource => r.type === "article") || [];

            return (
              <div key={i} className={`${styles.milestone} ${m.status === "completed" ? styles.completed : ""}`}>
                <div className={styles.milestoneDot}>
                  {m.status === "completed" ? "Done" : i + 1}
                </div>

                <div className={styles.milestoneContent}>
                  <div
                    className={styles.milestoneCard}
                    onClick={() => setExpandedMilestone(isOpen ? null : i)}
                  >
                    <div className={styles.titleRow}>
                      <div>
                        <h3 className={styles.mTitle}>{m.title}</h3>
                        {m.why_this_phase && <p className={styles.phaseWhy}>{m.why_this_phase}</p>}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className={styles.mDuration}>{m.duration}</span>
                        <span className={styles.expandLabel}>{isOpen ? "Hide" : "Open"}</span>
                      </div>
                    </div>

                    <div className={styles.tagList}>
                      {m.skills_to_learn?.map((s, idx) => (
                        <span key={idx} className={styles.skillTag}>{s}</span>
                      ))}
                    </div>

                    {isOpen && (
                      <div onClick={(e) => e.stopPropagation()}>
                        {m.projects?.length > 0 && (
                          <>
                            <div className={styles.subTitle}>Projects</div>
                            <div className={styles.projectStack}>
                              {m.projects.map((p, idx) => {
                                const proj = typeof p === "string"
                                  ? { name: p, description: "", difficulty: "Intermediate" as const }
                                  : p;
                                return (
                                  <div key={idx} className={styles.projectBox}>
                                    <div className={styles.projectHeader}>
                                      <span className={styles.projectName}>{proj.name}</span>
                                      <span
                                        className={styles.projectDifficulty}
                                        style={{ background: DIFFICULTY_COLOR[proj.difficulty] || "var(--text-muted)" }}
                                      >
                                        {proj.difficulty}
                                      </span>
                                    </div>
                                    {proj.description && (
                                      <p className={styles.projectDescription}>{proj.description}</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}

                        {ytResources.length > 0 && (
                          <>
                            <div className={styles.subTitle}>Video Walkthroughs</div>
                            <p className={styles.videoHint}>
                              Each card opens a valid YouTube search result page for the matching topic and channel.
                            </p>
                            <div className={styles.ytGrid}>
                              {ytResources.map((r, idx) => (
                                <YoutubeThumbnail key={idx} resource={r} />
                              ))}
                            </div>
                          </>
                        )}

                        {articleResources.length > 0 && (
                          <>
                            <div className={styles.subTitle}>Docs & Articles</div>
                            <div className={styles.resourceList}>
                              {articleResources.map((r, idx) => (
                                <a key={idx} href={r.url} className={styles.resourceLink} target="_blank" rel="noopener noreferrer">
                                  <span className={styles.resourceIcon}>Doc</span>
                                  <span>{r.name}</span>
                                </a>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <div className={styles.sidebarSectionLabel}>Compensation Lens</div>
            <div className={styles.salaryValue}>{roadmap.salary_expectation}</div>
            <div className={styles.sidebarSummary}>
              Use this as your pacing reference while you work through the roadmap and raise your market value.
            </div>

            <h4 style={{ marginBottom: 12, fontSize: 14 }}>Certifications</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {roadmap.certifications?.map((c, i) => (
                <div key={i} className={styles.certCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div className={styles.certName}>{c.name}</div>
                    {c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.certLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Info
                      </a>
                    )}
                  </div>
                  {c.provider && (
                    <div className={styles.certProvider}>{c.provider}</div>
                  )}
                  <div className={styles.certDesc}>{c.value}</div>
                </div>
              ))}
            </div>
          </div>

          {roadmap.top_hiring_companies?.length > 0 && (
            <div className={styles.sidebarCard}>
              <div className={styles.sidebarSectionLabel}>Hiring Radar</div>
              <h4 style={{ marginBottom: 12, fontSize: 14 }}>Top Hiring Companies</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {roadmap.top_hiring_companies.map((company, i) => (
                  <div key={i} className={styles.companyPill}>
                    {company}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
