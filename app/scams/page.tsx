"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import styles from "./page.module.css";
import Image from "next/image";

export default function ScamsPage() {
  const [feed, setFeed] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<"feed" | "search">("feed");
  const [searched, setSearched] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function fetchFeed(showSpinner = true) {
    if (showSpinner) setRefreshing(true);
    const res = await api.getScams();
    if (res.success && res.data) setFeed(res.data as any[]);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { fetchFeed(false); }, []);


  async function runSearch(q: string) {
    if (!q.trim()) {
      setActiveView("feed");
      setResults([]);
      setSearched("");
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setSearching(true);
    setActiveView("search");
    setSearched(q.trim());
    const res = await api.searchScams(q.trim());
    if (res.success && res.data) setResults(res.data as any[]);
    else setResults([]);
    setSearching(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") runSearch(query);
  }

  function handleClear() {
    setQuery("");
    setActiveView("feed");
    setResults([]);
    setSearched("");
  }

  const displayed = activeView === "search" ? results : feed;

  return (
    <div className="page-body">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Scam Alerts</h1>
          <p className="page-subtitle">
            Recent community reports about job scams — or search any company to verify.
          </p>
        </div>
        <button
          id="scam-refresh-btn"
          className="btn btn--ghost btn--sm"
          onClick={() => fetchFeed(true)}
          disabled={refreshing || loading}
          style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {refreshing
            ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Refreshing…</>
            : <>↺ Refresh Feed</>}
        </button>
      </div>

      <div className={styles.searchbar}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.searchIcon}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          id="scam-search-input"
          className={styles.searchInput}
          type="text"
          placeholder='Search company or topic e.g. "Wipro", "data entry", "TCS"...'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button className={styles.clearBtn} onClick={handleClear} aria-label="Clear">×</button>
        )}
        <button
          id="scam-search-btn"
          className={styles.searchBtn}
          onClick={() => runSearch(query)}
          disabled={searching || !query.trim()}
        >
          {searching
            ? <span className="spinner" style={{ width: 14, height: 14 }} />
            : "Search"}
        </button>
      </div>

      {activeView === "search" && searched && !searching && (
        <p className={styles.searchMeta}>
          {results.length > 0
            ? <>{results.length} result{results.length !== 1 ? "s" : ""} for &quot;{searched}&quot;</>
            : <>No scam reports found for &quot;{searched}&quot; — this may be a clean company.</>}
        </p>
      )}

      {(loading || (searching && displayed.length === 0)) ? (
        <div className="empty-state">
          <div className="spinner" style={{ width: 32, height: 32 }} />
          <p style={{ marginTop: 12, color: "var(--text-muted)" }}>
            {searching ? `Scanning Reddit, Google News & HackerNews for "${query}"...` : "Loading alerts..."}
          </p>
        </div>
      ) : displayed.length === 0 && !loading ? (
        <div className="empty-state">
          {activeView === "feed" ? "No recent scams reported in your sector. Stay safe!" : ""}
        </div>
      ) : (
        <div className={styles.grid}>
          {displayed.map((s, idx) => (
            <a key={idx} href={s.url} target="_blank" rel="noopener noreferrer" className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.logoWrapper}>
                  {s.logo && <Image src={s.logo} width={20} height={20} alt="Source" unoptimized />}
                </div>
                <span className={styles.sourceTag}>{s.source}</span>
                <span className={styles.dateTag}>
                  {s.created_utc ? new Date(s.created_utc * 1000).toLocaleDateString() : ""}
                </span>
              </div>
              <h3 className={styles.title}>{s.title}</h3>
              <p className={styles.snippet}>{s.snippet}</p>
              <div className={styles.viewMore}>Read full report on {s.source} →</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

