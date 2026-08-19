#!/usr/bin/env python3
"""Job monitor — fetches postings from configured sources and reports new ones."""

import json
import os
import sys
from datetime import datetime, timezone

from sources import (
    fetch_greenhouse, fetch_ashby, fetch_lever, fetch_doist, fetch_adzuna,
    fetch_remotive, fetch_weworkremotely, fetch_workingnomads,
)
from filters import filter_jobs
from state import load_state, save_state, find_new_jobs, mark_seen


BASE_DIR = os.path.dirname(__file__)
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
LOG_FILE = os.path.join(BASE_DIR, "new_jobs.txt")


def load_config(path=CONFIG_FILE):
    with open(path, "r") as f:
        return json.load(f)


def fetch_all(config):
    """Fetch jobs from every configured source. Returns a flat list."""
    all_jobs = []

    # Greenhouse boards
    for company in config.get("greenhouse_companies", []):
        try:
            jobs = fetch_greenhouse(company["slug"], company["name"])
            print(f"  Greenhouse/{company['name']}: {len(jobs)} jobs")
            all_jobs.extend(jobs)
        except Exception as e:
            print(f"  Greenhouse/{company['name']}: ERROR — {e}", file=sys.stderr)

    # Ashby boards
    for company in config.get("ashby_companies", []):
        try:
            jobs = fetch_ashby(company["slug"], company["name"])
            print(f"  Ashby/{company['name']}: {len(jobs)} jobs")
            all_jobs.extend(jobs)
        except Exception as e:
            print(f"  Ashby/{company['name']}: ERROR — {e}", file=sys.stderr)

    # Lever boards
    for company in config.get("lever_companies", []):
        try:
            jobs = fetch_lever(company["slug"], company["name"])
            print(f"  Lever/{company['name']}: {len(jobs)} jobs")
            all_jobs.extend(jobs)
        except Exception as e:
            print(f"  Lever/{company['name']}: ERROR — {e}", file=sys.stderr)

    # Adzuna disabled — mostly non-English results and broken redirect links.
    # To re-enable, uncomment below:
    # adzuna_config = config.get("adzuna", {})
    # if adzuna_config:
    #     try:
    #         jobs = fetch_adzuna(adzuna_config)
    #         all_jobs.extend(jobs)
    #     except Exception as e:
    #         print(f"  Adzuna: ERROR — {e}", file=sys.stderr)

    # Standalone sources + remote job boards
    for name, fetcher in [
        ("Doist", fetch_doist),
        ("Remotive", fetch_remotive),
        ("WeWorkRemotely", fetch_weworkremotely),
        ("WorkingNomads", fetch_workingnomads),
    ]:
        try:
            jobs = fetcher()
            print(f"  {name}: {len(jobs)} jobs")
            all_jobs.extend(jobs)
        except Exception as e:
            print(f"  {name}: ERROR — {e}", file=sys.stderr)

    return all_jobs


def format_job(job):
    """Format a single job for display."""
    source_tag = job["source"].upper()
    lines = [
        f"  {job['title']}",
        f"  {job['company']}  •  {job['location']}",
        f"  [{source_tag}] {job['url']}",
    ]
    return "\n".join(lines)


def log_new_jobs(jobs, path=LOG_FILE):
    """Append new jobs to the log file with a timestamp header."""
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    with open(path, "a") as f:
        f.write(f"\n{'=' * 50}\n")
        f.write(f"  {timestamp} — {len(jobs)} new job(s)\n")
        f.write(f"{'=' * 50}\n\n")
        for job in jobs:
            f.write(f"  {job['title']}\n")
            f.write(f"  {job['company']}  •  {job['location']}\n")
            f.write(f"  [{job['source'].upper()}] {job['url']}\n\n")


def main():
    print()
    print("  Job Monitor")
    print("  " + "=" * 38)

    config = load_config()

    print("\n  Fetching...\n")
    all_jobs = fetch_all(config)

    # Filter
    filtered = filter_jobs(all_jobs, config)
    print(f"\n  {len(all_jobs)} fetched → {len(filtered)} match filters")

    # Diff against saved state
    state = load_state()
    new_jobs = find_new_jobs(filtered, state)

    if new_jobs:
        print(f"\n  >>> {len(new_jobs)} NEW job(s):\n")
        print("  " + "-" * 38)
        for job in new_jobs:
            print()
            print(format_job(job))
        print()
        print("  " + "-" * 38)

        log_new_jobs(new_jobs)
        print(f"\n  Logged to new_jobs.txt")
        mark_seen(new_jobs, state)
    else:
        print("\n  No new jobs.")

    save_state(state)
    print(f"  State saved ({len(state['seen_ids'])} total seen).\n")


if __name__ == "__main__":
    main()
