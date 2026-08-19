#!/usr/bin/env python3
"""Web UI for the job monitor."""

import json
import os
from datetime import datetime, timezone

from flask import Flask, render_template, redirect, url_for, request

from sources import (
    fetch_greenhouse, fetch_ashby, fetch_lever, fetch_doist, fetch_adzuna,
    fetch_remotive, fetch_weworkremotely, fetch_workingnomads,
)
from filters import filter_jobs
from state import load_state, save_state, find_new_jobs, mark_seen


BASE_DIR = os.path.dirname(__file__)
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
LOG_FILE = os.path.join(BASE_DIR, "new_jobs.txt")
DISMISSED_FILE = os.path.join(BASE_DIR, "dismissed.json")
APPLIED_FILE = os.path.join(BASE_DIR, "applied.json")
INTERESTED_FILE = os.path.join(BASE_DIR, "interested.json")
TRACKER_FILE = os.path.join(BASE_DIR, "tracker.json")
CACHE_FILE = os.path.join(BASE_DIR, "last_results.json")
NOTES_FILE = os.path.join(BASE_DIR, "notes.json")

app = Flask(__name__)


def load_config():
    with open(CONFIG_FILE, "r") as f:
        return json.load(f)


def load_dismissed():
    """Load dismissed jobs: {id: {title, company, reason, keywords, date}}."""
    if os.path.exists(DISMISSED_FILE):
        with open(DISMISSED_FILE, "r") as f:
            return json.load(f)
    return {}


def save_dismissed(dismissed):
    with open(DISMISSED_FILE, "w") as f:
        json.dump(dismissed, f, indent=2)


def load_applied():
    """Load applied jobs: {id: {title, company, keywords, url, applied_at}}."""
    if os.path.exists(APPLIED_FILE):
        with open(APPLIED_FILE, "r") as f:
            return json.load(f)
    return {}


def save_applied(applied):
    with open(APPLIED_FILE, "w") as f:
        json.dump(applied, f, indent=2)


def load_interested():
    """Load interested jobs: {id: {title, company, keywords, url, added_at}}."""
    if os.path.exists(INTERESTED_FILE):
        with open(INTERESTED_FILE, "r") as f:
            return json.load(f)
    return {}


def save_interested(interested):
    with open(INTERESTED_FILE, "w") as f:
        json.dump(interested, f, indent=2)


def load_notes():
    """Load notes: {job_id: "note text"}."""
    if os.path.exists(NOTES_FILE):
        with open(NOTES_FILE, "r") as f:
            return json.load(f)
    return {}


def save_notes(notes):
    with open(NOTES_FILE, "w") as f:
        json.dump(notes, f, indent=2)


def load_cache():
    """Load cached job results from last refresh."""
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r") as f:
            return json.load(f)
    return None


def save_cache(data):
    with open(CACHE_FILE, "w") as f:
        json.dump(data, f, indent=2)


def fetch_all(config):
    """Fetch jobs from every configured source."""
    all_jobs = []
    errors = []

    for company in config.get("greenhouse_companies", []):
        try:
            jobs = fetch_greenhouse(company["slug"], company["name"])
            all_jobs.extend(jobs)
        except Exception as e:
            errors.append(f"Greenhouse/{company['name']}: {e}")

    for company in config.get("ashby_companies", []):
        try:
            jobs = fetch_ashby(company["slug"], company["name"])
            all_jobs.extend(jobs)
        except Exception as e:
            errors.append(f"Ashby/{company['name']}: {e}")

    for company in config.get("lever_companies", []):
        try:
            jobs = fetch_lever(company["slug"], company["name"])
            all_jobs.extend(jobs)
        except Exception as e:
            errors.append(f"Lever/{company['name']}: {e}")

    # Adzuna disabled — mostly non-English results and broken redirect links.
    # Remotive / WWR / Working Nomads cover English remote jobs better.
    # To re-enable, uncomment below:
    # adzuna_config = config.get("adzuna", {})
    # if adzuna_config:
    #     try:
    #         jobs = fetch_adzuna(adzuna_config)
    #         all_jobs.extend(jobs)
    #     except Exception as e:
    #         errors.append(f"Adzuna: {e}")

    # Standalone sources + remote job boards
    for name, fetcher in [
        ("Doist", fetch_doist),
        ("Remotive", fetch_remotive),
        ("WeWorkRemotely", fetch_weworkremotely),
        ("WorkingNomads", fetch_workingnomads),
    ]:
        try:
            jobs = fetcher()
            all_jobs.extend(jobs)
        except Exception as e:
            errors.append(f"{name}: {e}")

    return all_jobs, errors


def log_new_jobs(jobs):
    """Append new jobs to the log file."""
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with open(LOG_FILE, "a") as f:
        f.write(f"\n{'=' * 50}\n")
        f.write(f"  {timestamp} — {len(jobs)} new job(s)\n")
        f.write(f"{'=' * 50}\n\n")
        for job in jobs:
            f.write(f"  {job['title']}\n")
            f.write(f"  {job['company']}  •  {job['location']}\n")
            f.write(f"  [{job['source'].upper()}] {job['url']}\n\n")


def _get_manual_companies():
    """Load manual companies annotated with last-checked timestamps."""
    config = load_config()
    tracker_data = load_tracker()
    now = datetime.now(timezone.utc)
    manual = config.get("manual_companies", [])
    for company in manual:
        check = tracker_data["checks"].get(company["name"])
        company["last_checked"] = check if check else None
        if check:
            try:
                dt = datetime.fromisoformat(check)
                delta = now - dt
                company["days_ago"] = delta.days
                company["hours_ago"] = int(delta.total_seconds() // 3600)
                company["mins_ago"] = int(delta.total_seconds() // 60)
            except (ValueError, TypeError):
                company["days_ago"] = 999
                company["hours_ago"] = 999
                company["mins_ago"] = 999999
        else:
            company["days_ago"] = None
    return manual


@app.route("/")
def index():
    state = load_state()
    dismissed = load_dismissed()
    applied = load_applied()
    interested = load_interested()
    dismissed_ids = set(dismissed.keys())
    applied_ids = set(applied.keys())
    interested_ids = set(interested.keys())
    hidden_ids = dismissed_ids | applied_ids
    show_dismissed = request.args.get("dismissed") == "1"
    show_applied = request.args.get("applied") == "1"
    show_interested = request.args.get("interested") == "1"
    show_add = request.args.get("add") == "1"
    showing_list = show_dismissed or show_applied or show_interested or show_add

    # Use cached results if available (so dismiss/restore doesn't lose the list)
    cache = load_cache()
    if cache and not showing_list:
        cached_jobs = [j for j in cache["jobs"] if j["id"] not in hidden_ids]
        # Mark interested jobs
        for j in cached_jobs:
            j["is_interested"] = j["id"] in interested_ids
        return render_template(
            "index.html",
            jobs=cached_jobs,
            new_jobs=[],
            errors=cache.get("errors", []),
            last_run=state.get("last_run"),
            seen_count=len(state.get("seen_ids", [])),
            dismissed_count=len(dismissed),
            dismissed_jobs=dismissed,
            applied_count=len(applied),
            applied_jobs=applied,
            interested_count=len(interested),
            interested_jobs=interested,
            fetched=True,
            total_fetched=cache.get("total_fetched", 0),
            show_dismissed=False,
            show_applied=False,
            show_interested=False,
            show_add=False,
            manual_companies=_get_manual_companies(),
            notes=load_notes(),
        )

    return render_template(
        "index.html",
        jobs=None,
        new_jobs=None,
        errors=None,
        last_run=state.get("last_run"),
        seen_count=len(state.get("seen_ids", [])),
        dismissed_count=len(dismissed),
        dismissed_jobs=dismissed,
        applied_count=len(applied),
        applied_jobs=applied,
        interested_count=len(interested),
        interested_jobs=interested,
        fetched=False,
        show_dismissed=show_dismissed,
        show_applied=show_applied,
        show_interested=show_interested,
        show_add=show_add,
        manual_companies=_get_manual_companies(),
        notes=load_notes(),
    )


@app.route("/refresh", methods=["POST"])
def refresh():
    config = load_config()
    dismissed = load_dismissed()
    applied = load_applied()
    interested = load_interested()
    hidden_ids = set(dismissed.keys()) | set(applied.keys())
    interested_ids = set(interested.keys())

    # Fetch and filter
    all_jobs, errors = fetch_all(config)
    filtered = filter_jobs(all_jobs, config)

    # Remove dismissed and applied jobs from results
    filtered = [j for j in filtered if j["id"] not in hidden_ids]

    # Mark interested jobs
    for j in filtered:
        j["is_interested"] = j["id"] in interested_ids

    # Diff
    state = load_state()
    new_jobs = find_new_jobs(filtered, state)

    # Save
    if new_jobs:
        log_new_jobs(new_jobs)
        mark_seen(new_jobs, state)
    save_state(state)

    # Cache results so dismiss/restore can show them without re-fetching
    save_cache({
        "jobs": filtered,
        "new_jobs": new_jobs,
        "errors": errors,
        "total_fetched": len(all_jobs),
    })

    return render_template(
        "index.html",
        jobs=filtered,
        new_jobs=new_jobs,
        errors=errors,
        last_run=state.get("last_run"),
        seen_count=len(state.get("seen_ids", [])),
        dismissed_count=len(dismissed),
        dismissed_jobs=dismissed,
        applied_count=len(applied),
        applied_jobs=applied,
        interested_count=len(interested),
        interested_jobs=interested,
        fetched=True,
        total_fetched=len(all_jobs),
        show_dismissed=False,
        show_applied=False,
        show_interested=False,
        show_add=False,
        manual_companies=_get_manual_companies(),
        notes=load_notes(),
    )


def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


@app.route("/settings")
def settings():
    config = load_config()
    return render_template("settings.html", config=config, saved=request.args.get("saved") == "1")


@app.route("/settings/save", methods=["POST"])
def settings_save():
    config = load_config()

    # Parse company sources — each line is "slug, Display Name"
    for key in ["greenhouse_companies", "ashby_companies", "lever_companies"]:
        raw = request.form.get(key, "")
        companies = []
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            if "," in line:
                slug, name = line.split(",", 1)
                companies.append({"slug": slug.strip(), "name": name.strip()})
        config[key] = companies

    # Parse manual companies — each line is "Name, https://url"
    raw_manual = request.form.get("manual_companies", "")
    manual = []
    for line in raw_manual.splitlines():
        line = line.strip()
        if not line:
            continue
        if "," in line:
            name, url = line.split(",", 1)
            manual.append({"name": name.strip(), "url": url.strip()})
    config["manual_companies"] = manual

    # Parse keyword groups — each textarea has one term per line
    keywords = {}
    for group in ["support_ops", "support_roles", "cx_roles", "implementation", "cx_tools"]:
        raw = request.form.get(f"keywords_{group}", "")
        terms = [t.strip() for t in raw.splitlines() if t.strip()]
        if terms:
            keywords[group] = terms
    config["keywords"] = keywords

    # Remote filter
    config["remote_only"] = request.form.get("remote_only") == "1"
    raw_remote = request.form.get("remote_terms", "")
    config["remote_terms"] = [t.strip() for t in raw_remote.splitlines() if t.strip()]

    # Exclusion terms
    raw_exclude = request.form.get("exclusion_terms", "")
    config["exclusions"]["terms"] = [t.strip() for t in raw_exclude.splitlines() if t.strip()]

    # Exclusion exceptions
    raw_exceptions = request.form.get("exclusion_exceptions", "")
    config["exclusions"]["exceptions"] = [t.strip() for t in raw_exceptions.splitlines() if t.strip()]

    # Non-English markers
    raw_lang = request.form.get("non_english_markers", "")
    config["non_english_markers"] = [t.strip() for t in raw_lang.splitlines() if t.strip()]

    save_config(config)
    return redirect(url_for("settings", saved="1"))


@app.route("/dismiss", methods=["GET", "POST"])
def dismiss():
    """Dismiss a job — removes it from future results."""
    dismissed = load_dismissed()

    if request.method == "POST":
        job_id = request.form.get("job_id", "")
        dismissed[job_id] = {
            "title": request.form.get("title", ""),
            "company": request.form.get("company", ""),
            "keywords": request.form.get("keywords", ""),
            "dismissed_at": datetime.now(timezone.utc).isoformat(),
        }
    else:
        job_id = request.args.get("job_id", "")
        dismissed[job_id] = {
            "title": request.args.get("title", ""),
            "company": request.args.get("company", ""),
            "keywords": request.args.get("keywords", ""),
            "dismissed_at": datetime.now(timezone.utc).isoformat(),
        }

    save_dismissed(dismissed)
    return redirect(url_for("index"))


@app.route("/undismiss", methods=["GET", "POST"])
def undismiss():
    """Restore a dismissed job."""
    dismissed = load_dismissed()
    job_id = request.form.get("job_id", "") or request.args.get("job_id", "")
    dismissed.pop(job_id, None)
    save_dismissed(dismissed)
    return redirect(url_for("index"))


@app.route("/mark-applied", methods=["GET", "POST"])
def mark_applied():
    """Mark a job as applied — removes it from results, shows in Applied tab."""
    applied = load_applied()
    job_id = request.args.get("job_id", "") or request.form.get("job_id", "")
    applied[job_id] = {
        "title": request.args.get("title", "") or request.form.get("title", ""),
        "company": request.args.get("company", "") or request.form.get("company", ""),
        "keywords": request.args.get("keywords", "") or request.form.get("keywords", ""),
        "url": request.args.get("url", "") or request.form.get("url", ""),
        "applied_at": datetime.now(timezone.utc).isoformat(),
    }
    save_applied(applied)

    # Also remove from interested if it was there
    interested = load_interested()
    if job_id in interested:
        interested.pop(job_id)
        save_interested(interested)

    return redirect(url_for("index"))


@app.route("/unapply", methods=["GET", "POST"])
def unapply():
    """Remove a job from the applied list."""
    applied = load_applied()
    job_id = request.args.get("job_id", "") or request.form.get("job_id", "")
    applied.pop(job_id, None)
    save_applied(applied)
    return redirect(url_for("index"))


@app.route("/mark-interested", methods=["GET", "POST"])
def mark_interested():
    """Mark a job as interested — saves it for later."""
    interested = load_interested()
    job_id = request.args.get("job_id", "") or request.form.get("job_id", "")
    interested[job_id] = {
        "title": request.args.get("title", "") or request.form.get("title", ""),
        "company": request.args.get("company", "") or request.form.get("company", ""),
        "keywords": request.args.get("keywords", "") or request.form.get("keywords", ""),
        "url": request.args.get("url", "") or request.form.get("url", ""),
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    save_interested(interested)
    return redirect(url_for("index"))


@app.route("/uninterest", methods=["GET", "POST"])
def uninterest():
    """Remove a job from the interested list."""
    interested = load_interested()
    job_id = request.args.get("job_id", "") or request.form.get("job_id", "")
    interested.pop(job_id, None)
    save_interested(interested)
    return redirect(url_for("index"))


@app.route("/add-job", methods=["POST"])
def add_job():
    """Manually add a job to Applied or Interested."""
    title = request.form.get("title", "").strip()
    company = request.form.get("company", "").strip()
    url = request.form.get("url", "").strip()
    list_type = request.form.get("list_type", "interested")

    # Generate a stable ID from the URL or title+company
    import hashlib
    raw = url or f"{title}-{company}"
    job_id = "manual-" + hashlib.md5(raw.encode()).hexdigest()[:12]

    entry = {
        "title": title,
        "company": company,
        "keywords": "",
        "url": url,
    }

    if list_type == "applied":
        applied = load_applied()
        entry["applied_at"] = datetime.now(timezone.utc).isoformat()
        applied[job_id] = entry
        save_applied(applied)
    else:
        interested = load_interested()
        entry["added_at"] = datetime.now(timezone.utc).isoformat()
        interested[job_id] = entry
        save_interested(interested)

    return redirect(url_for("index"))


@app.route("/save-note", methods=["POST"])
def save_note():
    """Save or update a note on a job."""
    notes = load_notes()
    job_id = request.form.get("job_id", "")
    note_text = request.form.get("note", "").strip()
    if note_text:
        notes[job_id] = note_text
    else:
        notes.pop(job_id, None)
    save_notes(notes)
    return redirect(url_for("index"))


def load_tracker():
    """Load tracker data: {checks: {name: last_checked}, applications: [...]}."""
    if os.path.exists(TRACKER_FILE):
        with open(TRACKER_FILE, "r") as f:
            return json.load(f)
    return {"checks": {}, "applications": []}


def save_tracker(tracker):
    with open(TRACKER_FILE, "w") as f:
        json.dump(tracker, f, indent=2)


@app.route("/tracker")
def tracker():
    config = load_config()
    tracker_data = load_tracker()
    manual = config.get("manual_companies", [])

    # Annotate each company with its last-checked timestamp + parsed datetime
    now = datetime.now(timezone.utc)
    for company in manual:
        check = tracker_data["checks"].get(company["name"])
        company["last_checked"] = check if check else None
        if check:
            try:
                company["last_checked_dt"] = datetime.fromisoformat(check)
            except (ValueError, TypeError):
                company["last_checked_dt"] = None
        else:
            company["last_checked_dt"] = None

    return render_template(
        "tracker.html",
        companies=manual,
        applications=tracker_data.get("applications", []),
        now_utc=now,
    )


@app.route("/tracker/check", methods=["GET", "POST"])
def tracker_check():
    """Mark a company as checked right now."""
    name = request.args.get("name", "") or request.form.get("name", "")
    tracker_data = load_tracker()
    tracker_data["checks"][name] = datetime.now(timezone.utc).isoformat()
    save_tracker(tracker_data)
    return redirect(url_for("index"))


@app.route("/tracker/apply", methods=["POST"])
def tracker_apply():
    """Log a job application."""
    tracker_data = load_tracker()
    tracker_data.setdefault("applications", []).append({
        "company": request.form.get("company", ""),
        "role": request.form.get("role", ""),
        "url": request.form.get("url", ""),
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "status": "applied",
        "notes": request.form.get("notes", ""),
    })
    save_tracker(tracker_data)
    return redirect(url_for("tracker"))


@app.route("/tracker/update-status", methods=["POST"])
def tracker_update_status():
    """Update an application's status."""
    tracker_data = load_tracker()
    idx = int(request.form.get("index", -1))
    new_status = request.form.get("status", "")
    apps = tracker_data.get("applications", [])
    if 0 <= idx < len(apps):
        apps[idx]["status"] = new_status
    save_tracker(tracker_data)
    return redirect(url_for("tracker"))


@app.route("/tracker/delete-app", methods=["POST"])
def tracker_delete_app():
    """Remove an application entry."""
    tracker_data = load_tracker()
    idx = int(request.form.get("index", -1))
    apps = tracker_data.get("applications", [])
    if 0 <= idx < len(apps):
        apps.pop(idx)
    save_tracker(tracker_data)
    return redirect(url_for("tracker"))


if __name__ == "__main__":
    app.run(debug=True, port=5001)
