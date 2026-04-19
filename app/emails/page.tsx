"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import styles from "./page.module.css";

function EmailsContent() {
  const [composeOpen, setComposeOpen] = useState(false);
  const [isEnlarged, setIsEnlarged] = useState(false);
  const [toField, setToField] = useState("");
  const [ccField, setCcField] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subjectField, setSubjectField] = useState("");
  const [bodyField, setBodyField] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sentEmails, setSentEmails] = useState<any[]>([]);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "ai"; content: string }[]>([]);
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, strikethrough: false });
  const [searchQuery, setSearchQuery] = useState("");

  const editorRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const compose = searchParams.get("compose");
    if (compose === "true") {
      setComposeOpen(true);
      const to = searchParams.get("to");
      const subject = searchParams.get("subject");
      const body = searchParams.get("body");
      if (to) setToField(to);
      if (subject) setSubjectField(subject);
      if (body) {
        setBodyField(body);
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.innerHTML = body.replace(/\n/g, "<br/>");
          }
        }, 50);
      }
    }
    loadSentEmails();
  }, [searchParams]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isGenerating]);

  const updateFormatting = useCallback(() => {
    if (document.activeElement === editorRef.current || editorRef.current?.contains(document.activeElement)) {
      setActiveFormats({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikethrough: document.queryCommandState("strikeThrough"),
      });
    }
  }, []);

  useEffect(() => {
    const handler = () => updateFormatting();
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [updateFormatting]);

  async function loadSentEmails() {
    const res = await api.getSentEmails();
    if (res.success && res.data) {
      setSentEmails(res.data as any[]);
    }
  }

  // KEY FIX: onMouseDown + preventDefault keeps editor focus so execCommand works first try
  function execFormat(command: string) {
    editorRef.current?.focus();
    document.execCommand(command, false);
    updateFormatting();
  }

  function handleFormatMouseDown(e: React.MouseEvent, command: string) {
    e.preventDefault(); // prevent editor blur
    execFormat(command);
  }

  function execLink() {
    const url = prompt("Enter URL:");
    if (url) {
      editorRef.current?.focus();
      document.execCommand("createLink", false, url);
    }
  }

  async function handleAIGenerate() {
    setIsGenerating(true);
    try {
      const res = await api.generateEmail();
      if (res.success && res.data) {
        const d = res.data as any;
        setSubjectField(d.subject);
        setBodyField(d.body);
        if (editorRef.current) {
          editorRef.current.innerHTML = d.body.replace(/\n/g, "<br/>");
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleChatAi() {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    const currentDraft = editorRef.current?.innerHTML || "";
    setChatInput("");
    setChatHistory((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsGenerating(true);
    try {
      const res = await api.chatWithAi(userMsg, currentDraft);
      if (res.success && res.data) {
        setChatHistory((prev) => [...prev, { role: "ai", content: (res.data as any).reply }]);
      } else {
        alert("AI Error: " + res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  }

  function applyAiSuggestion(content: string) {
    if (editorRef.current) {
      editorRef.current.innerHTML = content.replace(/\n/g, "<br/>");
      setBodyField(content);
    }
  }

  async function handleSendEmail() {
    const body = editorRef.current?.innerHTML || bodyField;
    if (!toField) {
      alert("Please specify a recipient.");
      return;
    }
    setIsSending(true);
    try {
      let attachObj: { name: string; data: string } | undefined = undefined;
      if (attachment) {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(attachment);
        });
        attachObj = { name: attachment.name, data: base64Data };
      }
      const res = await api.sendDirectEmail(toField, subjectField, body, ccField, attachObj);
      if (res.success) {
        closeCompose();
        loadSentEmails();
      } else {
        alert("Error: " + (res.error || "Failed to send email"));
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  function closeCompose() {
    setComposeOpen(false);
    setToField("");
    setCcField("");
    setShowCc(false);
    setSubjectField("");
    setBodyField("");
    setAttachment(null);
    setCopilotOpen(false);
    setChatHistory([]);
    if (editorRef.current) editorRef.current.innerHTML = "";
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} email(s)?`)) return;
    const res = await api.deleteEmails(selectedIds);
    if (res.success) {
      setSelectedIds([]);
      loadSentEmails();
    } else {
      alert("Delete failed: " + res.error);
    }
  }

  function handleSelectAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) setSelectedIds(sentEmails.map((m) => m.id));
    else setSelectedIds([]);
  }

  function toggleSelectId(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleAttachmentClick() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.doc,.docx";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) setAttachment(file);
    };
    input.click();
  }

  const filteredEmails = sentEmails.filter(
    (e) =>
      !searchQuery ||
      e.to_addr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.body?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const allSelected = filteredEmails.length > 0 && selectedIds.length === filteredEmails.length;

  return (
    <div className={styles.pageContainer}>
      {/* Gmail-style top header */}
      <div className={styles.header}>
        <div className={styles.searchBar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search mail"
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.noticeBanner}>
        <strong>Note:</strong> This Email module is exclusively for composing and AI-generating cold emails. You cannot receive live emails here.
      </div>

      <div className={styles.mainContent}>
        <div className={styles.mailList}>
          {/* Mail toolbar row */}
          <div className={styles.mailToolbar}>
            <div className={styles.toolbarLeft}>
              <input
                type="checkbox"
                className={styles.selectAllCheck}
                checked={allSelected}
                onChange={handleSelectAll}
                title="Select All"
              />
              <button className={styles.toolbarIconBtn} onClick={loadSentEmails} title="Refresh">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
              {selectedIds.length > 0 && (
                <button className={styles.toolbarDeleteBtn} onClick={handleDeleteSelected}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                  Delete ({selectedIds.length})
                </button>
              )}
            </div>
            <div className={styles.toolbarRight}>
              <div className={`${styles.tab} ${styles.tabActive}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/>
                </svg>
                Sent
              </div>
            </div>
          </div>

          {/* Email rows */}
          <div className={styles.emails}>
            {filteredEmails.length === 0 ? (
              <div className={styles.emptyState}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dadce0" strokeWidth="1.5">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
                <p>{searchQuery ? "No emails match your search." : "Your sent emails will appear here."}</p>
              </div>
            ) : (
              filteredEmails.map((email) => (
                <div
                  key={email.id}
                  className={`${styles.emailRow} ${selectedIds.includes(email.id) ? styles.emailRowSelected : ""}`}
                  onClick={() => setSelectedEmail(email)}
                >
                  <div className={styles.rowLeft}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(email.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelectId(email.id)}
                    />
                    <div className={styles.avatar}>{email.to_addr?.[0]?.toUpperCase() ?? "?"}</div>
                    <span className={styles.emailTo}>{email.to_addr}</span>
                  </div>
                  <div className={styles.rowMid}>
                    <span className={styles.emailSubject}>{email.subject}</span>
                    <span className={styles.emailSnippet}> — {email.body?.replace(/<[^>]+>/g, "").substring(0, 60)}...</span>
                  </div>
                  <div className={styles.rowRight}>
                    {new Date(email.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Compose FAB */}
      <button className={styles.composeFab} onClick={() => setComposeOpen(true)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Compose
      </button>

      {/* Compose Box */}
      {composeOpen && (
        <div className={`${styles.composeBox} ${isEnlarged ? styles.composeEnlarged : ""}`}>
          {/* Compose header */}
          <div className={styles.composeHeader}>
            <span className={styles.composeTitle}>New Message</span>
            <div className={styles.composeHeaderActions}>
              <button
                className={styles.composeHeaderBtn}
                onClick={() => setIsEnlarged(!isEnlarged)}
                title={isEnlarged ? "Collapse" : "Expand"}
              >
                {isEnlarged ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3v5H3M16 3v5h5M16 21v-5h5M8 21v-5H3"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                  </svg>
                )}
              </button>
              <button className={styles.composeHeaderBtn} onClick={closeCompose} title="Close">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Recipient fields */}
          <div className={styles.composeFields}>
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>To</span>
              <input
                className={styles.fieldInput}
                type="text"
                placeholder=""
                value={toField}
                onChange={(e) => setToField(e.target.value)}
              />
              <button className={styles.fieldToggle} onClick={() => setShowCc(!showCc)}>
                {showCc ? "Hide Cc" : "Cc"}
              </button>
            </div>
            {showCc && (
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>Cc</span>
                <input
                  className={styles.fieldInput}
                  type="text"
                  placeholder=""
                  value={ccField}
                  onChange={(e) => setCcField(e.target.value)}
                />
              </div>
            )}
            <div className={styles.fieldRow}>
              <span className={styles.fieldLabel}>Subject</span>
              <input
                className={styles.fieldInput}
                type="text"
                placeholder=""
                value={subjectField}
                onChange={(e) => setSubjectField(e.target.value)}
              />
            </div>
          </div>

          {/* Editor */}
          <div
            ref={editorRef}
            className={styles.editorArea}
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              setBodyField(editorRef.current?.innerHTML || "");
              updateFormatting();
            }}
            onKeyUp={updateFormatting}
            onMouseUp={updateFormatting}
          />

          {/* AI Copilot panel */}
          {copilotOpen && (
            <div className={styles.copilotPanel}>
              <div className={styles.copilotHeader}>
                <span>✨ AI Copilot</span>
                <button onClick={() => setCopilotOpen(false)}>×</button>
              </div>
              <div className={styles.chatWindow}>
                {chatHistory.length === 0 ? (
                  <p className={styles.chatHint}>Ask AI to rewrite, fix tone, or add details.</p>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div key={i} className={msg.role === "user" ? styles.userMsg : styles.aiMsg}>
                      <span>{msg.content}</span>
                      {msg.role === "ai" && (
                        <button className={styles.useBtn} onClick={() => applyAiSuggestion(msg.content)}>
                          Use this draft
                        </button>
                      )}
                    </div>
                  ))
                )}
                {isGenerating && <div className={styles.aiMsg}><span className={styles.thinking}>● ● ●</span></div>}
                <div ref={chatEndRef} />
              </div>
              <div className={styles.chatInputRow}>
                <input
                  type="text"
                  placeholder="Ask AI..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleChatAi()}
                />
                <button onClick={handleChatAi} disabled={isGenerating}>→</button>
              </div>
            </div>
          )}

          {/* Format strip — KEY FIX: onMouseDown + preventDefault */}
          <div className={styles.formatStrip}>
            <div className={styles.formatGroup}>
              <button
                className={`${styles.fmtBtn} ${activeFormats.bold ? styles.fmtActive : ""}`}
                onMouseDown={(e) => handleFormatMouseDown(e, "bold")}
                title="Bold (Ctrl+B)"
              >
                <strong>B</strong>
              </button>
              <button
                className={`${styles.fmtBtn} ${activeFormats.italic ? styles.fmtActive : ""}`}
                onMouseDown={(e) => handleFormatMouseDown(e, "italic")}
                title="Italic (Ctrl+I)"
              >
                <em>I</em>
              </button>
              <button
                className={`${styles.fmtBtn} ${activeFormats.underline ? styles.fmtActive : ""}`}
                onMouseDown={(e) => handleFormatMouseDown(e, "underline")}
                title="Underline (Ctrl+U)"
              >
                <u>U</u>
              </button>
              <button
                className={`${styles.fmtBtn} ${activeFormats.strikethrough ? styles.fmtActive : ""}`}
                onMouseDown={(e) => handleFormatMouseDown(e, "strikeThrough")}
                title="Strikethrough"
              >
                <s>S</s>
              </button>
            </div>

            <div className={styles.formatDivider} />

            <div className={styles.formatGroup}>
              <button
                className={styles.fmtBtn}
                onMouseDown={(e) => { e.preventDefault(); editorRef.current?.focus(); document.execCommand("insertUnorderedList", false); }}
                title="Bullet list"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
                  <circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>
                </svg>
              </button>
              <button
                className={styles.fmtBtn}
                onMouseDown={(e) => { e.preventDefault(); execLink(); }}
                title="Insert link"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </button>
              <button
                className={styles.fmtBtn}
                onClick={handleAttachmentClick}
                title="Attach file"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              {attachment && (
                <span className={styles.attachBadge}>
                  📎 {attachment.name}
                  <button onMouseDown={(e) => { e.preventDefault(); setAttachment(null); }}>×</button>
                </span>
              )}
            </div>

            <div className={styles.formatSpacer} />

            <button
              className={styles.fmtBtn}
              onMouseDown={(e) => { e.preventDefault(); if (editorRef.current) editorRef.current.innerHTML = ""; setBodyField(""); }}
              title="Clear formatting"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              </svg>
            </button>
          </div>

          {/* Bottom toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarSendGroup}>
              <button className={styles.btnSend} onClick={handleSendEmail} disabled={isSending}>
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
            <div className={styles.toolbarAiGroup}>
              <button
                className={styles.btnAi}
                onClick={() => {
                  if (!copilotOpen) setCopilotOpen(true);
                  else handleAIGenerate();
                }}
                disabled={isGenerating}
              >
                {isGenerating ? "Thinking..." : copilotOpen ? "✨ Generate Draft" : "✨ AI Help"}
              </button>
            </div>
            <div className={styles.toolbarRight2}>
              <button className={styles.fmtBtn} onClick={closeCompose} title="Discard">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email detail modal */}
      {selectedEmail && (
        <div className={styles.emailModal} onClick={() => setSelectedEmail(null)}>
          <div className={styles.emailDetail} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailHeader}>
              <h2 className={styles.detailSubject}>{selectedEmail.subject}</h2>
              <button className={styles.detailClose} onClick={() => setSelectedEmail(null)}>×</button>
            </div>
            <div className={styles.detailMeta}>
              <div className={styles.avatarLarge}>{selectedEmail.to_addr?.[0]?.toUpperCase() ?? "?"}</div>
              <div className={styles.detailMetaText}>
                <p><strong>To: {selectedEmail.to_addr}</strong></p>
                {selectedEmail.cc_addr && <p>Cc: {selectedEmail.cc_addr}</p>}
                <p className={styles.detailDate}>{new Date(selectedEmail.sent_at).toLocaleString()}</p>
              </div>
            </div>
            <div className={styles.detailBody}>
              <div dangerouslySetInnerHTML={{ __html: selectedEmail.body }} />
            </div>
            <div className={styles.detailActions}>
              <button
                className={styles.btnSend}
                onClick={() => {
                  setToField(selectedEmail.to_addr);
                  setSubjectField(`Re: ${selectedEmail.subject}`);
                  setComposeOpen(true);
                  setSelectedEmail(null);
                }}
              >
                Reply
              </button>
              <button className={styles.btnSecondary} onClick={() => setSelectedEmail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmailsPage() {
  return (
    <Suspense>
      <EmailsContent />
    </Suspense>
  );
}

