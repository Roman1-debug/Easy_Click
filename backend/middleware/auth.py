"""
Local auth middleware — no JWT, no Supabase.
Returns a static dummy user so all endpoints work on localhost.
"""
from fastapi import Request


async def get_current_user(request: Request) -> dict:
    """Always returns the local user. No token required."""
    return {"sub": "1", "email": "local@easyclick.app"}
