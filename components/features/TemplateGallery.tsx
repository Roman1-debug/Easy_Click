"use client";

import styles from "./TemplateGallery.module.css";

interface TemplateGalleryProps {
  onSelect: (yaml: string, theme: string) => void;
}

// Each template has its own standalone YAML — no shared function or runtime interpolation
const TEMPLATE_YAMLS: Record<string, string> = {
  moderncv: `cv:
  name: "YOUR NAME"
  location: "City, Country"
  email: "your.email@example.com"
  website: "https://yourportfolio.com"
  social_networks:
    - network: "LinkedIn"
      username: "yourlinkedin"
    - network: "GitHub"
      username: "yourgithub"
  sections:
    summary:
      - "Computer Science professional specializing in Blue Team cybersecurity, with emphasis on threat detection, defensive strategies, and incident response."
    education:
      - institution: "Your University Name"
        area: "Computer Science"
        degree: "Bachelor of Science (B.Sc.)"
        start_date: 2023
        end_date: 2026
        location: "City, Country"
    skills:
      - label: "Defensive Security"
        details: "Intrusion detection (IDS/IPS), anomaly detection, incident response, network monitoring"
      - label: "Programming"
        details: "Python, FastAPI, JavaScript, React.js"
    experience:
      - company: "Previous Company or Lab"
        position: "Security Intern / Developer"
        start_date: 2024
        end_date: "present"
        location: "Remote/Office"
        highlights:
          - "Performed web application testing and protocol analysis"
          - "Developed automation scripts for system monitoring"
    projects:
      - name: "Major Project Name"
        date: "2025"
        highlights:
          - "Developed a real-time detection system using modern tech stacks"
          - "Implemented security protocols and automated response alerts"
design:
  theme: "moderncv"
`,

  engineeringresumes: `cv:
  name: "YOUR NAME"
  location: "City, Country"
  email: "your.email@example.com"
  website: "https://yourportfolio.com"
  social_networks:
    - network: "LinkedIn"
      username: "yourlinkedin"
    - network: "GitHub"
      username: "yourgithub"
  sections:
    summary:
      - "Computer Science professional specializing in Blue Team cybersecurity, with emphasis on threat detection, defensive strategies, and incident response."
    education:
      - institution: "Your University Name"
        area: "Computer Science"
        degree: "Bachelor of Science (B.Sc.)"
        start_date: 2023
        end_date: 2026
        location: "City, Country"
    skills:
      - label: "Defensive Security"
        details: "Intrusion detection (IDS/IPS), anomaly detection, incident response, network monitoring"
      - label: "Programming"
        details: "Python, FastAPI, JavaScript, React.js"
    experience:
      - company: "Previous Company or Lab"
        position: "Security Intern / Developer"
        start_date: 2024
        end_date: "present"
        location: "Remote/Office"
        highlights:
          - "Performed web application testing and protocol analysis"
          - "Developed automation scripts for system monitoring"
    projects:
      - name: "Major Project Name"
        date: "2025"
        highlights:
          - "Developed a real-time detection system using modern tech stacks"
          - "Implemented security protocols and automated response alerts"
design:
  theme: "engineeringresumes"
`,

  sb2nov: `cv:
  name: "YOUR NAME"
  location: "City, Country"
  email: "your.email@example.com"
  website: "https://yourportfolio.com"
  social_networks:
    - network: "LinkedIn"
      username: "yourlinkedin"
    - network: "GitHub"
      username: "yourgithub"
  sections:
    summary:
      - "Computer Science professional specializing in Blue Team cybersecurity, with emphasis on threat detection, defensive strategies, and incident response."
    education:
      - institution: "Your University Name"
        area: "Computer Science"
        degree: "Bachelor of Science (B.Sc.)"
        start_date: 2023
        end_date: 2026
        location: "City, Country"
    skills:
      - label: "Defensive Security"
        details: "Intrusion detection (IDS/IPS), anomaly detection, incident response, network monitoring"
      - label: "Programming"
        details: "Python, FastAPI, JavaScript, React.js"
    experience:
      - company: "Previous Company or Lab"
        position: "Security Intern / Developer"
        start_date: 2024
        end_date: "present"
        location: "Remote/Office"
        highlights:
          - "Performed web application testing and protocol analysis"
          - "Developed automation scripts for system monitoring"
    projects:
      - name: "Major Project Name"
        date: "2025"
        highlights:
          - "Developed a real-time detection system using modern tech stacks"
          - "Implemented security protocols and automated response alerts"
design:
  theme: "sb2nov"
`,

  classic: `cv:
  name: "YOUR NAME"
  location: "City, Country"
  email: "your.email@example.com"
  website: "https://yourportfolio.com"
  social_networks:
    - network: "LinkedIn"
      username: "yourlinkedin"
    - network: "GitHub"
      username: "yourgithub"
  sections:
    summary:
      - "Computer Science professional specializing in Blue Team cybersecurity, with emphasis on threat detection, defensive strategies, and incident response."
    education:
      - institution: "Your University Name"
        area: "Computer Science"
        degree: "Bachelor of Science (B.Sc.)"
        start_date: 2023
        end_date: 2026
        location: "City, Country"
    skills:
      - label: "Defensive Security"
        details: "Intrusion detection (IDS/IPS), anomaly detection, incident response, network monitoring"
      - label: "Programming"
        details: "Python, FastAPI, JavaScript, React.js"
    experience:
      - company: "Previous Company or Lab"
        position: "Security Intern / Developer"
        start_date: 2024
        end_date: "present"
        location: "Remote/Office"
        highlights:
          - "Performed web application testing and protocol analysis"
          - "Developed automation scripts for system monitoring"
    projects:
      - name: "Major Project Name"
        date: "2025"
        highlights:
          - "Developed a real-time detection system using modern tech stacks"
          - "Implemented security protocols and automated response alerts"
design:
  theme: "classic"
`,
};

const TEMPLATES = [
  {
    id: "moderncv",
    title: "ModernCV",
    image: "/templates/modern_cv.png",
    description: "Professional sidebar layout with a clean accent. Great for corporate roles.",
    theme: "moderncv",
  },
  {
    id: "engineeringresumes",
    title: "Engineering",
    image: "/templates/Engineering.png",
    description: "Minimalist, ATS-optimized layout built for technical and engineering roles.",
    theme: "engineeringresumes",
  },
  {
    id: "sb2nov",
    title: "sb2nov",
    image: "/templates/sb2nov.png",
    description: "Classic academic serif style. Ideal for research and formal positions.",
    theme: "sb2nov",
  },
  {
    id: "classic",
    title: "Classic",
    image: "/templates/classic.png",
    description: "Clean, timeless standard layout. Works well across all industries.",
    theme: "classic",
  },
];

export default function TemplateGallery({ onSelect }: TemplateGalleryProps) {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Visual Template Library</h2>
      <p className={styles.subtitle}>
        Pick a template. It'll open in the editor — just replace the placeholder text with your own info and hit Compile.
      </p>

      <div className={styles.grid}>
        {TEMPLATES.map((tpl) => (
          <div
            key={tpl.id}
            className={styles.card}
            onClick={() => onSelect(TEMPLATE_YAMLS[tpl.theme], tpl.theme)}
          >
            <div className={styles.imageContainer}>
              <img src={tpl.image} alt={tpl.title} className={styles.image} />
              <div className={styles.overlay}>
                <button className="btn btn--primary">Use Template</button>
              </div>
            </div>
            <div className={styles.cardInfo}>
              <h3 className={styles.cardTitle}>{tpl.title}</h3>
              <p className={styles.cardDesc}>{tpl.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
