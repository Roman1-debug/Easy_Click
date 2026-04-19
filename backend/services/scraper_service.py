import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import hashlib
import json
import re
from typing import Optional, List, Dict
from playwright.async_api import async_playwright

SCRAPE_DELAY_MS = 800
MAX_RESULTS_PER_SOURCE = 25
CONCURRENT_BROWSERS = 5

_BROWSER_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
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
    def normalize(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()

    raw = f"{normalize(title)}|{normalize(company)}|{normalize(location)}"
    return hashlib.md5(raw.encode()).hexdigest()


def _is_stale(posted_text: str) -> bool:
    if not posted_text:
        return False
    text = posted_text.lower()
    patterns = [r"(\d+)\s*month", r"(\d+)\s*year"]
    for pat in patterns:
        m = re.search(pat, text)
        if m and int(m.group(1)) >= 1:
            return True
    return False


def _clean(text: str) -> str:
    return " ".join(text.strip().split())


def _preserve_structure(text: str) -> str:
    if not text:
        return ""

    text = text.replace("\r", "\n").replace("\xa0", " ")
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.split("\n")]
    cleaned_lines = [line for line in lines if line]

    section_headers = {
        "about the job", "job description", "responsibilities", "qualifications", "preferred",
        "about us", "working with us", "we are", "health, safety and wellbeing",
        "inclusivity and diversity", "seniority level", "employment type", "job function",
        "industries", "bgv:", "finance/budgetary responsibilities", "our hybrid working module",
        "notice to third party agencies:",
    }

    formatted: list[str] = []
    for line in cleaned_lines:
        lower = line.lower().strip(":")
        if lower in section_headers:
            if formatted and formatted[-1] != "":
                formatted.append("")
            formatted.append(line)
            continue

        if formatted and formatted[-1] in section_headers:
            formatted.append(f"- {line.lstrip('-• ')}")
        else:
            formatted.append(line)

    text = "\n".join(formatted)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


async def _block_resources(route, request):
    if request.resource_type in ("image", "media", "font", "stylesheet"):
        await route.abort()
    else:
        await route.continue_()


async def _scrape_indeed(role: str, location: str, page, page_num: int = 1) -> list[dict]:
    jobs = []
    try:
        start_param = f"&start={(page_num - 1) * 10}" if page_num > 1 else ""
        url = f"https://in.indeed.com/jobs?q={role.replace(' ', '+')}&l={location.replace(' ', '+')}&fromage=30{start_param}"
        await page.route("**/*", _block_resources)
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(SCRAPE_DELAY_MS)

        cards = await page.query_selector_all("[data-testid='slider_item'], .job_seen_beacon")
        for card in cards[:MAX_RESULTS_PER_SOURCE]:
            try:
                title_el = await card.query_selector("[data-testid='jobTitle'] span, .jobTitle span")
                company_el = await card.query_selector("[data-testid='company-name'], .companyName")
                location_el = await card.query_selector("[data-testid='text-location'], .companyLocation")
                link_el = await card.query_selector("a[data-testid='job-title-link'], a.jcs-JobTitle")
                date_el = await card.query_selector("[data-testid='myJobsStateDate'], .date")
                salary_el = await card.query_selector("[class*='salary-snippet'], [class*='salary-container']")
                snippet_el = await card.query_selector(".job-snippet, [class*='snippet']")

                title = await title_el.inner_text() if title_el else ""
                company = await company_el.inner_text() if company_el else ""
                loc = await location_el.inner_text() if location_el else ""
                href = await link_el.get_attribute("href") if link_el else ""
                date_text = await date_el.inner_text() if date_el else ""
                salary_text = await salary_el.inner_text() if salary_el else ""
                snippet_text = await snippet_el.inner_text() if snippet_el else ""

                if not title or not company:
                    continue
                if _is_stale(date_text):
                    continue

                apply_link = f"https://in.indeed.com{href}" if href and href.startswith("/") else href
                jobs.append({
                    "title": _clean(title),
                    "company": _clean(company),
                    "location": _clean(loc),
                    "description": _clean(snippet_text),
                    "apply_link": apply_link,
                    "source": "indeed",
                    "posted_date": _clean(date_text),
                    "salary": _clean(salary_text),
                    "experience": "",
                })
            except Exception:
                continue
    except Exception:
        pass
    return jobs


async def _scrape_naukri(role: str, location: str, page, page_num: int = 1) -> list[dict]:
    jobs = []
    try:
        slug_role = role.lower().replace(" ", "-")
        slug_loc = location.lower().replace(" ", "-")
        url = f"https://www.naukri.com/{slug_role}-jobs-in-{slug_loc}"
        if page_num > 1:
            url += f"-{page_num}"
        await page.route("**/*", _block_resources)
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(SCRAPE_DELAY_MS)

        cards = await page.query_selector_all(".srp-jobtuple-wrapper, article.jobTuple")
        for card in cards[:MAX_RESULTS_PER_SOURCE]:
            try:
                title_el = await card.query_selector(".title, a.title")
                company_el = await card.query_selector(".comp-name, .companyInfo a")
                location_el = await card.query_selector(".locWdth, .location span")
                link_el = await card.query_selector("a.title")
                date_el = await card.query_selector(".job-post-day, .freshness")
                salary_el = await card.query_selector(".salni, .salary")
                exp_el = await card.query_selector(".expwdth, .experience, .exp")
                desc_el = await card.query_selector(".job-desc, .job-description, [class*='description']")

                title = await title_el.inner_text() if title_el else ""
                company = await company_el.inner_text() if company_el else ""
                loc = await location_el.inner_text() if location_el else ""
                href = await link_el.get_attribute("href") if link_el else ""
                date_text = await date_el.inner_text() if date_el else ""
                salary_text = await salary_el.inner_text() if salary_el else ""
                exp_text = await exp_el.inner_text() if exp_el else ""
                desc_text = await desc_el.inner_text() if desc_el else ""

                if not title or not company:
                    continue
                if _is_stale(date_text):
                    continue

                jobs.append({
                    "title": _clean(title),
                    "company": _clean(company),
                    "location": _clean(loc),
                    "description": _clean(desc_text),
                    "apply_link": href or "",
                    "source": "naukri",
                    "posted_date": _clean(date_text),
                    "salary": _clean(salary_text),
                    "experience": _clean(exp_text),
                })
            except Exception:
                continue
    except Exception:
        pass
    return jobs


async def _scrape_linkedin(role: str, location: str, page, page_num: int = 1) -> list[dict]:
    jobs = []
    try:
        start_param = f"&start={(page_num - 1) * 25}" if page_num > 1 else ""
        url = (
            f"https://www.linkedin.com/jobs/search/?keywords={role.replace(' ', '%20')}"
            f"&location={location.replace(' ', '%20')}&f_TPR=r2592000&f_WT=1,2,3{start_param}"
        )
        await page.route("**/*", _block_resources)
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(SCRAPE_DELAY_MS)

        cards = await page.query_selector_all(".jobs-search__results-list li, .base-card")
        for card in cards[:MAX_RESULTS_PER_SOURCE]:
            try:
                title_el = await card.query_selector("h3.base-search-card__title")
                company_el = await card.query_selector("h4.base-search-card__subtitle")
                location_el = await card.query_selector(".job-search-card__location")
                link_el = await card.query_selector("a.base-card__full-link")
                date_el = await card.query_selector("time")
                benefit_el = await card.query_selector(".job-search-card__benefits, [class*='salary']")

                title = await title_el.inner_text() if title_el else ""
                company = await company_el.inner_text() if company_el else ""
                loc = await location_el.inner_text() if location_el else ""
                href = await link_el.get_attribute("href") if link_el else ""
                date_text = await date_el.get_attribute("datetime") if date_el else ""
                benefit_text = await benefit_el.inner_text() if benefit_el else ""

                if not title or not company:
                    continue

                jobs.append({
                    "title": _clean(title),
                    "company": _clean(company),
                    "location": _clean(loc),
                    "description": "",
                    "apply_link": href or "",
                    "source": "linkedin",
                    "posted_date": date_text or "",
                    "salary": _clean(benefit_text),
                    "experience": "",
                })
            except Exception:
                continue
    except Exception:
        pass
    return jobs


async def _scrape_internshala(role: str, location: str, page, page_num: int = 1) -> list[dict]:
    jobs = []
    try:
        slug = role.lower().replace(" ", "-")
        url = f"https://internshala.com/jobs/{slug}-jobs-in-{location.lower().replace(' ', '-')}"
        if page_num > 1:
            url += f"/page-{page_num}"
        await page.route("**/*", _block_resources)
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(SCRAPE_DELAY_MS)

        cards = await page.query_selector_all(".internship-item, .individual_internship")
        for card in cards[:MAX_RESULTS_PER_SOURCE]:
            try:
                title_el = await card.query_selector(".job-internship-name, .profile")
                company_el = await card.query_selector(".company-name")
                location_el = await card.query_selector(".location_link, .locations")
                link_el = await card.query_selector("a.view_detail_button, a[href*='/jobs/detail/']")
                salary_el = await card.query_selector(".salary_container_desktop, .stipend")
                desc_el = await card.query_selector(".overview-section")

                title = await title_el.inner_text() if title_el else ""
                company = await company_el.inner_text() if company_el else ""
                loc = await location_el.inner_text() if location_el else ""
                href = await link_el.get_attribute("href") if link_el else ""
                salary_text = await salary_el.inner_text() if salary_el else ""
                desc_text = await desc_el.inner_text() if desc_el else ""

                if not title or not company:
                    continue

                apply_link = f"https://internshala.com{href}" if href and href.startswith("/") else href
                jobs.append({
                    "title": _clean(title),
                    "company": _clean(company),
                    "location": _clean(loc),
                    "description": _clean(desc_text),
                    "apply_link": apply_link,
                    "source": "internshala",
                    "posted_date": "",
                    "salary": _clean(salary_text),
                    "experience": "",
                })
            except Exception:
                continue
    except Exception:
        pass
    return jobs


async def _scrape_wellfound(role: str, location: str, page, page_num: int = 1) -> list[dict]:
    jobs = []
    try:
        url = f"https://wellfound.com/jobs?q={role.replace(' ', '+')}&l={location.replace(' ', '+')}"
        if page_num > 1:
            url += f"&page={page_num}"
        await page.route("**/*", _block_resources)
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(SCRAPE_DELAY_MS)

        cards = await page.query_selector_all("[data-test='StartupResult'], [class*='JobCard']")
        for card in cards[:MAX_RESULTS_PER_SOURCE]:
            try:
                title_el = await card.query_selector("a[class*='jobTitle'], h2")
                company_el = await card.query_selector("a[class*='companyLink'], h3")
                location_el = await card.query_selector("[class*='location']")
                link_el = await card.query_selector("a[href*='/jobs/']")
                salary_el = await card.query_selector("[class*='compensation'], [class*='salary']")
                desc_el = await card.query_selector("[class*='description'], [class*='jobDescription']")

                title = await title_el.inner_text() if title_el else ""
                company = await company_el.inner_text() if company_el else ""
                loc = await location_el.inner_text() if location_el else ""
                href = await link_el.get_attribute("href") if link_el else ""
                salary_text = await salary_el.inner_text() if salary_el else ""
                desc_text = await desc_el.inner_text() if desc_el else ""

                if not title or not company:
                    continue

                apply_link = f"https://wellfound.com{href}" if href and href.startswith("/") else href
                jobs.append({
                    "title": _clean(title),
                    "company": _clean(company),
                    "location": _clean(loc),
                    "description": _clean(desc_text),
                    "apply_link": apply_link,
                    "source": "wellfound",
                    "posted_date": "",
                    "salary": _clean(salary_text),
                    "experience": "",
                })
            except Exception:
                continue
    except Exception:
        pass
    return jobs


async def scrape_jobs(role: str, location: str, expanded_roles: list[str], expanded_locations: list[str], page: int = 1) -> list[dict]:
    loop = asyncio.get_event_loop()
    if sys.platform == 'win32' and not isinstance(loop, getattr(asyncio, 'ProactorEventLoop', type(None))):
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=1) as executor:
            return await loop.run_in_executor(executor, _sync_scrape_jobs, role, location, expanded_roles, expanded_locations, page)
    return await _scrape_jobs_logic(role, location, expanded_roles, expanded_locations, page)


def _sync_scrape_jobs(role, location, expanded_roles, expanded_locations, page_num=1):
    new_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(new_loop)
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    try:
        return new_loop.run_until_complete(_scrape_jobs_logic(role, location, expanded_roles, expanded_locations, page_num))
    finally:
        new_loop.close()


def _build_relevance_keywords(role: str, expanded_roles: list[str]) -> list[str]:
    stop_words = {
        "analyst", "engineer", "developer", "manager", "specialist", "intern",
        "associate", "senior", "junior", "lead", "operations", "center",
        "team", "blue", "red", "executive", "assistant", "consultant",
        "officer", "professional", "expert", "level", "staff", "member",
        "the", "and", "for", "with",
    }
    keywords: set[str] = set()
    for r in [role] + expanded_roles:
        for word in r.lower().split():
            if len(word) > 2 and word not in stop_words:
                keywords.add(word)
    return list(keywords)


async def _scrape_jobs_logic(role: str, location: str, expanded_roles: list[str], expanded_locations: list[str], page_num: int = 1) -> list[dict]:
    all_jobs = []
    seen_hashes: set[str] = set()
    semaphore = asyncio.Semaphore(CONCURRENT_BROWSERS)

    relevant_keywords = _build_relevance_keywords(role, expanded_roles)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=_BROWSER_ARGS)

        async def run_scraper(scraper_fn, s_role, s_loc):
            async with semaphore:
                context = await browser.new_context(
                    user_agent=_next_ua(),
                    viewport={"width": 1280, "height": 800},
                    java_script_enabled=True,
                )
                pg = await context.new_page()
                await pg.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
                try:
                    results = await scraper_fn(s_role, s_loc, pg, page_num)
                    return results, s_role, s_loc
                except Exception:
                    return [], s_role, s_loc
                finally:
                    await pg.close()
                    await context.close()

        scrapers = [_scrape_indeed, _scrape_naukri, _scrape_linkedin, _scrape_internshala, _scrape_wellfound]
        tasks = []

        for s_role in expanded_roles[:5]:
            for s_loc in expanded_locations[:3]:
                for scraper in scrapers:
                    tasks.append(run_scraper(scraper, s_role, s_loc))

        results_list = await asyncio.gather(*tasks, return_exceptions=True)

        for item in results_list:
            if isinstance(item, Exception):
                continue
            results, s_role, s_loc = item
            for job in results:
                title_lower = job["title"].lower()

                if relevant_keywords:
                    is_relevant = any(k in title_lower for k in relevant_keywords)
                    if not is_relevant and role.lower() in title_lower:
                        is_relevant = True
                else:
                    is_relevant = True

                if not is_relevant:
                    continue

                h = _hash_job(job["title"], job["company"], job["location"])
                if h not in seen_hashes:
                    seen_hashes.add(h)
                    job["hash"] = h
                    job["search_query"] = f"{s_role} in {s_loc}"
                    all_jobs.append(job)

        await browser.close()

    return all_jobs


async def fetch_job_description(url: str, source: str, keywords: str = "") -> dict:
    loop = asyncio.get_event_loop()
    if sys.platform == 'win32' and not isinstance(loop, getattr(asyncio, 'ProactorEventLoop', type(None))):
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=1) as executor:
            return await loop.run_in_executor(executor, _sync_fetch_job_description, url, source, keywords)
    return await _fetch_job_description_logic(url, source, keywords)


def _sync_fetch_job_description(url: str, source: str, keywords: str = "") -> dict:
    new_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(new_loop)
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    try:
        return new_loop.run_until_complete(_fetch_job_description_logic(url, source, keywords))
    finally:
        new_loop.close()


_SOURCE_SELECTORS = {
    "indeed": ["#jobDescriptionText", ".jobsearch-jobDescriptionText"],
    "naukri": [".job-desc", ".description", "[class*='job-description']"],
    "linkedin": [".show-more-less-html__markup", ".description__text", ".job-description"],
    "internshala": [".text-container", ".job_description", "[class*='description']"],
    "wellfound": [".job-description", "[class*='description']", "main"],
}

# These are common selectors used by popular ATS platforms and company career pages
_CAREER_PAGE_SELECTORS = [
    # Greenhouse
    "#content", "#app_body", ".job__description", "#job-description",
    # Lever
    ".posting-page", ".section-wrapper", ".posting",
    # Workday
    "[data-automation-id='jobPostingDescription']", ".wd-popup-content",
    # AshbyHQ
    ".ashby-job-posting-brief-description", "[class*='JobPosting']",
    # SmartRecruiters
    ".job-description", "#job-description-container",
    # BambooHR
    ".BambooHR-ATS-board", "[class*='bamboohr']",
    # Taleo
    "#requisitionDescriptionInterface", ".reqLabel",
    # Generic patterns
    "[class*='job-description']", "[id*='job-description']",
    "[class*='jobDescription']", "[id*='jobDescription']",
    "[class*='job_description']", "[id*='job_description']",
    "[class*='JobDescription']",
    "[class*='description-content']", "[class*='job-detail']",
    "[class*='job-content']", "[class*='role-description']",
    "article.job", "section.description",
    "main article", "article", "main",
]

# Job-signal keywords used to score text blocks for relevance
_JOB_SIGNAL_KEYWORDS = [
    "responsibilities", "requirements", "qualifications", "experience",
    "skills", "you will", "we are looking", "you'll", "what you'll",
    "about the role", "about the job", "job description", "role overview",
    "what we're looking", "ideal candidate", "minimum qualifications",
    "preferred qualifications", "must have", "nice to have", "benefits",
    "what you bring", "your background", "who you are",
]


async def _fetch_job_description_logic(url: str, source: str, keywords: str = "") -> dict:
    """Scrape a career page URL and return the best job description text found."""
    # Merge user keywords with built-in job-signal keywords for scoring
    user_kws = [k.strip().lower() for k in keywords.split() if k.strip()] if keywords else []
    all_signals = _JOB_SIGNAL_KEYWORDS + user_kws
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=_BROWSER_ARGS)
        context = await browser.new_context(
            user_agent=_next_ua(),
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()
        await page.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        # Only block media and fonts — keep CSS and scripts so JS-rendered pages work
        await page.route("**/*", lambda route, req: (
            route.abort() if req.resource_type in ("media", "font") else route.continue_()
        ))
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=35000)
            # Give JS-heavy ATS pages time to finish rendering
            try:
                await page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            await page.wait_for_timeout(2500)

            desc = ""
            all_selectors = _SOURCE_SELECTORS.get(source, []) + _CAREER_PAGE_SELECTORS

            # Strategy 1: try known selectors, pick the one with highest job-signal density
            best_score = 0
            for sel in all_selectors:
                try:
                    el = await page.query_selector(sel)
                    if el:
                        text = (await el.inner_text()).strip()
                        if len(text) < 100:
                            continue
                        text_lower = text.lower()
                        signal_score = sum(1 for kw in all_signals if kw in text_lower)
                        # User keywords count double — they are the strongest signal
                        signal_score += sum(2 for kw in user_kws if kw in text_lower)
                        if signal_score > best_score or (signal_score == best_score and len(text) > len(desc)):
                            best_score = signal_score
                            desc = text
                        if best_score >= 5:
                            break
                except Exception:
                    continue

            # Strategy 2: if selectors gave nothing useful, scan all visible blocks
            if not desc or best_score < 2:
                try:
                    # Pass user keywords into JS for browser-side scoring
                    user_kws_js = json.dumps(user_kws)
                    desc = await page.evaluate(f"""
                        () => {{
                            const JOB_SIGNALS = [
                                'responsibilities', 'requirements', 'qualifications', 'experience',
                                'skills', 'you will', 'we are looking', "you'll", 'about the role',
                                'must have', 'benefits', 'who you are', 'what you bring',
                            ];
                            const USER_KWS = {user_kws_js};
                            const allSignals = [...JOB_SIGNALS, ...USER_KWS];
                            const elems = Array.from(document.querySelectorAll(
                                'section, article, div, main'
                            ));
                            let best = {{ score: 0, text: '' }};
                            for (const el of elems) {{
                                const text = (el.innerText || '').trim();
                                if (text.length < 200) continue;
                                const lower = text.toLowerCase();
                                let score = allSignals.filter(kw => lower.includes(kw)).length;
                                // Double weight on user keywords
                                score += USER_KWS.filter(kw => lower.includes(kw)).length;
                                if (score > best.score || (score === best.score && text.length > best.text.length)) {{
                                    best = {{ score, text }};
                                }}
                            }}
                            return best.score >= 1 ? best.text : document.body.innerText.trim();
                        }}
                    """)
                except Exception:
                    pass

            # Strategy 3: last resort — get full body text and let AI figure it out
            if not desc or len(desc) < 200:
                try:
                    desc = await page.evaluate("document.body.innerText.trim()")
                except Exception:
                    pass

            desc_text = _preserve_structure(desc)

            # Extract structured job data from JSON-LD, Open Graph, and HTML signals
            try:
                structured = await page.evaluate("""() => {
                    const result = { title: '', company: '', location: '' };

                    // 1. JSON-LD schema.org/JobPosting (highest priority)
                    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
                    for (const s of scripts) {
                        try {
                            const data = JSON.parse(s.textContent);
                            const items = Array.isArray(data) ? data : [data];
                            for (const item of items) {
                                const t = item['@type'];
                                if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) {
                                    result.title = item.title || result.title;
                                    result.company = (item.hiringOrganization && item.hiringOrganization.name) || result.company;
                                    result.location = (item.jobLocation && item.jobLocation.address &&
                                        (item.jobLocation.address.addressLocality || item.jobLocation.address.addressRegion))
                                        || result.location;
                                    break;
                                }
                            }
                        } catch(e) {}
                        if (result.title && result.company) break;
                    }

                    // 2. Open Graph / meta tags
                    if (!result.title) {
                        const ogTitle = document.querySelector('meta[property="og:title"]');
                        const metaTitle = document.querySelector('meta[name="title"]');
                        result.title = (ogTitle && ogTitle.content) || (metaTitle && metaTitle.content) || '';
                    }
                    if (!result.company) {
                        const ogSite = document.querySelector('meta[property="og:site_name"]');
                        result.company = (ogSite && ogSite.content) || '';
                    }

                    // 3. Page <title> and <h1> — strip company name if appended with | or -
                    if (!result.title) {
                        const pageTitle = document.title || '';
                        result.title = pageTitle.split(/[|\\-–]/)[0].trim();
                    }
                    if (!result.title) {
                        const h1 = document.querySelector('h1');
                        result.title = h1 ? h1.innerText.trim() : '';
                    }

                    // 4. Domain as fallback company name
                    if (!result.company) {
                        try {
                            const hostname = new URL(window.location.href).hostname;
                            result.company = hostname.replace('www.', '').split('.')[0];
                        } catch(e) {}
                    }

                    return result;
                }""")
            except Exception:
                structured = {"title": "", "company": "", "location": ""}

            emails = re.findall(
                r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', desc_text
            )
            filtered_emails = [
                e for e in emails
                if not any(x in e.lower() for x in ["noreply", "no-reply", "support", "info@", "hello@", "team@"])
            ]
            hr_email = filtered_emails[0] if filtered_emails else (emails[0] if emails else None)

            return {
                "description": desc_text[:10000],
                "hr_email": hr_email,
                "title": structured.get("title", "").strip(),
                "company": structured.get("company", "").strip(),
                "location": structured.get("location", "").strip(),
            }

        except Exception as e:
            return {"description": "", "hr_email": None, "error": str(e)}
        finally:
            await browser.close()
