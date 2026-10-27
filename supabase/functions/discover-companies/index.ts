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

async function fetchFantasticJobs(
  apiKey: string,
  keyword: string,
  timeFrame: string,
): Promise<FantasticJob[]> {
  const allJobs: FantasticJob[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const params = new URLSearchParams({
      title: keyword,
      source: "ashby,greenhouse,lever",
      ai_language: "English",
      organization_agency: "exclude",
      time_frame: timeFrame,
      limit: String(limit),
      offset: String(offset),
    });

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

    const jobs: FantasticJob[] = await res.json();
    allJobs.push(...jobs);

    if (jobs.length < limit) break;
    offset += limit;

    // Safety cap: don't fetch more than 5000 jobs per keyword
    if (offset >= 5000) break;
  }

  return allJobs;
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
      supabase.from("discovery_suggestions").select("ats_type, slug, status").eq("user_id", userId),
      supabase.from("keyword_config").select("config").eq("user_id", userId).maybeSingle(),
    ]);

  const config = configRow ?? { time_frame: "7d", enabled: false };

  // Build set of already-tracked slugs
  const trackedSlugs = new Set(
    (sourceRows ?? []).map((s: { type: string; slug: string }) => `${s.type}::${s.slug}`),
  );

  // Build set of already-suggested or dismissed slugs (avoid duplicates)
  const seenSlugs = new Set(
    (existingSuggestions ?? []).map((s: { ats_type: string; slug: string }) => `${s.ats_type}::${s.slug}`),
  );

  // Load keyword config for filtering roles AND discovery search terms
  const kwConfig = (kwConfigRow?.config ?? {}) as Record<string, unknown>;
  const filterKeywords = Object.values((kwConfig.keywords ?? {}) as Record<string, string[]>).flat();
  const exclusions = ((kwConfig.exclusions as Record<string, unknown>)?.terms ?? []) as string[];
  const exceptions = ((kwConfig.exclusions as Record<string, unknown>)?.exceptions ?? []) as string[];
  const locationExclude = (kwConfig.location_exclude ?? []) as string[];
  const locationInclude = (kwConfig.location_include ?? []) as string[];
  const nonEnglishMarkers = (kwConfig.non_english_markers ?? []) as string[];

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
  const timeFrame = config.time_frame ?? "7d";

  // Phase 1: Fetch jobs from Fantastic Jobs API for each keyword
  const allJobs: FantasticJob[] = [];

  for (const keyword of keywords) {
    try {
      const jobs = await fetchFantasticJobs(apiKey, keyword, timeFrame);
      allJobs.push(...jobs);
    } catch (e) {
      errors.push({
        step: `fetch:${keyword}`,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

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
    if (trackedSlugs.has(key) || seenSlugs.has(key)) continue;

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

  // Phase 3: Apply keyword/exclusion filtering and create suggestions
  let companiesSuggested = 0;

  for (const company of companyMap.values()) {
    const matched = filterKeywords.length > 0
      ? filterRolesByKeywords(
          company.roles, filterKeywords, exclusions, exceptions, locationExclude, locationInclude, nonEnglishMarkers,
        )
      : company.roles;

    if (matched.length > 0) {
      companiesSuggested++;
      await supabase.from("discovery_suggestions").insert({
        user_id: userId,
        ats_type: company.atsType,
        slug: company.slug,
        company_name: company.organization,
        matching_roles: matched.slice(0, 20),
        status: "pending",
      });
    }
  }

  // Finalize run
  await supabase.from("discovery_runs").update({
    jobs_fetched: uniqueJobs.size,
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
    errors: errors.length,
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

    if (body.user_id) {
      userIds = [body.user_id as string];
    } else {
      const cronSecret = Deno.env.get("DISCOVERY_CRON_SECRET");
      const provided = req.headers.get("x-cron-secret");
      if (!cronSecret || provided !== cronSecret) {
        return new Response(JSON.stringify({ error: "user_id required or valid x-cron-secret" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: enabledUsers } = await supabase
        .from("discovery_config")
        .select("user_id")
        .eq("enabled", true);
      userIds = (enabledUsers ?? []).map((r) => r.user_id);
      if (userIds.length === 0) {
        return new Response(JSON.stringify({ ok: true, message: "No users with discovery enabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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
