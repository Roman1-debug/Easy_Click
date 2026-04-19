from typing import Optional
from fastapi import APIRouter, Depends
try:
    from backend.models import ApplicationUpdateRequest
except ImportError:
    from models import ApplicationUpdateRequest
try:
    from backend.middleware.auth import get_current_user
except ImportError:
    from middleware.auth import get_current_user
try:
    from backend.database import get_db
except ImportError:
    from database import get_db

router = APIRouter(prefix="/applications", tags=["applications"])


@router.get("")
async def get_applications(user=Depends(get_current_user), db=Depends(get_db)):
    async with db.execute(
        """SELECT a.*, j.title as role, j.company, j.location, j.apply_link
           FROM applications a
           LEFT JOIN jobs j ON a.job_id = j.id
           ORDER BY a.applied_at DESC"""
    ) as cur:
        rows = await cur.fetchall()
    apps = [dict(r) for r in rows]
    return {"success": True, "data": {"applications": apps}, "error": None}


@router.get("/stats")
async def get_stats(user=Depends(get_current_user), db=Depends(get_db)):
    async with db.execute("SELECT COUNT(*) as total_jobs FROM jobs") as cur:
        jobs_row = await cur.fetchone()
    async with db.execute("SELECT COUNT(*) as total_applications FROM applications") as cur:
        apps_row = await cur.fetchone()
    async with db.execute("SELECT COUNT(*) as sent FROM sent_emails") as cur:
        emails_row = await cur.fetchone()
    return {
        "success": True,
        "data": {
            "total_jobs": jobs_row["total_jobs"] if jobs_row else 0,
            "total_applications": apps_row["total_applications"] if apps_row else 0,
            "sent": emails_row["sent"] if emails_row else 0,
        }
    }


@router.patch("/{app_id}")
async def update_application(app_id: str, payload: ApplicationUpdateRequest, user=Depends(get_current_user), db=Depends(get_db)):
    update_data = {"status": payload.status}
    if payload.notes is not None:
        update_data["notes"] = payload.notes
    sets = ", ".join(f"{k} = ?" for k in update_data)
    vals = list(update_data.values()) + [app_id]
    await db.execute(f"UPDATE applications SET {sets} WHERE id = ?", vals)
    await db.commit()
    return {"success": True, "data": {"message": "Updated successfully"}, "error": None}


@router.delete("/{app_id}")
async def delete_application(app_id: str, user=Depends(get_current_user), db=Depends(get_db)):
    await db.execute("DELETE FROM applications WHERE id = ?", (app_id,))
    await db.commit()
    return {"success": True, "data": {"message": "Deleted successfully"}, "error": None}
