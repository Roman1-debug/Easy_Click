export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  skills: string[];
  target_roles: string[];
  preferred_location: string;
  resume_text: string;
  experience_years: number;
  linkedin_url: string;
  portfolio_url: string;
  country: string;
  state: string;
  pincode: string;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: number;
  hash: string;
  title: string;
  company: string;
  location: string;
  description: string;
  apply_link: string;
  source: string;
  posted_date: string;
  score: number;
  score_reason: string;
  search_query: string;
  is_saved?: boolean;
  hr_email?: string;
  salary?: string;
  experience?: string;
  created_at: string;
}

export interface Application {
  id: number;
  company: string;
  role: string;
  apply_link: string;
  status: "pending" | "sent" | "viewed" | "interview" | "rejected" | "offer";
  job_id: number | null;
  notes: string | null;
  applied_at: string;
}

export interface ResumeVersion {
  id: number;
  job_id: number;
  ats_score: number;
  change_summary: string;
  pdf_path: string | null;
  created_at: string;
}

export interface DashboardStats {
  total_applications: number;
  sent: number;
  total_jobs: number;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
}

export interface TailoredResume {
  resume_version_id: number;
  tailored_data: Record<string, unknown>;
  ats_score: number;
  change_summary: string;
}
