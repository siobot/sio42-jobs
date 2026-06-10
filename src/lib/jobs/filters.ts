import type { KeywordConfig, MatchedJob, RawJob } from "./types";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMatches(titleLower: string, terms: string[]): string[] {
  const matched: string[] = [];
  for (const term of terms) {
    if (term.length <= 3) {
      const re = new RegExp(`\\b${escapeRegex(term)}\\b`);
      if (re.test(titleLower)) matched.push(term);
    } else if (titleLower.includes(term)) {
      matched.push(term);
    }
  }
  return matched;
}

const matchesAny = (t: string, terms: string[]) => findMatches(t, terms).length > 0;

export function filterJobs(jobs: RawJob[], config: KeywordConfig): MatchedJob[] {
  const excludeTerms = (config.exclusions?.terms ?? []).map((t) => t.toLowerCase());
  const exceptionTerms = (config.exclusions?.exceptions ?? []).map((t) => t.toLowerCase());
  const allKeywords: string[] = [];
  const keywordGroups: Record<string, string> = {};
  for (const [group, terms] of Object.entries(config.keywords ?? {})) {
    for (const t of terms) {
      const tl = t.toLowerCase();
      allKeywords.push(tl);
      keywordGroups[tl] = group;
    }
  }
  const locationExclude = (config.location_exclude ?? []).map((t) => t.toLowerCase());
  const nonEnglish = (config.non_english_markers ?? []).map((t) => t.toLowerCase());
  const remoteOnly = !!config.remote_only;
  const remoteTerms = (config.remote_terms ?? ["remote"]).map((t) => t.toLowerCase());

  const out: MatchedJob[] = [];
  for (const job of jobs) {
    const title = (job.title || "").toLowerCase();
    const loc = (job.location || "").toLowerCase();

    if (nonEnglish.length && nonEnglish.some((m) => title.includes(m))) continue;
    if (locationExclude.length && locationExclude.some((t) => loc.includes(t))) continue;
    if (remoteOnly) {
      const combined = `${title} ${loc}`;
      if (!remoteTerms.some((t) => combined.includes(t))) continue;
    }
    const matched = findMatches(title, allKeywords);
    if (matched.length === 0) continue;
    if (matchesAny(title, excludeTerms) && !matchesAny(title, exceptionTerms)) continue;

    const uniq = Array.from(new Set(matched));
    out.push({
      ...job,
      matched_keywords: uniq,
      matched_groups: Array.from(new Set(uniq.map((m) => keywordGroups[m]).filter(Boolean))),
    });
  }
  return out;
}
