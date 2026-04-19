import type { Job } from "./types";

const SECTION_HEADERS = [
  "About the job",
  "Job Description",
  "Responsibilities",
  "Finance/Budgetary Responsibilities",
  "Qualifications",
  "Preferred",
  "BGV:",
  "About Us",
  "We are",
  "Working with Us",
  "Our Hybrid Working Module",
  "Health, Safety and Wellbeing",
  "Inclusivity and Diversity",
  "NOTICE TO THIRD PARTY AGENCIES:",
  "Seniority level",
  "Employment type",
  "Job function",
  "Industries",
];

export function formatJobDescription(raw: string): string {
  if (!raw) return "";

  let text = raw.replace(/\r/g, "\n").trim();

  for (const header of SECTION_HEADERS) {
    const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\s*${escaped}\\s*`, "gi"), `\n\n${header}\n`);
  }

  text = text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();

  return text;
}

export function descriptionToBlocks(raw: string) {
  const formatted = formatJobDescription(raw);
  if (!formatted) return [];

  const lines = formatted.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => {
    const isBullet = line.startsWith("- ");
    const normalized = isBullet ? line.slice(2).trim() : line;
    const isHeading =
      !isBullet &&
      normalized.length <= 80 &&
      /^(about the job|job description|responsibilities|finance\/budgetary responsibilities|qualifications|preferred|bgv:|about us|we are|working with us|our hybrid working module|health, safety and wellbeing|inclusivity and diversity|notice to third party agencies:|seniority level|employment type|job function|industries)$/i.test(
        normalized
      );

    return {
      type: isHeading ? "heading" : isBullet ? "bullet" : "paragraph",
      text: normalized,
    };
  });
}

export function extractRequiredExperience(text: string): { min: number | null; label: string | null } {
  if (!text) return { min: null, label: null };

  const normalized = text.replace(/\u2013|\u2014/g, "-");
  const rangeMatch = normalized.match(/(\d+)\s*[-to]{1,3}\s*(\d+)\s*years?/i);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    return { min, label: `${min}-${max} years` };
  }

  const plusMatch = normalized.match(/(\d+)\s*\+\s*years?/i);
  if (plusMatch) {
    const min = Number(plusMatch[1]);
    return { min, label: `${min}+ years` };
  }

  const singleMatch = normalized.match(/(?:experience\s*(?:of|required|:)?\s*)?(\d+)\s*years?/i);
  if (singleMatch) {
    const min = Number(singleMatch[1]);
    return { min, label: `${min} years` };
  }

  return { min: null, label: null };
}

export function getExperienceFit(job: Job, userExperienceYears?: number | null) {
  const required = extractRequiredExperience(`${job.title} ${job.experience || ""} ${job.description || ""}`);
  const scoreReason = (job.score_reason || "").toLowerCase();
  const hasGap = scoreReason.includes("seniority gap") || scoreReason.includes("requires more experience");

  if (hasGap && required.label) {
    return { tone: "warn" as const, message: `Needs ${required.label}` };
  }

  if (hasGap) {
    return { tone: "warn" as const, message: "Needs more experience" };
  }

  if (required.label && typeof userExperienceYears === "number" && required.min !== null && userExperienceYears >= required.min) {
    return { tone: "ok" as const, message: `Fits ${required.label} requirement` };
  }

  if (required.label) {
    return { tone: "neutral" as const, message: `Requires ${required.label}` };
  }

  return null;
}
