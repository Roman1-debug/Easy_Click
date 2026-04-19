"use client";

import styles from "./page.module.css";
import { useState } from "react";

const TOPICS = [
  { id: 'tech', label: 'Technical Rounds', count: 142 },
  { id: 'behavioral', label: 'Behavioral / HR', count: 85 },
  { id: 'system', label: 'System Design', count: 48 },
  { id: 'culture', label: 'Culture Fit', count: 34 },
];

export default function PreparePage() {
  const [activeTopic, setActiveTopic] = useState('tech');

  return (
    <div className="page-body">
      <header className="page-header">
        <h1 className="page-title">Interview Readiness</h1>
        <p className="page-subtitle">Master your next interview with AI-powered mock rounds and curated field guides.</p>
      </header>

      <div className={styles.container}>
        {/* Top Actions */}
        <section className={styles.heroGrid}>
          <div className={`${styles.heroCard} ${styles.aiCard}`}>
            <div className={styles.heroContent}>
              <span className={styles.badge}>Live</span>
              <h2>AI Mock Interview</h2>
              <p>Practice with a realistic AI interviewer tailored to your target role and company.</p>
              <button className="btn btn--dark">Start Session</button>
            </div>
            <div className={styles.heroIconSVG}>
               <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 12L2.7 7.3"/><path d="M12 12V22"/><path d="M12 12l9.3 4.7"/></svg>
            </div>
          </div>
          
          <div className={`${styles.heroCard} ${styles.guideCard}`}>
            <div className={styles.heroContent}>
              <span className={styles.badge} style={{ background: 'var(--text-muted)' }}>Guides</span>
              <h2>Company Field Guides</h2>
              <p>Insider tips, recent questions, and culture deep-dives for top companies.</p>
              <button className="btn btn--primary">Browse Guides</button>
            </div>
            <div className={styles.heroIconSVG} style={{ opacity: 0.1 }}>
               <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className={styles.topicsSection}>
          <h3 className={styles.sectionTitle}>Preparation Tracks</h3>
          <div className={styles.topicGrid}>
            {TOPICS.map(topic => (
              <button 
                key={topic.id}
                className={`${styles.topicCard} ${activeTopic === topic.id ? styles.topicCardActive : ""}`}
                onClick={() => setActiveTopic(topic.id)}
              >
                <div className={styles.topicInfo}>
                  <span className={styles.topicLabel}>{topic.label}</span>
                  <span className={styles.topicCount}>{topic.count} questions</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Question Feed (Mocked) */}
        <section className={styles.questionsSection}>
          <div className="card">
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>Trending for {TOPICS.find(t => t.id === activeTopic)?.label}</h3>
              <button className="btn btn--ghost btn--sm">View All</button>
            </div>
            
            <div className={styles.questionList}>
               {[1, 2, 3].map(i => (
                 <div key={i} className={styles.questionItem}>
                   <div className={styles.qHeader}>
                     <span className="badge badge--purple">Common Question</span>
                     <span className={styles.qCompany}>Recently asked at BigTech</span>
                   </div>
                   <p className={styles.qText}>How do you handle conflict with a team member during a high-stakes project?</p>
                   <div className={styles.qFooter}>
                     <button className="btn btn--secondary btn--sm">Practice Answer</button>
                     <button className="btn btn--ghost btn--sm">View Guide</button>
                   </div>
                 </div>
               ))}
            </div>
          </div>
        </section>

        {/* Resources Sidebar (Layout-wise bottom or side) */}
        <section className="grid-3">
          <div className="card">
            <h4 className={styles.resTitle}>Resume Checklist</h4>
            <p className={styles.resText}>Ensure your resume is ATS-friendly before the big day.</p>
            <a href="/resume" className={styles.resLink}>Audit Now →</a>
          </div>
          <div className="card">
            <h4 className={styles.resTitle}>Salary Negotiation</h4>
            <p className={styles.resText}>Don't leave money on the table. Know your worth.</p>
            <a href="/search/salary" className={styles.resLink}>Check Rates →</a>
          </div>
          <div className="card">
            <h4 className={styles.resTitle}>Cheat Sheets</h4>
            <p className={styles.resText}>Quick-reference sheets for algorithms and frameworks.</p>
            <span className={styles.resLink}>Coming Soon</span>
          </div>
        </section>
      </div>
    </div>
  );
}
