import sys
import asyncio
import os

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="EasyClick API", version="2.0.0")

# ─── CORS ─────────────────────────────────────────────────────────────────────
# Allow both local dev and production frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
from .routers import (
    profile, config, jobs, resume,
    email_router, apply, applications,
    scams, salary, prepare, tasks,
)

app.include_router(profile.router)
app.include_router(config.router)
app.include_router(jobs.router)
app.include_router(resume.router)
app.include_router(email_router.router)
app.include_router(apply.router)
app.include_router(applications.router)
app.include_router(scams.router)
app.include_router(salary.router)
app.include_router(prepare.router)
app.include_router(tasks.router)


@app.on_event("startup")
async def startup():
    # Always use local SQLite
    from .database import init_db
    await init_db()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "mode": "production" if os.environ.get("SUPABASE_URL") else "local",
        "platform": sys.platform,
    }
