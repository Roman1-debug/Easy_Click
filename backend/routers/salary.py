from fastapi import APIRouter, Depends
try:
    from backend.models import SalarySearchRequest
except ImportError:
    from models import SalarySearchRequest
try:
    from backend.services.ai_service import analyze_salary_market
except ImportError:
    from services.ai_service import analyze_salary_market
try:
    from backend.middleware.auth import get_current_user
except ImportError:
    from middleware.auth import get_current_user
try:
    from backend.database import get_db
except ImportError:
    from database import get_db

router = APIRouter(prefix="/salary", tags=["salary"])


def _ensure_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        parts = [item.strip(" -•\t") for item in value.replace("\r", "\n").replace(";", "\n").split("\n")]
        if len(parts) == 1 and "," in value:
            parts = [item.strip(" -•\t") for item in value.split(",")]
        return [item for item in parts if item]
    if isinstance(value, dict):
        return [str(item).strip() for item in value.values() if str(item).strip()]
    return []


def _ensure_number_list(value):
    if isinstance(value, list):
        numbers = []
        for item in value:
            try:
                numbers.append(int(float(item)))
            except Exception:
                continue
        return numbers
    if isinstance(value, str):
        raw_parts = value.replace("[", "").replace("]", "").split(",")
        numbers = []
        for item in raw_parts:
            try:
                numbers.append(int(float(item.strip())))
            except Exception:
                continue
        return numbers
    return []


def _normalize_salary_payload(data: dict) -> dict:
    normalized = dict(data or {})
    normalized["insights"] = _ensure_list(normalized.get("insights"))
    normalized["benefits"] = _ensure_list(normalized.get("benefits"))
    normalized["top_industries"] = _ensure_list(normalized.get("top_industries"))
    normalized["growth_projection"] = _ensure_number_list(normalized.get("growth_projection"))
    return normalized


@router.post("/analyze")
async def search_salary(payload: SalarySearchRequest, user=Depends(get_current_user), db=Depends(get_db)):
    async with db.execute("SELECT value FROM config WHERE key = 'openrouter_api_key'") as cur:
        row = await cur.fetchone()
    if not row or not row["value"]:
        return {"success": False, "error": "API Key not configured."}
    api_key = row["value"]
    try:
        data = await analyze_salary_market(api_key, payload.role, payload.location, payload.experience)
        return {"success": True, "data": _normalize_salary_payload(data)}
    except Exception as e:
        return {"success": False, "error": str(e)}
