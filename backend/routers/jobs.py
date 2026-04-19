import json
import hashlib
import asyncio
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

try:
    from backend.models import JobSearchRequest, JobScoreRequest, JobExtractRequest
except ImportError:
    from models import JobSearchRequest, JobScoreRequest, JobExtractRequest
try:
    from backend.services.scoring_service import score_job
except ImportError:
    from services.scoring_service import score_job
try:
    from backend.services.query_expansion import expand_role, expand_location
except ImportError:
    from services.query_expansion import expand_role, expand_location
try:
    from backend.middleware.auth import get_current_user
except ImportError:
    from middleware.auth import get_current_user
try:
    from backend.database import get_db
except ImportError:
    from database import get_db
try:
    from backend.services.scraper_service import scrape_jobs, fetch_job_description
except ImportError:
    from services.scraper_service import scrape_jobs, fetch_job_description

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _hash_job(title: str, company: str, location: str) -> str:
    def normalize(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()

    raw = f"{normalize(title)}|{normalize(company)}|{normalize(location)}"
    return hashlib.md5(raw.encode()).hexdigest()


@router.post("/search")
async def search_jobs(payload: JobSearchRequest, user=Depends(get_current_user), db=Depends(get_db)):
    """Run a job search and store results in SQLite."""
    try:
        # Get user profile for scoring
        async with db.execute("SELECT * FROM users LIMIT 1") as cur:
            user_row = await cur.fetchone()
        user_profile = dict(user_row) if user_row else {}
        for field in ("skills", "target_roles"):
            if isinstance(user_profile.get(field), str):
                try:
                    user_profile[field] = json.loads(user_profile[field])
                except Exception:
                    user_profile[field] = []

        try:
            from backend.services.query_expansion import expand_role, expand_location
        except ImportError:
            from services.query_expansion import expand_role, expand_location

        expanded_roles = expand_role(payload.role)
        expanded_locations = expand_location(payload.location)

        jobs = await scrape_jobs(
            role=payload.role,
            location=payload.location,
            expanded_roles=expanded_roles,
            expanded_locations=expanded_locations,
            page=payload.page or 1,
        )

        search_query = f"{payload.role} {payload.location}".strip()
        for job in jobs:
            h = _hash_job(job.get("title", ""), job.get("company", ""), job.get("location", ""))
            score_res = score_job(job, user_profile) if user_profile else {"score": 0, "reason": ""}
            try:
                await db.execute(
                    """INSERT INTO jobs
                       (hash, title, company, location, description, apply_link, source, search_query, score, score_reason, hr_email, salary, experience, posted_date)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(hash) DO UPDATE SET
                           title = excluded.title,
                           company = excluded.company,
                           location = excluded.location,
                           description = CASE WHEN excluded.description != '' THEN excluded.description ELSE jobs.description END,
                           apply_link = CASE WHEN excluded.apply_link != '' THEN excluded.apply_link ELSE jobs.apply_link END,
                           source = excluded.source,
                           search_query = excluded.search_query,
                           score = excluded.score,
                           score_reason = excluded.score_reason,
                           hr_email = CASE WHEN excluded.hr_email != '' THEN excluded.hr_email ELSE jobs.hr_email END,
                           salary = CASE WHEN excluded.salary != '' THEN excluded.salary ELSE jobs.salary END,
                           experience = CASE WHEN excluded.experience != '' THEN excluded.experience ELSE jobs.experience END,
                           posted_date = CASE WHEN excluded.posted_date != '' THEN excluded.posted_date ELSE jobs.posted_date END""",
                    (
                        h,
                        job.get("title", ""),
                        job.get("company", ""),
                        job.get("location", ""),
                        job.get("description", ""),
                        job.get("apply_link", ""),
                        job.get("source", ""),
                        search_query,
                        score_res["score"],
                        score_res["reason"],
                        job.get("hr_email", ""),
                        job.get("salary", ""),
                        job.get("experience", ""),
                        job.get("posted_date", ""),
                    )
                )
            except Exception as e:
                print(f"[jobs] Insert error: {e}")
        await db.commit()

        offset = max((payload.page or 1) - 1, 0) * (payload.max_results or 50)
        async with db.execute(
            """SELECT * FROM jobs
               WHERE search_query = ? AND COALESCE(is_saved, 0) = 0
               ORDER BY score DESC, id DESC
               LIMIT ? OFFSET ?""",
            (search_query, payload.max_results or 50, offset)
        ) as cur:
            rows = await cur.fetchall()
        result_jobs = [dict(r) for r in rows]
        return {"success": True, "data": {"jobs": result_jobs, "total": len(result_jobs)}}

    except Exception as e:
        return {"success": False, "error": str(e), "data": {"jobs": [], "total": 0}}


@router.post("/extract")
async def extract_job(payload: JobExtractRequest, user=Depends(get_current_user), db=Depends(get_db)):
    """Extract a single job from a URL and store it."""
    try:
        job = await fetch_job_description(payload.url, "direct", payload.keywords or "")
        if not job or not job.get("description"):
            return {"success": False, "error": "Could not extract job from URL"}

        h = _hash_job(job.get("title", ""), job.get("company", ""), job.get("location", ""))
        await db.execute(
            """INSERT OR REPLACE INTO jobs
               (hash, title, company, location, description, apply_link, source, search_query, score, score_reason, hr_email, salary, experience)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                h, job.get("title", ""), job.get("company", ""), job.get("location", ""),
                job.get("description", ""), payload.url, "direct", payload.keywords or "",
                0, "", job.get("hr_email", ""), job.get("salary", ""), job.get("experience", ""),
            )
        )
        await db.commit()
        async with db.execute("SELECT * FROM jobs WHERE hash = ?", (h,)) as cur:
            row = await cur.fetchone()
        saved = dict(row) if row else job
        return {"success": True, "data": {"job": saved, "score": saved.get("score", 0), "reason": saved.get("score_reason", "")}}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/score")
async def score_jobs(payload: JobScoreRequest, user=Depends(get_current_user), db=Depends(get_db)):
    async with db.execute("SELECT * FROM users LIMIT 1") as cur:
        user_row = await cur.fetchone()
    if not user_row:
        return {"success": False, "error": "No user profile found."}
    user_profile = dict(user_row)
    for field in ("skills", "target_roles"):
        if isinstance(user_profile.get(field), str):
            try:
                user_profile[field] = json.loads(user_profile[field])
            except Exception:
                user_profile[field] = []

    scored = []
    for job_id in payload.job_ids:
        async with db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)) as cur:
            job_row = await cur.fetchone()
        if not job_row:
            continue
        job = dict(job_row)
        result = score_job(job, user_profile)
        await db.execute(
            "UPDATE jobs SET score = ?, score_reason = ? WHERE id = ?",
            (result["score"], result["reason"], job_id)
        )
        scored.append({"id": job_id, **result})
    await db.commit()
    return {"success": True, "data": {"scored": scored}}


@router.post("/{job_id}/save")
async def toggle_save(job_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    async with db.execute("SELECT is_saved FROM jobs WHERE id = ?", (job_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        return {"success": False, "error": "Job not found"}
    new_state = 0 if row["is_saved"] else 1
    await db.execute("UPDATE jobs SET is_saved = ? WHERE id = ?", (new_state, job_id))
    await db.commit()
    return {"success": True, "data": {"is_saved": bool(new_state)}}


@router.post("/{job_id}/refresh")
async def refresh_job(job_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    async with db.execute("SELECT apply_link, source FROM jobs WHERE id = ?", (job_id,)) as cur:
        row = await cur.fetchone()
    if not row or not row["apply_link"]:
        return {"success": False, "error": "Job not found"}
    try:
        job = await fetch_job_description(row["apply_link"], row["source"] or "direct", "")
        if job and job.get("description"):
            await db.execute(
                "UPDATE jobs SET description = ?, hr_email = ?, salary = ?, experience = ? WHERE id = ?",
                (job.get("description", ""), job.get("hr_email", ""), job.get("salary", ""), job.get("experience", ""), job_id)
            )
            await db.commit()
    except Exception as e:
        print(f"[refresh] error: {e}")
    async with db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)) as cur:
        refreshed = await cur.fetchone()
    return {"success": True, "data": dict(refreshed) if refreshed else {"message": "Refreshed"}}


@router.get("")
async def list_jobs(
    limit: int = 50,
    min_score: int = 0,
    remote_only: bool = False,
    saved_only: bool = False,
    exclude_saved: bool = False,
    role: Optional[str] = None,
    location: Optional[str] = None,
    search_query: Optional[str] = None,
    q: Optional[str] = None,
    source: Optional[str] = None,
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    conditions = ["score >= ?"]
    params: list = [min_score]

    if saved_only:
        conditions.append("is_saved = 1")
    elif exclude_saved:
        conditions.append("COALESCE(is_saved, 0) = 0")
    if remote_only:
        conditions.append("LOWER(location) LIKE '%remote%'")
    if source:
        conditions.append("source = ?")
        params.append(source)
    if search_query and search_query.strip():
        conditions.append("LOWER(search_query) = ?")
        params.append(search_query.strip().lower())
    if role and role.strip():
        conditions.append("LOWER(title) LIKE ?")
        params.append(f"%{role.lower()}%")
    if location and location.strip().lower() not in ("remote", ""):
        conditions.append("LOWER(location) LIKE ?")
        params.append(f"%{location.lower()}%")
    if q and q.strip():
        conditions.append("(LOWER(title) LIKE ? OR LOWER(company) LIKE ?)")
        params.extend([f"%{q.lower()}%", f"%{q.lower()}%"])

    where = " AND ".join(conditions)
    params.append(limit)

    async with db.execute(f"SELECT * FROM jobs WHERE {where} ORDER BY score DESC LIMIT ?", params) as cur:
        rows = await cur.fetchall()

    jobs = [dict(r) for r in rows]
    return {"success": True, "data": {"jobs": jobs, "total": len(jobs)}}


@router.get("/{job_id}")
async def get_job(job_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    async with db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        return {"success": False, "error": "Job not found"}
    return {"success": True, "data": dict(row)}
