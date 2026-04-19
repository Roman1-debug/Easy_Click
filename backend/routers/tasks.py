"""
Tasks router — simplified for local use.
No task queue needed; jobs run synchronously or are tracked in memory.
"""
from fastapi import APIRouter, Depends
try:
    from backend.middleware.auth import get_current_user
except ImportError:
    from middleware.auth import get_current_user

router = APIRouter(prefix="/tasks", tags=["tasks"])


async def _ping_worker():
    """No-op for local mode — no remote worker needed."""
    pass


@router.get("/{task_id}")
async def get_task(task_id: str, user=Depends(get_current_user)):
    # Local mode: tasks complete synchronously, no queue needed
    return {
        "id": task_id,
        "status": "done",
        "task_type": "local",
        "result": None,
        "error": None,
        "created_at": None,
        "updated_at": None,
    }


@router.get("")
async def list_tasks(user=Depends(get_current_user)):
    return {"success": True, "data": []}
