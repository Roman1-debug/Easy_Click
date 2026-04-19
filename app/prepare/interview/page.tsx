"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import styles from "./page.module.css";

type InterviewMessage = {
  role: "assistant" | "user";
  content: string;
};

function parseAssistantTurn(content: string) {
  const raw = String(content || "").trim();
  if (!raw) return { reaction: null as string | null, question: "" };

  const parts = raw.split("[NEXT_QUESTION]");
  if (parts.length === 1) {
    return { reaction: null as string | null, question: raw.replace(/\[NEXT_QUESTION\]/g, "").trim() };
  }

  const reaction = parts[0].trim() || null;
  const question = parts.slice(1).join(" ").replace(/\[NEXT_QUESTION\]/g, "").trim();

  if (!question) {
    return {
      reaction: null,
      question: (reaction || raw).replace(/\[NEXT_QUESTION\]/g, "").trim(),
    };
  }

  return { reaction, question };
}

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
  question_breakdown: { question_summary: string; answer_quality: string; note: string }[];
};

const HIRE_SIGNAL_COLOR: Record<string, string> = {
  "Strong Hire": "var(--success)",
  "Hire": "#4ade80",
  "No Hire": "var(--warning)",
  "Strong No Hire": "var(--danger)",
};

export default function MockInterviewPage() {
  const [step, setStep] = useState<"setup" | "interview" | "result">("setup");
  const [role, setRole] = useState("");
  const [focus, setFocus] = useState("Mixed");
  const [experience, setExperience] = useState("0-2");
  const [jd, setJd] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const [history, setHistory] = useState<InterviewMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [userAnswer, setUserAnswer] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSessionId, setSavedSessionId] = useState<number | null>(null);

  const [scorecard, setScorecard] = useState<Scorecard | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speechQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);

  // Lock in a consistent male voice once voices are loaded
  const initVoice = useCallback(() => {
    if (voiceRef.current) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;

    const preferred = [
      "Google UK English Male",
      "Microsoft Ryan Online (Natural) - English (United Kingdom)",
      "Microsoft Guy Online (Natural) - English (United States)",
      "Google US English",
      "Alex",
    ];

    for (const name of preferred) {
      const match = voices.find(v => v.name === name);
      if (match) { voiceRef.current = match; return; }
    }

    // Fallback: pick first English male-sounding voice, else first English
    const enMale = voices.find(v => v.lang.startsWith("en") && v.name.toLowerCase().includes("male"));
    const enAny = voices.find(v => v.lang.startsWith("en"));
    voiceRef.current = enMale || enAny || voices[0];
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = initVoice;
    initVoice();
  }, [initVoice]);

  const processNextInQueue = useCallback(() => {
    if (isSpeakingRef.current || speechQueueRef.current.length === 0) return;
    const text = speechQueueRef.current.shift()!;
    if (!text.trim()) { processNextInQueue(); return; }

    isSpeakingRef.current = true;
    setIsSpeaking(true);

    const utterance = new SpeechSynthesisUtterance(text.trim());
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.rate = 0.92;
    utterance.pitch = 0.95;
    utterance.volume = 1;

    utterance.onend = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      processNextInQueue();
    };
    utterance.onerror = () => {
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      processNextInQueue();
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback((raw: string) => {
    if (!window.speechSynthesis || isMuted) return;
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    speechQueueRef.current = [];

    let text = raw.replace(/[*_#~`]/g, "").replace(/\s{2,}/g, " ");
    const parsed = parseAssistantTurn(text);

    // The AI uses [NEXT_QUESTION] as separator — speak only the question part
    if (parsed.reaction || parsed.question) {
      if (parsed.reaction) speechQueueRef.current.push(parsed.reaction);
      if (parsed.question) speechQueueRef.current.push(parsed.question);
    } else {
      speechQueueRef.current.push(text);
    }

    processNextInQueue();
  }, [isMuted, processNextInQueue]);

  useEffect(() => {
    const lastMsg = history[history.length - 1];
    if (step === "interview" && lastMsg?.role === "assistant" && !isAiThinking) {
      speak(lastMsg.content);
    }
  }, [history, isAiThinking, step, speak]);

  // Camera + audio meter
  useEffect(() => {
    if (step !== "interview" || !videoRef.current) return;
    let processor: ScriptProcessorNode | null = null;
    let audioCtx: AudioContext | null = null;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        if (videoRef.current) videoRef.current.srcObject = stream;
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        processor = audioCtx.createScriptProcessor(512, 1, 1);
        source.connect(processor);
        processor.connect(audioCtx.destination);
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
          setVolume(Math.min(100, Math.sqrt(sum / input.length) * 600));
        };
      })
      .catch(() => {});

    return () => {
      processor?.disconnect();
      audioCtx?.close();
    };
  }, [step]);

  // Web Speech API — Speech to Text
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Use Chrome.");
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    let finalTranscript = userAnswer;

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? " " : "") + t.trim();
        } else {
          interim = t;
        }
      }
      setUserAnswer(finalTranscript + (interim ? " " + interim : ""));
    };

    recognition.onerror = (e: any) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(`Mic error: ${e.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    // Pause AI speech while user is speaking
    window.speechSynthesis.pause();
    recognition.start();
    setIsListening(true);
  }, [userAnswer]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    window.speechSynthesis.resume();
  }, []);

  const startInterview = async () => {
    if (!role.trim()) return;
    setIsStarting(true);
    setError(null);
    try {
      const res = await api.startInterview({ role, experience, focus, history: [], jd });
      if (res.success && res.data) {
        const parsed = parseAssistantTurn((res.data as any).question || "");
        setHistory([{ role: "assistant", content: `${parsed.reaction ? `${parsed.reaction} [NEXT_QUESTION] ` : ""}${parsed.question}`.trim() }]);
        setStep("interview");
      } else {
        setError((res as any).error || "Failed to start. Check your API key in Settings.");
      }
    } catch {
      setError("Network error. Ensure the backend is running.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleAnswer = async () => {
    const trimmed = userAnswer.trim();
    if (!trimmed || isAiThinking) return;

    stopListening();
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    speechQueueRef.current = [];

    const newHistory: InterviewMessage[] = [...history, { role: "user", content: trimmed }];
    setHistory(newHistory);
    setUserAnswer("");
    setIsAiThinking(true);
    setError(null);

    try {
      const res = await api.submitAnswer({ role, experience, focus, jd, history: newHistory, answer: trimmed });
      if (res.success && res.data) {
        const parsed = parseAssistantTurn((res.data as any).question || "");
        setHistory(prev => [...prev, { role: "assistant", content: `${parsed.reaction ? `${parsed.reaction} [NEXT_QUESTION] ` : ""}${parsed.question}`.trim() }]);
      } else {
        setError((res as any).error || "Failed to get next question.");
      }
    } catch {
      setError("Network error on answer submission.");
    } finally {
      setIsAiThinking(false);
    }
  };

  const endInterview = async () => {
    stopListening();
    window.speechSynthesis.cancel();
    setIsAiThinking(true);
    setError(null);
    try {
      const res = await api.evaluateInterview(history);
      if (res.success && res.data) {
        setScorecard(res.data as Scorecard);
        setStep("result");
      } else {
        setError((res as any).error || "Evaluation failed.");
      }
    } catch {
      setError("Analysis failed. Please try again.");
    } finally {
      setIsAiThinking(false);
    }
  };

  const saveSession = async () => {
    if (!scorecard) return;
    setIsSaving(true);
    try {
      const res = await fetch("http://localhost:8000/prepare/mock/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, focus, experience, history, scorecard }),
      });
      const data = await res.json();
      if (data.success) setSavedSessionId(data.data?.id || 1);
    } catch {
      setError("Failed to save session.");
    } finally {
      setIsSaving(false);
    }
  };

  const displayQuestion = (content: string) => {
    return parseAssistantTurn(content).question;
  };

  const displayReaction = (content: string) => {
    return parseAssistantTurn(content).reaction;
  };

  if (step === "setup") {
    return (
      <div className="page-body">
        <div className={styles.setupCard}>
          <div className="card">
            <h1 className="page-title">Interview Simulator</h1>
            <p className="page-subtitle" style={{ marginBottom: 24 }}>
              Configure your session. Marcus, your AI interviewer, will adapt questions to your level in real time.
            </p>

            <div className="form-group" style={{ textAlign: "left" }}>
              <label className="label">Target Role</label>
              <input
                className="input"
                placeholder="e.g. Senior Backend Engineer"
                value={role}
                onChange={e => setRole(e.target.value)}
                onKeyDown={e => e.key === "Enter" && startInterview()}
              />
            </div>

            <div className="grid-2" style={{ textAlign: "left", marginBottom: 16 }}>
              <div className="form-group">
                <label className="label">Focus Area</label>
                <select className="input" value={focus} onChange={e => setFocus(e.target.value)}>
                  <option value="Mixed">Mixed (Standard)</option>
                  <option value="Technical">Pure Technical</option>
                  <option value="Behavioral">Behavioral / HR</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Experience Level</label>
                <select className="input" value={experience} onChange={e => setExperience(e.target.value)}>
                  <option value="0-1">Fresher (0–1 yr)</option>
                  <option value="1-3">Junior (1–3 yrs)</option>
                  <option value="3-7">Mid-Senior (3–7 yrs)</option>
                  <option value="7+">Senior / Lead (7+ yrs)</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ textAlign: "left", marginBottom: 24 }}>
              <label className="label">Job Description <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional — makes questions sharper)</span></label>
              <textarea
                className="input"
                placeholder="Paste the JD here..."
                rows={3}
                value={jd}
                onChange={e => setJd(e.target.value)}
                style={{ resize: "vertical", fontSize: 13 }}
              />
            </div>

            <button
              className="btn btn--primary btn--lg"
              style={{ width: "100%" }}
              onClick={startInterview}
              disabled={!role.trim() || isStarting}
            >
              {isStarting ? "Connecting to Marcus..." : "Begin Interview"}
            </button>
            {error && <p style={{ color: "var(--danger)", marginTop: 16, fontSize: 13 }}>{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (step === "interview") {
    const lastAssistant = [...history].reverse().find(m => m.role === "assistant");
    const reaction = lastAssistant ? displayReaction(lastAssistant.content) : null;
    const currentQuestion = lastAssistant ? displayQuestion(lastAssistant.content) : null;

    return (
      <div className="page-body">
        <div className={styles.container}>
          <div className={styles.interviewLayout}>
            <div className={styles.mainStage}>
              <div className={styles.videoGrid}>
                <div className={`${styles.videoCard} ${isSpeaking ? styles.interviewerActive : ""}`}>
                  <div className={styles.avatarContainer}>
                    <div className={`${styles.avatarCircle} ${isSpeaking ? styles.pulse : ""}`}>
                      {isSpeaking ? "●" : "M"}
                    </div>
                    <span>Marcus · Principal Engineer</span>
                  </div>
                  <div className={styles.videoLabel}>{isSpeaking ? "Speaking..." : isAiThinking ? "Thinking..." : "Listening"}</div>
                </div>
                <div className={`${styles.videoCard} ${styles.userVideo}`}>
                  <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <div className={styles.videoLabel}>You · Candidate</div>
                </div>
              </div>

              <div className={styles.transcriptArea}>
                {reaction && !isAiThinking && (
                  <div className={styles.reactionText}>{reaction}</div>
                )}
                <div className={styles.questionText}>
                  {isAiThinking
                    ? <span className={styles.aiResponse}>Marcus is thinking<span className={styles.ellipsis}>...</span></span>
                    : currentQuestion
                  }
                </div>
              </div>
            </div>

            <div className={styles.sidebar}>
              <div className={`card ${styles.statusCard}`}>
                <div className={styles.meterLabel}>
                  <span>Voice Activity</span>
                  <span>{isListening ? "🔴 Live" : "—"}</span>
                </div>
                <div className={styles.meterBar}>
                  <div className={styles.meterFill} style={{ width: `${volume}%`, transition: "width 0.08s ease" }} />
                </div>

                <div className={styles.meterLabel} style={{ marginTop: 16 }}>
                  <span>Questions</span>
                  <span>{history.filter(m => m.role === "assistant").length}</span>
                </div>
                <div className={styles.meterBar}>
                  <div className={styles.meterFill} style={{ width: `${Math.min(100, history.filter(m => m.role === "assistant").length * 10)}%` }} />
                </div>
              </div>

              <div className="card">
                <h4 style={{ fontSize: 13, marginBottom: 12 }}>Your Answer</h4>

                <div className="form-group">
                  <textarea
                    className="input"
                    placeholder={isListening ? "Listening — speak now..." : "Type or use mic to answer..."}
                    style={{ minHeight: 110, fontSize: 13, borderColor: isListening ? "var(--accent)" : undefined }}
                    value={userAnswer}
                    onChange={e => setUserAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAnswer(); } }}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button
                    className={`btn btn--sm ${isListening ? "btn--danger" : "btn--secondary"}`}
                    style={{ flex: 1 }}
                    onClick={isListening ? stopListening : startListening}
                    disabled={isAiThinking}
                    title={isListening ? "Stop recording" : "Answer by voice"}
                  >
                    {isListening ? "⏹ Stop Mic" : "🎙 Use Mic"}
                  </button>
                  <button
                    className="btn btn--primary btn--sm"
                    style={{ flex: 2 }}
                    onClick={handleAnswer}
                    disabled={isAiThinking || !userAnswer.trim()}
                  >
                    Submit →
                  </button>
                </div>

                <button
                  className={`btn btn--sm ${isMuted ? "btn--secondary" : "btn--secondary"}`}
                  style={{ width: "100%", marginBottom: 8 }}
                  onClick={() => {
                    setIsMuted(m => {
                      if (!m) window.speechSynthesis.cancel();
                      return !m;
                    });
                  }}
                >
                  {isMuted ? "🔈 Unmute Marcus" : "🔇 Mute Marcus"}
                </button>

                {error && <p style={{ color: "var(--danger)", fontSize: 11, marginTop: 4 }}>{error}</p>}

                <div className="divider" />

                <button
                  className="btn btn--danger btn--sm"
                  style={{ width: "100%" }}
                  onClick={endInterview}
                  disabled={isAiThinking || history.filter(m => m.role === "user").length < 2}
                  title={history.filter(m => m.role === "user").length < 2 ? "Answer at least 2 questions first" : ""}
                >
                  {isAiThinking ? "Generating Report..." : "Complete & Analyze"}
                </button>
              </div>

              <div className="card" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                <strong style={{ display: "block", marginBottom: 6, color: "var(--text-secondary)" }}>Tips</strong>
                Answer with specific examples. Mention exact tools and numbers. Avoid "we" — say "I".
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Result step
  if (!scorecard) return null;

  const hireColor = HIRE_SIGNAL_COLOR[scorecard.hire_signal] || "var(--text-primary)";

  return (
    <div className="page-body">
      <div className={styles.scorecard}>
        <header className="page-header" style={{ textAlign: "center" }}>
          <h1 className="page-title">Performance Scorecard</h1>
          <p className="page-subtitle">Role: <strong>{role}</strong> · Focus: {focus} · Experience: {experience}</p>
        </header>

        <div className="card" style={{ marginBottom: 20, textAlign: "center", padding: "20px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>Hire Signal</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: hireColor }}>{scorecard.hire_signal}</div>
        </div>

        <div className="card">
          <div className={styles.scoreGrid} style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div style={{ textAlign: "center" }}>
              <div className={styles.scoreCircle}>{scorecard.technical_score ?? 0}/10</div>
              <span className="label">Technical</span>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className={styles.scoreCircle}>{scorecard.communication_score ?? 0}/10</div>
              <span className="label">Communication</span>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className={styles.scoreCircle} style={{ borderColor: "var(--text-primary)" }}>
                {scorecard.confidence_score ?? 0}/10
              </div>
              <span className="label">Confidence</span>
            </div>
          </div>

          <div className="divider" />

          <div className="grid-2">
            <div>
              <h4 style={{ marginBottom: 12 }}>Strengths</h4>
              <ul className={styles.tagList} style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {scorecard.strengths?.map((s, i) => (
                  <li key={i} className={`badge badge--success ${styles.feedbackItem}`}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 style={{ marginBottom: 12 }}>Weaknesses</h4>
              <ul className={styles.tagList} style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {scorecard.weaknesses?.map((w, i) => (
                  <li key={i} className={`badge badge--warning ${styles.feedbackItem}`}>{w}</li>
                ))}
              </ul>
            </div>
          </div>

          {scorecard.red_flags?.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h4 style={{ marginBottom: 12 }}>Red Flags</h4>
              <div className={styles.tagList}>
                {scorecard.red_flags.map((r, i) => (
                  <span key={i} className={styles.redFlag}>⚑ {r}</span>
                ))}
              </div>
            </div>
          )}

          {scorecard.coaching_notes?.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h4 style={{ marginBottom: 12 }}>Coaching Notes</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {scorecard.coaching_notes.map((note, i) => (
                  <div key={i} style={{ fontSize: 13, padding: "10px 14px", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)", borderLeft: "3px solid var(--accent)" }}>
                    {note}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 24, padding: 16, background: "var(--bg-elevated)", borderRadius: "var(--radius-md)" }}>
            <h4 style={{ marginBottom: 8 }}>Expert Feedback</h4>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7 }}>{scorecard.overall_feedback}</p>
          </div>

          {scorecard.question_breakdown?.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h4 style={{ marginBottom: 12 }}>Question Breakdown</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {scorecard.question_breakdown.map((q, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 13, padding: "10px 14px", background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)" }}>
                    <span style={{
                      flexShrink: 0,
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: q.answer_quality === "Strong" ? "var(--success)" : q.answer_quality === "Weak" ? "var(--danger)" : "var(--warning)",
                      color: "#fff"
                    }}>{q.answer_quality}</span>
                    <div>
                      <div style={{ fontWeight: 500, marginBottom: 2 }}>{q.question_summary}</div>
                      <div style={{ color: "var(--text-muted)" }}>{q.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="divider" />

          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn--secondary" onClick={() => { setStep("setup"); setScorecard(null); setHistory([]); setSavedSessionId(null); }}>
              New Interview
            </button>
            <button
              className="btn btn--primary"
              onClick={saveSession}
              disabled={isSaving || !!savedSessionId}
            >
              {savedSessionId ? "✓ Session Saved" : isSaving ? "Saving..." : "Save Session"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
