#!/usr/bin/env python3
"""Daily job monitor — fetches jobs, emails new matches.

Run manually:
    python3 daily_check.py

Set up as a cron job (see bottom of file for instructions).

Requires GMAIL_APP_PASSWORD in .env (see setup instructions below).
"""

import json
import os
import smtplib
import sys
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from dotenv import load_dotenv

# Ensure we're running from the project directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

load_dotenv(os.path.join(BASE_DIR, ".env"))

from sources import (
    fetch_greenhouse, fetch_ashby, fetch_lever, fetch_doist,
    fetch_remotive, fetch_weworkremotely, fetch_workingnomads,
)
from filters import filter_jobs
from state import load_state, save_state, find_new_jobs, mark_seen


CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
LOG_FILE = os.path.join(BASE_DIR, "new_jobs.txt")
DISMISSED_FILE = os.path.join(BASE_DIR, "dismissed.json")
APPLIED_FILE = os.path.join(BASE_DIR, "applied.json")

# Email settings
EMAIL_FROM = os.environ.get("GMAIL_ADDRESS", "siobhan.hyser@gmail.com")
EMAIL_TO = os.environ.get("NOTIFY_EMAIL", EMAIL_FROM)
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")


def load_config():
    with open(CONFIG_FILE, "r") as f:
        return json.load(f)


def load_json_file(path):
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return {}


def fetch_all(config):
    """Fetch jobs from every configured source."""
    all_jobs = []
    errors = []

    for company in config.get("greenhouse_companies", []):
        try:
            all_jobs.extend(fetch_greenhouse(company["slug"], company["name"]))
        except Exception as e:
            errors.append(f"Greenhouse/{company['name']}: {e}")

    for company in config.get("ashby_companies", []):
        try:
            all_jobs.extend(fetch_ashby(company["slug"], company["name"]))
        except Exception as e:
            errors.append(f"Ashby/{company['name']}: {e}")

    for company in config.get("lever_companies", []):
        try:
            all_jobs.extend(fetch_lever(company["slug"], company["name"]))
        except Exception as e:
            errors.append(f"Lever/{company['name']}: {e}")

    for name, fetcher in [
        ("Doist", fetch_doist),
        ("Remotive", fetch_remotive),
        ("WeWorkRemotely", fetch_weworkremotely),
        ("WorkingNomads", fetch_workingnomads),
    ]:
        try:
            all_jobs.extend(fetcher())
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


def build_email_html(new_jobs, total_fetched, total_filtered, errors):
    """Build a nice HTML email body."""
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    jobs_html = ""
    for job in new_jobs:
        keywords = ""
        if job.get("matched_keywords"):
            kw_badges = " ".join(
                f'<span style="background:#f3f0ff;color:#7c5cfc;padding:2px 8px;'
                f'border-radius:4px;font-size:12px;font-weight:500;">{kw}</span>'
                for kw in job["matched_keywords"]
            )
            keywords = f'<div style="margin-top:6px;">{kw_badges}</div>'

        jobs_html += f"""
        <div style="background:#f9f9fb;border-radius:10px;padding:16px 20px;margin-bottom:10px;
                     border-left:3px solid #7c5cfc;">
            <div style="font-size:16px;font-weight:600;">
                <a href="{job['url']}" style="color:#1a1a2e;text-decoration:none;">{job['title']}</a>
            </div>
            <div style="color:#555;font-size:14px;margin-top:4px;">
                {job['company']}  ·  {job['location']}
            </div>
            <div style="color:#888;font-size:12px;margin-top:4px;">
                {job['source'].upper()}{('  ·  ' + job['date']) if job.get('date') else ''}
            </div>
            {keywords}
        </div>
        """

    errors_html = ""
    if errors:
        error_list = "".join(f"<li>{e}</li>" for e in errors)
        errors_html = f"""
        <div style="margin-top:20px;padding:12px 16px;background:#fff5f5;border-radius:8px;
                     font-size:13px;color:#c53030;">
            <strong>{len(errors)} source error(s):</strong>
            <ul style="margin:6px 0 0 16px;">{error_list}</ul>
        </div>
        """

    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                max-width:600px;margin:0 auto;padding:20px;">
        <h1 style="font-size:22px;color:#1a1a2e;margin-bottom:4px;">
            {len(new_jobs)} New Job{"s" if len(new_jobs) != 1 else ""} Found
        </h1>
        <p style="color:#888;font-size:14px;margin-bottom:20px;">
            {timestamp}  ·  {total_fetched} fetched  ·  {total_filtered} matched filters
        </p>

        {jobs_html}

        {errors_html}

        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;
                     font-size:13px;color:#aaa;text-align:center;">
            Job Monitor  ·  <a href="http://localhost:5001" style="color:#7c5cfc;">Open Dashboard</a>
        </div>
    </div>
    """
    return html


def build_email_text(new_jobs, total_fetched, total_filtered):
    """Build a plain text email body."""
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        f"{len(new_jobs)} New Job(s) — {timestamp}",
        f"{total_fetched} fetched, {total_filtered} matched filters",
        "",
        "=" * 50,
    ]
    for job in new_jobs:
        lines.append("")
        lines.append(f"  {job['title']}")
        lines.append(f"  {job['company']}  ·  {job['location']}")
        lines.append(f"  [{job['source'].upper()}] {job['url']}")
        if job.get("matched_keywords"):
            lines.append(f"  Keywords: {', '.join(job['matched_keywords'])}")
    lines.append("")
    lines.append("=" * 50)
    return "\n".join(lines)


def send_email(new_jobs, total_fetched, total_filtered, errors):
    """Send email notification via Gmail SMTP."""
    if not GMAIL_APP_PASSWORD:
        print("  No GMAIL_APP_PASSWORD set — skipping email.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Job Monitor: {len(new_jobs)} new job{'s' if len(new_jobs) != 1 else ''}"
    msg["From"] = EMAIL_FROM
    msg["To"] = EMAIL_TO

    text_body = build_email_text(new_jobs, total_fetched, total_filtered)
    html_body = build_email_html(new_jobs, total_fetched, total_filtered, errors)

    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(EMAIL_FROM, GMAIL_APP_PASSWORD)
            server.sendmail(EMAIL_FROM, EMAIL_TO, msg.as_string())
        print(f"  Email sent to {EMAIL_TO}")
        return True
    except Exception as e:
        print(f"  Email failed: {e}", file=sys.stderr)
        return False


def main():
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"\n  Daily Job Check — {timestamp}")
    print("  " + "=" * 40)

    config = load_config()
    dismissed = load_json_file(DISMISSED_FILE)
    applied = load_json_file(APPLIED_FILE)
    hidden_ids = set(dismissed.keys()) | set(applied.keys())

    # Fetch and filter
    print("\n  Fetching...")
    all_jobs, errors = fetch_all(config)
    filtered = filter_jobs(all_jobs, config)
    filtered = [j for j in filtered if j["id"] not in hidden_ids]

    print(f"  {len(all_jobs)} fetched → {len(filtered)} match filters")

    if errors:
        print(f"  {len(errors)} source error(s)")

    # Find new jobs
    state = load_state()
    new_jobs = find_new_jobs(filtered, state)

    if new_jobs:
        print(f"\n  >>> {len(new_jobs)} NEW job(s)")
        for job in new_jobs:
            print(f"      {job['title']} — {job['company']}")

        # Log and save
        log_new_jobs(new_jobs)
        mark_seen(new_jobs, state)
        save_state(state)

        # Send email
        send_email(new_jobs, len(all_jobs), len(filtered), errors)
    else:
        print("\n  No new jobs.")
        save_state(state)

    print("  Done.\n")


if __name__ == "__main__":
    main()


# ============================================================
#  SETUP INSTRUCTIONS
# ============================================================
#
#  1. Create a Gmail App Password:
#     - Go to https://myaccount.google.com/apppasswords
#     - Sign in, select "Mail" and your device
#     - Copy the 16-character password
#
#  2. Add it to your .env file:
#     echo 'GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx' >> ~/Claude\ Projects/job-monitor/.env
#
#  3. Test it:
#     cd ~/Claude\ Projects/job-monitor
#     python3 daily_check.py
#
#  4. Set up the daily cron job (runs at 8am every day):
#     crontab -e
#     Then add this line:
#     0 8 * * * cd /Users/sio/Claude\ Projects/job-monitor && /usr/local/bin/python3 daily_check.py >> /Users/sio/Claude\ Projects/job-monitor/cron.log 2>&1
#
#     Or use the launchd plist (more reliable on macOS):
#     See job-monitor.plist in this directory.
# ============================================================
