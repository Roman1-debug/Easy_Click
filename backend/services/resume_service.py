import os
import asyncio
import tempfile
import uuid
import yaml as pyyaml
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "generated_resumes"
OUTPUT_DIR.mkdir(exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# PRIMARY PATH: Use the REAL RenderCV engine for manual YAML-based generation
# This gives pixel-perfect output identical to app.rendercv.com
# ─────────────────────────────────────────────────────────────────────────────

def _preprocess_yaml_for_rendercv(yaml_string: str) -> str:
    """
    Clean up known RenderCV 2.3 Typst incompatibilities before compilation.
    Main issue: 'url' field in project entries triggers 'cannot multiply dict with int' Typst error.
    We preserve the URL by injecting it as a Markdown link in the highlights.
    """
    import ruamel.yaml
    ryaml = ruamel.yaml.YAML()
    ryaml.preserve_quotes = True

    import io
    data = ryaml.load(yaml_string)

    cv = data.get("cv", {})
    sections = cv.get("sections", {})

    for section_name, entries in sections.items():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            # Move 'url' to a highlight to avoid Typst crash
            if "url" in entry:
                url = entry.pop("url")
                if url:
                    highlights = entry.setdefault("highlights", [])
                    # Prepend a markdown link as first highlight if not already there
                    link_text = f"[GitHub / Project Link]({url})"
                    if not any(str(url) in str(h) for h in highlights):
                        highlights.insert(0, link_text)

    stream = io.StringIO()
    ryaml.dump(data, stream)
    return stream.getvalue()


def _sync_rendercv_from_yaml(yaml_string: str, job_id: int) -> str:
    """
    Uses the official RenderCV Python API to compile a YAML string into a PDF.
    Output is identical to app.rendercv.com.
    """
    import rendercv

    # Pre-process to fix known RenderCV 2.3 Typst compatibility issues
    clean_yaml = _preprocess_yaml_for_rendercv(yaml_string)

    unique_id = uuid.uuid4().hex[:8]
    output_path = OUTPUT_DIR / f"resume_{job_id}_{unique_id}.pdf"

    try:
        rendercv.create_a_pdf_from_a_yaml_string(clean_yaml, output_path)
    except Exception as e:
        raise RuntimeError(f"RenderCV compilation failed: {str(e)}")

    if not output_path.exists():
        raise RuntimeError("RenderCV ran but did not produce a PDF. Check your YAML for errors.")

    return str(output_path)


async def generate_pdf_from_yaml(yaml_string: str, job_id: int) -> str:
    """Async wrapper for the RenderCV engine."""
    return await asyncio.to_thread(_sync_rendercv_from_yaml, yaml_string, job_id)


# ─────────────────────────────────────────────────────────────────────────────
# SECONDARY PATH: Legacy HTML renderer for AI-Tailored resumes
# (Tailored resumes come as structured JSON dicts, not RenderCV YAML)
# ─────────────────────────────────────────────────────────────────────────────

from playwright.sync_api import sync_playwright


def _get_base_styles():
    return """
    @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&family=EB+Garamond:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fff; color: #000; -webkit-print-color-adjust: exact; }
    .item-list { margin-left: 1.1rem; list-style-type: disc; margin-top: 0.3rem; }
    .item-list li { margin-bottom: 0.15rem; }
    a { color: inherit; text-decoration: none; }
    """


def _clean_combine(*parts, sep=", "):
    return sep.join([p for p in parts if p and str(p).strip()])


def _render_tailored_html(data: dict, template: str = "classic") -> str:
    blue = "rgb(0, 79, 144)"

    # Build sections
    summary_html = f'<div style="margin-bottom:0.4cm;">{data.get("summary", "")}</div>' if data.get("summary") else ""

    exp_html = ""
    for exp in data.get("experience", []):
        if not isinstance(exp, dict):
            continue
        bullets = "".join([f"<li>{b}</li>" for b in exp.get("bullets", [])])
        main = _clean_combine(f"<strong>{exp.get('title', '')}</strong>", exp.get('company', ''))
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
        main = _clean_combine(f"<strong>{edu.get('institution', '')}</strong>", edu.get('degree', ''))
        edu_html += f"""
        <div class="entry">
            <div class="entry-header">
                <div>{main}</div>
                <div class="entry-date">{edu.get('year', '')}</div>
            </div>
        </div>"""

    raw_skills = data.get("skills", [])
    if raw_skills and isinstance(raw_skills[0], dict):
        # New format: [{"label": "Category", "details": "tool1, tool2"}]
        skills_html = " &nbsp;|&nbsp; ".join(
            f"<strong>{s.get('label', '')}:</strong> {s.get('details', '')}"
            for s in raw_skills if isinstance(s, dict)
        )
    else:
        # Legacy format: ["Python", "React"]
        skills_html = ", ".join(str(s) for s in raw_skills)
    certs_raw = data.get("certifications", [])
    certs_html = ", ".join(str(c) for c in certs_raw) if certs_raw else ""

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        {_get_base_styles()}
        body {{ font-family: 'EB Garamond', serif; font-size: 11pt; line-height: 1.4; padding: 1.5cm 1.8cm; color: #000; }}
        .header {{ text-align: center; margin-bottom: 0.5cm; }}
        .header h1 {{ font-size: 26pt; font-weight: 500; margin-bottom: 0.1cm; }}
        .contact {{ font-size: 10pt; color: #444; }}
        h2 {{ border-bottom: 0.7pt solid #000; font-size: 1.1em; font-weight: 700; text-transform: uppercase;
              margin-top: 0.4cm; margin-bottom: 0.25cm; }}
        .entry {{ margin-bottom: 0.3cm; }}
        .entry-header {{ display: flex; justify-content: space-between; align-items: baseline; }}
        .entry-date {{ font-size: 0.9em; font-style: italic; color: #555; }}
        .item-list {{ font-size: 10.5pt; color: #111; }}
    </style></head><body>
    <div class="header">
        <h1>{data.get('name', '')}</h1>
        <div class="contact">
            {_clean_combine(data.get('location',''), data.get('email',''), data.get('phone',''), data.get('linkedin',''), data.get('portfolio',''), sep=' | ')}
        </div>
    </div>
    {summary_html}
    {'<h2>Education</h2>' + edu_html if edu_html else ''}
    {'<h2>Experience</h2>' + exp_html if exp_html else ''}
    {'<h2>Projects</h2>' + proj_html if proj_html else ''}
    {'<h2>Skills</h2><div style="font-size:10.5pt;">' + skills_html + '</div>' if skills_html else ''}
    {'<h2>Certifications</h2><div style="font-size:10.5pt;">' + certs_html + '</div>' if certs_html else ''}
    </body></html>"""
    return html


def _sync_generate_pdf_worker(raw_data: dict, job_id: int, template: str = "classic") -> str:
    html_content = _render_tailored_html(raw_data, template)
    unique_id = uuid.uuid4().hex[:8]
    pdf_path = OUTPUT_DIR / f"resume_{job_id}_{unique_id}.pdf"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        page = browser.new_page()
        page.set_content(html_content)
        page.wait_for_timeout(2000)
        page.pdf(
            path=str(pdf_path),
            format="Letter",
            margin={"top": "0in", "bottom": "0in", "left": "0in", "right": "0in"},
            print_background=True
        )
        browser.close()
    return str(pdf_path)


async def generate_pdf(tailored_data: dict, job_id: int, template: str = "classic") -> str:
    """Legacy path: Used by the AI tailoring workflow (structured JSON → HTML → PDF)."""
    return await asyncio.to_thread(_sync_generate_pdf_worker, tailored_data, job_id, template)


async def generate_pdf_local(content_string: str, template: str = "classic") -> str:
    """Bridge function for resume.py to support both JSON styling and YAML building."""
    import json
    import yaml as pyyaml
    
    # Try to parse as JSON first (tailored data)
    try:
        data = json.loads(content_string)
        if isinstance(data, dict) and ("experience" in data or "education" in data or "summary" in data or "name" in data):
             # It's tailored json data
             return await generate_pdf(data, job_id=0, template=template)
    except Exception:
        pass
        
    # If not JSON, it might be RenderCV YAML. Update the theme if template is specified
    if template and template != "classic":
        try:
            import ruamel.yaml
            ryaml = ruamel.yaml.YAML()
            ryaml.preserve_quotes = True
            import io
            
            # Map frontend template names to RenderCV built-in themes
            theme_map = {
                "engineering": "engineeringresumes",
                "classic": "classic",
                "sb2nov": "sb2nov",
            }
            mapped_theme = theme_map.get(template.lower(), template)
            
            data = ryaml.load(content_string)
            if data and "design" in data and "theme" in data["design"]:
                data["design"]["theme"] = mapped_theme
                
            stream = io.StringIO()
            ryaml.dump(data, stream)
            content_string = stream.getvalue()
        except Exception:
            pass

    return await generate_pdf_from_yaml(content_string, job_id=0)
