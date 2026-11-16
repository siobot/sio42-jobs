import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FANTASTIC_JOBS_URL = "https://data.fantastic.jobs/v1/active-ats";

type FantasticJob = {
  id: number;
  title: string;
  organization: string | null;
  organization_url: string | null;
  url: string;
  source: string;
  source_slug: string | null;
  locations_derived: string[] | null;
  location_type: string | null;
  ai_job_language: string | null;
};

type DiscoveredCompany = {
  organization: string;
  atsType: string;
  slug: string;
  roles: Array<{ title: string; url: string; location: string }>;
};

// Free-plan quota (jobs and API calls) is finite and never resets, so each
// Discover run makes at most two requests, sharing a MAX_JOBS_PER_RUN cap: all
// keywords combined into one Boolean title search with location filters applied
// server-side, then (if a location filter is set and the cap isn't reached) the
// same search for jobs with no recognisable location, which a location filter
// would otherwise drop. Each request resumes from the last job id seen for
// the same search (cursor), so no job is paid for twice.
const MAX_JOBS_PER_RUN = 100;

type FetchResult = {
  jobs: FantasticJob[];
  jobsRemaining: number | null;
  requestsRemaining: number | null;
  jobsThisRequest: number | null;
};

// Turn a free-text term into an exact-phrase operand for *_advanced params.
// Punctuation is dropped (the parser is strict); multi-word terms are quoted.
function phrase(term: string): string | null {
  const words = term.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!words) return null;
  return words.includes(" ") ? `'${words}'` : words;
}

function anyOf(terms: string[]): string | null {
  const parts = [...new Set(terms.map(phrase).filter((p): p is string => !!p))];
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `(${parts.join(" | ")})`;
}

// (kw1 | kw2 ...) & !((ex1 | ex2 ...) & !(exc1 | exc2 ...))
export function buildTitleQuery(keywords: string[], exclusions: string[], exceptions: string[]): string | null {
  const kw = anyOf(keywords);
  if (!kw) return null;
  const ex = anyOf(exclusions);
  if (!ex) return kw;
  const exc = anyOf(exceptions);
  return exc ? `${kw} & !(${ex} & !${exc})` : `${kw} & !${ex}`;
}

// (inc1 | inc2 ...) & !(exc1 | exc2 ...), searched against locations_derived.
export function buildLocationQuery(include: string[], exclude: string[]): string | null {
  const inc = anyOf(include);
  const exc = anyOf(exclude);
  if (inc && exc) return `${inc} & !${exc}`;
  if (inc) return inc;
  if (exc) return `!${exc}`;
  return null;
}

function headerInt(res: Response, name: string): number | null {
  const v = res.headers.get(name);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchFantasticJobs(
  apiKey: string,
  titleQuery: string,
  // A location_advanced expression, "none" for jobs with no recognisable
  // location (has_no_location), or null for no location filter.
  location: string | "none" | null,
  timeFrame: string,
  limit: number,
  cursor: number,
): Promise<FetchResult> {
  // The API's windows are 1h, 24h, 7d and 6m. 36h/48h use the 7d window
  // narrowed to jobs indexed within the last N hours (date_created_gte).
  const hours = { "36h": 36, "48h": 48 }[timeFrame];
  const params = new URLSearchParams({
    title_advanced: titleQuery,
    source: "ashby,greenhouse,lever.co",
    ai_language: "English",
    organization_agency: "exclude",
    time_frame: hours ? "7d" : timeFrame,
    limit: String(limit),
    // Cursor pagination: results ordered by id ascending, starting after
    // `cursor`, so each run resumes where the previous one stopped.
    cursor: String(cursor),
  });
  if (hours) {
    const since = new Date(Date.now() - hours * 3600_000).toISOString().slice(0, 19);
    params.set("date_created_gte", since);
  }
  if (location === "none") params.set("has_no_location", "true");
  else if (location) params.set("location_advanced", location);

  const res = await fetch(`${FANTASTIC_JOBS_URL}?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30000),
  });

  if (res.status === 429) {
    throw new Error("Rate limited by Fantastic Jobs API");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fantastic Jobs API ${res.status}: ${text.slice(0, 200)}`);
  }

  return {
    jobs: (await res.json()) as FantasticJob[],
    jobsRemaining: headerInt(res, "x-api-jobs-remaining"),
    requestsRemaining: headerInt(res, "x-api-requests-remaining"),
    jobsThisRequest: headerInt(res, "x-api-jobs-this-request"),
  };
}

function mapAtsSource(source: string): string | null {
  const map: Record<string, string> = {
    ashby: "ashby",
    greenhouse: "greenhouse",
    "lever.co": "lever",
  };
  return map[source] ?? null;
}

function extractSlug(job: FantasticJob): string | null {
  // Greenhouse provides source_slug directly
  if (job.source_slug) return job.source_slug;

  // For other ATS, extract from the job URL
  try {
    const url = new URL(job.url);
    const host = url.hostname.toLowerCase();

    // Ashby: jobs.ashbyhq.com/<slug>/...
    if (host === "jobs.ashbyhq.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      return segments[0] || null;
    }

    // Greenhouse: boards.greenhouse.io/<slug>/... or job-boards.greenhouse.io/<slug>/...
    if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
      const segments = url.pathname.split("/").filter(Boolean);
      return segments[0] || null;
    }

    // Lever: jobs.lever.co/<slug>/... or jobs.eu.lever.co/<slug>/...
    if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
      const segments = url.pathname.split("/").filter(Boolean);
      return segments[0] || null;
    }
  } catch {
    // fall through
  }

  return null;
}

function filterRolesByKeywords(
  roles: Array<{ title: string; url: string; location: string }>,
  keywords: string[],
  exclusions: string[],
  exceptions: string[],
  locationExclude: string[],
  locationInclude: string[],
  nonEnglishMarkers: string[],
): Array<{ title: string; url: string; location: string }> {
  const kwLower = keywords.map((k) => k.toLowerCase());
  const exLower = exclusions.map((e) => e.toLowerCase());
  const excLower = exceptions.map((e) => e.toLowerCase());
  const locExLower = locationExclude.map((l) => l.toLowerCase());
  const locInLower = locationInclude.map((l) => l.toLowerCase());
  const neLower = nonEnglishMarkers.map((m) => m.toLowerCase());

  return roles.filter((role) => {
    const title = role.title.toLowerCase();
    const loc = role.location.toLowerCase();

    if (neLower.some((m) => title.includes(m))) return false;
    if (locExLower.some((l) => loc.includes(l))) return false;
    if (locInLower.length > 0 && loc !== "" && !loc.includes("remote") && !loc.includes("emea") && !loc.includes("worldwide") && !locInLower.some((l) => loc.includes(l))) return false;
    if (!kwLower.some((kw) => title.includes(kw))) return false;
    if (exLower.some((e) => title.includes(e)) && !excLower.some((e) => title.includes(e))) return false;

    return true;
  });
}

async function runDiscoveryForUser(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  userId: string,
  triggeredBy: string,
): Promise<Record<string, unknown>> {
  const [{ data: configRow }, { data: sourceRows }, { data: existingSuggestions }, { data: kwConfigRow }] =
    await Promise.all([
      supabase.from("discovery_config").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("sources").select("type, slug, name").eq("user_id", userId),
      supabase.from("discovery_suggestions")
        .select("id, ats_type, slug, status, matching_roles, cleared_urls").eq("user_id", userId),
      supabase.from("keyword_config").select("config").eq("user_id", userId).maybeSingle(),
    ]);

  const config = configRow ?? { time_frame: "7d", enabled: false };

  // Build set of already-tracked slugs
  const trackedSlugs = new Set(
    (sourceRows ?? []).map((s: { type: string; slug: string }) => `${s.type}::${s.slug}`),
  );

  // Companies already shown. "approved" means it is now tracked (regular scans
  // cover it), so skip it. Exclusion is decided by the excluded-companies list
  // below, so a "dismissed" company taken off that list reopens.
  type Role = { title: string; url: string; location: string };
  type ExistingSuggestion = {
    id: string; ats_type: string; slug: string; status: string;
    matching_roles: Role[] | null; cleared_urls: string[] | null;
  };
  const existingByKey = new Map<string, ExistingSuggestion>();
  const closedSlugs = new Set<string>();
  for (const s of (existingSuggestions ?? []) as ExistingSuggestion[]) {
    const key = `${s.ats_type}::${s.slug}`;
    if (s.status === "approved") closedSlugs.add(key);
    else existingByKey.set(key, s);
  }

  // Load keyword config for filtering roles AND discovery search terms
  const kwConfig = (kwConfigRow?.config ?? {}) as Record<string, unknown>;
  const filterKeywords = Object.values((kwConfig.keywords ?? {}) as Record<string, string[]>).flat();
  const exclusions = ((kwConfig.exclusions as Record<string, unknown>)?.terms ?? []) as string[];
  const exceptions = ((kwConfig.exclusions as Record<string, unknown>)?.exceptions ?? []) as string[];
  const locationExclude = (kwConfig.location_exclude ?? []) as string[];
  const locationInclude = (kwConfig.location_include ?? []) as string[];
  const nonEnglishMarkers = (kwConfig.non_english_markers ?? []) as string[];
  // Companies removed with "Remove company" (Settings → Excluded companies).
  const excludedCompanies = new Set(
    ((kwConfig.company_exclude ?? []) as string[]).map((c) => c.trim().toLowerCase()),
  );

  // Use keyword groups as discovery search terms (deduplicated)
  const keywords = [...new Set(filterKeywords)];

  if (keywords.length === 0) {
    return { userId, ok: false, error: "No keyword groups configured in Settings" };
  }

  // Create run
  const { data: runRow, error: runErr } = await supabase
    .from("discovery_runs")
    .insert({ user_id: userId, triggered_by: triggeredBy })
    .select("id")
    .single();
  if (runErr) throw new Error(`Failed to create run: ${runErr.message}`);
  const runId = runRow.id;

  const errors: Array<{ step: string; error: string }> = [];
  // "1h" is no longer offered in Settings; older saved values run as 24h.
  const timeFrame = config.time_frame === "1h" ? "24h" : (config.time_frame ?? "7d");

  // Phase 1: fetch from the Fantastic Jobs API (see MAX_JOBS_PER_RUN note)
  const allJobs: FantasticJob[] = [];
  let jobsRemaining: number | null = null;
  let requestsRemaining: number | null = null;
  const titleQuery = buildTitleQuery(keywords, exclusions, exceptions)!;
  const locationQuery = buildLocationQuery(locationInclude, locationExclude);

  const passes: Array<{ step: string; location: string | "none" | null }> = [
    { step: "fetch", location: locationQuery },
  ];
  if (locationQuery) passes.push({ step: "fetch:no-location", location: "none" });

  type CursorState = Record<string, { key: string; cursor: number }>;
  const savedCursors = ((configRow as { cursors?: CursorState } | null)?.cursors ?? {}) as CursorState;
  const nextCursors: CursorState = { ...savedCursors };

  // Jobs returned by each request, and how many the no-location request
  // returned that the location request already had (shows whether it's redundant).
  const passCounts: { location: number | null; noLocation: number | null } = { location: null, noLocation: null };
  let overlap = 0;

  for (const pass of passes) {
    const room = MAX_JOBS_PER_RUN - allJobs.length;
    if (room <= 0) break;
    // A changed search (keywords, location settings, time frame) starts over.
    const key = JSON.stringify([timeFrame, titleQuery, pass.location]);
    const saved = savedCursors[pass.step];
    const cursor = saved && saved.key === key && saved.cursor > 0 ? saved.cursor : 1;
    try {
      const r = await fetchFantasticJobs(apiKey, titleQuery, pass.location, timeFrame, room, cursor);
      passCounts[pass.step === "fetch" ? "location" : "noLocation"] = r.jobs.length;
      for (const j of r.jobs) if (allJobs.some((a) => a.id === j.id)) overlap++;
      allJobs.push(...r.jobs);
      // The *-remaining headers are cached for a few seconds, so a second
      // request moments later can still show the pre-run balance. Take the
      // balance from the first request and subtract later requests locally
      // (x-api-jobs-this-request is always exact).
      if (jobsRemaining === null) {
        jobsRemaining = r.jobsRemaining;
        requestsRemaining = r.requestsRemaining;
      } else {
        jobsRemaining -= r.jobsThisRequest ?? r.jobs.length;
        if (requestsRemaining !== null) requestsRemaining -= 1;
      }
      const lastId = r.jobs.reduce((m, j) => Math.max(m, Number(j.id) || 0), cursor);
      nextCursors[pass.step] = { key, cursor: lastId };
    } catch (e) {
      errors.push({ step: pass.step, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const { error: cursorErr } = await supabase.from("discovery_config")
    .upsert({ user_id: userId, cursors: nextCursors }, { onConflict: "user_id" });
  if (cursorErr) errors.push({ step: "save-cursor", error: cursorErr.message });
  const capReached = allJobs.length >= MAX_JOBS_PER_RUN;

  // Dedupe jobs by ID
  const uniqueJobs = new Map<number, FantasticJob>();
  for (const job of allJobs) {
    if (!uniqueJobs.has(job.id)) {
      uniqueJobs.set(job.id, job);
    }
  }

  // Phase 2: Group jobs by company (atsType + slug)
  const companyMap = new Map<string, DiscoveredCompany>();

  for (const job of uniqueJobs.values()) {
    const atsType = mapAtsSource(job.source);
    if (!atsType) continue;

    const slug = extractSlug(job);
    if (!slug) continue;

    const key = `${atsType}::${slug}`;
    if (trackedSlugs.has(key) || closedSlugs.has(key)) continue;
    if (excludedCompanies.has((job.organization || slug).trim().toLowerCase())) continue;

    if (!companyMap.has(key)) {
      companyMap.set(key, {
        organization: job.organization || slug,
        atsType,
        slug,
        roles: [],
      });
    }

    const location = (job.locations_derived ?? []).join(", ") || "";
    companyMap.get(key)!.roles.push({
      title: job.title,
      url: job.url,
      location,
    });
  }

  // Roles the user already acted on (Interested / Applied / Not Interested).
  const { data: importedJobs } = await supabase
    .from("jobs").select("external_id").eq("user_id", userId).like("external_id", "discovered:%");
  const actionedUrls = new Set(
    (importedJobs ?? []).map((j: { external_id: string }) => j.external_id.replace("discovered:", "")),
  );

  // Phase 3: Apply keyword/exclusion filtering, then add new companies and
  // add new roles to companies already on the list.
  let companiesSuggested = 0;
  let companiesUpdated = 0;
  let newRoles = 0;

  for (const [key, company] of companyMap) {
    const matched = filterKeywords.length > 0
      ? filterRolesByKeywords(
          company.roles, filterKeywords, exclusions, exceptions, locationExclude, locationInclude, nonEnglishMarkers,
        )
      : company.roles;

    const existing = existingByKey.get(key);
    const known = new Set([
      ...actionedUrls,
      ...(existing?.matching_roles ?? []).map((r) => r.url),
      ...(existing?.cleared_urls ?? []),
    ]);
    const fresh = matched.filter((r) => !known.has(r.url));
    if (fresh.length === 0) continue;
    newRoles += fresh.length;

    if (existing) {
      companiesUpdated++;
      await supabase.from("discovery_suggestions").update({
        matching_roles: [...fresh, ...(existing.matching_roles ?? [])].slice(0, 50),
        discovered_at: new Date().toISOString(),
        status: "pending",
        resolved_at: null,
      }).eq("id", existing.id);
    } else {
      companiesSuggested++;
      await supabase.from("discovery_suggestions").insert({
        user_id: userId,
        ats_type: company.atsType,
        slug: company.slug,
        company_name: company.organization,
        matching_roles: fresh.slice(0, 50),
        status: "pending",
      });
    }
  }

  // Finalize run
  await supabase.from("discovery_runs").update({
    jobs_fetched: uniqueJobs.size,
    jobs_remaining: jobsRemaining,
    requests_remaining: requestsRemaining,
    companies_found: companyMap.size,
    companies_suggested: companiesSuggested,
    errors,
    finished_at: new Date().toISOString(),
  }).eq("id", runId);

  return {
    ok: true,
    userId,
    runId,
    jobsFetched: uniqueJobs.size,
    companiesFound: companyMap.size,
    companiesSuggested,
    companiesUpdated,
    newRoles,
    errors: errors.length,
    errorDetails: errors,
    jobsRemaining,
    requestsRemaining,
    capReached,
    maxJobsPerRun: MAX_JOBS_PER_RUN,
    passCounts,
    overlap,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("FANTASTIC_JOBS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "FANTASTIC_JOBS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    let userIds: string[] = [];
    const triggeredBy = (body.triggered_by as string) || "manual";

    // Discovery runs only when the user presses "Discover new" (free-plan API
    // quota is finite), so scheduled/cron calls without a user_id are refused.
    if (!body.user_id) {
      return new Response(JSON.stringify({ error: "user_id required; scheduled discovery is disabled" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userIds = [body.user_id as string];

    const allResults: Array<Record<string, unknown>> = [];

    for (const userId of userIds) {
      try {
        const result = await runDiscoveryForUser(supabase, apiKey, userId, triggeredBy);
        allResults.push(result);
      } catch (e) {
        allResults.push({
          userId,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const summary = userIds.length === 1 ? allResults[0] : { ok: true, results: allResults };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
