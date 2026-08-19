"""Load, save, and diff job state to track which postings we've already seen."""

import json
import os
import tempfile
from datetime import datetime, timezone


STATE_FILE = os.path.join(os.path.dirname(__file__), "jobs_state.json")


def load_state(path=STATE_FILE):
    """Return the current state dict, or a fresh one if the file doesn't exist."""
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return {"seen_ids": [], "last_run": None}


def save_state(state, path=STATE_FILE):
    """Write state to disk atomically (write to temp file, then rename)."""
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    dir_name = os.path.dirname(path) or "."
    fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(state, f, indent=2)
        os.replace(tmp_path, path)
    except Exception:
        os.unlink(tmp_path)
        raise


def find_new_jobs(jobs, state):
    """Return only the jobs whose IDs aren't in the seen set."""
    seen = set(state["seen_ids"])
    return [j for j in jobs if j["id"] not in seen]


def mark_seen(jobs, state):
    """Add job IDs to the seen set (mutates state in place)."""
    seen = set(state["seen_ids"])
    for job in jobs:
        seen.add(job["id"])
    state["seen_ids"] = sorted(seen)
