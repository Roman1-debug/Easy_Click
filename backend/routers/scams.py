import aiohttp
import json
import asyncio
import time
import urllib.parse
import email.utils
import xml.etree.ElementTree as ET
from fastapi import APIRouter, Depends, Query
try:
    from backend.middleware.auth import get_current_user
except ImportError:
    from middleware.auth import get_current_user

router = APIRouter(prefix="/scams", tags=["scams"])

REDDIT_SUBREDDITS = [
    "Scams", "ScamsIndia", "recruitinghell", "cscareerquestions",
    "WorkOnline", "india", "mumbai", "bangalore", "delhi", "antiwork",
    "jobs", "phishing", "cybersecurity", "indianworkplace",
]

_HEADERS = {
    "User-Agent": "EasyClick/1.0 (job-safety-research-tool)",
    "Accept": "application/json, text/plain, */*",
}

# Posts older than 5 years are considered stale for the feed
_FEED_CUTOFF = int(time.time()) - (5 * 365 * 24 * 3600)


# ─── Sources ──────────────────────────────────────────────────────────────────

async def _fetch_reddit(session: aiohttp.ClientSession, subreddit: str, keyword: str, time_filter: str = "month") -> list[dict]:
    query = keyword if "scam" in keyword.lower() or "fraud" in keyword.lower() else f"{keyword} scam"
    encoded = urllib.parse.quote(query)
    url = (
        f"https://www.reddit.com/r/{subreddit}/search.json"
        f"?q={encoded}&sort=new&restrict_sr=1&limit=15&t={time_filter}"
    )
    results = []
    try:
        async with session.get(url, headers=_HEADERS, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                return []
            data = await resp.json(content_type=None)
            for child in data.get("data", {}).get("children", []):
                post = child.get("data", {})
                text = post.get("selftext", "").strip()
                if not text or text in ("[removed]", "[deleted]"):
                    continue
                ts = int(post.get("created_utc", 0))
                results.append({
                    "id": f"reddit_{post.get('id')}",
                    "title": post.get("title", ""),
                    "snippet": text[:400] + ("..." if len(text) > 400 else ""),
                    "url": f"https://www.reddit.com{post.get('permalink', '')}",
                    "source": f"Reddit r/{subreddit}",
                    "author": post.get("author", ""),
                    "created_utc": ts,
                    "logo": "https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png",
                })
    except Exception:
        pass
    return results


async def _fetch_reddit_all_subs(session: aiohttp.ClientSession, keyword: str, time_filter: str = "month") -> list[dict]:
    """Search across ALL of reddit (not subreddit-restricted) for a keyword."""
    query = keyword if "scam" in keyword.lower() else f"{keyword} scam OR fraud OR fake"
    encoded = urllib.parse.quote(query)
    url = (
        f"https://www.reddit.com/search.json"
        f"?q={encoded}&sort=new&limit=25&t={time_filter}"
    )
    results = []
    try:
        async with session.get(url, headers=_HEADERS, timeout=aiohttp.ClientTimeout(total=12)) as resp:
            if resp.status != 200:
                return []
            data = await resp.json(content_type=None)
            for child in data.get("data", {}).get("children", []):
                post = child.get("data", {})
                text = post.get("selftext", "").strip()
                title = post.get("title", "").strip()
                if not title:
                    continue
                if not text or text in ("[removed]", "[deleted]"):
                    text = ""
                ts = int(post.get("created_utc", 0))
                sub = post.get("subreddit", "")
                results.append({
                    "id": f"reddit_{post.get('id')}",
                    "title": title,
                    "snippet": text[:400] if text else title,
                    "url": f"https://www.reddit.com{post.get('permalink', '')}",
                    "source": f"Reddit r/{sub}" if sub else "Reddit",
                    "author": post.get("author", ""),
                    "created_utc": ts,
                    "logo": "https://www.redditstatic.com/desktop2x/img/favicon/android-icon-192x192.png",
                })
    except Exception:
        pass
    return results


async def _fetch_google_news(session: aiohttp.ClientSession, keyword: str) -> list[dict]:
    """Fetch from Google News RSS — no auth, very reliable."""
    encoded = urllib.parse.quote(keyword)
    url = f"https://news.google.com/rss/search?q={encoded}&hl=en-IN&gl=IN&ceid=IN:en"
    results = []
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                return []
            text = await resp.text()
            root = ET.fromstring(text)
            for item in root.findall(".//item")[:15]:
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                desc_raw = (item.findtext("description") or "").strip()
                pub_date = item.findtext("pubDate") or ""
                if not title:
                    continue
                # Strip basic HTML
                import re as _re
                desc = _re.sub(r"<[^>]+>", " ", desc_raw).strip()
                try:
                    ts = int(email.utils.parsedate_to_datetime(pub_date).timestamp()) if pub_date else 0
                except Exception:
                    ts = 0
                results.append({
                    "id": f"gnews_{abs(hash(link))}",
                    "title": title,
                    "snippet": desc[:400] or title,
                    "url": link,
                    "source": "Google News",
                    "author": "",
                    "created_utc": ts,
                    "logo": "https://www.google.com/favicon.ico",
                })
    except Exception:
        pass
    return results


async def _fetch_hackernews(session: aiohttp.ClientSession, keyword: str) -> list[dict]:
    """HackerNews via Algolia API — no auth, structured, very reliable."""
    encoded = urllib.parse.quote(keyword)
    url = f"https://hn.algolia.com/api/v1/search?query={encoded}&tags=story&hitsPerPage=10"
    results = []
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                return []
            data = await resp.json(content_type=None)
            for hit in data.get("hits", []):
                title = hit.get("title", "").strip()
                hn_url = hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
                snippet = (hit.get("story_text") or "")[:400]
                ts = hit.get("created_at_i", 0)
                if not title:
                    continue
                results.append({
                    "id": f"hn_{hit.get('objectID')}",
                    "title": title,
                    "snippet": snippet or title,
                    "url": hn_url,
                    "source": "HackerNews",
                    "author": hit.get("author", ""),
                    "created_utc": int(ts),
                    "logo": "https://news.ycombinator.com/favicon.ico",
                })
    except Exception:
        pass
    return results


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _deduplicate(posts: list[dict]) -> list[dict]:
    seen: set = set()
    out = []
    for p in posts:
        if p["id"] not in seen:
            seen.add(p["id"])
            out.append(p)
    return out


def _relevance_score(post: dict, query_lower: str) -> int:
    score = 0
    title_l = post["title"].lower()
    snippet_l = post["snippet"].lower()
    words = query_lower.split()
    # Exact phrase match is highest
    if query_lower in title_l:
        score += 300
    if query_lower in snippet_l:
        score += 150
    # Per-word matches
    for w in words:
        if len(w) < 3:
            continue
        if w in title_l:
            score += 50
        if w in snippet_l:
            score += 20
    return score


def _build_search_variants(q: str) -> list[str]:
    """Fan out a company/topic query into multiple targeted search strings."""
    base = q.strip()
    return [
        base,
        f"{base} scam",
        f"{base} fraud",
        f"{base} fake",
        f"{base} legit",
        f"{base} review warning",
        f"{base} job scam",
        f"is {base} scam",
    ]


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("")
async def get_recent_scams(user=Depends(get_current_user)):
    # Use generic defaults for local mode
    industry = "IT"
    country_pref = "India"

    search_terms = [
        f"{industry} job scam",
        f"{country_pref} hiring fraud",
        f"fake job offer {country_pref}",
        "work from home scam data entry",
        "telegram job scam india",
    ]

    async with aiohttp.ClientSession() as session:
        tasks = []
        for sub in REDDIT_SUBREDDITS[:6]:
            for term in search_terms[:3]:
                tasks.append(_fetch_reddit(session, sub, term, "month"))
        for term in search_terms:
            tasks.append(_fetch_google_news(session, f"{term} fraud warning"))
        for term in search_terms[:2]:
            tasks.append(_fetch_hackernews(session, term))

        raw = await asyncio.gather(*tasks, return_exceptions=True)

    all_posts = []
    for r in raw:
        if isinstance(r, list):
            all_posts.extend(r)

    all_posts = _deduplicate(all_posts)
    all_posts = [p for p in all_posts if p["created_utc"] >= _FEED_CUTOFF or p["created_utc"] == 0]
    all_posts.sort(key=lambda x: x["created_utc"], reverse=True)

    return {"success": True, "data": all_posts[:60], "error": None}


@router.get("/search")
async def search_scams(q: str = Query(..., min_length=2)):
    """Aggressively search multiple sources + query variants for scam reports."""
    q = q.strip()
    if not q:
        return {"success": False, "data": [], "error": "Query is required"}

    variants = _build_search_variants(q)

    async with aiohttp.ClientSession() as session:
        tasks = []
        # Global Reddit search (unrestricted) — most comprehensive
        for variant in variants[:4]:
            tasks.append(_fetch_reddit_all_subs(session, variant, "all"))
        # Subreddit-specific searches with top variants
        for sub in REDDIT_SUBREDDITS:
            tasks.append(_fetch_reddit(session, sub, q, "all"))
            tasks.append(_fetch_reddit(session, sub, f"{q} scam", "all"))
        # Google News
        for variant in variants[:5]:
            tasks.append(_fetch_google_news(session, variant))
        # HackerNews
        for variant in variants[:3]:
            tasks.append(_fetch_hackernews(session, variant))

        raw = await asyncio.gather(*tasks, return_exceptions=True)

    all_posts = []
    for r in raw:
        if isinstance(r, list):
            all_posts.extend(r)

    all_posts = _deduplicate(all_posts)

    q_lower = q.lower()
    all_posts.sort(
        key=lambda p: (_relevance_score(p, q_lower), p["created_utc"]),
        reverse=True,
    )

    return {"success": True, "data": all_posts[:60], "error": None}




