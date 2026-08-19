"""Keyword-based inclusion/exclusion filtering for job titles."""

import re


def _find_matches(title_lower, terms):
    """Return the list of terms that match in the title.

    Short terms (<=3 chars) use word-boundary regex to avoid false positives
    like 'ai' matching 'maintain'.
    """
    matched = []
    for term in terms:
        if len(term) <= 3:
            if re.search(rf"\b{re.escape(term)}\b", title_lower):
                matched.append(term)
        else:
            if term in title_lower:
                matched.append(term)
    return matched


def _matches_any(title_lower, terms):
    """Return True if the title matches any of the given terms."""
    return len(_find_matches(title_lower, terms)) > 0


def filter_jobs(jobs, config):
    """Apply filtering and annotate each job with the keywords that matched.

    Args:
        jobs: List of normalized job dicts.
        config: The full config dict (must have 'keywords' and 'exclusions' keys).

    Returns:
        List of jobs that pass all stages. Each job gets a 'matched_keywords' key.
    """
    keywords = config.get("keywords", {})
    exclusions = config.get("exclusions", {})
    exclude_terms = [t.lower() for t in exclusions.get("terms", [])]
    exception_terms = [t.lower() for t in exclusions.get("exceptions", [])]

    # Build keyword list with group labels for display
    all_keywords = []
    keyword_groups = {}  # term -> group name
    for group_name, group_terms in keywords.items():
        for t in group_terms:
            tl = t.lower()
            all_keywords.append(tl)
            keyword_groups[tl] = group_name

    location_exclude = [t.lower() for t in config.get("location_exclude", [])]
    non_english = [t.lower() for t in config.get("non_english_markers", [])]
    remote_only = config.get("remote_only", False)
    remote_terms = [t.lower() for t in config.get("remote_terms", ["remote"])]

    results = []
    for job in jobs:
        title = job["title"].lower()
        raw_loc = job.get("location", "")
        loc = (raw_loc if isinstance(raw_loc, str) else str(raw_loc)).lower()

        # Stage -1 — reject non-English job titles
        if non_english and any(marker in title for marker in non_english):
            continue

        # Stage 0a — reject if location matches an excluded region
        if location_exclude:
            if any(term in loc for term in location_exclude):
                continue

        # Stage 0b — if remote_only, require "remote" (or similar) in title or location
        if remote_only:
            combined = title + " " + loc
            if not any(term in combined for term in remote_terms):
                continue

        # Stage 1 — must match at least one inclusion keyword
        matched = _find_matches(title, all_keywords)
        if not matched:
            continue

        # Stage 2 — reject if title contains an exclusion term,
        # UNLESS it also contains an exception term
        if _matches_any(title, exclude_terms):
            if not _matches_any(title, exception_terms):
                continue

        # Annotate job with matched keywords and their groups
        job["matched_keywords"] = list(set(matched))
        job["matched_groups"] = list(set(keyword_groups[m] for m in matched))

        results.append(job)

    return results
