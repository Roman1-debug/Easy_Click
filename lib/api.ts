import type { ApiResponse } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    if (!res.ok) {
      return { success: false, data: null, error: `HTTP ${res.status}` };
    }

    return res.json();
  } catch (error) {
    return {
      success: false,
      data: null,
      error:
        error instanceof Error
          ? error.message
          : typeof error === "string"
          ? error
          : "Network request failed",
    };
  }
}

export const api = {
  // Profile
  getProfile: () => request("/profile"),
  saveProfile: (data: unknown) =>
    request("/profile", { method: "POST", body: JSON.stringify(data) }),

  // Config
  getConfig: () => request("/config"),
  setConfig: (key: string, value: string) =>
    request("/config", { method: "POST", body: JSON.stringify({ key, value }) }),
  deleteConfig: (key: string) =>
    request(`/config/${key}`, { method: "DELETE" }),

  // Jobs
  searchJobs: (role: string, location: string, max_results = 50, page = 1) =>
    request("/jobs/search", {
      method: "POST",
      body: JSON.stringify({ role, location, max_results, page }),
    }),
  scoreJobs: (job_ids: number[]) =>
    request("/jobs/score", { method: "POST", body: JSON.stringify({ job_ids }) }),
  listJobs: (params?: { limit?: number; min_score?: number; remote_only?: boolean; saved_only?: boolean; exclude_saved?: boolean; role?: string; location?: string; search_query?: string; q?: string; source?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.min_score) qs.set("min_score", String(params.min_score));
    if (params?.remote_only) qs.set("remote_only", "true");
    if (params?.saved_only) qs.set("saved_only", "true");
    if (params?.exclude_saved) qs.set("exclude_saved", "true");
    if (params?.role) qs.set("role", params.role);
    if (params?.location) qs.set("location", params.location);
    if (params?.search_query) qs.set("search_query", params.search_query);
    if (params?.q) qs.set("q", params.q);
    if (params?.source) qs.set("source", params.source);
    return request(`/jobs?${qs.toString()}`);
  },
  getJob: (id: number | string) => request(`/jobs/${id}`),
  refreshJob: (id: number | string) => request(`/jobs/${id}/refresh`, { method: "POST" }),
  toggleSaveJob: (id: number | string) => request(`/jobs/${id}/save`, { method: "POST" }),

  // Resume
  tailorResume: (job_id: number | string, user_id: number | string = "1", feedback?: string) =>
    request("/resume/tailor", { method: "POST", body: JSON.stringify({ job_id, user_id, feedback: feedback || null }) }),
  generatePdf: (resume_version_id: number | string, template: string = "classic") =>
    request("/resume/generate", {
      method: "POST",
      body: JSON.stringify({ resume_version_id, template }),
    }),
  getResumeVersions: (job_id: number | string) => request(`/resume/versions/${job_id}`),

  // Email
  generateEmail: (job_id?: number | string, user_id: number | string = "1") =>
    request("/email/generate", { method: "POST", body: JSON.stringify({ job_id, user_id }) }),

  // Apply
  applyToJob: (job_id: number | string, mode: "manual" | "automatic") =>
    request("/apply", { method: "POST", body: JSON.stringify({ job_id, mode }) }),
  chatWithAi: (message: string, currentDraft: string, userId: number | string = "1") =>
    request("/email/chat", { method: "POST", body: JSON.stringify({ message, current_draft: currentDraft, user_id: userId }) }),
  sendEmail: (application_id: number | string, recipient: string, subject: string, body: string) => {
    const qs = new URLSearchParams({ application_id: String(application_id), recipient, subject, body });
    return request(`/apply/send?${qs.toString()}`, { method: "POST" });
  },
  sendDirectEmail: (to: string, subject: string, body: string, cc?: string, attachment?: { name: string, data: string }) =>
    request("/email/send", { method: "POST", body: JSON.stringify({ to, subject, body, cc, attachment }) }),
  getSentEmails: () => request("/email/sent"),
  deleteEmails: (ids: (number | string)[]) => request("/email/delete", { method: "POST", body: JSON.stringify({ ids }) }),

  // Applications
  getApplications: () => request("/applications"),
  getStats: () => request("/applications/stats"),
  updateApplication: (id: number | string, status: string, notes?: string) =>
    request(`/applications/${id}`, { method: "PATCH", body: JSON.stringify({ status, notes }) }),
  deleteApplication: (id: number | string) =>
    request(`/applications/${id}`, { method: "DELETE" }),

  // Extraction & Manual
  directExtractJob: (url: string, keywords?: string) =>
    request("/jobs/extract", { method: "POST", body: JSON.stringify({ url, keywords: keywords || "" }) }),
  generateManualPdf: (yamlString: string, template: string) =>
    request("/resume/manual-generate", {
      method: "POST",
      body: JSON.stringify({ yaml_string: yamlString, template }),
    }),

  // Scams
  getScams: () => request("/scams"),
  searchScams: (q: string) => request(`/scams/search?q=${encodeURIComponent(q)}`),

  // Salary
  analyzeSalary: (role: string, location: string, experience: string) =>
    request("/salary/analyze", { method: "POST", body: JSON.stringify({ role, location, experience }) }),

  // Prepare — Interview & Roadmap
  startInterview: (payload: any) => request("/prepare/mock/start", { method: "POST", body: JSON.stringify(payload) }),
  submitAnswer: (payload: any) => request("/prepare/mock/answer", { method: "POST", body: JSON.stringify(payload) }),
  evaluateInterview: (history: any[]) => request("/prepare/mock/evaluate", { method: "POST", body: JSON.stringify({ history }) }),
  generateRoadmap: (payload: any) => request("/prepare/roadmap/generate", { method: "POST", body: JSON.stringify(payload) }),
  saveInterviewSession: (role: string, focus: string, experience: string, history: unknown[], scorecard: unknown) =>
    request("/prepare/mock/save", { method: "POST", body: JSON.stringify({ role, focus, experience, history, scorecard }) }),
  getInterviewSessions: () => request("/prepare/mock/sessions"),
  getInterviewSession: (id: number | string) => request(`/prepare/mock/sessions/${id}`),
};
