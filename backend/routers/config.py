from fastapi import APIRouter, Depends, Request
try:
    from backend.models import ConfigUpdateRequest
except ImportError:
    from models import ConfigUpdateRequest
try:
    from backend.middleware.auth import get_current_user
except ImportError:
    from middleware.auth import get_current_user
try:
    from backend.database import get_db
except ImportError:
    from database import get_db

router = APIRouter(prefix="/config", tags=["config"])

ALLOWED_KEYS = {"openrouter_api_key", "gmail_address", "gmail_app_password", "email_address", "email_app_password"}


@router.get("")
async def get_config(user=Depends(get_current_user), db=Depends(get_db)):
    async with db.execute("SELECT key, value FROM config") as cur:
        rows = await cur.fetchall()

    data = {
        "openrouter_api_key": "",
        "gmail_address": "",
        "gmail_app_password": "",
        "email_address": "",
        "email_app_password": "",
        "openrouter_api_key_set": False,
        "gmail_address_set": False,
        "gmail_app_password_set": False,
        "email_address_set": False,
        "email_app_password_set": False,
    }
    for row in rows:
        data[row["key"]] = row["value"]

    # Set _set flags
    for key in list(ALLOWED_KEYS):
        data[f"{key}_set"] = bool(data.get(key, "").strip())

    return {"success": True, "data": data}


@router.post("")
async def update_config(request: Request, user=Depends(get_current_user), db=Depends(get_db)):
    """Accepts either { key, value } (frontend setConfig) or { openrouter_api_key, gmail_address, ... }"""
    body = await request.json()

    updates = {}

    # Format 1: { key, value } — from api.setConfig(key, val)
    if "key" in body and "value" in body:
        k = body["key"]
        v = body["value"]
        if k in ALLOWED_KEYS:
            updates[k] = v

    # Format 2: named fields { openrouter_api_key, gmail_address, ... }
    else:
        for k in ALLOWED_KEYS:
            if k in body and body[k] is not None:
                updates[k] = body[k]

    if not updates:
        return {"success": False, "error": "No valid config keys provided"}

    for key, value in updates.items():
        await db.execute(
            "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value)
        )
    await db.commit()
    return {"success": True, "data": {"message": "Configuration updated successfully"}}


@router.delete("/{key}")
async def delete_config(key: str, user=Depends(get_current_user), db=Depends(get_db)):
    await db.execute("DELETE FROM config WHERE key = ?", (key,))
    await db.commit()
    return {"success": True, "data": {"message": f"Key '{key}' deleted"}}
