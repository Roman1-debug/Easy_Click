import asyncio
from fastapi import FastAPI
from services.queue_poller import start_polling

app = FastAPI(title="EasyClick Worker", version="1.0.0")


@app.on_event("startup")
async def startup():
    asyncio.create_task(start_polling())


@app.post("/trigger")
async def trigger():
    """Called by the main API to wake this worker from Render sleep."""
    return {"status": "awake", "message": "Worker is running, polling queue"}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "worker"}
