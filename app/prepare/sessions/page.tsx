"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import styles from "./page.module.css";

type Message = {
  role: "assistant" | "user";
  content: string;
};

type QuestionBreakdown = {
  question_summary: string;
  answer_quality: "Strong" | "Adequate" | "Weak";
  note: string;
};

type Scorecard = {
  technical_score: number;
  communication_score: number;
  confidence_score: number;
  hire_signal: string;
  strengths: string[];
  weaknesses: string[];
  red_flags: string[];
  coaching_notes: string[];
  overall_feedback: string;
  question_breakdown: QuestionBreakdown[];
};

type Session = {
  id: number;
  role: string;
  focus: string;
  experience: string;
  scorecard: Scorecard;
  created_at: string;
};

type SessionDetail = Session & {
  history: Message[];
};

const HIRE_COLOR: Record<string, string> = {
  "Strong Hire": "#22c55e",
  "Hire": "#4ade80",
  "No Hire": "#f59e0b",
  "Strong No Hire": "var(--danger)",
};

const QUALITY_COLOR: Record<string, string> = {
  Strong: "#22c55e",
  Adequate: "#f59e0b",
  Weak: "var(--danger)",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, (value / 10) * 100);
  const color = value >= 7 ? "#22c55e" : value >= 5 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontWeight: 600, color }}>{value}/10</span>
      </div>
      <div style={{ height: 8, background: "var(--border)", borderRadius: 99 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

function TranscriptReplay({ history }: { history: Message[] }) {
  if (!history?.length) {
    return <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No transcript available for this session.</p>;
  }

  return (
    <div className={styles.transcript}>
      {history.map((msg, i) => {
        const isAi = msg.role === "assistant";
        let displayContent = msg.content;
        if (isAi && displayContent.includes("[NEXT_QUESTION]")) {
          const parts = displayContent.split("[NEXT_QUESTION]");
          const reaction = parts[0]?.trim();
          const question = parts[1]?.trim();
          return (
            <div key={i} className={styles.transcriptTurn}>
              {reaction && (
                <div className={styles.reactionBubble}>{reaction}</div>
              )}
              {question && (
                <div className={`${styles.bubble} ${styles.bubbleAi}`}>
                  <span className={styles.bubbleSender}>Marcus</span>
                  {question}
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={i} className={`${styles.bubble} ${isAi ? styles.bubbleAi : styles.bubbleUser}`}>
            <span className={styles.bubbleSender}>{isAi ? "Marcus" : "You"}</span>
            {displayContent}
          </div>
        );
      })}
    </div>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<Record<number, SessionDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Record<number, "scores" | "breakdown" | "transcript">>({});

  useEffect(() => {
    setIsLoading(true);
    api.getInterviewSessions()
      .then(res => {
        if (res.success && res.data) {
          setSessions(res.data as Session[]);
        } else {
          setError("Could not load sessions.");
        }
      })
      .catch(() => setError("Network error loading sessions."))
      .finally(() => setIsLoading(false));
  }, []);

  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (detailData[id]) return;

    setLoadingDetail(id);
    try {
      const res = await api.getInterviewSession(id);
      if (res.success && res.data) {
        setDetailData(prev => ({ ...prev, [id]: res.data as SessionDetail }));
        setActiveTab(prev => ({ ...prev, [id]: "scores" }));
      }
    } catch {
      setError("Failed to load session detail.");
    } finally {
      setLoadingDetail(null);
    }
  };

  const setTab = (id: number, tab: "scores" | "breakdown" | "transcript") => {
    setActiveTab(prev => ({ ...prev, [id]: tab }));
  };

  if (isLoading) {
    return (
      <div className="page-body">
        <header className="page-header">
          <h1 className="page-title">Past Interview Sessions</h1>
        </header>
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 14 }}>
          Loading sessions...
        </div>
      </div>
    );
  }

  return (
    <div className="page-body">
      <header className="page-header">
        <h1 className="page-title">Past Interview Sessions</h1>
        <p className="page-subtitle">
          {sessions.length > 0
            ? `${sessions.length} session${sessions.length > 1 ? "s" : ""} saved — click any row to review.`
            : "Your saved interview sessions will appear here."}
        </p>
      </header>

      {error && (
        <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>{error}</p>
      )}

      {sessions.length === 0 && !error && (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🎙</div>
          <h3 style={{ marginBottom: 8 }}>No sessions yet</h3>
          <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
            Complete a mock interview and hit "Save Session" on the scorecard to see it here.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sessions.map(session => {
          const sc = session.scorecard || {};
          const isOpen = expandedId === session.id;
          const detail = detailData[session.id];
          const tab = activeTab[session.id] || "scores";
          const hireColor = HIRE_COLOR[sc.hire_signal] || "var(--text-muted)";
          const avgScore = sc.technical_score != null
            ? Math.round(((sc.technical_score || 0) + (sc.communication_score || 0) + (sc.confidence_score || 0)) / 3)
            : null;

          return (
            <div key={session.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                className={styles.sessionRow}
                onClick={() => toggleExpand(session.id)}
                style={{ cursor: "pointer" }}
              >
                <div className={styles.sessionMeta}>
                  <div className={styles.sessionRole}>{session.role || "Unknown Role"}</div>
                  <div className={styles.sessionTags}>
                    <span className={styles.tag}>{session.focus}</span>
                    <span className={styles.tag}>{session.experience}</span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDate(session.created_at)}</span>
                  </div>
                </div>

                <div className={styles.sessionSignals}>
                  {sc.hire_signal && (
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: 20,
                      background: `${hireColor}22`,
                      color: hireColor,
                      border: `1px solid ${hireColor}55`,
                    }}>
                      {sc.hire_signal}
                    </span>
                  )}
                  {avgScore != null && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                      Avg {avgScore}/10
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>

              {isOpen && (
                <div className={styles.sessionDetail}>
                  {loadingDetail === session.id ? (
                    <p style={{ fontSize: 13, color: "var(--text-muted)", padding: "20px 0" }}>Loading detail...</p>
                  ) : (
                    <>
                      <div className={styles.tabBar}>
                        {(["scores", "breakdown", "transcript"] as const).map(t => (
                          <button
                            key={t}
                            className={`${styles.tabBtn} ${tab === t ? styles.tabBtnActive : ""}`}
                            onClick={() => setTab(session.id, t)}
                          >
                            {t === "scores" && "Scores & Feedback"}
                            {t === "breakdown" && "Question Breakdown"}
                            {t === "transcript" && "Transcript Replay"}
                          </button>
                        ))}
                      </div>

                      {tab === "scores" && (
                        <div className={styles.tabContent}>
                          <div className={styles.scoresLayout}>
                            <div>
                              <ScoreBar label="Technical" value={sc.technical_score ?? 0} />
                              <ScoreBar label="Communication" value={sc.communication_score ?? 0} />
                              <ScoreBar label="Confidence" value={sc.confidence_score ?? 0} />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                              {sc.strengths?.length > 0 && (
                                <div>
                                  <div className={styles.sectionLabel}>Strengths</div>
                                  {sc.strengths.map((s, i) => (
                                    <div key={i} className={styles.feedbackItem} style={{ borderLeft: "3px solid #22c55e" }}>{s}</div>
                                  ))}
                                </div>
                              )}
                              {sc.weaknesses?.length > 0 && (
                                <div>
                                  <div className={styles.sectionLabel}>Weaknesses</div>
                                  {sc.weaknesses.map((w, i) => (
                                    <div key={i} className={styles.feedbackItem} style={{ borderLeft: "3px solid #f59e0b" }}>{w}</div>
                                  ))}
                                </div>
                              )}
                              {sc.coaching_notes?.length > 0 && (
                                <div>
                                  <div className={styles.sectionLabel}>Coaching Notes</div>
                                  {sc.coaching_notes.map((n, i) => (
                                    <div key={i} className={styles.feedbackItem} style={{ borderLeft: "3px solid var(--accent)" }}>{n}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {sc.overall_feedback && (
                            <div style={{ marginTop: 20, padding: "14px 16px", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)" }}>
                              <div className={styles.sectionLabel} style={{ marginBottom: 6 }}>Expert Feedback</div>
                              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
                                {sc.overall_feedback}
                              </p>
                            </div>
                          )}

                          {sc.red_flags?.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                              <div className={styles.sectionLabel}>Red Flags</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                                {sc.red_flags.map((r, i) => (
                                  <span key={i} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 4, background: "#ef444422", color: "var(--danger)", border: "1px solid #ef444455" }}>
                                    ⚑ {r}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {tab === "breakdown" && (
                        <div className={styles.tabContent}>
                          {sc.question_breakdown?.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {sc.question_breakdown.map((q, i) => (
                                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", fontSize: 13 }}>
                                  <span style={{
                                    flexShrink: 0,
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: QUALITY_COLOR[q.answer_quality] || "var(--text-muted)",
                                    color: "#fff",
                                  }}>{q.answer_quality}</span>
                                  <div>
                                    <div style={{ fontWeight: 500, marginBottom: 3 }}>{q.question_summary}</div>
                                    <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{q.note}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No question breakdown data for this session.</p>
                          )}
                        </div>
                      )}

                      {tab === "transcript" && (
                        <div className={styles.tabContent}>
                          <TranscriptReplay history={detail?.history || []} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
