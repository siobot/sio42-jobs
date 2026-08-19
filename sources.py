"""Fetch and normalize job postings from ATS APIs and remote job boards."""

import os
import xml.etree.ElementTree as ET

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


def fetch_greenhouse(slug, company_name):
    """Fetch all jobs from a Greenhouse board and normalize them.

    Args:
        slug: Greenhouse board slug (e.g. "intercom")
        company_name: Display name for the company

    Returns:
        List of normalized job dicts.
    """
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    jobs = []
    for raw in data.get("jobs", []):
        location = raw.get("location", {})
        location_name = location.get("name", "") if isinstance(location, dict) else str(location)

        jobs.append({
            "id": f"gh-{slug}-{raw['id']}",
            "source": "greenhouse",
            "company": company_name,
            "title": raw.get("title", ""),
            "location": location_name,
            "url": raw.get("absolute_url", ""),
            "date": (raw.get("updated_at") or "")[:10],
        })

    return jobs


def fetch_ashby(slug, company_name):
    """Fetch all jobs from an Ashby job board and normalize them.

    Args:
        slug: Ashby board slug (e.g. "notion", "linear")
        company_name: Display name for the company

    Returns:
        List of normalized job dicts.
    """
    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    jobs = []
    for raw in data.get("jobs", []):
        # Location can be a string, dict, or missing — normalize defensively
        location = raw.get("location", "")
        if isinstance(location, dict):
            location = location.get("name", "")
        elif not isinstance(location, str):
            location = str(location)

        jobs.append({
            "id": f"ash-{slug}-{raw['id']}",
            "source": "ashby",
            "company": company_name,
            "title": raw.get("title", ""),
            "location": location,
            "url": raw.get("jobUrl", ""),
            "date": (raw.get("publishedAt") or "")[:10],
        })

    return jobs


def fetch_lever(slug, company_name):
    """Fetch all jobs from a Lever job board and normalize them.

    Args:
        slug: Lever company slug (e.g. "appfollow")
        company_name: Display name for the company

    Returns:
        List of normalized job dicts.
    """
    url = f"https://api.lever.co/v0/postings/{slug}"
    resp = requests.get(url, params={"mode": "json"}, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    jobs = []
    for raw in data:
        location = raw.get("categories", {}).get("location", "")
        jobs.append({
            "id": f"lev-{slug}-{raw.get('id', '')}",
            "source": "lever",
            "company": company_name,
            "title": raw.get("text", ""),
            "location": location,
            "url": raw.get("hostedUrl", ""),
            "date": "",
        })

    return jobs


def fetch_adzuna(adzuna_config):
    """Fetch jobs from Adzuna across all configured queries and countries.

    Args:
        adzuna_config: The 'adzuna' section of config.json.

    Returns:
        List of normalized job dicts (deduplicated by Adzuna job ID).
    """
    app_id = os.environ.get("ADZUNA_APP_ID", "")
    app_key = os.environ.get("ADZUNA_APP_KEY", "")

    if not app_id or not app_key:
        print("  Adzuna: SKIPPED — ADZUNA_APP_ID / ADZUNA_APP_KEY not set in .env")
        return []

    countries = adzuna_config.get("countries", ["gb"])
    queries = adzuna_config.get("queries", [])
    per_page = adzuna_config.get("results_per_page", 50)

    seen_ids = set()
    jobs = []

    for country in countries:
        for query in queries:
            try:
                url = f"https://api.adzuna.com/v1/api/jobs/{country}/search/1"
                params = {
                    "app_id": app_id,
                    "app_key": app_key,
                    "what": query,
                    "results_per_page": per_page,
                }
                resp = requests.get(url, params=params, timeout=15)
                resp.raise_for_status()
                data = resp.json()

                count = 0
                for raw in data.get("results", []):
                    adz_id = str(raw.get("id", ""))
                    if adz_id in seen_ids:
                        continue
                    seen_ids.add(adz_id)

                    company = raw.get("company", {})
                    company_name = company.get("display_name", "") if isinstance(company, dict) else str(company)
                    location = raw.get("location", {})
                    location_name = location.get("display_name", "") if isinstance(location, dict) else str(location)

                    jobs.append({
                        "id": f"adz-{adz_id}",
                        "source": "adzuna",
                        "company": company_name,
                        "title": raw.get("title", ""),
                        "location": location_name,
                        "url": raw.get("redirect_url", ""),
                        "date": (raw.get("created") or "")[:10],
                    })
                    count += 1

                print(f"  Adzuna/{country}/{query}: {count} jobs")
            except Exception as e:
                print(f"  Adzuna/{country}/{query}: ERROR — {e}")

    return jobs


def fetch_doist():
    """Fetch jobs from the Doist careers API.

    Returns:
        List of normalized job dicts.
    """
    url = "https://doist.com/api/jobs"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    jobs = []
    for raw in data:
        job_id = raw.get("shortcode", raw.get("id", raw.get("title", "")))

        # Location can be a string or a dict with location_str/country keys
        location = raw.get("location", "Remote")
        if isinstance(location, dict):
            location = location.get("location_str") or location.get("country") or "Remote"
            if raw.get("location", {}).get("telecommuting"):
                location = f"Remote — {location}" if location != "Remote" else "Remote"
        elif not isinstance(location, str):
            location = str(location)

        jobs.append({
            "id": f"doist-{job_id}",
            "source": "doist",
            "company": "Doist",
            "title": raw.get("title", raw.get("name", "")),
            "location": location,
            "url": raw.get("url", f"https://doist.com/careers/{job_id}"),
            "date": (raw.get("published_at", raw.get("created_at", "")) or "")[:10],
        })

    return jobs


def fetch_remotive():
    """Fetch jobs from the Remotive API.

    Returns:
        List of normalized job dicts.
    """
    url = "https://remotive.com/api/remote-jobs"
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    data = resp.json()

    jobs = []
    for raw in data.get("jobs", []):
        jobs.append({
            "id": f"rem-{raw.get('id', '')}",
            "source": "remotive",
            "company": raw.get("company_name", ""),
            "title": raw.get("title", ""),
            "location": raw.get("candidate_required_location", "Anywhere"),
            "url": raw.get("url", ""),
            "date": (raw.get("publication_date") or "")[:10],
        })

    return jobs


def fetch_weworkremotely():
    """Fetch jobs from We Work Remotely RSS feed.

    Returns:
        List of normalized job dicts.
    """
    url = "https://weworkremotely.com/remote-jobs.rss"
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()

    root = ET.fromstring(resp.content)
    jobs = []

    for item in root.findall(".//item"):
        title_raw = item.findtext("title", "")
        link = item.findtext("link", "")
        region = item.findtext("region", "Anywhere")
        pub_date = item.findtext("pubDate", "")

        # Title format is usually "Company: Job Title"
        if ": " in title_raw:
            company, title = title_raw.split(": ", 1)
        else:
            company = ""
            title = title_raw

        # Use the link as the unique ID since there's no explicit ID in RSS
        job_id = link.rstrip("/").split("/")[-1] if link else title_raw

        jobs.append({
            "id": f"wwr-{job_id}",
            "source": "weworkremotely",
            "company": company.strip(),
            "title": title.strip(),
            "location": region or "Remote",
            "url": link,
            "date": pub_date[:16] if pub_date else "",
        })

    return jobs


def fetch_workingnomads():
    """Fetch jobs from Working Nomads API.

    Returns:
        List of normalized job dicts.
    """
    url = "https://www.workingnomads.com/api/exposed_jobs/"
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    data = resp.json()

    jobs = []
    for raw in data:
        slug = raw.get("slug", "")
        jobs.append({
            "id": f"wn-{slug}" if slug else f"wn-{raw.get('title', '')}",
            "source": "workingnomads",
            "company": raw.get("company_name", ""),
            "title": raw.get("title", ""),
            "location": raw.get("location", "Remote"),
            "url": raw.get("url", ""),
            "date": (raw.get("pub_date") or "")[:10],
        })

    return jobs
