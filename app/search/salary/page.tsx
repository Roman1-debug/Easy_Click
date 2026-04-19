"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import styles from "./page.module.css";

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .replace(/\r/g, "\n")
      .split(/\n|,|;|•/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.values(value).map((item) => String(item).trim()).filter(Boolean);
  }
  return [];
}

function toNumberList(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
  }
  if (typeof value === "string") {
    return value
      .replace(/[\[\]]/g, "")
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
  }
  return [];
}

function firstSentence(value: string | undefined): string {
  if (!value) return "";
  const [sentence] = value.split(/(?<=[.!?])\s+/);
  return sentence || value;
}

function buildNegotiationGuide(params: {
  role: string;
  experience: string;
  location: string;
  median?: string;
  inHand?: string;
  topIndustries: string[];
  benefits: string[];
  insights: string[];
}) {
  const { role, experience, location, median, inHand, topIndustries, benefits, insights } = params;
  const skillsPremium = insights.find((item) => item.toLowerCase().startsWith("skills premium"));
  const marketVelocity = insights.find((item) => item.toLowerCase().startsWith("market velocity"));
  const industryPulse = insights.find((item) => item.toLowerCase().startsWith("industry pulse"));

  return {
    phase1: [
      `Build your strongest case around real ${role} work: portfolio pieces, measurable outcomes, client impact, and software proficiency that directly match the role.`,
      skillsPremium ? firstSentence(skillsPremium.split(": ").slice(1).join(": ")) : `Highlight the role-specific tools, domain knowledge, and execution strengths that make you immediately useful in ${location}.`,
      median ? `Use the ${median} median as your baseline and prepare one stretch number tied to your strongest evidence.` : `Prepare a clear baseline number backed by market data and your strongest work examples.`,
    ],
    phase2: [
      `Ask how compensation is split between fixed pay, performance incentives, and project-based upside for a ${role} in ${location}.`,
      inHand ? `Clarify the monthly in-hand expectation early and compare it against ${inHand}.` : `Clarify take-home pay early so the offer is compared on real cash, not only headline CTC.`,
      topIndustries.length > 0 ? `If the offer is tight, use demand in ${topIndustries.slice(0, 2).join(" and ")} as leverage for a stronger band.` : `If the offer is tight, negotiate on bonus, review cycle timing, and learning budget instead of only fixed pay.`,
    ],
    phase3: [
      benefits.length > 0 ? `Review the non-cash value carefully, especially ${benefits[0].toLowerCase()}.` : `Review non-cash value carefully, including insurance, flexibility, and any project-based bonus structure.`,
      industryPulse ? firstSentence(industryPulse.split(": ").slice(1).join(": ")) : `Check whether the employer's segment is in an active hiring cycle so you know how hard to push.`,
      marketVelocity ? firstSentence(marketVelocity.split(": ").slice(1).join(": ")) : `Document why now is the right time for your role in this market and use that as timing leverage.`,
    ],
  };
}

export default function SalarySearchPage() {
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("India");
  const [experience, setExperience] = useState("0-2");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const [showGuide, setShowGuide] = useState(false);
  const guideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showGuide && guideRef.current) {
      guideRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showGuide]);

  const growthProjection = toNumberList(results?.growth_projection);
  const insights = toStringList(results?.insights);
  const benefits = toStringList(results?.benefits);
  const topIndustries = toStringList(results?.top_industries);
  const guide = buildNegotiationGuide({
    role,
    experience,
    location,
    median: results?.median,
    inHand: results?.estimated_monthly_in_hand,
    topIndustries,
    benefits,
    insights,
  });

  const handleSearch = async () => {
    if (!role) return;
    setIsSearching(true);
    setError(null);
    setResults(null);
    setShowGuide(false);
    
    try {
      const res = await api.analyzeSalary(role, location, experience);
      if (res.success && res.data) {
        setResults(res.data);
      } else {
        setError(res.error || "Failed to analyze market value");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="page-body">
      <header className="page-header">
        <h1 className="page-title">Advanced Salary Search</h1>
        <p className="page-subtitle">Benchmark your market value with accurate data across industries and global tech hubs.</p>
      </header>

      <div className={styles.container}>
        {/* Search Bar */}
        <section className={styles.searchSection}>
          <div className="card">
            <div className={styles.searchGrid}>
              <div className="form-group">
                <label className="label">Target Role</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Senior SOC Analyst" 
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="label">Primary Location</label>
                <select 
                  className="input" 
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  <option value="India">India</option>
                  <option value="USA">USA (Silicon Valley)</option>
                  <option value="UK">United Kingdom</option>
                  <option value="Canada">Canada</option>
                  <option value="Europe">Europe (Germany/NL)</option>
                  <option value="Remote">Global / Remote</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Experience Level</label>
                <select 
                  className="input" 
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                >
                  <option value="0-2">Entry Level (0-2 yrs)</option>
                  <option value="2-5">Mid-Level (2-5 yrs)</option>
                  <option value="5-10">Senior (5-10 yrs)</option>
                  <option value="10+">Lead / Architect (10+ yrs)</option>
                </select>
              </div>
              <div className={styles.searchAction}>
                <button 
                  className="btn btn--primary btn--lg" 
                  style={{ width: '100%' }} 
                  onClick={handleSearch}
                  disabled={isSearching || !role}
                >
                  {isSearching ? "Analyzing Market Data..." : "Analyze Market Value"}
                </button>
              </div>
            </div>
            {error && <p style={{ color: "var(--danger)", marginTop: "12px", fontSize: "14px" }}>{error}</p>}
          </div>
        </section>

        {/* Results / Insights */}
        {results && !isSearching && (
          <>
            <div className={styles.resultsGrid}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                   <h3 className={styles.cardTitle} style={{ margin: 0 }}>Market Compensation Spectrum</h3>
                   <div className="badge badge--success" style={{ padding: '6px 12px' }}>
                      Est. In-Hand: <strong style={{ marginLeft: 4 }}>{results.estimated_monthly_in_hand} / mo</strong>
                   </div>
                </div>

                <div className={styles.salaryRange}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Market Average (CTC)</span>
                    <span className={styles.statValue}>{results.average_range}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Top 10 Percent (Elite)</span>
                    <span className={styles.statValue}>{results.top_10_percent}</span>
                  </div>
                </div>
                
                <div className={styles.visualizer}>
                   <div className={styles.visualBar}>
                      <div className={styles.barFill} style={{ width: '100%', background: 'linear-gradient(90deg, #e5e7eb 0%, #d1d5db 20%, #5bba6f 50%, #d1d5db 80%, #e5e7eb 100%)', opacity: 0.3 }}></div>
                      <div className={styles.marker} style={{ left: '50%', background: 'var(--accent)', height: '100%', width: '4px', top: 0, borderRadius: 2 }}>
                         <div style={{ position: 'absolute', top: -25, left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>Current Median</div>
                      </div>
                   </div>
                   <div className={styles.barLabels}>
                      <div style={{ textAlign: 'left' }}><span className={styles.statLabel}>Minimum</span><br/><strong>{results.min}</strong></div>
                      <div style={{ textAlign: 'center' }}><span className={styles.statLabel}>Median</span><br/><strong>{results.median}</strong></div>
                      <div style={{ textAlign: 'right' }}><span className={styles.statLabel}>Maximum</span><br/><strong>{results.max}</strong></div>
                   </div>
                </div>

                <div className={styles.chartMock} style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                   <p className={styles.statLabel} style={{ marginBottom: 12 }}>Salary Growth Projection (3 Years)</p>
                   <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '100px' }}>
                      {growthProjection.map((h: number, i: number) => (
                        <div key={i} style={{ flex: 1, height: `${h}%`, background: `var(--accent${i > 1 ? '-dark' : i > 0 ? '' : '-light'})`, borderRadius: '4px', transition: 'height 1s ease', position: 'relative' }}>
                           <span style={{ position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: 'var(--text-secondary)' }}>Year {i+1}</span>
                        </div>
                      ))}
                      <div style={{ flex: 1, height: '95%', background: 'rgba(0,0,0,0.05)', border: '1px dashed #ccc', borderRadius: '4px' }}></div>
                   </div>
                </div>
              </div>

              <div className="card">
                <h3 className={styles.cardTitle}>Strategic Market Insights</h3>
                <ul className={styles.insightList}>
                  {insights.map((insight: string, i: number) => {
                    const [label, content] = insight.split(': ');
                    return (
                      <li key={i}>
                        <strong>{label}:</strong> {content}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="grid-3" style={{ marginTop: '24px' }}>
               <div className="card">
                  <h4 className={styles.featureTitle}>Benefit Trends</h4>
                  <ul className={styles.smallList}>
                    {benefits.map((benefit: string, i: number) => (
                      <li key={i}>{benefit}</li>
                    ))}
                  </ul>
               </div>
               <div className="card">
                  <h4 className={styles.featureTitle}>Top Paying Industries</h4>
                  <ul className={styles.smallList}>
                    {topIndustries.map((industry: string, i: number) => (
                      <li key={i}>{industry}</li>
                    ))}
                  </ul>
               </div>
               <div className="card">
                  <h4 className={styles.featureTitle}>Negotiation Roadmap</h4>
                  <p className={styles.featureText} style={{ marginBottom: '12px' }}>Based on your {experience} years experience in {location}, aim for the 75th percentile.</p>
                  <button className="btn btn--secondary btn--sm" onClick={() => setShowGuide(!showGuide)}>
                    {showGuide ? "Hide Guide" : "View Full Guide"}
                  </button>
               </div>
            </div>

            {showGuide && (
              <div ref={guideRef} className="card" style={{ marginTop: 24, border: '1px solid var(--accent)', background: 'var(--accent-light)' }}>
                <h4 style={{ color: 'var(--accent-dark)', marginBottom: 12 }}>Professional Negotiation Guide (v1.2)</h4>
                <div className="grid-2" style={{ gap: 24 }}>
                  <div>
                    <h5 style={{ fontSize: 13, marginBottom: 8 }}>Phase 1: Research & Leverage</h5>
                    <ul className={styles.smallList} style={{ color: 'var(--text-secondary)' }}>
                      {guide.phase1.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 style={{ fontSize: 13, marginBottom: 8 }}>Phase 2: The Negotiation Call</h5>
                    <ul className={styles.smallList} style={{ color: 'var(--text-secondary)' }}>
                      {guide.phase2.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 style={{ fontSize: 13, marginBottom: 8 }}>Phase 3: Offer Review</h5>
                    <ul className={styles.smallList} style={{ color: 'var(--text-secondary)' }}>
                      {guide.phase3.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Features for empty state */}
        {!results && !isSearching && (
          <div className="grid-3">
             <div className="card--flat">
                <div className={styles.featureLabel}>Equity Analysis</div>
                <h4 className={styles.featureTitle}>Advanced Equity Mapping</h4>
                <p className={styles.featureText}>Calculate the true value of ESOPs, RSUs, and stock options in modern tech offers.</p>
             </div>
             <div className="card--flat">
                <div className={styles.featureLabel}>Company Research</div>
                <h4 className={styles.featureTitle}>MNC Global Benchmarks</h4>
                <p className={styles.featureText}>Compare pay scales across major tech hubs and top-tier MNCs globally.</p>
             </div>
             <div className={styles.cardHighlight}>
                <div className={styles.featureLabel}>Professional Help</div>
                <h4 className={styles.featureTitle}>Negotiation Advisor</h4>
                <p className={styles.featureText}>Get personalized tips on how to negotiate your new offer based on market trends.</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

