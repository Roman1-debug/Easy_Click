"""
Scraper handler for the worker.
Identical logic to backend/services/scraper_service.py — runs inside the worker container
where Playwright/Chromium is installed.
"""
import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import hashlib
import json
import re
import time
from typing import Optional, List, Dict
from playwright.async_api import async_playwright
from services.supabase_client import get_supabase

SCRAPE_DELAY_MS = 1000
MAX_RESULTS_PER_SOURCE = 12
CONCURRENT_BROWSERS = 3

_BROWSER_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--single-process",
]

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

_ua_index = 0


def _next_ua() -> str:
    global _ua_index
    ua = _USER_AGENTS[_ua_index % len(_USER_AGENTS)]
    _ua_index += 1
    return ua


def _hash_job(title: str, company: str, location: str) -> str:
    raw = f"{title.lower().strip()}{company.lower().strip()}{location.lower().strip()}"
    return hashlib.md5(raw.encode()).hexdigest()


def _is_stale(posted_text: str) -> bool:
    if not posted_text:
        return False
    text = posted_text.lower()
    patterns = [r"(\d+)\s*month", r"(\d+)\s*year"]
    for pat in patterns:
        m = re.search(pat, text)
        if m and int(m.group(1)) >= 2:
            return True
    return False


# ─── Source scrapers (same logic as backend, adapted for linux/docker) ─────────

async def _scrape_indeed(page, role: str, location: str) -> List[Dict]:
    jobs = []
    query = role.replace(" ", "+")
    loc = location.replace(" ", "+")
    url = f"https://in.indeed.com/jobs?q={query}&l={loc}&fromage=14"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(2000)
        cards = await page.query_selector_all('[class*="job_seen_beacon"], [class*="jobsearch-ResultsList"] li')
        for card in cards[:MAX_RESULTS_PER_SOURCE]:
            try:
                title_el = await card.query_selector('[class*="jobTitle"] span, h2 a span')
                company_el = await card.query_selector('[data-testid="company-name"], [class*="companyName"]')
                location_el = await card.query_selector('[data-testid="text-location"], [class*="companyLocation"]')
                link_el = await card.query_selector('a[id^="job_"], a[href*="/rc/clk"]')
                posted_el = await card.query_selector('[class*="date"], [data-testid="myJobsStateDate"]')

                title = (await title_el.inner_text()).strip() if title_el else ""
                company = (await company_el.inner_text()).strip() if company_el else ""
                loc_text = (await location_el.inner_text()).strip() if location_el else location
                posted = (await posted_el.inner_text()).strip() if posted_el else ""
                href = await link_el.get_attribute("href") if link_el else ""
                full_url = f"https://in.indeed.com{href}" if href and href.startswith("/") else href

                if not title or not company:
                    continue
                if _is_stale(posted):
                    continue

                jobs.append({
                    "title": title,
                    "company": company,
                    "location": loc_text,
                    "apply_link": full_url,
                    "source": "indeed",
                    "hash": _hash_job(title, company, loc_text),
                    "description": "",
                })
            except Exception:
                continue
    except Exception as e:
        print(f"[scraper] Indeed error: {e}")
    return jobs


async def _scrape_naukri(page, role: str, location: str) -> List[Dict]:
    jobs = []
    query = role.replace(" ", "-").lower()
    loc = location.replace(" ", "-").lower()
    url = f"https://www.naukri.com/{query}-jobs-in-{loc}"
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(2500)
        cards = await page.query_selector_all('article.jobTuple, div.srp-jobtuple-wrapper')
        for card in cards[:MAX_RESULTS_PER_SOURCE]:
            try:
                title_el = await card.query_selector('a.title, .jobTitle a')
                company_el = await card.query_selector('a.subTitle, .companyInfo a')
                location_el = await card.query_selector('.locWdth, .location span')
                href = await title_el.get_attribute("href") if title_el else ""
                title = (await title_el.inner_text()).strip() if title_el else ""
                company = (await company_el.inner_text()).strip() if company_el else ""
                loc_text = (await location_el.inner_text()).strip() if location_el else location

                if not title or not company:
                    continue

                jobs.append({
                    "title": title,
                    "company": company,
                    "location": loc_text,
                    "apply_link": href,
                    "source": "naukri",
                    "hash": _hash_job(title, company, loc_text),
                    "description": "",
                })
            except Exception:
                continue
    except Exception as e:
        print(f"[scraper] Naukri error: {e}")
    return jobs


async def _scrape_source(browser, source_fn, role: str, location: str) -> List[Dict]:
    try:
        context = await browser.new_context(user_agent=_next_ua())
        page = await context.new_page()
        await page.route("**/*", lambda route: route.abort()
                         if route.request.resource_type in ["image", "media", "font"]
                         else route.continue_())
        results = await source_fn(page, role, location)
        await context.close()
        return results
    except Exception as e:
        print(f"[scraper] Source error: {e}")
        return []


async def handle_search_jobs(payload: dict) -> dict:
    """Playwright scraping task — runs in worker."""
    role = payload.get("role", "")
    location = payload.get("location", "India")
    query_hash = payload.get("query_hash", "")
    user_id = payload.get("user_id", "")
    page_num = payload.get("page", 1)

    all_jobs = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=_BROWSER_ARGS)

        tasks = [
            _scrape_source(browser, _scrape_indeed, role, location),
            _scrape_source(browser, _scrape_naukri, role, location),
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, list):
                all_jobs.extend(r)

        await browser.close()

    # Deduplicate by hash
    seen = set()
    unique_jobs = []
    for job in all_jobs:
        if job["hash"] not in seen:
            seen.add(job["hash"])
            unique_jobs.append(job)

    # Cache results in Supabase
    if query_hash and unique_jobs:
        sb = get_supabase()
        try:
            sb.table("search_cache").upsert({
                "query_hash": query_hash,
                "role": role,
                "location": location,
                "page": page_num,
                "results": unique_jobs,
            }).execute()
        except Exception as e:
            print(f"[scraper] Cache write error: {e}")

    return {"jobs": unique_jobs, "total": len(unique_jobs), "query_hash": query_hash}


async def handle_extract_job(payload: dict) -> dict:
    """Direct extract — scrape a specific career page URL."""
    url = payload.get("url", "")
    keywords = payload.get("keywords", "")
    user_id = payload.get("user_id", "")

    if not url:
        raise ValueError("URL is required for extract_job task")

    user_kws = [k.strip().lower() for k in keywords.split() if k.strip()] if keywords else []

    _JOB_SIGNAL_KEYWORDS = [
        "responsibilities", "requirements", "qualifications", "experience",
        "skills", "you will", "we are looking", "about the role",
        "must have", "benefits", "who you are", "what you bring",
        "job description", "role description", "salary", "compensation",
        "apply", "hiring", "position", "candidate", "team",
    ]
    all_signals = _JOB_SIGNAL_KEYWORDS + user_kws

    desc = ""

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=_BROWSER_ARGS)
        context = await browser.new_context(
            user_agent=_next_ua(),
            viewport={"width": 1280, "height": 800},
        )
        page = await context.new_page()
        await page.route("**/*", lambda route: route.abort()
                         if route.request.resource_type in ["image", "media", "font", "stylesheet"]
                         else route.continue_())

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)
            try:
                await page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            await page.wait_for_timeout(2500)

            # Strategy 1: JSON-LD structured data
            ld = await page.evaluate("""
                () => {
                    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                    for (const s of scripts) {
                        try {
                            const d = JSON.parse(s.textContent);
                            if (d['@type'] === 'JobPosting') return d;
                        } catch(e) {}
                    }
                    return null;
                }
            """)
            if ld:
                desc = ld.get("description", "") or ld.get("title", "")

            # Strategy 2: CSS selector scoring
            if not desc:
                selectors = [
                    '[class*="job-description"]', '[class*="jobDescription"]',
                    '[id*="job-description"]', '[id*="jobDescription"]',
                    'article', 'main', '[role="main"]',
                    '.job-details', '.position-details',
                ]
                best_score = 0
                for sel in selectors:
                    try:
                        el = await page.query_selector(sel)
                        if el:
                            text = (await el.inner_text()).strip()
                            if len(text) < 100:
                                continue
                            text_lower = text.lower()
                            signal_score = sum(1 for kw in all_signals if kw in text_lower)
                            signal_score += sum(2 for kw in user_kws if kw in text_lower)
                            if signal_score > best_score:
                                best_score = signal_score
                                desc = text
                    except Exception:
                        continue

            # Strategy 3: DOM block scan
            if not desc or len(desc) < 200:
                import json as _json
                user_kws_js = _json.dumps(user_kws)
                desc = await page.evaluate(f"""
                    () => {{
                        const JOB_SIGNALS = [
                            'responsibilities','requirements','qualifications','experience',
                            'skills','you will','we are looking','about the role',
                            'must have','benefits','who you are','what you bring',
                        ];
                        const USER_KWS = {user_kws_js};
                        const allSignals = [...JOB_SIGNALS, ...USER_KWS];
                        const elems = Array.from(document.querySelectorAll('section, article, div, main'));
                        let best = {{ score: 0, text: '' }};
                        for (const el of elems) {{
                            const text = (el.innerText || '').trim();
                            if (text.length < 200) continue;
                            const lower = text.toLowerCase();
                            let score = allSignals.filter(kw => lower.includes(kw)).length;
                            score += USER_KWS.filter(kw => lower.includes(kw)).length;
                            if (score > best.score || (score === best.score && text.length > best.text.length)) {{
                                best = {{ score, text }};
                            }}
                        }}
                        return best.score >= 1 ? best.text : document.body.innerText.trim();
                    }}
                """)

            # Strategy 4: full body fallback
            if not desc or len(desc) < 200:
                desc = await page.evaluate("document.body.innerText.trim()")

        finally:
            await context.close()
            await browser.close()

    desc_text = " ".join(desc.split()) if desc else ""
    return {"raw_text": desc_text, "url": url, "user_id": user_id}
