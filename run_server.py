import sys
import asyncio
import os

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import uvicorn

if __name__ == "__main__":
    if sys.platform == 'win32':
        # This MUST be set before any event loops are created
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        print("Set WindowsProactorEventLoopPolicy in run_server.py")

    # Autoreload on Windows has been leaving stale worker processes around,
    # which caused the server to serve old imports even after code changes.
    reload_enabled = os.environ.get("EASYCLICK_RELOAD") == "1"
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=reload_enabled)
