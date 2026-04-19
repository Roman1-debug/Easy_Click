import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

DAILY_LIMIT = 10


def send_email(smtp_email: str, smtp_password: str, recipient: str, subject: str, body: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_email
    msg["To"] = recipient
    msg.attach(MIMEText(body, "plain"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(smtp_email, smtp_password)
        server.sendmail(smtp_email, recipient, msg.as_string())
