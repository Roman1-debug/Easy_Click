from pydantic import BaseModel, EmailStr
from typing import Optional, List


class ApiResponse(BaseModel):
    success: bool
    data: Optional[dict | list] = None
    error: Optional[str] = None


class UserProfileRequest(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    skills: List[str] = []
    target_roles: List[str] = []
    preferred_location: Optional[str] = None
    resume_text: Optional[str] = None
    experience_years: Optional[int] = 0
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    country: Optional[str] = "India"
    state: Optional[str] = None
    pincode: Optional[str] = None
    about_me: Optional[str] = None
    about_work: Optional[str] = None
    about_experience: Optional[str] = None


class ConfigSetRequest(BaseModel):
    key: str
    value: str

class ConfigUpdateRequest(BaseModel):
    openrouter_api_key: Optional[str] = None
    gmail_address: Optional[str] = None
    gmail_app_password: Optional[str] = None


class JobSearchRequest(BaseModel):
    role: str
    location: str
    page: Optional[int] = 1
    max_results: Optional[int] = 50


class JobScoreRequest(BaseModel):
    job_ids: List[int]


class ResumeTailorRequest(BaseModel):
    job_id: int
    user_id: Optional[int] = 1
    feedback: Optional[str] = None


class ResumePdfRequest(BaseModel):
    resume_version_id: int
    template: Optional[str] = "classic"


class EmailGenerateRequest(BaseModel):
    job_id: Optional[int] = None
    user_id: Optional[int] = 1


class ApplyRequest(BaseModel):
    job_id: int
    mode: str  # "manual" or "automatic"
    recipient_email: Optional[str] = None
    user_id: Optional[int] = 1


class ApplicationUpdateRequest(BaseModel):
    status: str
    notes: Optional[str] = None


class JobExtractRequest(BaseModel):
    url: str
    keywords: Optional[str] = None  # e.g. "python developer backend"


class ManualResumeRequest(BaseModel):
    resume_data: Optional[dict] = None
    yaml_string: Optional[str] = None
    template: Optional[str] = "classic"


class ChatAssistantRequest(BaseModel):
    message: str
    current_yaml: str
    attachment: Optional[dict] = None


class SalarySearchRequest(BaseModel):
    role: str
    location: str
    experience: str


class MockInterviewRequest(BaseModel):
    role: str
    experience: str
    focus: str
    jd: Optional[str] = ""
    history: List[dict] = []


class InterviewAnswerRequest(BaseModel):
    role: str
    experience: str
    focus: str
    jd: Optional[str] = ""
    history: List[dict]
    answer: str


class InterviewEvaluationRequest(BaseModel):
    history: List[dict]


class SaveSessionRequest(BaseModel):
    role: str
    focus: str
    experience: str
    history: List[dict]
    scorecard: Optional[dict] = None


class RoadmapRequest(BaseModel):
    target_role: str
    current_skills: List[str]
    experience: str
    country: Optional[str] = None
