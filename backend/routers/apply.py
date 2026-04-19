from fastapi import APIRouter, Depends, Request
try:
    from backend.middleware.auth import get_current_user
except ImportError:
    from middleware.auth import get_current_user
try:
    from backend.database import get_db
except ImportError:
    from database import get_db

router = APIRouter(prefix="/apply", tags=["apply"])


@router.post("")
async def apply_to_job(payload: dict, user=Depends(get_current_user), db=Depends(get_db)):
    job_id = payload.get("job_id")
    mode = payload.get("mode", "manual")
    if not job_id:
        return {"success": False, "error": "job_id is required"}

    # Check if application already exists
    async with db.execute("SELECT id FROM applications WHERE job_id = ?", (job_id,)) as cur:
        existing = await cur.fetchone()

    # Get job details for the application record
    async with db.execute("SELECT company, title FROM jobs WHERE id = ?", (job_id,)) as cur:
        job_row = await cur.fetchone()

    company = job_row["company"] if job_row else ""
    role = job_row["title"] if job_row else ""

    if existing:
        await db.execute(
            "UPDATE applications SET status = 'applied' WHERE id = ?",
            (existing["id"],)
        )
    else:
        await db.execute(
            "INSERT INTO applications (job_id, company, role, status) VALUES (?, ?, ?, 'applied')",
            (job_id, company, role)
        )
    await db.commit()
    return {"success": True, "data": {"message": "Marked as applied"}, "error": None}


@router.post("/send")
async def send_email_apply(request: Request, user=Depends(get_current_user), db=Depends(get_db)):
    """Send an email and log the application."""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    import re

    try:
        payload = await request.json()
        if not isinstance(payload, dict):
            payload = {}
    except Exception:
        payload = {}

    query_params = request.query_params

    # Get email config, supporting both legacy gmail_* keys and current email_* keys.
    async with db.execute(
        "SELECT key, value FROM config WHERE key IN ('gmail_address', 'gmail_app_password', 'email_address', 'email_app_password')"
    ) as cur:
        rows = await cur.fetchall()
    config = {r["key"]: r["value"] for r in rows}

    sender_email = (config.get("email_address") or config.get("gmail_address") or "").strip()
    app_password = (config.get("email_app_password") or config.get("gmail_app_password") or "").replace(" ", "")

    if not sender_email or not app_password:
        return {"success": False, "error": "Gmail address or App Password not configured."}

    recipient = payload.get("recipient") or payload.get("to") or query_params.get("recipient") or query_params.get("to") or ""
    subject = payload.get("subject") or query_params.get("subject") or ""
    html_body = payload.get("body") or query_params.get("body") or ""
    plain_body = re.sub(r"<br\s*/?>", "\n", html_body)
    plain_body = re.sub(r"<[^>]+>", "", plain_body)

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender_email
        msg["To"] = recipient
        msg.attach(MIMEText(plain_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
            server.login(sender_email, app_password)
            server.sendmail(sender_email, [recipient], msg.as_string())

        # Log to sent_emails
        await db.execute(
            "INSERT INTO sent_emails (to_addr, subject, body, status) VALUES (?, ?, ?, 'sent')",
            (recipient, subject, html_body)
        )

        # Log application if application_id provided
        app_id = payload.get("application_id") or query_params.get("application_id")
        if app_id:
            await db.execute("UPDATE applications SET status = 'sent' WHERE id = ?", (app_id,))

        await db.commit()
        return {"success": True, "data": {"message": f"Sent to {recipient}"}}
    except Exception as e:
        return {"success": False, "error": str(e)}
