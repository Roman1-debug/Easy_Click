import asyncio
import traceback
from services.supabase_client import get_supabase
from handlers.scraper import handle_search_jobs, handle_extract_job
from handlers.pdf_generator import handle_generate_pdf


HANDLERS = {
    "search_jobs": handle_search_jobs,
    "extract_job": handle_extract_job,
    "generate_pdf": handle_generate_pdf,
}


async def start_polling():
    sb = get_supabase()
    print("[worker] Queue polling started")

    while True:
        try:
            # Atomically claim next pending task
            result = sb.rpc("claim_next_task", {}).execute()
            task = result.data

            if task and task.get("id"):
                task_id = task["id"]
                task_type = task["task_type"]
                payload = task["payload"]

                print(f"[worker] Processing task {task_id} type={task_type}")

                handler = HANDLERS.get(task_type)
                if not handler:
                    sb.table("task_queue").update({
                        "status": "failed",
                        "error": f"Unknown task type: {task_type}"
                    }).eq("id", task_id).execute()
                else:
                    try:
                        result_data = await handler(payload)
                        sb.table("task_queue").update({
                            "status": "done",
                            "result": result_data
                        }).eq("id", task_id).execute()
                        print(f"[worker] Task {task_id} done")
                    except Exception as e:
                        err = traceback.format_exc()
                        print(f"[worker] Task {task_id} FAILED: {err}")
                        sb.table("task_queue").update({
                            "status": "failed",
                            "error": str(e)[:500]
                        }).eq("id", task_id).execute()

                # Small pause between tasks to avoid hammering
                await asyncio.sleep(1)
            else:
                # No pending tasks — wait before polling again
                await asyncio.sleep(5)

        except Exception:
            traceback.print_exc()
            await asyncio.sleep(10)
