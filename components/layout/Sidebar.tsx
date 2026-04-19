"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { UserProfile } from "../../lib/types";
import styles from "./Sidebar.module.css";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    href: "/search",
    label: "Search",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
    ),
    subItems: [
      { href: "/search", label: "Search Jobs" },
      { href: "/search/salary", label: "Search Salary" },
    ]
  },
  {
    href: "/prepare",
    label: "Prepare",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    ),
    subItems: [
      { href: "/prepare/interview", label: "Mock Interview" },
      { href: "/prepare/roadmap", label: "Skill Roadmap" },
      { href: "/prepare/sessions", label: "Past Sessions" },
    ]
  },
  {
    href: "/results",
    label: "Saved Jobs",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
  },
  {
    href: "/resume",
    label: "Resume",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    href: "/applications",
    label: "Applications",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    href: "/emails",
    label: "Emails",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline>
      </svg>
    ),
  },
  {
    href: "/scams",
    label: "Scam Alerts",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 0-14.14 0M4.93 19.07a10 10 0 0 0 14.14 0M1 12h2m18 0h2M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
      </svg>
    ),
  },
];

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function Sidebar() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Partial<UserProfile> | null>(null);
  const [searchExpanded, setSearchExpanded] = useState(true);
  const [prepareExpanded, setPrepareExpanded] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const pRes = await api.getProfile().catch((e) => ({ success: false, data: null, error: e?.message ?? String(e) }));
      const p = pRes.success && pRes.data ? (pRes.data as any) : null;
      if (p) setProfile(p);
    }

    loadProfile().catch((err) => {
      console.error("Sidebar profile load failed:", err);
    });
  }, [pathname]);

  const displayName = profile?.name || "My Account";
  const displayRole = profile?.preferred_location
    ? profile.preferred_location
    : profile?.target_roles?.[0] || "Job Seeker";
  const initials = getInitials(profile?.name || "");

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo} style={{ padding: '24px 20px 10px', display: 'flex', justifyContent: 'center', background: 'transparent' }}>
        <Image 
          src="/logo.png" 
          alt="EasyClick Logo" 
          width={280} 
          height={80} 
          priority
          loading="eager"
          style={{ 
            width: '100%',
            height: 'auto',
            objectFit: 'contain', 
            mixBlendMode: 'multiply',
            filter: 'contrast(1.5) brightness(1.1) grayscale(1)'
          }}
        />
      </div>


      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const hasSubItems = 'subItems' in item && item.subItems && item.subItems.length > 0;

          return (
            <div key={item.label} className={styles.navGroup}>
              {hasSubItems ? (
                <div 
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                  onClick={() => {
                    if (item.label === "Search") setSearchExpanded(!searchExpanded);
                    if (item.label === "Prepare") setPrepareExpanded(!prepareExpanded);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  <svg 
                    width="14" 
                    height="14" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    style={{ 
                      transform: ((item.label === "Search" && searchExpanded) || (item.label === "Prepare" && prepareExpanded)) ? 'rotate(180deg)' : 'rotate(0deg)', 
                      transition: 'transform 0.2s' 
                    }}
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              ) : (
                <Link
                  href={item.href}
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )}
              
              {hasSubItems && (isActive || (item.label === "Search" && searchExpanded) || (item.label === "Prepare" && prepareExpanded)) && (
                <div className={styles.subItems} style={{ display: 'flex' }}>
                  {(item as any).subItems.map((sub: any) => {
                    const isSubActive = pathname === sub.href;
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={`${styles.subItem} ${isSubActive ? styles.subItemActive : ""}`}
                      >
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto' }}>
        <Link href="/settings" className={styles.userBlock} style={{ borderTop: '1px solid var(--border)', borderRadius: 0, padding: '20px' }}>
          <div className={styles.avatar}>{initials}</div>
          <div className={styles.userInfo}>
            <p className={styles.userName}>{displayName}</p>
            <p className={styles.userRole}>{displayRole}</p>
          </div>
        </Link>
      </div>

      <div className={styles.footer}>
        <span className={styles.footerText}>v1.0.0</span>
      </div>
    </aside>
  );
}
