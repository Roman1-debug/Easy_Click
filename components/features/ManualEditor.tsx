"use client";

import { useState, useEffect } from "react";
import yaml from "js-yaml";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";
import styles from "./ManualEditor.module.css";

interface ManualEditorProps {
  initialData: any;
  prepopulatedYaml?: string;
  fromTemplate?: boolean;
  onTemplateSelected?: (theme: string) => void;
}

export default function ManualEditor({ initialData, prepopulatedYaml, fromTemplate, onTemplateSelected }: ManualEditorProps) {
  const [yamlText, setYamlText] = useState("");
  const [template, setTemplate] = useState("classic");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{ role: "ai" | "user"; content: string }[]>([
    { role: "ai", content: "Hi! I can help you rewrite sections or add new details to your resume. What would you like to improve?" }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [attachedFileBase64, setAttachedFileBase64] = useState<string | null>(null);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  
  // Track previous prop to avoid infinite loops
  const [lastPrepopulated, setLastPrepopulated] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (prepopulatedYaml && prepopulatedYaml !== lastPrepopulated) {
      setYamlText(prepopulatedYaml);
      setLastPrepopulated(prepopulatedYaml);
      
      // Try to extract theme from YAML if provided
      try {
        const parsed: any = yaml.load(prepopulatedYaml);
        if (parsed?.design?.theme) {
          setTemplate(parsed.design.theme);
        }
      } catch (e) {}
    }
  }, [prepopulatedYaml, lastPrepopulated]);

  useEffect(() => {
    if (initialData && !yamlText && !prepopulatedYaml) {
      try {
        setYamlText(yaml.dump(initialData));
      } catch (e) {
        setYamlText(JSON.stringify(initialData, null, 2));
      }
    }
  }, [initialData]);

  async function handleCompile() {
    if (!yamlText.trim()) {
      alert("Editor is empty. Paste your YAML first.");
      return;
    }
    setCompiling(true);
    try {
      // Send raw YAML string — RenderCV engine handles everything
      const res = await api.generateManualPdf(yamlText, template);
      if (res.success && res.data) {
        const versionId = (res.data as any).version_id;
        setPdfUrl(`http://localhost:8000/resume/download/${versionId}?t=${Date.now()}`);
      } else {
        alert("Compile error: " + (res.error || "Unknown error"));
      }
    } catch (e) {
      alert("Error: " + (e as Error).message);
    }
    setCompiling(false);
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      const base64Data = result.split(',')[1];
      setAttachedFileBase64(base64Data);
      setAttachedFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  async function handleChat() {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setMessages(prev => [...prev, { role: "user", content: userMsg }, { role: "ai", content: "" }]);
    setChatInput("");
    setChatLoading(true);

    const payload: any = { message: userMsg, current_yaml: yamlText };
    if (attachedFileBase64 && attachedFileName) {
      payload.attachment = { filename: attachedFileName, data: attachedFileBase64 };
      setAttachedFileBase64(null);
      setAttachedFileName(null);
    }

    try {
      const res = await fetch("http://localhost:8000/resume/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      if (reader) {
        setChatLoading(false);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Process line by line from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ""; // keep the last incomplete line in the buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.substring(6));
                if (data.error) {
                  // Immutable update — avoids React StrictMode double-invoke duplication
                  setMessages(prev => [
                    ...prev.slice(0, -1),
                    { ...prev[prev.length - 1], content: prev[prev.length - 1].content + `\nError: ${data.error}` }
                  ]);
                }
                if (data.content) {
                  setMessages(prev => [
                    ...prev.slice(0, -1),
                    { ...prev[prev.length - 1], content: prev[prev.length - 1].content + data.content }
                  ]);
                }
              } catch(e) {}
            }
          }
        }
      }
    } catch (e) {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { ...prev[prev.length - 1], content: prev[prev.length - 1].content + "\nError: " + (e as Error).message }
      ]);
    }
    setChatLoading(false);
  }



  return (
    <div className={styles.container}>
      {/* Left: Editor */}
      <div className={styles.editorPane}>
        <div className={styles.paneHeader}>
          <span>YAML Editor (.cv.yaml)</span>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {fromTemplate ? (
              <span style={{
                background: "#1a1a2e",
                border: "1px solid var(--primary-color)",
                color: "var(--primary-color)",
                borderRadius: "6px",
                fontSize: "11px",
                padding: "3px 8px",
                fontWeight: 600,
                letterSpacing: "0.5px"
              }}>
                🎨 {template} (from template)
              </span>
            ) : (
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                style={{ background: "#333", color: "#fff", border: "none", fontSize: "11px", padding: "2px 5px" }}
              >
                <option value="moderncv">ModernCV</option>
                <option value="engineeringresumes">Engineering</option>
                <option value="sb2nov">sb2nov</option>
                <option value="classic">Classic</option>
              </select>
            )}
            <button className="btn btn--primary btn--sm" onClick={handleCompile} disabled={compiling}>
              {compiling ? "..." : "Compile"}
            </button>
            {pdfUrl && (
              <a 
                href={pdfUrl.replace("/download/", "/download-forced/")} 
                className="btn btn--secondary btn--sm"
                title="Download PDF"
              >
                Download
              </a>
            )}
          </div>
        </div>
        <textarea
          className={styles.yamlEditor}
          value={yamlText}
          onChange={(e) => setYamlText(e.target.value)}
          spellCheck={false}
        />
      </div>

      {/* Right: Preview */}
      <div className={styles.previewPane}>
        {!pdfUrl ? (
          <div className={styles.previewPlaceholder}>
            <div className="spinner" style={{ width: 40, height: 40 }} />
            <p>PDF Preview will appear here after compilation</p>
            <button className="btn btn--secondary" onClick={handleCompile}>Initial Compile</button>
          </div>
        ) : (
          <iframe src={pdfUrl} className={styles.pdfViewer} title="Resume Preview" />
        )}

        {/* AI Chat Button */}
        <div className={styles.chatToggle} onClick={() => setChatOpen(!chatOpen)}>
          {chatOpen ? "✕" : "💬"}
        </div>

        {/* AI Chat Panel */}
        {chatOpen && (
          <div className={styles.chatPanel}>
            <div className={styles.chatHeader}>
              <span>AI Assistant</span>
              <button className="btn btn--ghost btn--sm" onClick={() => setChatOpen(false)}>×</button>
            </div>
            <div className={styles.chatBody}>
              {messages.map((m, i) => (
                <div key={i} className={`${styles.chatMsg} ${m.role === "ai" ? styles.msgAi : styles.msgUser}`}>
                  <ReactMarkdown
                    components={{
                      code(props) {
                        const {children, className, ...rest} = props;
                        const match = /language-(\w+)/.exec(className || '');
                        const isBlock = match || String(children).includes('\n');
                        if (isBlock) {
                          return (
                            <div style={{ background: '#060c1a', borderRadius: '8px', padding: '10px', marginTop: '10px', border: '1px solid rgba(99,102,241,0.3)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px' }}>
                                <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Code Proposal</span>
                                <button 
                                  className="btn btn--primary btn--sm" 
                                  style={{ fontSize: '10px', padding: '2px 10px', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', borderRadius: '6px' }}
                                onClick={() => {
                                  // Strip any stray backtick fences that ReactMarkdown may pass through during streaming
                                  const raw = String(children)
                                    .replace(/^```[a-z]*\n?/i, '')
                                    .replace(/\n?```$/i, '')
                                    .replace(/\n$/, '')
                                    .trim();
                                  setYamlText(raw);
                                }}
                                >
                                  ✦ Apply
                                </button>
                              </div>
                              <pre style={{ fontSize: '11px', color: '#a5f3fc', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', lineHeight: 1.6 }}>
                                <code>{children}</code>
                              </pre>
                            </div>
                          );
                        }
                        return <code style={{background: 'rgba(255,255,255,0.1)', padding: '2px 5px', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace'}}>{children}</code>;
                      }
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                </div>
              ))}
              {chatLoading && (
                <div className={styles.msgAi} style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '12px 14px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', display: 'inline-block', animation: 'pulse 1s infinite 0.2s' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', display: 'inline-block', animation: 'pulse 1s infinite 0.4s' }} />
                </div>
              )}
            </div>
            <div className={styles.chatInputArea}>
              {attachedFileName && (
                <div style={{ fontSize: '11px', color: '#5bba6f', background: 'rgba(91, 186, 111, 0.1)', padding: '4px 8px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>📎 {attachedFileName}</span>
                  <button onClick={() => {setAttachedFileName(null); setAttachedFileBase64(null)}} style={{background:'none',border:'none',color:'#fff',cursor:'pointer'}}>✕</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                <label
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', padding: '0 11px', borderRadius: '8px', color: '#94a3b8', height: '36px', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}
                  title="Attach reference resume (PDF/Text)"
                >
                  📎
                  <input type="file" style={{ display: 'none' }} accept=".pdf,.txt,.md" onChange={handleFileUpload} />
                </label>
                <input
                  type="text"
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#f1f5f9',
                    padding: '0 12px',
                    height: '36px',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                  placeholder="Ask for help..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleChat()}
                />
                <button
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '0 14px',
                    height: '36px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                    boxShadow: '0 2px 10px rgba(99,102,241,0.4)',
                    transition: 'opacity 0.2s'
                  }}
                  onClick={handleChat}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

