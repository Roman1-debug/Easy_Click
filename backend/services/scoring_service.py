import json
import re


ROLE_WEIGHT = 30
SKILL_WEIGHT = 30
LOCATION_WEIGHT = 20
EXPERIENCE_WEIGHT = 20

FRESHER_KEYWORDS = ["fresher", "entry level", "0-1", "0 to 1", "graduate", "trainee", "intern"]
SENIOR_KEYWORDS = ["senior", "lead", "manager", "principal", "head of", "director"]


def _token_overlap(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    tokens_a = set(re.sub(r"[^\w\s]", "", a.lower()).split())
    tokens_b = set(re.sub(r"[^\w\s]", "", b.lower()).split())
    if not tokens_a or not tokens_b:
        return 0.0
    return len(tokens_a & tokens_b) / max(len(tokens_a), len(tokens_b))


def _role_score(job_title: str, target_roles: list[str]) -> tuple[int, str]:
    if not target_roles:
        return 15, "no target roles set"

    job_title_lower = job_title.lower()
    best_overlap = 0.0
    direct_match = False

    for role in target_roles:
        r_lower = role.lower()
        if r_lower in job_title_lower or job_title_lower in r_lower:
            direct_match = True
            break
        overlap = _token_overlap(job_title, role)
        if overlap > best_overlap:
            best_overlap = overlap

    if direct_match or best_overlap >= 0.7:
        return ROLE_WEIGHT, "strong role match"
    if best_overlap >= 0.4:
        return int(ROLE_WEIGHT * 0.7), "partial role match"
    if best_overlap >= 0.2:
        return int(ROLE_WEIGHT * 0.4), "weak role match"
    return 0, "role mismatch"


def _skill_score(job_description: str, user_skills: list[str]) -> tuple[int, str]:
    if not user_skills or not job_description:
        return int(SKILL_WEIGHT * 0.5), "no skill data available"

    desc_lower = job_description.lower()
    matched = []
    for skill in user_skills:
        s_lower = skill.lower()
        # Handle skills that might have spaces or special chars
        pattern = r"\b" + re.escape(s_lower) + r"\b"
        if re.search(pattern, desc_lower) or s_lower in desc_lower:
            matched.append(skill)
            
    ratio = len(matched) / len(user_skills)

    if ratio >= 0.7:
        return SKILL_WEIGHT, f"matched {len(matched)}/{len(user_skills)} skills"
    if ratio >= 0.4:
        return int(SKILL_WEIGHT * 0.7), f"matched {len(matched)}/{len(user_skills)} skills"
    if ratio >= 0.2:
        return int(SKILL_WEIGHT * 0.4), f"matched {len(matched)}/{len(user_skills)} skills"
    return 0, "skills not found in description"


def _location_score(job_location: str, preferred_location: str) -> tuple[int, str]:
    if not preferred_location:
        return int(LOCATION_WEIGHT * 0.5), "no preferred location set"

    job_loc_lower = job_location.lower()
    pref_lower = preferred_location.lower()

    if "remote" in job_loc_lower or "work from home" in job_loc_lower:
        return LOCATION_WEIGHT, "remote position"
    
    # 1. Exact Match Check (Highest Priority)
    if pref_lower == job_loc_lower:
        return LOCATION_WEIGHT, "exact location match"
        
    # 2. Strict Sub-region Handling
    # If user wants "Mumbai", but job is "Navi Mumbai", it's NOT a perfect match.
    # We check if the pref_lower is a whole word in the job_loc
    pattern = r"\b" + re.escape(pref_lower) + r"\b"
    if re.search(pattern, job_loc_lower):
        # It contains the city name. Now check for prefixes like "Navi", "Greater", "North", etc.
        # If the job location has MORE words than the preferred location, it might be a sub-region.
        job_tokens = set(re.sub(r"[^\w\s]", "", job_loc_lower).split())
        pref_tokens = set(re.sub(r"[^\w\s]", "", pref_lower).split())
        
        # If they are exactly the same tokens, it's a match
        if job_tokens == pref_tokens:
            return LOCATION_WEIGHT, "location match"
            
        # If job has extra words like "navi", "greater", "new", etc.
        extra_words = job_tokens - pref_tokens
        if any(w in extra_words for w in ["navi", "greater", "new", "outer", "north", "south", "west", "east"]):
            return int(LOCATION_WEIGHT * 0.3), f"near {preferred_location} (sub-region)"
            
        return int(LOCATION_WEIGHT * 0.8), "location match"
        
    return 0, "location mismatch"


def _experience_score(job_title: str, job_description: str, user_exp: int) -> tuple[int, str]:
    combined = f"{job_title} {job_description}".lower()
    
    # 1. Check for senior keywords vs fresher user
    is_senior_role = any(kw in combined for kw in SENIOR_KEYWORDS)
    if is_senior_role and user_exp < 3:
        return -20, "seniority mismatch (role requires more experience)"
        
    # 2. Extract years of experience with improved regex
    # Handles: "3-5 years", "3 to 5 years", "5+ years", "5 years"
    exp_patterns = [
        r"(\d+)\s*(?:-|–|to)\s*(\d+)\s*years?",
        r"(\d+)\+\s*years?",
        r"experience\s*(?:of|required|:)?\s*(\d+)\s*years?"
    ]
    
    min_required = 0
    found = False
    
    for pattern in exp_patterns:
        match = re.search(pattern, combined)
        if match:
            try:
                min_required = int(match.group(1))
                found = True
                break
            except (ValueError, IndexError):
                continue

    if found:
        if user_exp >= min_required:
            return EXPERIENCE_WEIGHT, f"experience match ({min_required} years req.)"
        else:
            # Huge penalty for being under-qualified
            gap = min_required - user_exp
            penalty = -10 * gap
            return max(-40, penalty), f"seniority gap (job reqs {min_required}y, you have {user_exp}y)"

    # 3. Check for fresher keywords
    if any(kw in combined for kw in FRESHER_KEYWORDS):
        if user_exp <= 2:
            return EXPERIENCE_WEIGHT, "fresher-friendly"
        return int(EXPERIENCE_WEIGHT * 0.5), "entry-level role (possible over-qualification)"

    # If no years mentioned, assume it's okay unless it's a senior role
    if is_senior_role:
        return 0, "no year data, but role looks senior"
        
    return int(EXPERIENCE_WEIGHT * 0.5), "experience requirement unspecified"


def _safe_list(value) -> list:
    """Return value as a list whether it's already a list or a JSON string."""
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []


def score_job(job: dict, user_profile: dict) -> dict:
    target_roles = _safe_list(user_profile.get("target_roles") or [])
    skills = _safe_list(user_profile.get("skills") or [])
    preferred_location = user_profile.get("preferred_location", "") or ""
    user_exp = int(user_profile.get("experience_years", 0) or 0)

    role_pts, role_reason = _role_score(job.get("title", ""), target_roles)
    skill_pts, skill_reason = _skill_score(job.get("description", ""), skills)
    loc_pts, loc_reason = _location_score(job.get("location", ""), preferred_location)
    exp_pts, exp_reason = _experience_score(job.get("title", ""), job.get("description", ""), user_exp)

    total = role_pts + skill_pts + loc_pts + exp_pts
    # Clamp score between 0 and 100
    total = max(0, min(100, total))
    
    # 1. Clean and normalize parts
    role_txt = role_reason
    if "strong role match" in role_reason.lower() and target_roles:
        role_txt = f"Fits your '{target_roles[0]}' target"
    elif "partial" in role_reason.lower() and target_roles:
        role_txt = f"Similar to {target_roles[0]}"
        
    loc_txt = loc_reason
    if "location match" in loc_reason.lower() and preferred_location:
         loc_txt = f"In {preferred_location}"
    elif "remote" in loc_reason.lower():
         loc_txt = "Remote Friendly"

    # 2. Build a concise, personalized summary
    reasons = [role_txt.capitalize()]
    
    if "match" in loc_txt.lower() or "remote" in loc_txt.lower():
        reasons.append(loc_txt.capitalize())
        
    if "match" in exp_reason.lower() or "fresher" in exp_reason.lower():
        reasons.append(exp_reason.capitalize())
    elif "mismatch" in exp_reason.lower():
        reasons.append("Seniority gap")

    if "matched" in skill_reason.lower():
        reasons.append(skill_reason.capitalize())
    
    # Final cleanup: Join with separator, fallback if too short
    if len(reasons) < 2:
        reason_str = f"{role_txt.capitalize()} • {loc_reason.capitalize()} • {exp_reason.capitalize()}"
    else:
        reason_str = " | ".join(reasons)

    return {"score": total, "reason": reason_str}
