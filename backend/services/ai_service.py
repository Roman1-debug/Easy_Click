import aiohttp
import json
import re
import asyncio
from typing import Optional

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

FREE_MODELS = [
    "openrouter/free",
    "google/gemma-4-31b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-coder:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
]

async def call_ai(api_key: str, system_prompt: str, user_message: str) -> Optional[str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "EasyClick",
    }

    failures = []
    max_tokens = 4000 if len(system_prompt) + len(user_message) > 1000 else 2000

    for model in FREE_MODELS:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.3,
            "max_tokens": max_tokens,
        }

        for attempt in range(2):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(OPENROUTER_URL, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            content = data.get("choices", [{}])[0].get("message", {}).get("content")
                            if content:
                                return content
                        elif resp.status == 401:
                            error_text = await resp.text()
                            raise ValueError(
                                f"OpenRouter API key is invalid or expired (401). "
                                f"Please go to Settings and re-enter a valid key from openrouter.ai/keys. "
                                f"Detail: {error_text[:80]}"
                            )
                        elif resp.status == 429:
                            error_text = await resp.text()
                            failures.append(f"{model}: HTTP 429 (Rate Limited)")
                            await asyncio.sleep(1)
                            break  # Skip retrying the same model if rate limited
                        elif resp.status == 404:
                            failures.append(f"{model}: HTTP 404 (Not Found)")
                            break  # Skip retrying if model doesn't exist
                        else:
                            error_text = await resp.text()
                            failures.append(f"{model}: HTTP {resp.status}")
            except ValueError:
                raise
            except Exception as e:
                failures.append(f"{model}: {str(e)[:60]}")
                break

            await asyncio.sleep(1)

    # Check if we were rate limited by OpenRouter
    if any("429" in f for f in failures):
        raise ValueError("OpenRouter Free Tier Limit Reached: You have made too many requests. Please wait a minute for limits to reset, or add credits to your OpenRouter account to use paid models.")
        
    raise ValueError(
        f"All AI models failed. Check your OpenRouter API key in Settings. "
        f"Failures: {' | '.join(failures[-3:])}"
    )


async def stream_ai(api_key: str, system_prompt: str, user_message: str):
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "EasyClick",
    }
    
    last_error = ""
    for model in FREE_MODELS:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.3,
            "max_tokens": 2000,
            "stream": True
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(OPENROUTER_URL, headers=headers, json=payload) as resp:
                    if resp.status == 200:
                        async for line in resp.content:
                            if line:
                                line = line.decode('utf-8').strip()
                                if line.startswith("data: "):
                                    data_str = line[6:]
                                    if data_str == "[DONE]":
                                        break
                                    try:
                                        chunk = json.loads(data_str)
                                        delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                        if delta:
                                            yield delta
                                    except:
                                        pass
                        return
                    else:
                        error_text = await resp.text()
                        if resp.status == 429:
                            last_error = "OpenRouter free tier rate limit exceeded. Please wait 1-2 minutes."
                            break
                        elif resp.status == 404:
                            last_error = f"Model {model} not found."
                            break
                        else:
                            last_error = f"Model {model} returned {resp.status}: {error_text}"
        except Exception as e:
            last_error = str(e)
            
        await asyncio.sleep(1)

    yield f"\n\n[AI Service Error: {last_error[:200]}]"


# --- INTERVIEW SERVICE ---

INTERVIEW_SYSTEM_PROMPT = """You are Marcus, a Principal Engineer and Senior Technical Interviewer with 14 years of industry experience at top-tier product companies. You have a calm, measured, authoritative voice — like a senior staff engineer who has seen everything and respects candidates who think clearly.

The candidate is interviewing for: {role}
Their experience level: {experience} years
Interview focus: {focus}
Job Description context: {jd_context}

YOUR PERSONA RULES (never break these):
- You are always Marcus. You never change name or gender.
- Your tone is measured, intelligent, and slightly challenging — not robotic, not overly warm.
- Speak naturally. Use short real sentences like "Interesting. Let me push on that." or "Good instinct — but what happens at scale?"
- You do NOT use lists or bullet points in your spoken output. Everything reads as natural dialogue.

QUESTION RULES:
1. Ask ONE focused question per turn. Never stack two questions.
2. Before asking the next question, give a SHORT 1–2 sentence spoken reaction to their last answer. Be honest — if it was weak, say "That covers the basics, but I'd want more depth on the internals."
3. Use this EXACT separator between your reaction and the next question so the frontend can parse it cleanly:
   [NEXT_QUESTION]
4. Rotate topic domains each turn: never ask two questions in the same domain (e.g., if you asked about databases, move to system design, then behavioral, then security, then architecture).
5. If an answer is dangerously shallow, do ONE follow-up probe, then move on regardless.
6. For {focus} = Technical: go deep on architecture, tradeoffs, failure modes.
   For {focus} = Behavioral: use STAR-method probing ("Tell me about a time when...").
   For {focus} = Mixed: alternate every 2 turns.
7. Scale difficulty to experience: {experience} years means {experience} years of expected depth — no softballs for senior candidates.

OPENING (only on first turn with empty history):
Introduce yourself as Marcus, mention the role, and ask a warm but substantive opening question that reveals how they think — not just what they know. Keep the intro to 2 sentences max."""

async def generate_interview_question(api_key: str, role: str, experience: str, focus: str, history: list, jd: str = "") -> str:
    system = INTERVIEW_SYSTEM_PROMPT.format(
        role=role,
        experience=experience,
        focus=focus,
        jd_context=jd[:800] if jd else "Not provided."
    )

    if not history:
        user = "Begin the interview now. This is turn 1 — give the opening introduction and first question."
    else:
        recent = history[-6:]
        user = (
            "Continue the interview naturally. Here is the recent exchange:\n"
            + json.dumps(recent, indent=2)
            + "\n\nGive your spoken reaction to their last answer, then ask the next question using [NEXT_QUESTION] as the separator."
        )
    
    return await call_ai(api_key, system, user)


EVALUATION_SYSTEM_PROMPT = """You are Dr. Priya Nair, a Senior Director of Talent Assessment at a top-tier technology company. You have spent 12 years evaluating thousands of engineering candidates. You write scorecards that hiring committees trust to make final decisions.

You will receive a full interview transcript. Your evaluation must be:
- EVIDENCE-BASED: every score and observation must cite a specific moment from the transcript.
- BRUTALLY HONEST: do not inflate scores. A candidate who gave vague answers scores low regardless of confidence.
- ACTIONABLE: weaknesses must name the specific gap, not generic feedback.

SCORING RUBRIC:
technical_score (0–10):
  9–10: Demonstrated mastery with real-world tradeoffs, unprompted depth, correct edge cases.
  7–8: Solid fundamentals, minor gaps in depth or tradeoffs.
  5–6: Surface-level answers, correct but shallow.
  3–4: Significant gaps, incorrect assumptions, could not go deeper when probed.
  0–2: Fundamental misunderstandings, unable to answer basic questions for the stated experience level.

communication_score (0–10):
  Measures: structured answers (STAR/problem-solution), clarity, conciseness, absence of filler, ability to explain complex topics simply.

confidence_score (0–10):
  Measures: directness, ownership of past work, no excessive hedging, recovers well from hard follow-ups.

RETURN ONLY a valid JSON object. No preamble. No markdown. Structure:
{
  "technical_score": <int>,
  "communication_score": <int>,
  "confidence_score": <int>,
  "hire_signal": "Strong Hire | Hire | No Hire | Strong No Hire",
  "strengths": [
    "Specific observation with evidence from transcript",
    "Specific observation with evidence from transcript",
    "Specific observation with evidence from transcript"
  ],
  "weaknesses": [
    "Specific gap with evidence from transcript",
    "Specific gap with evidence from transcript",
    "Specific gap with evidence from transcript"
  ],
  "red_flags": [
    "Specific concern — or empty array if none"
  ],
  "coaching_notes": [
    "Concrete, actionable improvement for next interview",
    "Concrete, actionable improvement for next interview"
  ],
  "overall_feedback": "3–4 sentence hiring-committee-level summary. Reference actual answers. Be specific about what sets this candidate apart or holds them back.",
  "question_breakdown": [
    {"question_summary": "Short summary of Q1", "answer_quality": "Strong | Adequate | Weak", "note": "One sentence observation"}
  ]
}"""

async def evaluate_interview_session(api_key: str, history: list) -> dict:
    user = (
        "Here is the complete interview transcript. Evaluate the CANDIDATE's performance only — ignore the interviewer's style.\n\n"
        f"TRANSCRIPT:\n{json.dumps(history, indent=2)}\n\n"
        "Return the evaluation JSON now."
    )
    
    response = await call_ai(api_key, EVALUATION_SYSTEM_PROMPT, user)
    return _extract_json(response)


def _extract_json(text: str) -> dict:
    if not text or not text.strip():
        raise ValueError("AI returned an empty response.")
    
    def clean_newlines(match):
        return match.group(0).replace('\n', '\\n').replace('\r', '')
    
    cleaned_text = re.sub(r'(".*?")', clean_newlines, text, flags=re.DOTALL)
    
    start = cleaned_text.find("{")
    end = cleaned_text.rfind("}") + 1
    
    if start == -1:
        raise ValueError("AI response did not contain a valid JSON block.")
    
    json_str = cleaned_text[start:end]
    json_str = re.sub(r",\s*([\]}])", r"\1", json_str)
    
    try:
        return json.loads(json_str)
    except Exception:
        if "{" in json_str and not json_str.endswith("}"):
            json_str += "}"
        
        try:
            return json.loads(json_str)
        except Exception as e:
            raise ValueError(f"AI returned malformed data. Please try again. (Parsing Error: {str(e)})")


async def generate_skill_roadmap(api_key: str, role: str, skills: list, experience: str) -> dict:
    system = (
        "You are a Principal Engineer and Career Architect who has mentored 200+ engineers into senior roles at FAANG and top startups. "
        "You build roadmaps that actually get people hired — not generic study lists.\n\n"
        "QUALITY RULES — violating any of these makes the roadmap useless:\n"
        "1. ZERO GENERIC TERMS. Not 'Learn Python'. Instead: 'Async Python: asyncio event loop, Task scheduling, aiohttp for concurrent API calls'.\n"
        "2. REAL YOUTUBE VIDEOS: For every milestone, include 2–3 YouTube resources. "
        "   You MUST provide real YouTube video IDs (11-character strings like 'dQw4w9WgXcQ'). "
        "   Use well-known channels: Fireship, Traversy Media, TechWorld with Nana, NetworkChuck, The Primeagen, Hussein Nasser, ByteByteGo, Computerphile, MIT OpenCourseWare, freeCodeCamp. "
        "   Match the video to the exact skill. Use your training knowledge of real videos from these channels.\n"
        "3. ELITE PROJECTS: Each project must name the exact tech stack, the problem being solved, and what a recruiter will see on GitHub.\n"
        "4. LOGICAL PROGRESSION: Phase 1 must be prerequisite knowledge Phase 3 builds on.\n"
        "5. EXPERIENCE-AWARE: If experience > 3 years, skip beginner phases entirely. Start at intermediate/advanced.\n\n"
        "Return ONLY a valid JSON object. No preamble. No markdown. This structure:\n"
        "{\n"
        '  "title": "string",\n'
        '  "overview": "2 sentence strategy summary",\n'
        '  "total_duration": "e.g. 5 Months",\n'
        '  "milestones": [\n'
        '    {\n'
        '      "id": 1,\n'
        '      "title": "Phase title",\n'
        '      "duration": "e.g. 3 Weeks",\n'
        '      "why_this_phase": "1 sentence: what gap this fills and why it matters for the target role",\n'
        '      "skills_to_learn": ["Specific Skill A with context", "Specific Skill B with context"],\n'
        '      "projects": [\n'
        '        {"name": "Project title", "description": "What to build, exact stack, what a recruiter sees on GitHub", "difficulty": "Beginner|Intermediate|Advanced"}\n'
        '      ],\n'
        '      "resources": [\n'
        '        {"name": "Video title", "type": "youtube", "youtube_id": "REAL_11_CHAR_ID", "channel": "Channel name", "duration_mins": 15},\n'
        '        {"name": "Official doc or article title", "type": "article", "url": "https://real-url.com"}\n'
        '      ],\n'
        '      "status": "pending"\n'
        '    }\n'
        '  ],\n'
        '  "certifications": [\n'
        '    {"name": "Cert name", "provider": "Provider", "value": "Why this cert specifically matters for this role", "url": "https://..."}\n'
        '  ],\n'
        '  "salary_expectation": "e.g. ₹18L–₹28L (India) / $110k–$160k (US)",\n'
        '  "top_hiring_companies": ["Company A", "Company B", "Company C"]\n'
        "}"
    )
    
    skills_str = ", ".join(skills) if skills else "none specified"
    user = (
        f"Build a roadmap for: {role}\n"
        f"Current skills: {skills_str}\n"
        f"Experience: {experience}\n\n"
        "Give 5 milestones. Every YouTube video ID must be a real, known video — not fabricated. "
        "Every resource URL must be a real, working URL. No placeholders."
    )
    
    response = await call_ai(api_key, system, user)
    return _extract_json(response)


def _format_compensation_range(min_val: float, max_val: float, unit: str, decimals: int = 1) -> str:
    if unit == "LPA":
        return f"INR {min_val:.{decimals}f}L - {max_val:.{decimals}f}L / year"
    if unit == "K":
        return f"${int(min_val)}k - ${int(max_val)}k / year"
    if unit == "GBP_K":
        return f"GBP {int(min_val)}k - {int(max_val)}k / year"
    if unit == "EUR_K":
        return f"EUR {int(min_val)}k - {int(max_val)}k / year"
    if unit == "AED_K":
        return f"AED {int(min_val)}k - {int(max_val)}k / year"
    if unit == "CAD_K":
        return f"CAD {int(min_val)}k - {int(max_val)}k / year"
    if unit == "AUD_K":
        return f"AUD {int(min_val)}k - {int(max_val)}k / year"
    if unit == "PKR_L":
        return f"PKR {min_val:.1f}L - {max_val:.1f}L / year"
    return f"{min_val:.{decimals}f} - {max_val:.{decimals}f} / year"


def _estimate_salary_expectation(role: str, skills: list, experience: str, country: str) -> str:
    role_family = _infer_role_family(role, skills or [])
    experience_band = _infer_experience_band(experience)
    country_text = str(country or "").strip().lower()

    band_index = {"entry": 0, "mid": 1, "senior": 2, "lead": 3}.get(experience_band, 1)
    family_multipliers = {
        "security": 1.1,
        "design": 0.8,
        "data": 1.0,
        "frontend": 1.0,
        "backend": 1.05,
        "product": 1.15,
        "general": 0.9,
    }
    multiplier = family_multipliers.get(role_family, 0.9)

    if country_text in {"india", "in"}:
        base_ranges = [(3.5, 6.0), (6.5, 12.0), (12.0, 22.0), (22.0, 38.0)]
        low, high = base_ranges[band_index]
        return _format_compensation_range(low * multiplier, high * multiplier, "LPA")
    if country_text in {"united states", "usa", "us"}:
        base_ranges = [(60, 90), (95, 140), (140, 200), (190, 280)]
        low, high = base_ranges[band_index]
        return _format_compensation_range(low * multiplier, high * multiplier, "K")
    if country_text in {"united kingdom", "uk", "england"}:
        base_ranges = [(28, 45), (45, 70), (70, 100), (95, 140)]
        low, high = base_ranges[band_index]
        return _format_compensation_range(low * multiplier, high * multiplier, "GBP_K")
    if country_text in {"germany", "france", "netherlands", "spain", "italy", "europe", "eu"}:
        base_ranges = [(32, 50), (50, 75), (75, 110), (100, 150)]
        low, high = base_ranges[band_index]
        return _format_compensation_range(low * multiplier, high * multiplier, "EUR_K")
    if country_text in {"united arab emirates", "uae", "dubai"}:
        base_ranges = [(90, 150), (150, 240), (240, 380), (360, 550)]
        low, high = base_ranges[band_index]
        return _format_compensation_range(low * multiplier, high * multiplier, "AED_K")
    if country_text in {"canada"}:
        base_ranges = [(55, 85), (85, 125), (120, 175), (165, 240)]
        low, high = base_ranges[band_index]
        return _format_compensation_range(low * multiplier, high * multiplier, "CAD_K")
    if country_text in {"australia"}:
        base_ranges = [(60, 95), (95, 135), (135, 190), (180, 260)]
        low, high = base_ranges[band_index]
        return _format_compensation_range(low * multiplier, high * multiplier, "AUD_K")
    if country_text in {"pakistan"}:
        base_ranges = [(8, 16), (16, 30), (30, 55), (55, 90)]
        low, high = base_ranges[band_index]
        return _format_compensation_range(low * multiplier, high * multiplier, "PKR_L")

    return "Compensation varies by market, city, and specialization"


def _normalize_roadmap_payload(data: dict, role: str = "", skills: list | None = None, experience: str = "", country: str = "") -> dict:
    roadmap = dict(data or {})
    roadmap["title"] = str(roadmap.get("title") or "Personalized Career Roadmap")
    roadmap["overview"] = str(roadmap.get("overview") or "")
    roadmap["total_duration"] = str(roadmap.get("total_duration") or "Flexible timeline")
    roadmap["salary_expectation"] = str(
        _estimate_salary_expectation(role, skills or [], experience, country)
        if country
        else (roadmap.get("salary_expectation") or "Varies by market")
    )
    roadmap["top_hiring_companies"] = [str(x).strip() for x in (roadmap.get("top_hiring_companies") or []) if str(x).strip()]

    milestones = []
    for idx, item in enumerate(roadmap.get("milestones") or [], start=1):
        if not isinstance(item, dict):
            continue
        resources = []
        for resource in item.get("resources") or []:
            if not isinstance(resource, dict):
                continue
            r_type = resource.get("type")
            if r_type == "youtube":
                resources.append({
                    "name": str(resource.get("name") or "Recommended video"),
                    "type": "youtube",
                    "youtube_id": str(resource.get("youtube_id") or ""),
                    "channel": str(resource.get("channel") or "YouTube"),
                    "duration_mins": resource.get("duration_mins"),
                    "search_query": str(resource.get("search_query") or f"{resource.get('channel', '')} {resource.get('name', '')}").strip(),
                })
            elif r_type == "article":
                resources.append({
                    "name": str(resource.get("name") or "Recommended article"),
                    "type": "article",
                    "url": str(resource.get("url") or ""),
                })

        projects = []
        for project in item.get("projects") or []:
            if isinstance(project, dict):
                projects.append({
                    "name": str(project.get("name") or "Portfolio project"),
                    "description": str(project.get("description") or ""),
                    "difficulty": str(project.get("difficulty") or "Intermediate"),
                })

        milestones.append({
            "id": item.get("id") or idx,
            "title": str(item.get("title") or f"Phase {idx}"),
            "duration": str(item.get("duration") or "2-4 weeks"),
            "why_this_phase": str(item.get("why_this_phase") or ""),
            "skills_to_learn": [str(x).strip() for x in (item.get("skills_to_learn") or []) if str(x).strip()],
            "projects": projects,
            "resources": resources,
            "status": str(item.get("status") or "pending"),
        })
    roadmap["milestones"] = milestones

    certifications = []
    for cert in roadmap.get("certifications") or []:
        if not isinstance(cert, dict):
            continue
        certifications.append({
            "name": str(cert.get("name") or ""),
            "provider": str(cert.get("provider") or ""),
            "value": str(cert.get("value") or ""),
            "url": str(cert.get("url") or ""),
        })
    roadmap["certifications"] = certifications
    return roadmap


def _infer_experience_band(experience: str) -> str:
    text = str(experience or "").strip().lower()
    if any(token in text for token in ["0-2", "0 to 2", "entry", "fresher", "junior", "beginner"]):
        return "entry"
    if any(token in text for token in ["3-5", "3 to 5", "mid", "intermediate"]):
        return "mid"
    if any(token in text for token in ["6-8", "6 to 8", "senior"]):
        return "senior"
    if any(token in text for token in ["9+", "10+", "lead", "principal", "staff", "architect"]):
        return "lead"
    return "mid"


def _infer_role_family(role: str, skills: list) -> str:
    haystack = f"{role or ''} {' '.join(skills or [])}".lower()
    families = {
        "security": ["security", "soc", "siem", "incident", "threat", "blue team", "cyber"],
        "design": ["designer", "interior", "ux", "ui", "visual", "brand", "cad"],
        "data": ["data", "analyst", "analytics", "bi", "sql", "dashboard", "ml"],
        "frontend": ["frontend", "front-end", "react", "ui engineer", "web"],
        "backend": ["backend", "back-end", "api", "server", "python", "java", "node"],
        "product": ["product", "pm", "roadmap", "stakeholder", "discovery"],
    }
    for family, keywords in families.items():
        if any(keyword in haystack for keyword in keywords):
            return family
    return "general"


def _build_fallback_roadmap(role: str, skills: list, experience: str, country: str = "") -> dict:
    role_text = str(role or "your target role").strip() or "your target role"
    skill_list = [str(skill).strip() for skill in (skills or []) if str(skill).strip()]
    highlighted_skills = skill_list[:4]
    experience_band = _infer_experience_band(experience)
    role_family = _infer_role_family(role_text, skill_list)

    stage_map = {
        "entry": {
            "duration": "12-16 weeks",
            "salary": "Entry-level compensation varies by city, domain, and portfolio strength",
            "companies": ["High-growth startups", "Consulting firms", "Mid-size product companies", "Agencies"],
        },
        "mid": {
            "duration": "16-24 weeks",
            "salary": "Mid-level compensation typically improves with ownership depth and measurable outcomes",
            "companies": ["Product companies", "Enterprise teams", "Consultancies", "Scale-ups"],
        },
        "senior": {
            "duration": "20-28 weeks",
            "salary": "Senior-level compensation usually reflects scope, mentoring, and business impact",
            "companies": ["Large enterprises", "Global product teams", "Specialist consultancies", "Platform companies"],
        },
        "lead": {
            "duration": "24-32 weeks",
            "salary": "Lead-level compensation is tied to strategy, architecture, and cross-team influence",
            "companies": ["Global enterprises", "Platform leaders", "Mature scale-ups", "Transformation programs"],
        },
    }
    stage = stage_map.get(experience_band, stage_map["mid"])

    family_profiles = {
        "security": {
            "focus": ["Incident handling", "Detection engineering", "Threat analysis", "Playbook execution"],
            "projects": [
                ("Build a triage playbook", "Create a practical incident triage workflow with severity rules, escalation paths, and evidence templates."),
                ("Detection tuning lab", "Write and refine alert logic against sample logs, then document false-positive reductions."),
                ("Post-incident review pack", "Produce a concise incident report with root cause, timeline, containment, and hardening actions."),
            ],
            "articles": [
                ("MITRE ATT&CK", "https://attack.mitre.org/"),
                ("NIST Cybersecurity Framework", "https://www.nist.gov/cyberframework"),
                ("Microsoft Security Documentation", "https://learn.microsoft.com/security/"),
            ],
            "certs": [
                ("Security+ or equivalent baseline", "CompTIA", "Strong baseline for fundamentals", "https://www.comptia.org/certifications/security"),
                ("SC-200 or SIEM-focused path", "Microsoft", "Useful for security operations and incident workflows", "https://learn.microsoft.com/credentials/certifications/security-operations-analyst/"),
            ],
        },
        "design": {
            "focus": ["Spatial planning", "Design communication", "Materials and finishes", "Client presentation"],
            "projects": [
                ("Residential concept package", "Create a small-room concept with moodboard, layout options, materials, and budget notes."),
                ("Execution-ready design sheet", "Turn one concept into a practical set of drawings, measurements, and vendor-ready selections."),
                ("Portfolio case study", "Present a complete before-and-after case study with decisions, constraints, and outcomes."),
            ],
            "articles": [
                ("Autodesk Learning", "https://www.autodesk.com/learn"),
                ("ArchDaily", "https://www.archdaily.com/"),
                ("Dezeen", "https://www.dezeen.com/"),
            ],
            "certs": [
                ("AutoCAD professional path", "Autodesk", "Improves drafting credibility", "https://www.autodesk.com/certification/overview"),
                ("Sustainable interiors fundamentals", "Industry learning providers", "Useful for premium projects and modern portfolios", "https://www.usgbc.org/credentials"),
            ],
        },
        "data": {
            "focus": ["SQL fluency", "Dashboard storytelling", "Business metrics", "Data quality checks"],
            "projects": [
                ("Executive KPI dashboard", "Build a dashboard with clear business metrics, trend explanations, and action-oriented commentary."),
                ("Data cleaning notebook", "Take a messy dataset through validation, cleaning, and issue reporting."),
                ("Decision memo case study", "Use analysis to recommend one business action and defend it with data."),
            ],
            "articles": [
                ("Google Looker Studio Help", "https://support.google.com/looker-studio/"),
                ("Mode SQL Tutorial", "https://mode.com/sql-tutorial/"),
                ("Kaggle Learn", "https://www.kaggle.com/learn"),
            ],
            "certs": [
                ("Data analytics certificate", "Google or IBM", "Good market signal for structured analytics work", "https://www.coursera.org/professional-certificates/google-data-analytics"),
            ],
        },
        "frontend": {
            "focus": ["Component systems", "Accessibility", "State management", "Performance basics"],
            "projects": [
                ("Responsive product landing page", "Build a polished responsive interface with strong hierarchy and accessibility basics."),
                ("Interactive dashboard", "Create a small dashboard with filtering, loading states, and empty-state handling."),
                ("Design-system starter", "Extract reusable buttons, inputs, cards, and spacing rules into a coherent UI set."),
            ],
            "articles": [
                ("MDN Web Docs", "https://developer.mozilla.org/"),
                ("React Docs", "https://react.dev/"),
                ("web.dev", "https://web.dev/"),
            ],
            "certs": [
                ("Frontend specialization", "Meta or equivalent", "Useful if portfolio depth is still growing", "https://www.coursera.org/professional-certificates/meta-front-end-developer"),
            ],
        },
        "backend": {
            "focus": ["API design", "Data modeling", "Testing habits", "Deployment thinking"],
            "projects": [
                ("CRUD service with auth", "Build a small API with validation, persistence, and clear error handling."),
                ("Background job workflow", "Add one async or scheduled workflow and document retry behavior."),
                ("Production-readiness review", "Add logging, health checks, and a deployment checklist to an existing service."),
            ],
            "articles": [
                ("FastAPI Docs", "https://fastapi.tiangolo.com/"),
                ("Node.js Docs", "https://nodejs.org/en/docs"),
                ("PostgreSQL Docs", "https://www.postgresql.org/docs/"),
            ],
            "certs": [
                ("Cloud fundamentals", "AWS, Azure, or GCP", "Useful when backend roles expect deployment literacy", "https://aws.amazon.com/certification/certified-cloud-practitioner/"),
            ],
        },
        "product": {
            "focus": ["Problem framing", "Stakeholder alignment", "Prioritization", "Experimentation"],
            "projects": [
                ("Feature discovery brief", "Write a concise problem statement, target users, risks, and success metrics."),
                ("Prioritization exercise", "Score a backlog using one framework and explain tradeoffs clearly."),
                ("Launch retrospective", "Summarize what shipped, what moved, and what should change next."),
            ],
            "articles": [
                ("Mind the Product", "https://www.mindtheproduct.com/"),
                ("Product School", "https://productschool.com/blog"),
                ("SVPG Articles", "https://www.svpg.com/articles/"),
            ],
            "certs": [
                ("Product management certificate", "Recognized PM program", "Helpful when moving into structured product roles", "https://www.coursera.org/professional-certificates/ibm-product-manager"),
            ],
        },
        "general": {
            "focus": ["Core role fundamentals", "Project execution", "Communication", "Interview readiness"],
            "projects": [
                ("Portfolio-ready case study", "Complete one polished project that demonstrates the exact role you want."),
                ("Skill-gap sprint", "Choose one weak area and improve it through a small structured practice project."),
                ("Interview proof pack", "Prepare concise stories, work samples, and measurable outcomes for common interviews."),
            ],
            "articles": [
                ("LinkedIn Learning", "https://www.linkedin.com/learning/"),
                ("Coursera Career Academy", "https://www.coursera.org/"),
                ("Indeed Career Guide", "https://www.indeed.com/career-advice"),
            ],
            "certs": [
                ("Role-aligned foundational certification", "Relevant provider", "Useful when the market values clear proof of fundamentals", "https://www.coursera.org/"),
            ],
        },
    }
    profile = family_profiles.get(role_family, family_profiles["general"])

    focus_skills = highlighted_skills or profile["focus"][:4]
    milestone_specs = [
        {
            "title": "Build Your Core Foundation",
            "duration": "Weeks 1-3",
            "why": f"Start with the core capabilities employers expect for {role_text}, so the later projects feel grounded instead of random.",
            "skills": focus_skills[:3] or profile["focus"][:3],
            "project": profile["projects"][0],
            "video": f"{role_text} fundamentals roadmap",
        },
        {
            "title": "Turn Skills Into Repeatable Workflow",
            "duration": "Weeks 4-6",
            "why": "Shift from theory into repeatable execution by practicing the exact workflow a hiring team would expect to see.",
            "skills": (focus_skills[1:4] or profile["focus"][1:4]),
            "project": profile["projects"][1],
            "video": f"{role_text} workflow best practices",
        },
        {
            "title": "Create Proof Through Portfolio Work",
            "duration": "Weeks 7-10",
            "why": "A visible project with clear decision-making is often what makes a profile believable and interview-worthy.",
            "skills": [profile["focus"][0], profile["focus"][-1], "Documentation"],
            "project": profile["projects"][2],
            "video": f"{role_text} portfolio project walkthrough",
        },
        {
            "title": "Match the Hiring Market",
            "duration": "Weeks 11-13",
            "why": "Translate your work into recruiter-facing language, stronger applications, and role-specific interview readiness.",
            "skills": ["Resume targeting", "Interview storytelling", "Role-specific problem solving"],
            "project": ("Application asset pack", f"Prepare a targeted resume, a concise role-specific project summary, and interview stories for {role_text}."),
            "video": f"{role_text} interview preparation",
        },
    ]

    milestones = []
    for idx, spec in enumerate(milestone_specs, start=1):
        article_name, article_url = profile["articles"][(idx - 1) % len(profile["articles"])]
        project_name, project_desc = spec["project"]
        milestones.append({
            "id": idx,
            "title": spec["title"],
            "duration": spec["duration"],
            "why_this_phase": spec["why"],
            "skills_to_learn": [str(item) for item in spec["skills"] if str(item).strip()],
            "projects": [
                {
                    "name": project_name,
                    "description": project_desc,
                    "difficulty": "Beginner" if idx == 1 and experience_band == "entry" else "Intermediate",
                }
            ],
            "resources": [
                {
                    "name": f"{spec['title']} video guide",
                    "type": "youtube",
                    "youtube_id": "",
                    "channel": "YouTube search",
                    "duration_mins": 20 + idx * 5,
                    "search_query": spec["video"],
                },
                {
                    "name": article_name,
                    "type": "article",
                    "url": article_url,
                },
            ],
            "status": "pending",
        })

    certifications = [
        {
            "name": name,
            "provider": provider,
            "value": value,
            "url": url,
        }
        for name, provider, value, url in profile["certs"]
    ]

    return _normalize_roadmap_payload({
        "title": f"{role_text} Growth Roadmap",
        "overview": f"A practical roadmap for moving toward {role_text}, tailored around your current profile, {experience or 'current experience'}, and the most relevant proof-of-skill work you can show recruiters.",
        "total_duration": stage["duration"],
        "milestones": milestones,
        "certifications": certifications,
        "salary_expectation": stage["salary"],
        "top_hiring_companies": stage["companies"],
    }, role=role, skills=skills, experience=experience, country=country)


async def _repair_json_response(api_key: str, malformed_text: str, schema_hint: str) -> dict:
    system = (
        "You are a JSON repair tool. Convert the provided malformed JSON-like text into one valid JSON object only. "
        "Preserve as much information as possible. Do not add markdown or explanation."
    )
    user = (
        f"SCHEMA HINT:\n{schema_hint}\n\n"
        f"MALFORMED INPUT:\n{malformed_text[:12000]}\n\n"
        "Return only valid JSON now."
    )
    repaired = await call_ai(api_key, system, user)
    return _extract_json(repaired)


async def generate_skill_roadmap_safe(api_key: str, role: str, skills: list, experience: str, country: str = "") -> dict:
    system = (
        "You are a senior career strategist building a highly personalized learning roadmap. "
        "Your output must be valid JSON and must be tightly tailored to the user's target role, current skills, and experience level.\n\n"
        "RULES:\n"
        "1. Be concrete, not generic.\n"
        "2. Use realistic projects and hiring companies for the target role.\n"
        "3. For video resources, do NOT invent direct YouTube IDs. Use youtube_id as an empty string and include a strong search_query instead.\n"
        "4. Prefer reliable articles/docs over fragile links when uncertain.\n"
        "5. Keep every string plain and avoid quotation marks inside titles when possible.\n\n"
        "Return ONLY a valid JSON object with this structure:\n"
        "{\n"
        '  "title": "string",\n'
        '  "overview": "string",\n'
        '  "total_duration": "string",\n'
        '  "milestones": [\n'
        '    {\n'
        '      "id": 1,\n'
        '      "title": "string",\n'
        '      "duration": "string",\n'
        '      "why_this_phase": "string",\n'
        '      "skills_to_learn": ["string"],\n'
        '      "projects": [{"name": "string", "description": "string", "difficulty": "Beginner|Intermediate|Advanced"}],\n'
        '      "resources": [\n'
        '        {"name": "string", "type": "youtube", "youtube_id": "", "channel": "string", "duration_mins": 15, "search_query": "string"},\n'
        '        {"name": "string", "type": "article", "url": "https://example.com"}\n'
        '      ],\n'
        '      "status": "pending"\n'
        '    }\n'
        '  ],\n'
        '  "certifications": [{"name": "string", "provider": "string", "value": "string", "url": "https://example.com"}],\n'
        '  "salary_expectation": "string",\n'
        '  "top_hiring_companies": ["string"]\n'
        "}"
    )

    skills_str = ", ".join(skills) if skills else "none specified"
    user = (
        f"Build a roadmap for target role: {role}\n"
        f"Current skills: {skills_str}\n"
        f"Experience: {experience}\n"
        f"Country: {country or 'Default to the user market'}\n\n"
        "Make it feel clearly personalized to this profile. Return only valid JSON."
    )

    schema_hint = "Roadmap JSON with milestones, projects, resources, certifications, salary_expectation, and top_hiring_companies."
    response = ""
    try:
        response = await call_ai(api_key, system, user)
        return _normalize_roadmap_payload(_extract_json(response), role=role, skills=skills, experience=experience, country=country)
    except Exception:
        try:
            repaired = await _repair_json_response(api_key, response, schema_hint)
            return _normalize_roadmap_payload(repaired, role=role, skills=skills, experience=experience, country=country)
        except Exception:
            return _build_fallback_roadmap(role, skills, experience, country)


async def tailor_resume(api_key: str, resume_text: str, job_description: str, job_title: str, company: str, user_profile: dict, feedback: str = "") -> dict:
    safe_jd = job_description[:2500]
    safe_resume = resume_text[:3500]

    skills_raw = user_profile.get("skills", [])
    if isinstance(skills_raw, str):
        try:
            skills_list = json.loads(skills_raw)
        except Exception:
            skills_list = [s.strip() for s in skills_raw.split(",") if s.strip()]
    else:
        skills_list = skills_raw or []

    system = (
        "You are a senior ATS-optimisation specialist and resume writer with 15 years of experience placing "
        "candidates at top-tier companies. Your tailored resumes consistently score above 85% on ATS systems "
        "like Greenhouse, Lever, and Workday.\n\n"
        "TASK: Rewrite the candidate's resume to maximise ATS match for the specific job below.\n\n"
        "STRICT OUTPUT RULES:\n"
        "1. Return ONLY a single valid JSON object. No preamble, no markdown, no explanation.\n"
        "2. Every string value must be valid JSON — escape quotes, no raw newlines inside values.\n\n"
        "ATS OPTIMISATION RULES:\n"
        "1. Mirror EXACT keywords and phrases from the job description verbatim where truthful.\n"
        "2. Every experience bullet MUST start with a strong past-tense action verb "
        "   (e.g. Engineered, Automated, Reduced, Spearheaded, Deployed).\n"
        "3. Quantify every bullet where even a rough number can be inferred "
        "   (e.g. 'Managed 3 concurrent projects', 'Reduced MTTR by ~30%%').\n"
        "4. The summary must open with the candidate's seniority + exact target role title + core differentiator. "
        "   No 'I am a hardworking professional' openers.\n"
        "5. Skills must be grouped by category matching the JD's tech stack — never a flat list.\n"
        "6. Section ORDER for maximum ATS weight: summary → experience → education → projects → skills → certifications.\n"
        "7. Keep the resume to a strict 1 page: max 3 experience entries (4 bullets each), max 2 projects, "
        "   max 6 skill categories with 3-4 items each.\n"
        "8. Do NOT invent credentials, companies, or degrees not present in the original resume.\n"
        "9. If the candidate has relevant certifications, always include them — ATS systems scan for cert names.\n\n"
        "SCORING RULES for ats_score:\n"
        "- Start at 60.\n"
        "- +10 if summary contains the exact job title.\n"
        "- +10 if 5+ exact JD keywords appear in experience bullets.\n"
        "- +10 if all bullets are quantified.\n"
        "- +5 if certifications section is present.\n"
        "- +5 if skills are categorised matching JD stack.\n"
        "- Deduct 10 if resume would exceed 1 page.\n\n"
        "JSON STRUCTURE (return exactly this shape):\n"
        "{\n"
        '  "name": "string",\n'
        '  "email": "string",\n'
        '  "phone": "string",\n'
        '  "location": "string",\n'
        '  "linkedin": "string or empty string",\n'
        '  "portfolio": "string or empty string",\n'
        '  "summary": "2-3 sentence paragraph. No bullet points.",\n'
        '  "experience": [\n'
        '    {\n'
        '      "title": "Exact Job Title",\n'
        '      "company": "Company Name",\n'
        '      "start": "Month YYYY or YYYY",\n'
        '      "end": "Month YYYY or Present",\n'
        '      "location": "City, Country or Remote",\n'
        '      "bullets": [\n'
        '        "Action verb + specific task + quantified result.",\n'
        '        "Action verb + specific task + quantified result.",\n'
        '        "Action verb + specific task + quantified result.",\n'
        '        "Action verb + specific task + quantified result."\n'
        '      ]\n'
        '    }\n'
        '  ],\n'
        '  "education": [\n'
        '    {\n'
        '      "degree": "Full degree name e.g. Bachelor of Engineering",\n'
        '      "institution": "University Name",\n'
        '      "year": "YYYY",\n'
        '      "gpa": "optional string or empty string"\n'
        '    }\n'
        '  ],\n'
        '  "projects": [\n'
        '    {\n'
        '      "name": "Project Name",\n'
        '      "date": "YYYY or Month YYYY",\n'
        '      "highlights": [\n'
        '        "Built X using Y to solve Z, achieving W.",\n'
        '        "Specific technical detail or measurable outcome."\n'
        '      ]\n'
        '    }\n'
        '  ],\n'
        '  "skills": [\n'
        '    {"label": "Category matching JD stack", "details": "tool1, tool2, tool3"}\n'
        '  ],\n'
        '  "certifications": ["Cert Name — Issuer, Year"],\n'
        '  "ats_score": 85,\n'
        '  "change_summary": "Precise 2-sentence description of the top 2 changes made and why they improve ATS match."\n'
        "}"
    )

    user = (
        f"TARGET ROLE: {job_title} at {company}\n\n"
        f"JOB DESCRIPTION:\n{safe_jd}\n\n"
        f"CANDIDATE PROFILE:\n"
        f"- Years of experience: {user_profile.get('experience_years', 0)}\n"
        f"- Known skills: {', '.join(skills_list) if skills_list else 'See resume'}\n"
        f"- LinkedIn: {user_profile.get('linkedin_url', '')}\n"
        f"- Portfolio: {user_profile.get('portfolio_url', '')}\n"
        f"- About: {user_profile.get('about_me', '')}\n\n"
        f"RAW RESUME TEXT:\n{safe_resume}\n\n"
        + (
            f"SPECIFIC FEEDBACK TO APPLY (treat this as the highest priority instruction — "
            f"override your defaults if needed to honour it):\n{feedback.strip()}\n\n"
            if feedback and feedback.strip()
            else ""
        )
        + "Rewrite this resume now. Return only the JSON object."
    )

    response = await call_ai(api_key, system, user)
    return _extract_json(response)


async def tailor_resume_safe(api_key: str, resume_text: str, job_description: str, job_title: str, company: str, user_profile: dict, feedback: str = "") -> dict:
    safe_jd = job_description[:2500]
    safe_resume = resume_text[:3500]

    skills_raw = user_profile.get("skills", [])
    if isinstance(skills_raw, str):
        try:
            skills_list = json.loads(skills_raw)
        except Exception:
            skills_list = [s.strip() for s in skills_raw.split(",") if s.strip()]
    else:
        skills_list = skills_raw or []

    system = (
        "You are a senior ATS optimisation specialist and resume writer. "
        "Your job is to improve selection chances while staying strictly truthful and interview-safe.\n\n"
        "TASK: Rewrite the candidate's resume to maximise ATS match for the job below without exaggeration.\n\n"
        "STRICT OUTPUT RULES:\n"
        "1. Return ONLY one valid JSON object. No markdown, no explanation.\n"
        "2. Every string value must be valid JSON.\n\n"
        "TRUTH RULES:\n"
        "1. Never invent experience, projects, tools, certifications, domains, impact, leadership, or metrics.\n"
        "2. Never upgrade the candidate's seniority beyond what the source material supports.\n"
        "3. Respect the user's stated years of experience.\n"
        "4. If evidence is weak or missing, stay conservative.\n"
        "5. Quantify only when a number already exists in the resume, profile, or explicit feedback.\n"
        "6. If the JD asks for something the candidate does not have, do not fake it. Emphasise adjacent transferable evidence instead.\n"
        "7. The final resume must sound credible to a human interviewer.\n\n"
        "ATS RULES:\n"
        "1. Mirror exact JD keywords only where truthful.\n"
        "2. Start every experience bullet with a strong past-tense action verb.\n"
        "3. Open the summary with the candidate's actual seniority, target role title, and real differentiator.\n"
        "4. Group skills by category matching the JD stack.\n"
        "5. Keep section order: summary, experience, education, projects, skills, certifications.\n"
        "6. Keep it to one page: max 3 experience entries, max 4 bullets each, max 2 projects.\n\n"
        "JSON STRUCTURE:\n"
        "{\n"
        '  "name": "string",\n'
        '  "email": "string",\n'
        '  "phone": "string",\n'
        '  "location": "string",\n'
        '  "linkedin": "string or empty string",\n'
        '  "portfolio": "string or empty string",\n'
        '  "summary": "2-3 sentence paragraph. No bullet points.",\n'
        '  "experience": [{"title": "string", "company": "string", "start": "string", "end": "string", "location": "string", "bullets": ["string"]}],\n'
        '  "education": [{"degree": "string", "institution": "string", "year": "string", "gpa": "string or empty string"}],\n'
        '  "projects": [{"name": "string", "date": "string", "highlights": ["string", "string"]}],\n'
        '  "skills": [{"label": "string", "details": "tool1, tool2, tool3"}],\n'
        '  "certifications": ["Cert Name - Issuer, Year"],\n'
        '  "ats_score": 85,\n'
        '  "change_summary": "2 sentences describing evidence-based changes and ATS gains."\n'
        "}"
    )

    user = (
        f"TARGET ROLE: {job_title} at {company}\n\n"
        f"JOB DESCRIPTION:\n{safe_jd}\n\n"
        f"CANDIDATE PROFILE:\n"
        f"- Years of experience: {user_profile.get('experience_years', 0)}\n"
        f"- Known skills: {', '.join(skills_list) if skills_list else 'See resume'}\n"
        f"- LinkedIn: {user_profile.get('linkedin_url', '')}\n"
        f"- Portfolio: {user_profile.get('portfolio_url', '')}\n"
        f"- About: {user_profile.get('about_me', '')}\n\n"
        f"RAW RESUME TEXT:\n{safe_resume}\n\n"
        + (
            f"SPECIFIC FEEDBACK TO APPLY (highest priority if present):\n{feedback.strip()}\n\n"
            if feedback and feedback.strip()
            else ""
        )
        + "Return only the JSON object. Truthful optimisation beats inflated claims."
    )

    response = await call_ai(api_key, system, user)
    return _extract_json(response)


async def generate_email(api_key: str, user_profile: dict, job: dict) -> dict:
    system = (
        "You are an expert cold email writer. Your goal is to write a high-conversion, professional cold email "
        "that sounds human and authentic. Avoid corporate buzzwords and emojis. "
        "Return ONLY a valid JSON object with 'subject' and 'body'.\n"
        "Structure:\n"
        '{"subject": "...", "body": "..."}'
    )
    
    job_title = job.get('title', 'Position')
    company = job.get('company', 'your company')
    jd = (job.get('description', '') or "")[:1200]
    
    user_name = user_profile.get('name', 'Job Seeker')
    user_skills = ", ".join(user_profile.get('skills', []) if isinstance(user_profile.get('skills'), list) else [])
    user_exp = f"{user_profile.get('experience_years', 0)} years"
    
    about_user = []
    if user_profile.get('about_me'): about_user.append(f"About Me: {user_profile['about_me']}")
    if user_profile.get('about_work'): about_user.append(f"Work Ethic/Approach: {user_profile['about_work']}")
    if user_profile.get('about_experience'): about_user.append(f"Key Experience Highlights: {user_profile['about_experience']}")
    about_str = "\n".join(about_user)
    
    user_msg = (
        f"Write a cold email for the role: {job_title} at {company}.\n\n"
        f"Company Info/JD: {jd}\n\n"
        f"Sender Profile:\n"
        f"- Name: {user_name}\n"
        f"- Core Skills: {user_skills}\n"
        f"- Experience: {user_exp}\n"
        f"{about_str}\n\n"
        "Instructions:\n"
        "1. Mention specific skills from the profile that fit the JD.\n"
        "2. Keep it concise (under 150 words).\n"
        "3. Focus on how the sender can solve problems for the company.\n"
        "4. Seamlessly incorporate the 'About' details if they add value, but don't just dump all information. Pick the most compelling bits.\n"
        "5. End with a soft call to action."
    )
    
    response = await call_ai(api_key, system, user_msg)
    return _extract_json(response)


async def extract_job_details(api_key: str, raw_text: str) -> dict:
    safe_text = raw_text[:6000]

    system = (
        "You are an expert recruitment assistant. You will receive raw text scraped from a company career page. "
        "The text may be messy — it may contain navigation menus, footers, cookie banners, and other noise. "
        "Your job is to identify and extract ONLY the job posting information, ignoring all surrounding noise.\n\n"
        "EXTRACTION RULES:\n"
        "1. Extract the most specific job title you can find.\n"
        "2. Extract the company name. If not explicitly mentioned, infer from the domain context.\n"
        "3. Extract the location. Use 'Remote' if not specified.\n"
        "4. Extract the full job description — include responsibilities, requirements, and qualifications. "
        "   Clean it up: remove navigation text, cookie notices, and repeated headers.\n"
        "5. If multiple jobs are present on the page, extract the most prominent/first one.\n\n"
        "Return ONLY a valid JSON object. No preamble. No markdown.\n"
        "Structure:\n"
        "{\n"
        '  "title": "Exact job title",\n'
        '  "company": "Company name",\n'
        '  "location": "City, Country or Remote",\n'
        '  "description": "Full cleaned job description with requirements and responsibilities"\n'
        "}\n"
    )
    user = f"RAW TEXT FROM CAREER PAGE:\n{safe_text}"

    response = await call_ai(api_key, system, user)
    return _extract_json(response)



async def analyze_salary_market(api_key: str, role: str, location: str, experience: str) -> dict:
    system = (
        "You are a Senior Compensation Consultant at a top-tier HR research firm (like Mercer or Radford). "
        "Provide a highly realistic, localized, and data-driven salary analysis. "
        "CRITICAL: Do NOT provide generic 'bullshit' data. "
        "Adjust your figures based on the LOCATION and EXPERIENCE provided. "
        "Be granular. No placeholders like 'Benefit 1'. Use real terms (e.g. 'RSUs', 'Quarterly Performance Bonus', 'Health Insurance for Parents').\n"
        "Return ONLY a valid JSON object. No preamble.\n"
        "Structure:\n"
        "{\n"
        '  "average_range": "e.g. INR 6.5L - 9.2L",\n'
        '  "top_10_percent": "e.g. INR 15L - 18L",\n'
        '  "median": "e.g. INR 7.8L",\n'
        '  "min": "e.g. INR 4.5L",\n'
        '  "max": "e.g. INR 18L",\n'
        '  "estimated_monthly_in_hand": "e.g. INR 52,000 - 72,000",\n'
        '  "growth_projection": [20, 35, 50, 75], \n'
        '  "insights": [\n'
        '    "Market Velocity: [Specific news or trend about this role]",\n'
        '    "Skills Premium: [Name specific high-value skills and their % impact on pay]",\n'
        '    "Industry Pulse: [Current demand state in specific sectors]",\n'
        '    "Stability Score: [Score out of 10 with detailed reason]"\n'
        '  ],\n'
        '  "benefits": ["Benefit Detail 1", "Benefit Detail 2", "Benefit Detail 3"],\n'
        '  "top_industries": ["Specific Industry A", "Specific Industry B", "Specific Industry C"]\n'
        "}\n"
    )
    user = f"Provide a realistic market analysis for a {role} in {location} with {experience} years of experience."
    
    response = await call_ai(api_key, system, user)
    return _extract_json(response)
