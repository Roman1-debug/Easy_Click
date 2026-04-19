import json
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse, StreamingResponse

from backend.models import ResumeTailorRequest, ResumePdfRequest, ManualResumeRequest, ChatAssistantRequest
from backend.services import ai_service, resume_service
from backend.middleware.auth import get_current_user
from backend.database import get_db

router = APIRouter(prefix="/resume", tags=["resume"])


async def _get_api_key(db) -> str:
    async with db.execute("SELECT value FROM config WHERE key = 'openrouter_api_key'") as cur:
        row = await cur.fetchone()
    return row["value"] if row else ""


async def _get_pdf_response(version_id: int, db, force_download: bool = False):
    async with db.execute("SELECT pdf_path FROM resume_versions WHERE id = ?", (version_id,)) as cur:
        row = await cur.fetchone()

    if not row or not row["pdf_path"]:
        return {"success": False, "error": "PDF not found for this resume version"}

    pdf_path = Path(row["pdf_path"])
    if not pdf_path.exists():
        return {"success": False, "error": f"Saved PDF file is missing: {pdf_path}"}

    filename = pdf_path.name
    disposition = "attachment" if force_download else "inline"
    headers = {"Content-Disposition": f'{disposition}; filename="{filename}"'}
    return FileResponse(path=pdf_path, media_type="application/pdf", filename=filename, headers=headers)


@router.post("/tailor")
async def tailor_resume(payload: ResumeTailorRequest, user=Depends(get_current_user), db=Depends(get_db)):
    api_key = await _get_api_key(db)
    if not api_key:
        return {"success": False, "error": "OpenRouter API key not configured"}

    async with db.execute("SELECT * FROM users LIMIT 1") as cur:
        user_row = await cur.fetchone()
    if not user_row:
        return {"success": False, "error": "User profile not found."}
    user_profile = dict(user_row)
    for field in ("skills", "target_roles"):
        if isinstance(user_profile.get(field), str):
            try:
                user_profile[field] = json.loads(user_profile[field])
            except Exception:
                user_profile[field] = []

    resume_text = user_profile.get("resume_text") or ""
    if not resume_text:
        return {"success": False, "error": "No resume text in profile."}

    async with db.execute("SELECT * FROM jobs WHERE id = ?", (payload.job_id,)) as cur:
        job_row = await cur.fetchone()
    if not job_row:
        return {"success": False, "error": "Job not found"}
    job = dict(job_row)

    if not job.get("description") or len(job["description"]) < 80:
        return {"success": False, "error": "This job has no description loaded."}

    try:
        tailored_data = await ai_service.tailor_resume_safe(
            api_key=api_key,
            resume_text=resume_text,
            job_description=job.get("description", ""),
            job_title=job.get("title", ""),
            company=job.get("company", ""),
            user_profile=user_profile,
            feedback=payload.feedback or "",
        )
    except Exception as e:
        return {"success": False, "error": f"Tailoring failed: {str(e)}"}

    await db.execute(
        """INSERT INTO resume_versions (job_id, tailored_yaml, ats_score, change_summary)
           VALUES (?, ?, ?, ?)""",
        (
            payload.job_id,
            json.dumps(tailored_data),
            tailored_data.get("ats_score", 0),
            tailored_data.get("change_summary", ""),
        )
    )
    await db.commit()

    async with db.execute("SELECT last_insert_rowid() as id") as cur:
        row = await cur.fetchone()
    version_id = row["id"] if row else None

    return {
        "success": True,
        "data": {
            "resume_version_id": version_id,
            "tailored_data": tailored_data,
            "ats_score": tailored_data.get("ats_score", 0),
            "change_summary": tailored_data.get("change_summary", ""),
        }
    }


@router.post("/generate")
async def generate_pdf(payload: ResumePdfRequest, user=Depends(get_current_user), db=Depends(get_db)):
    async with db.execute("SELECT * FROM resume_versions WHERE id = ?", (payload.resume_version_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        return {"success": False, "error": "Resume version not found"}

    version = dict(row)
    try:
        yaml_content = version.get("tailored_yaml", "")
        pdf_path = await resume_service.generate_pdf_local(yaml_content, payload.template or "classic")

        await db.execute("UPDATE resume_versions SET pdf_path = ? WHERE id = ?", (pdf_path, payload.resume_version_id))
        await db.commit()
        return {"success": True, "data": {"pdf_path": pdf_path, "resume_version_id": payload.resume_version_id}}
    except AttributeError as ae:
        import sys
        mod = sys.modules.get('backend.services.resume_service') or sys.modules.get('services.resume_service')
        err_msg = f"AttributeError: {ae}. Module keys: {dir(mod) if mod else 'none'}"
        return {"success": False, "error": err_msg}
    except Exception as e:
        return {"success": False, "error": f"Top level error: {str(e)}"}


@router.post("/manual-generate")
async def manual_generate_pdf(payload: ManualResumeRequest, user=Depends(get_current_user), db=Depends(get_db)):
    if not payload.yaml_string and not payload.resume_data:
        return {"success": False, "error": "Either yaml_string or resume_data is required"}

    await db.execute(
        "INSERT INTO resume_versions (tailored_yaml, change_summary) VALUES (?, 'Manual Edition')",
        (payload.yaml_string or json.dumps(payload.resume_data or {}),)
    )
    await db.commit()
    async with db.execute("SELECT last_insert_rowid() as id") as cur:
        row = await cur.fetchone()
    version_id = row["id"] if row else None

    try:
        pdf_path = await resume_service.generate_pdf_local(payload.yaml_string or "", payload.template or "classic")
        await db.execute("UPDATE resume_versions SET pdf_path = ? WHERE id = ?", (pdf_path, version_id))
        await db.commit()
        return {"success": True, "data": {"pdf_path": pdf_path, "version_id": version_id}}
    except AttributeError as ae:
        import sys
        mod = sys.modules.get('backend.services.resume_service') or sys.modules.get('services.resume_service')
        err_msg = f"AttributeError: {ae}. Module keys: {dir(mod) if mod else 'none'}"
        return {"success": False, "error": err_msg}
    except Exception as e:
        return {"success": False, "error": f"Top level error: {str(e)}"}


@router.get("/versions/{job_id}")
async def list_versions(job_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    async with db.execute(
        "SELECT id, job_id, ats_score, change_summary, pdf_path, created_at FROM resume_versions WHERE job_id = ? ORDER BY created_at DESC",
        (job_id,)
    ) as cur:
        rows = await cur.fetchall()
    return {"success": True, "data": {"versions": [dict(r) for r in rows]}}


@router.get("/download/{version_id}")
async def download_pdf(version_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    return await _get_pdf_response(version_id, db, force_download=False)


@router.get("/download-forced/{version_id}")
async def download_pdf_forced(version_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    return await _get_pdf_response(version_id, db, force_download=True)


@router.post("/chat/stream")
async def chat_assistant_stream(payload: ChatAssistantRequest, user=Depends(get_current_user), db=Depends(get_db)):
    api_key = await _get_api_key(db)

    if not api_key:
        async def err():
            yield 'data: ' + json.dumps({"error": "API Key not configured."}) + "\n\n"
        return StreamingResponse(err(), media_type="text/event-stream")

    system_prompt = """You are an expert resume coach and RenderCV (v2.3) specialist.
    The user is editing a YAML resume.
    Provide only the updated YAML.
    """

    user_msg_parts = [f"USER MESSAGE: {payload.message}\n"]
    if payload.attachment:
        user_msg_parts.append("[Attachment ignored to save tokens]")
    user_msg_parts.append(f"CURRENT RESUME YAML:\n{payload.current_yaml[:3000]}")
    user_msg = "\n".join(user_msg_parts)

    async def event_generator():
        try:
            async for chunk in ai_service.stream_ai(api_key, system_prompt, user_msg):
                yield f"data: {json.dumps({'content': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
