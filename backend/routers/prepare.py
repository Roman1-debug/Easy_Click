import json
from fastapi import APIRouter, Depends
try:
    from backend.models import MockInterviewRequest, InterviewAnswerRequest, InterviewEvaluationRequest, RoadmapRequest
except ImportError:
    from models import MockInterviewRequest, InterviewAnswerRequest, InterviewEvaluationRequest, RoadmapRequest
try:
    from backend.services.ai_service import generate_interview_question, evaluate_interview_session, generate_skill_roadmap_safe
except ImportError:
    from services.ai_service import generate_interview_question, evaluate_interview_session, generate_skill_roadmap_safe
try:
    from backend.middleware.auth import get_current_user
except ImportError:
    from middleware.auth import get_current_user
try:
    from backend.database import get_db
except ImportError:
    from database import get_db

router = APIRouter(prefix="/prepare", tags=["prepare"])


async def _get_api_key(db) -> str:
    async with db.execute("SELECT value FROM config WHERE key = 'openrouter_api_key'") as cur:
        row = await cur.fetchone()
    return row["value"] if row else ""


@router.post("/mock/start")
async def start_interview(payload: MockInterviewRequest, user=Depends(get_current_user), db=Depends(get_db)):
    api_key = await _get_api_key(db)
    if not api_key:
        return {"success": False, "error": "API Key not found. Add it in Settings."}
    try:
        question = await generate_interview_question(
            api_key=api_key,
            role=payload.role,
            experience=payload.experience,
            focus=payload.focus,
            history=[],
            jd=payload.jd
        )
        return {"success": True, "data": {"question": question}}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/mock/answer")
async def submit_answer(payload: InterviewAnswerRequest, user=Depends(get_current_user), db=Depends(get_db)):
    api_key = await _get_api_key(db)
    if not api_key:
        return {"success": False, "error": "API Key not found. Add it in Settings."}
    try:
        next_question = await generate_interview_question(
            api_key=api_key,
            role=payload.role,
            experience=payload.experience,
            focus=payload.focus,
            history=payload.history,
            jd=payload.jd if hasattr(payload, "jd") else ""
        )
        return {"success": True, "data": {"question": next_question}}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/mock/evaluate")
async def evaluate_interview(payload: InterviewEvaluationRequest, user=Depends(get_current_user), db=Depends(get_db)):
    api_key = await _get_api_key(db)
    if not api_key:
        return {"success": False, "error": "API Key not found. Add it in Settings."}
    try:
        scorecard = await evaluate_interview_session(api_key, payload.history)
        return {"success": True, "data": scorecard}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/mock/save")
async def save_session(payload: dict, user=Depends(get_current_user), db=Depends(get_db)):
    try:
        role = payload.get("role", "")
        focus = payload.get("focus", "")
        experience = payload.get("experience", "")
        history = json.dumps(payload.get("history", []))
        scorecard = json.dumps(payload.get("scorecard", {}))

        await db.execute(
            "INSERT INTO interview_sessions (role, focus, experience, history, scorecard) VALUES (?, ?, ?, ?, ?)",
            (role, focus, experience, history, scorecard)
        )
        await db.commit()
        return {"success": True, "data": {"saved": True}}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/mock/sessions")
async def list_sessions(user=Depends(get_current_user), db=Depends(get_db)):
    try:
        async with db.execute(
            "SELECT id, role, focus, experience, scorecard, created_at FROM interview_sessions ORDER BY created_at DESC LIMIT 20"
        ) as cur:
            rows = await cur.fetchall()
        sessions = []
        for r in rows:
            s = dict(r)
            if isinstance(s.get("scorecard"), str):
                try:
                    s["scorecard"] = json.loads(s["scorecard"])
                except Exception:
                    pass
            sessions.append(s)
        return {"success": True, "data": sessions}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/mock/sessions/{session_id}")
async def get_session(session_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    try:
        async with db.execute("SELECT * FROM interview_sessions WHERE id = ?", (session_id,)) as cur:
            row = await cur.fetchone()
        if not row:
            return {"success": False, "error": "Session not found."}
        s = dict(row)
        for field in ("history", "scorecard"):
            if isinstance(s.get(field), str):
                try:
                    s[field] = json.loads(s[field])
                except Exception:
                    pass
        return {"success": True, "data": s}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/roadmap/generate")
async def get_roadmap(payload: RoadmapRequest, user=Depends(get_current_user), db=Depends(get_db)):
    api_key = await _get_api_key(db)
    if not api_key:
        return {"success": False, "error": "API Key not found. Add it in Settings."}
    try:
        roadmap = await generate_skill_roadmap_safe(
            api_key=api_key,
            role=payload.target_role,
            skills=payload.current_skills,
            experience=payload.experience,
            country=payload.country or "India",
        )
        return {"success": True, "data": roadmap}
    except Exception as e:
        return {"success": False, "error": str(e)}
