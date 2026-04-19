import json
from fastapi import APIRouter, Depends
try:
    from backend.models import EmailGenerateRequest
except ImportError:
    from models import EmailGenerateRequest
try:
    from backend.middleware.auth import get_current_user
except ImportError:
    from middleware.auth import get_current_user
try:
    from backend.database import get_db
except ImportError:
    from database import get_db

router = APIRouter(prefix="/email", tags=["email"])


async def _get_config(db) -> dict:
    async with db.execute("SELECT key, value FROM config") as cur:
        rows = await cur.fetchall()
    config = {r["key"]: r["value"] for r in rows}

    # Support both the old gmail_* keys and the newer email_* keys used by Settings.
    if not config.get("gmail_address") and config.get("email_address"):
        config["gmail_address"] = config["email_address"]
    if not config.get("gmail_app_password") and config.get("email_app_password"):
        config["gmail_app_password"] = config["email_app_password"]

    return config


@router.get("/sent")
async def list_sent_emails(user=Depends(get_current_user), db=Depends(get_db)):
    async with db.execute("SELECT * FROM sent_emails ORDER BY sent_at DESC") as cur:
        rows = await cur.fetchall()
    return {"success": True, "data": [dict(r) for r in rows], "error": None}


@router.post("/delete")
async def delete_emails(payload: dict, user=Depends(get_current_user), db=Depends(get_db)):
    ids = payload.get("ids", [])
    if ids:
        placeholders = ",".join("?" * len(ids))
        await db.execute(f"DELETE FROM sent_emails WHERE id IN ({placeholders})", ids)
        await db.commit()
    return {"success": True, "data": {"message": "Deleted successfully"}, "error": None}


@router.post("/generate")
async def generate_email(payload: EmailGenerateRequest, user=Depends(get_current_user), db=Depends(get_db)):
    config = await _get_config(db)
    api_key = config.get("openrouter_api_key", "")
    if not api_key:
        return {"success": False, "error": "OpenRouter API key not configured"}

    async with db.execute("SELECT * FROM users LIMIT 1") as cur:
        user_row = await cur.fetchone()
    if not user_row:
        return {"success": False, "error": "User profile not found"}

    user_profile = dict(user_row)
    for field in ("skills", "target_roles"):
        if isinstance(user_profile.get(field), str):
            try:
                user_profile[field] = json.loads(user_profile[field])
            except Exception:
                user_profile[field] = []

    job_dict = {}
    if payload.job_id:
        async with db.execute("SELECT * FROM jobs WHERE id = ?", (payload.job_id,)) as cur:
            job_row = await cur.fetchone()
        if job_row:
            job_dict = dict(job_row)

    try:
        try:
            from backend.services.ai_service import generate_email as ai_generate_email
        except ImportError:
            from services.ai_service import generate_email as ai_generate_email
        result = await ai_generate_email(api_key, user_profile, job_dict)
        return {"success": True, "data": result, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/send")
async def send_email(payload: dict, user=Depends(get_current_user), db=Depends(get_db)):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    import re

    config = await _get_config(db)
    sender_email = config.get("gmail_address", "")
    app_password = config.get("gmail_app_password", "").replace(" ", "")

    if not sender_email or not app_password:
        return {"success": False, "error": "Gmail address or App Password not configured."}

    to_addr = payload.get("to", "")
    subject = payload.get("subject", "")
    html_body = payload.get("body", "")
    plain_body = re.sub(r"<br\s*/?>", "\n", html_body)
    plain_body = re.sub(r"<[^>]+>", "", plain_body)

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender_email
        msg["To"] = to_addr
        msg.attach(MIMEText(plain_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
            server.login(sender_email, app_password)
            server.sendmail(sender_email, [to_addr], msg.as_string())

        await db.execute(
            "INSERT INTO sent_emails (to_addr, subject, body, status) VALUES (?, ?, ?, 'sent')",
            (to_addr, subject, html_body)
        )
        await db.commit()
        return {"success": True, "data": {"message": f"Sent to {to_addr}"}}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/chat")
async def chat_with_ai(payload: dict, user=Depends(get_current_user), db=Depends(get_db)):
    config = await _get_config(db)
    api_key = config.get("openrouter_api_key", "")
    if not api_key:
        return {"success": False, "error": "OpenRouter API key not configured"}
    try:
        try:
            from backend.services.ai_service import chat_email_draft
        except ImportError:
            from services.ai_service import chat_email_draft
        result = await chat_email_draft(
            api_key=api_key,
            message=payload.get("message", ""),
            current_draft=payload.get("current_draft", ""),
        )
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}
