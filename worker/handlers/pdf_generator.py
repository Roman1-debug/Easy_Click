"""
PDF generation handler for the worker.
Handles both RenderCV YAML path and legacy HTML/Playwright path.
Uploads result to Supabase Storage and returns a signed URL.
"""
import asyncio
import tempfile
import uuid
import os
from pathlib import Path
from services.supabase_client import get_supabase


# ─── RenderCV path (YAML → Typst → PDF) ──────────────────────────────────────

def _preprocess_yaml(yaml_string: str) -> str:
    import ruamel.yaml
    import io
    ryaml = ruamel.yaml.YAML()
    ryaml.preserve_quotes = True
    data = ryaml.load(yaml_string)
    cv = data.get("cv", {})
    for section_name, entries in cv.get("sections", {}).items():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            if "url" in entry:
                url = entry.pop("url")
                if url:
                    highlights = entry.setdefault("highlights", [])
                    link_text = f"[GitHub / Project Link]({url})"
                    if not any(str(url) in str(h) for h in highlights):
                        highlights.insert(0, link_text)
    stream = io.StringIO()
    ryaml.dump(data, stream)
    return stream.getvalue()


def _sync_rendercv(yaml_string: str, job_id: str) -> bytes:
    import rendercv
    clean_yaml = _preprocess_yaml(yaml_string)
    unique_id = uuid.uuid4().hex[:8]
    with tempfile.TemporaryDirectory() as tmp:
        out_path = Path(tmp) / f"resume_{job_id}_{unique_id}.pdf"
        rendercv.create_a_pdf_from_a_yaml_string(clean_yaml, out_path)
        if not out_path.exists():
            raise RuntimeError("RenderCV did not produce a PDF")
        return out_path.read_bytes()


# ─── Legacy HTML path (AI JSON → HTML → Playwright → PDF) ────────────────────

def _render_tailored_html(data: dict) -> str:
    def _clean(*parts, sep=", "):
        return sep.join([p for p in parts if p and str(p).strip()])

    summary_html = f'<div style="margin-bottom:0.4cm;">{data.get("summary", "")}</div>' if data.get("summary") else ""

    exp_html = ""
    for exp in data.get("experience", []):
        if not isinstance(exp, dict):
            continue
        bullets = "".join([f"<li>{b}</li>" for b in exp.get("bullets", [])])
        main = _clean(f"<strong>{exp.get('title', '')}</strong>", exp.get('company', ''))
        exp_html += f"""
        <div class="entry">
            <div class="entry-header">
                <div>{main}</div>
                <div class="entry-date">{exp.get('start', '')} – {exp.get('end', 'present')}</div>
            </div>
            <ul class="item-list">{bullets}</ul>
        </div>"""

    proj_html = ""
    for proj in data.get("projects", []):
        if not isinstance(proj, dict):
            continue
        bullets = "".join([f"<li>{b}</li>" for b in proj.get("highlights", [])])
        proj_html += f"""
        <div class="entry">
            <div class="entry-header">
                <strong>{proj.get('name', '')}</strong>
                <div class="entry-date">{proj.get('date', '')}</div>
            </div>
            <ul class="item-list">{bullets}</ul>
        </div>"""

    edu_html = ""
    for edu in data.get("education", []):
        main = _clean(f"<strong>{edu.get('institution', '')}</strong>", edu.get('degree', ''))
        edu_html += f"""
        <div class="entry">
            <div class="entry-header">
                <div>{main}</div>
                <div class="entry-date">{edu.get('year', '')}</div>
            </div>
        </div>"""

    raw_skills = data.get("skills", [])
    if raw_skills and isinstance(raw_skills[0], dict):
        skills_html = " &nbsp;|&nbsp; ".join(
            f"<strong>{s.get('label', '')}:</strong> {s.get('details', '')}"
            for s in raw_skills if isinstance(s, dict)
        )
    else:
        skills_html = ", ".join(str(s) for s in raw_skills)

    certs_html = ", ".join(str(c) for c in data.get("certifications", []))

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700&display=swap');
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: 'EB Garamond', serif; font-size: 11pt; line-height: 1.4; padding: 1.5cm 1.8cm; color: #000; background: #fff; }}
    .header {{ text-align: center; margin-bottom: 0.5cm; }}
    .header h1 {{ font-size: 26pt; font-weight: 500; margin-bottom: 0.1cm; }}
    .contact {{ font-size: 10pt; color: #444; }}
    h2 {{ border-bottom: 0.7pt solid #000; font-size: 1.1em; font-weight: 700; text-transform: uppercase; margin-top: 0.4cm; margin-bottom: 0.25cm; }}
    .entry {{ margin-bottom: 0.3cm; }}
    .entry-header {{ display: flex; justify-content: space-between; align-items: baseline; }}
    .entry-date {{ font-size: 0.9em; font-style: italic; color: #555; }}
    .item-list {{ margin-left: 1.1rem; list-style-type: disc; font-size: 10.5pt; color: #111; }}
    </style></head><body>
    <div class="header">
        <h1>{data.get('name', '')}</h1>
        <div class="contact">{_clean(data.get('location',''), data.get('email',''), data.get('phone',''), data.get('linkedin',''), data.get('portfolio',''), sep=' | ')}</div>
    </div>
    {summary_html}
    {'<h2>Education</h2>' + edu_html if edu_html else ''}
    {'<h2>Experience</h2>' + exp_html if exp_html else ''}
    {'<h2>Projects</h2>' + proj_html if proj_html else ''}
    {'<h2>Skills</h2><div style="font-size:10.5pt;">' + skills_html + '</div>' if skills_html else ''}
    {'<h2>Certifications</h2><div style="font-size:10.5pt;">' + certs_html + '</div>' if certs_html else ''}
    </body></html>"""


def _sync_html_pdf(data: dict) -> bytes:
    from playwright.sync_api import sync_playwright
    html = _render_tailored_html(data)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=[
            "--no-sandbox", "--disable-setuid-sandbox",
            "--disable-dev-shm-usage", "--disable-gpu", "--single-process"
        ])
        page = browser.new_page()
        page.set_content(html)
        page.wait_for_timeout(2000)
        pdf_bytes = page.pdf(
            format="Letter",
            margin={"top": "0in", "bottom": "0in", "left": "0in", "right": "0in"},
            print_background=True,
        )
        browser.close()
    return pdf_bytes


# ─── Upload to Supabase Storage ───────────────────────────────────────────────

def _upload_pdf(pdf_bytes: bytes, user_id: str, version_id: str) -> str:
    sb = get_supabase()
    path = f"{user_id}/{version_id}.pdf"
    sb.storage.from_("resumes").upload(
        path, pdf_bytes,
        {"content-type": "application/pdf", "upsert": "true"}
    )
    signed = sb.storage.from_("resumes").create_signed_url(path, 3600)
    return signed["signedURL"]


# ─── Main handler ─────────────────────────────────────────────────────────────

async def handle_generate_pdf(payload: dict) -> dict:
    """
    payload must contain one of:
      - yaml_content: str  → RenderCV YAML path
      - resume_data: dict  → Legacy HTML+Playwright path
    Plus: user_id, job_id (used for storage path and filename)
    """
    user_id = payload.get("user_id", "unknown")
    job_id = str(payload.get("job_id", "manual"))
    version_id = uuid.uuid4().hex

    if payload.get("yaml_content"):
        pdf_bytes = await asyncio.to_thread(_sync_rendercv, payload["yaml_content"], job_id)
    elif payload.get("resume_data"):
        pdf_bytes = await asyncio.to_thread(_sync_html_pdf, payload["resume_data"])
    else:
        raise ValueError("payload must contain yaml_content or resume_data")

    pdf_url = await asyncio.to_thread(_upload_pdf, pdf_bytes, user_id, version_id)

    return {
        "pdf_url": pdf_url,
        "storage_path": f"{user_id}/{version_id}.pdf",
        "version_id": version_id,
    }
