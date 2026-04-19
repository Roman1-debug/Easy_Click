import json
from fastapi import APIRouter, Depends
try:
    from backend.models import UserProfileRequest
except ImportError:
    from models import UserProfileRequest
try:
    from backend.middleware.auth import get_current_user
except ImportError:
    from middleware.auth import get_current_user
try:
    from backend.database import get_db
except ImportError:
    from database import get_db

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("")
async def get_profile(user=Depends(get_current_user), db=Depends(get_db)):
    async with db.execute("SELECT * FROM users LIMIT 1") as cur:
        row = await cur.fetchone()
    if not row:
        # Create a default empty profile on first run
        await db.execute(
            "INSERT INTO users (name, email) VALUES (?, ?)",
            ("", user["email"])
        )
        await db.commit()
        return {"success": True, "data": {"id": 1, "email": user["email"], "name": ""}}

    profile = dict(row)
    # Deserialise JSON list fields
    for field in ("skills", "target_roles"):
        if isinstance(profile.get(field), str):
            try:
                profile[field] = json.loads(profile[field])
            except Exception:
                profile[field] = []
    return {"success": True, "data": profile}


@router.post("")
async def save_profile(payload: UserProfileRequest, user=Depends(get_current_user), db=Depends(get_db)):
    data = payload.dict(exclude_unset=True)

    # Serialise list fields
    for field in ("skills", "target_roles"):
        if field in data and isinstance(data[field], list):
            data[field] = json.dumps(data[field])

    # Check if user row exists
    async with db.execute("SELECT id FROM users LIMIT 1") as cur:
        row = await cur.fetchone()

    if row:
        sets = ", ".join(f"{k} = ?" for k in data)
        vals = list(data.values()) + [row["id"]]
        await db.execute(f"UPDATE users SET {sets} WHERE id = ?", vals)
    else:
        data["email"] = user["email"]
        cols = ", ".join(data.keys())
        placeholders = ", ".join("?" * len(data))
        await db.execute(f"INSERT INTO users ({cols}) VALUES ({placeholders})", list(data.values()))

    await db.commit()

    # Return updated profile
    async with db.execute("SELECT * FROM users LIMIT 1") as cur:
        updated = await cur.fetchone()
    profile = dict(updated)
    for field in ("skills", "target_roles"):
        if isinstance(profile.get(field), str):
            try:
                profile[field] = json.loads(profile[field])
            except Exception:
                profile[field] = []
    return {"success": True, "data": profile}
