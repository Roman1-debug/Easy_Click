"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { UserProfile } from "@/lib/types";
import HelpModal from "@/components/ui/HelpModal";
import styles from "./page.module.css";

const CONFIG_KEYS = ["openrouter_api_key", "email_address", "email_app_password"] as const;
type ConfigKey = typeof CONFIG_KEYS[number];

const CONFIG_LABELS: Record<ConfigKey, string> = {
  openrouter_api_key: "OpenRouter API Key",
  email_address: "Email Address (Gmail)",
  email_app_password: "Gmail App Password",
};

type ConfigState = {
  value: string;
  maskedValue: string;
  isSet: boolean;
};

type ConfigMap = Record<ConfigKey, ConfigState>;

const emptyConfigMap = (): ConfigMap => ({
  openrouter_api_key: { value: "", maskedValue: "", isSet: false },
  email_address: { value: "", maskedValue: "", isSet: false },
  email_app_password: { value: "", maskedValue: "", isSet: false },
});

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>({
    name: "", email: "", phone: "", skills: [], target_roles: [], preferred_location: "", resume_text: "", experience_years: 0,
    country: "India", state: "", pincode: "", about_me: "", about_work: "", about_experience: ""
  });
  const [configMap, setConfigMap] = useState<ConfigMap>(emptyConfigMap());
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingKey, setSavingKey] = useState<ConfigKey | null>(null);
  const [removingKey, setRemovingKey] = useState<ConfigKey | null>(null);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [configMsg, setConfigMsg] = useState<Partial<Record<ConfigKey, { type: "success" | "error"; text: string }>>>({});
  const [skillInput, setSkillInput] = useState("");
  const [roleInput, setRoleInput] = useState("");
  const [openrouterModalOpen, setOpenrouterModalOpen] = useState(false);
  const [gmailModalOpen, setGmailModalOpen] = useState(false);

  useEffect(() => {
    Promise.all([api.getProfile(), api.getConfig()]).then(([pRes, cRes]) => {
      const profileData = pRes.success && pRes.data ? (pRes.data as any) : null;
      if (profileData) setProfile(profileData);

      const profileComplete =
        profileData &&
        profileData.name?.trim() &&
        profileData.email?.trim() &&
        (profileData.skills?.length ?? 0) > 0 &&
        (profileData.target_roles?.length ?? 0) > 0 &&
        profileData.resume_text?.trim();

      if (cRes.success && cRes.data) {
        const raw = cRes.data as Record<string, string | boolean>;
        const configComplete = !!(raw["openrouter_api_key_set"] as boolean);
        setIsOnboarding(!profileComplete || !configComplete);
        setConfigMap({
          openrouter_api_key: {
            value: "",
            maskedValue: (raw["openrouter_api_key"] as string) || "",
            isSet: !!(raw["openrouter_api_key_set"] as boolean),
          },
          email_address: {
            value: "",
            maskedValue: (raw["email_address"] as string) || "",
            isSet: !!(raw["email_address_set"] as boolean),
          },
          email_app_password: {
            value: "",
            maskedValue: (raw["email_app_password"] as string) || "",
            isSet: !!(raw["email_app_password_set"] as boolean),
          },
        });
      } else {
        setIsOnboarding(!profileComplete);
      }
    });
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg(null);
    const res = await api.saveProfile(profile);
    setProfileMsg(
      res.success
        ? { type: "success", text: "Profile saved successfully" }
        : { type: "error", text: res.error || "Save failed" }
    );
    setSavingProfile(false);
    if (res.success) setTimeout(() => setProfileMsg(null), 3000);
  }

  async function saveConfigKey(key: ConfigKey) {
    const val = configMap[key].value.trim();
    if (!val) return;
    setSavingKey(key);
    const res = await api.setConfig(key, val);
    if (res.success) {
      const getRes = await api.getConfig();
      if (getRes.success && getRes.data) {
        const raw = getRes.data as Record<string, string | boolean>;
        setConfigMap((prev) => ({
          ...prev,
          [key]: {
            value: "",
            maskedValue: (raw[key] as string) || "",
            isSet: !!(raw[`${key}_set`] as boolean),
          },
        }));
      }
      setConfigMsg((prev) => ({ ...prev, [key]: { type: "success", text: "Saved and locked" } }));
    } else {
      setConfigMsg((prev) => ({ ...prev, [key]: { type: "error", text: res.error || "Save failed" } }));
    }
    setSavingKey(null);
    setTimeout(() => setConfigMsg((prev) => ({ ...prev, [key]: undefined })), 3000);
  }

  async function removeConfigKey(key: ConfigKey) {
    setRemovingKey(key);
    const res = await api.deleteConfig(key);
    if (res.success) {
      // If app password was removed, also clear email_address state (cascade from backend)
      if (key === "email_app_password") {
        setConfigMap((prev) => ({
          ...prev,
          email_app_password: { value: "", maskedValue: "", isSet: false },
          email_address: { value: "", maskedValue: "", isSet: false },
        }));
        setConfigMsg((prev) => ({
          ...prev,
          email_app_password: { type: "success", text: "Removed — email address also cleared" },
        }));
      } else {
        setConfigMap((prev) => ({
          ...prev,
          [key]: { value: "", maskedValue: "", isSet: false },
        }));
        setConfigMsg((prev) => ({ ...prev, [key]: { type: "success", text: "Removed" } }));
      }
    } else {
      setConfigMsg((prev) => ({ ...prev, [key]: { type: "error", text: res.error || "Remove failed" } }));
    }
    setRemovingKey(null);
    setTimeout(() => setConfigMsg((prev) => ({ ...prev, [key]: undefined })), 3000);
  }

  function addSkill() {
    const s = skillInput.trim();
    if (!s || profile.skills?.includes(s)) return;
    setProfile((p: any) => ({ ...p, skills: [...(p.skills || []), s] }));
    setSkillInput("");
  }

  function removeSkill(skill: string) {
    setProfile((p: any) => ({ ...p, skills: (p.skills || []).filter((s: string) => s !== skill) }));
  }

  function addRole() {
    const r = roleInput.trim();
    if (!r || profile.target_roles?.includes(r)) return;
    setProfile((p: any) => ({ ...p, target_roles: [...(p.target_roles || []), r] }));
    setRoleInput("");
  }

  function removeRole(role: string) {
    setProfile((p: any) => ({ ...p, target_roles: (p.target_roles || []).filter((r: string) => r !== role) }));
  }

  const isProfileFilled = !!(
    profile.name?.trim() &&
    profile.email?.trim() &&
    (profile.skills?.length ?? 0) > 0 &&
    (profile.target_roles?.length ?? 0) > 0 &&
    profile.resume_text?.trim()
  );

  const isSetupComplete = isProfileFilled && configMap.openrouter_api_key.isSet;

  function renderConfigBlock(key: ConfigKey, opts?: { helpBtn?: React.ReactNode; inputType?: string }) {
    const state = configMap[key];
    const msg = configMsg[key];
    const isRemoving = removingKey === key;
    const isSaving = savingKey === key;

    return (
      <div key={key} className={styles.configBlock}>
        <label className="label" htmlFor={`config-${key}`}>{CONFIG_LABELS[key]}</label>

        {state.isSet ? (
          // Locked view — show masked value + Remove button
          <div className={styles.lockedRow}>
            <div className={styles.lockedField}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span className={styles.maskedValue}>{state.maskedValue}</span>
              <span className={styles.setTag}>Saved</span>
            </div>
            <button
              className="btn btn--danger btn--sm"
              onClick={() => removeConfigKey(key)}
              disabled={isRemoving}
              id={`remove-config-${key}-btn`}
            >
              {isRemoving ? <span className="spinner" /> : "Remove"}
            </button>
          </div>
        ) : (
          // Editable view — input + Save button
          <div className={styles.configRow}>
            <input
              id={`config-${key}`}
              className="input"
              type={opts?.inputType || "text"}
              value={state.value}
              onChange={(e) => setConfigMap((prev) => ({ ...prev, [key]: { ...prev[key], value: e.target.value } }))}
              placeholder={
                key === "openrouter_api_key" ? "sk-or-v1-..." :
                key === "email_address" ? "yourname@gmail.com" :
                "16-character app password"
              }
            />
            <button
              className="btn btn--primary btn--sm"
              onClick={() => saveConfigKey(key)}
              disabled={isSaving || !state.value.trim()}
              id={`save-config-${key}-btn`}
            >
              {isSaving ? <span className="spinner" /> : "Save"}
            </button>
          </div>
        )}

        {!state.isSet && !state.value.trim() && (
          <span className={styles.validationHint}>Enter a value before saving.</span>
        )}

        {msg && (
          <span className={styles.inlineMsg} data-type={msg.type}>{msg.text}</span>
        )}

        {opts?.helpBtn}
        
        {key === "email_app_password" && state.isSet && (
          <button 
            className="btn btn--secondary btn--sm" 
            style={{ marginTop: 12, width: '100%', border: '1px dashed #8ab4f8' }}
            onClick={async () => {
              const res = await api.sendDirectEmail(profile.email || "", "EasyClick SMTP Test", "Your SMTP configuration is working perfectly!");
              if (res.success) alert("Test email sent to your profile email (" + (profile.email || "not set") + ")!");
              else alert("Test failed: " + res.error);
            }}
          >
            🚀 Send Test Email
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="page-body">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your profile and API credentials</p>
      </div>

      {isOnboarding && (
        <div className="alert alert--warning" style={{ marginBottom: 24 }}>
          <strong>Complete your setup to continue</strong>
          <p style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
            All of the following are required before you can use the app:
          </p>
          <ul style={{ fontSize: 13, marginTop: 6, paddingLeft: 20, lineHeight: 1.8 }}>
            <li style={{ color: profile.name?.trim() ? "var(--success, #22c55e)" : "inherit" }}>Full Name</li>
            <li style={{ color: profile.email?.trim() ? "var(--success, #22c55e)" : "inherit" }}>Email Address</li>
            <li style={{ color: (profile.skills?.length ?? 0) > 0 ? "var(--success, #22c55e)" : "inherit" }}>At least one Skill</li>
            <li style={{ color: (profile.target_roles?.length ?? 0) > 0 ? "var(--success, #22c55e)" : "inherit" }}>At least one Target Role</li>
            <li style={{ color: profile.resume_text?.trim() ? "var(--success, #22c55e)" : "inherit" }}>Resume Text</li>
            <li style={{ color: configMap.openrouter_api_key.isSet ? "var(--success, #22c55e)" : "inherit" }}>OpenRouter API Key</li>
          </ul>
          {isSetupComplete && (
            <button
              className="btn btn--primary"
              style={{ marginTop: 16 }}
              onClick={() => { window.dispatchEvent(new Event("onboarding-complete")); router.push("/"); }}
              id="complete-setup-btn"
            >
              Setup Complete — Go to Dashboard
            </button>
          )}
        </div>
      )}

      <div className={styles.sections}>

        {/* Profile Section */}
        <section className={`card ${styles.section}`}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>User Profile</h2>
              <p className={styles.sectionDesc}>Used for job scoring, resume tailoring, and email generation</p>
            </div>
          </div>

          <div className="divider" />

          <div className="grid-2">
            <div className="form-group">
              <label className="label" htmlFor="name-input">Full Name</label>
              <input id="name-input" className="input" value={profile.name || ""} onChange={(e) => setProfile((p: any) => ({ ...p, name: e.target.value }))} placeholder="Your full name" />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="email-input">Email Address</label>
              <input id="email-input" className="input" type="email" value={profile.email || ""} onChange={(e) => setProfile((p: any) => ({ ...p, email: e.target.value }))} placeholder="your@email.com" />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="phone-input">Phone Number</label>
              <input id="phone-input" className="input" value={profile.phone || ""} onChange={(e) => setProfile((p: any) => ({ ...p, phone: e.target.value }))} placeholder="+91 XXXXXXXXXX" />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="location-input">Preferred Location</label>
              <input id="location-input" className="input" value={profile.preferred_location || ""} onChange={(e) => setProfile((p: any) => ({ ...p, preferred_location: e.target.value }))} placeholder="e.g. Mumbai, Bangalore, Remote" />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="exp-input">Years of Experience</label>
              <input id="exp-input" className="input" type="number" min={0} value={profile.experience_years || 0} onChange={(e) => setProfile((p: any) => ({ ...p, experience_years: parseInt(e.target.value) || 0 }))} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="linkedin-input">LinkedIn URL</label>
              <input id="linkedin-input" className="input" value={profile.linkedin_url || ""} onChange={(e) => setProfile((p: any) => ({ ...p, linkedin_url: e.target.value }))} placeholder="linkedin.com/in/..." />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="portfolio-input">Portfolio URL</label>
              <input id="portfolio-input" className="input" value={profile.portfolio_url || ""} onChange={(e) => setProfile((p: any) => ({ ...p, portfolio_url: e.target.value }))} placeholder="yourportfolio.com" />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="country-input">Country</label>
              <input id="country-input" className="input" value={profile.country || ""} onChange={(e) => setProfile((p: any) => ({ ...p, country: e.target.value }))} placeholder="e.g. India" />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="state-input">State</label>
              <input id="state-input" className="input" value={profile.state || ""} onChange={(e) => setProfile((p: any) => ({ ...p, state: e.target.value }))} placeholder="e.g. Maharashtra" />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="pincode-input">Pincode</label>
              <input id="pincode-input" className="input" value={profile.pincode || ""} onChange={(e) => setProfile((p: any) => ({ ...p, pincode: e.target.value }))} placeholder="e.g. 400001" />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Skills</label>
            <div className="tags-container">
              {(profile.skills || []).map((s: any) => (
                <span key={s} className="tag-item">
                  {s}
                  <button className="tag-remove" onClick={() => removeSkill(s)} aria-label={`Remove ${s}`}>×</button>
                </span>
              ))}
              <input id="skill-input" className="tag-input" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }} placeholder="Type a skill and press Enter" />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Target Roles</label>
            <div className="tags-container">
              {(profile.target_roles || []).map((r: any) => (
                <span key={r} className="tag-item">
                  {r}
                  <button className="tag-remove" onClick={() => removeRole(r)} aria-label={`Remove ${r}`}>×</button>
                </span>
              ))}
              <input id="role-input" className="tag-input" value={roleInput} onChange={(e) => setRoleInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRole(); } }} placeholder="Type a role and press Enter" />
            </div>
          </div>

          <div className="form-group">
            <label className="label" htmlFor="resume-textarea">
              Resume Text
              <span className={styles.labelHint}>Paste your full resume — used for AI tailoring</span>
            </label>
            <textarea id="resume-textarea" className="input textarea" style={{ minHeight: 180 }} value={profile.resume_text || ""} onChange={(e) => setProfile((p: any) => ({ ...p, resume_text: e.target.value }))} placeholder="Paste your full resume content here..." />
          </div>

          <div className="alert alert--info" style={{ marginTop: '24px', marginBottom: '16px' }}>
            <strong>Tell us about yourself (Used by AI for Emails)</strong>
            <p style={{ fontSize: '13px', marginTop: '4px' }}>Fill these sections to give the AI context when generating cold emails. It will extract key points without making the email unnecessarily large.</p>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="label" htmlFor="about-me-textarea">About Yourself</label>
              <textarea id="about-me-textarea" className="input textarea" style={{ minHeight: 120 }} value={profile.about_me || ""} onChange={(e) => setProfile((p: any) => ({ ...p, about_me: e.target.value }))} placeholder="Brief background, hobbies, or traits..." />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="about-work-textarea">About Your Work</label>
              <textarea id="about-work-textarea" className="input textarea" style={{ minHeight: 120 }} value={profile.about_work || ""} onChange={(e) => setProfile((p: any) => ({ ...p, about_work: e.target.value }))} placeholder="Work ethic, problem solving style..." />
            </div>
          </div>
          <div className="form-group">
            <label className="label" htmlFor="about-exp-textarea">About Your Experience</label>
            <textarea id="about-exp-textarea" className="input textarea" style={{ minHeight: 120 }} value={profile.about_experience || ""} onChange={(e) => setProfile((p: any) => ({ ...p, about_experience: e.target.value }))} placeholder="Key achievements, domains of expertise..." />
          </div>

          {profileMsg && (
            <div className={`alert alert--${profileMsg.type}`} style={{ marginBottom: 14 }}>{profileMsg.text}</div>
          )}

          <button className="btn btn--primary" onClick={saveProfile} disabled={savingProfile || !isProfileFilled} id="save-profile-btn">
            {savingProfile ? <><span className="spinner" /> Saving...</> : "Save Profile"}
          </button>
          {!isProfileFilled && (
            <p className={styles.validationHint}>Name, email, at least one skill, one target role, and resume text are all required.</p>
          )}
        </section>

        {/* API Config Section */}
        <section className={`card ${styles.section}`}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>API Configuration</h2>
              <p className={styles.sectionDesc}>Credentials are stored locally in the database — once saved, only removable</p>
            </div>
          </div>

          <div className="divider" />

          {renderConfigBlock("openrouter_api_key", {
            helpBtn: (
              <button className={styles.helpLink} onClick={() => setOpenrouterModalOpen(true)} id="openrouter-help-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
                How to get a free OpenRouter API key
              </button>
            ),
          })}

          {renderConfigBlock("email_address")}

          {renderConfigBlock("email_app_password", {
            inputType: "password",
            helpBtn: (
              <button className={styles.helpLink} onClick={() => setGmailModalOpen(true)} id="gmail-help-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
                What is a Gmail App Password and how to get one
              </button>
            ),
          })}

          <div className="alert alert--info" style={{ marginTop: 8 }}>
            Without an OpenRouter key, AI features are disabled. Without Gmail credentials, automatic email sending is disabled. Job scraping always works.
          </div>
        </section>
      </div>

      {/* OpenRouter Help Modal */}
      <HelpModal isOpen={openrouterModalOpen} onClose={() => setOpenrouterModalOpen(false)} title="How to get a free OpenRouter API Key">
        <div className={styles.modalContent}>
          <div className={styles.step}>
            <div className={styles.stepBadge}>1</div>
            <div>
              <p className={styles.stepTitle}>Go to OpenRouter</p>
              <p>Visit <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className={styles.link}>openrouter.ai</a> and click <strong>Sign In</strong>. Sign up with Google or GitHub — no credit card required.</p>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepBadge}>2</div>
            <div>
              <p className={styles.stepTitle}>Go to API Keys</p>
              <p>After signing in, click your profile icon and go to <strong>Keys</strong>, or visit <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className={styles.link}>openrouter.ai/keys</a>.</p>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepBadge}>3</div>
            <div>
              <p className={styles.stepTitle}>Create a new key</p>
              <p>Click <strong>Create Key</strong>, name it <code className={styles.code}>EasyClick</code>, and confirm. Copy the key — it starts with <code className={styles.code}>sk-or-v1-...</code></p>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepBadge}>4</div>
            <div>
              <p className={styles.stepTitle}>Free models available</p>
              <p>OpenRouter has free models including <code className={styles.code}>mistralai/mistral-7b-instruct</code>. EasyClick uses free models by default — you will not be charged.</p>
            </div>
          </div>
          <div className={styles.modalNote}>Paste the key in the API Key field and click Save. Your key is stored only in the local database.</div>
        </div>
      </HelpModal>

      {/* Gmail App Password Help Modal */}
      <HelpModal isOpen={gmailModalOpen} onClose={() => setGmailModalOpen(false)} title="How to get a Gmail App Password">
        <div className={styles.modalContent}>
          <p style={{ marginBottom: 16 }}>A Gmail App Password is a 16-character code that lets EasyClick send emails without storing your real password. It can be revoked anytime.</p>
          <div className={styles.step}>
            <div className={styles.stepBadge}>1</div>
            <div>
              <p className={styles.stepTitle}>Enable 2-Step Verification</p>
              <p>Go to your <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" className={styles.link}>Google Account Security page</a> and turn on <strong>2-Step Verification</strong>.</p>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepBadge}>2</div>
            <div>
              <p className={styles.stepTitle}>Go to App Passwords</p>
              <p>Visit <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className={styles.link}>myaccount.google.com/apppasswords</a>.</p>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepBadge}>3</div>
            <div>
              <p className={styles.stepTitle}>Create an App Password</p>
              <p>Type <code className={styles.code}>EasyClick</code> as the app name and click <strong>Create</strong>. Google shows a 16-character code.</p>
            </div>
          </div>
          <div className={styles.step}>
            <div className={styles.stepBadge}>4</div>
            <div>
              <p className={styles.stepTitle}>Copy and paste</p>
              <p>Paste the 16-character code into the Gmail App Password field. Spaces do not matter.</p>
            </div>
          </div>
          <div className={styles.modalNote}>You can revoke this App Password anytime from your Google Account page.</div>
        </div>
      </HelpModal>
    </div>
  );
}

