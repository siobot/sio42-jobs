import type { AtsType, RawJob } from "./types";

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : v == null ? fallback : String(v);

export async function fetchGreenhouse(slug: string, name: string): Promise<RawJob[]> {
  const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`) as { jobs?: Array<Record<string, unknown>> };
  return (data.jobs ?? []).map((raw) => {
    const loc = raw.location;
    const locName = loc && typeof loc === "object" && "name" in loc ? str((loc as Record<string, unknown>).name) : str(loc);
    return {
      external_id: `gh-${slug}-${raw.id}`,
      source: "greenhouse",
      company: name,
      title: str(raw.title),
      location: locName,
      url: str(raw.absolute_url),
      job_date: str(raw.updated_at).slice(0, 10),
    };
  });
}

export async function fetchAshby(slug: string, name: string): Promise<RawJob[]> {
  const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`) as { jobs?: Array<Record<string, unknown>> };
  return (data.jobs ?? []).map((raw) => {
    let loc: string;
    const l = raw.location;
    if (typeof l === "string") loc = l;
    else if (l && typeof l === "object" && "name" in l) loc = str((l as Record<string, unknown>).name);
    else loc = "";
    return {
      external_id: `ash-${slug}-${raw.id}`,
      source: "ashby",
      company: name,
      title: str(raw.title),
      location: loc,
      url: str(raw.jobUrl),
      job_date: str(raw.publishedAt).slice(0, 10),
    };
  });
}

export async function fetchLever(slug: string, name: string): Promise<RawJob[]> {
  const data = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`) as Array<Record<string, unknown>>;
  return (data ?? []).map((raw) => {
    const cats = (raw.categories ?? {}) as Record<string, unknown>;
    return {
      external_id: `lev-${slug}-${str(raw.id)}`,
      source: "lever",
      company: name,
      title: str(raw.text),
      location: str(cats.location),
      url: str(raw.hostedUrl),
      job_date: "",
    };
  });
}

const joinLoc = (...parts: unknown[]) => parts.map((p) => str(p).trim()).filter(Boolean).join(", ");
// Adds "Remote" so remote-only filtering sees boards that flag remote work
// separately from the location text.
const withRemote = (loc: string, remote: boolean) =>
  remote && !/remote/i.test(loc) ? (loc ? `${loc} (Remote)` : "Remote") : loc;

export async function fetchWorkable(slug: string, name: string): Promise<RawJob[]> {
  const data = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${slug}`) as { jobs?: Array<Record<string, unknown>> };
  return (data.jobs ?? []).map((raw) => ({
    external_id: `wk-${slug}-${str(raw.shortcode)}`,
    source: "workable",
    company: name,
    title: str(raw.title),
    location: withRemote(joinLoc(raw.city, raw.state, raw.country), raw.telecommuting === true),
    url: str(raw.url),
    job_date: str(raw.published_on).slice(0, 10),
  }));
}

export async function fetchRecruitee(slug: string, name: string): Promise<RawJob[]> {
  const data = await getJson(`https://${slug}.recruitee.com/api/offers/`) as { offers?: Array<Record<string, unknown>> };
  return (data.offers ?? []).map((raw) => ({
    external_id: `rc-${slug}-${str(raw.id)}`,
    source: "recruitee",
    company: name,
    title: str(raw.title),
    location: withRemote(str(raw.location) || joinLoc(raw.city, raw.country), raw.remote === true),
    url: str(raw.careers_url),
    job_date: str(raw.published_at).slice(0, 10),
  }));
}

export async function fetchPersonio(slug: string, name: string): Promise<RawJob[]> {
  const xml = await getText(`https://${slug}.jobs.personio.de/xml`);
  const positions = xml.match(/<position>[\s\S]*?<\/position>/g) ?? [];
  const pick = (block: string, tag: string) =>
    (block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "")
      .replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#039;/g, "'").trim();
  return positions.map((p) => {
    // Drop the description blocks so <name> picks the job title, not a section heading.
    const head = p.replace(/<jobDescriptions>[\s\S]*?<\/jobDescriptions>/, "");
    const id = pick(head, "id");
    return {
      external_id: `pe-${slug}-${id}`,
      source: "personio",
      company: name,
      title: pick(head, "name"),
      location: pick(head, "office"),
      url: `https://${slug}.jobs.personio.de/job/${id}`,
      job_date: pick(head, "createdAt").slice(0, 10),
    };
  });
}

export async function fetchBambooHR(slug: string, name: string): Promise<RawJob[]> {
  const data = await getJson(`https://${slug}.bamboohr.com/careers/list`) as { result?: Array<Record<string, unknown>> };
  return (data.result ?? []).map((raw) => {
    const loc = (raw.location ?? {}) as Record<string, unknown>;
    const ats = (raw.atsLocation ?? {}) as Record<string, unknown>;
    return {
      external_id: `bh-${slug}-${str(raw.id)}`,
      source: "bamboohr",
      company: name,
      title: str(raw.jobOpeningName),
      // locationType "1" is BambooHR's remote setting.
      location: withRemote(
        joinLoc(loc.city ?? ats.city, loc.state ?? ats.state, ats.country),
        raw.isRemote === true || str(raw.locationType) === "1",
      ),
      url: `https://${slug}.bamboohr.com/careers/${str(raw.id)}`,
      job_date: "",
    };
  });
}

export async function fetchBreezy(slug: string, name: string): Promise<RawJob[]> {
  const data = await getJson(`https://${slug}.breezy.hr/json`) as Array<Record<string, unknown>>;
  return (data ?? []).map((raw) => {
    const loc = (raw.location ?? {}) as Record<string, unknown>;
    const country = (loc.country ?? {}) as Record<string, unknown>;
    return {
      external_id: `bz-${slug}-${str(raw.id)}`,
      source: "breezy",
      company: name,
      title: str(raw.name),
      location: withRemote(str(loc.name) || joinLoc(loc.city, country.name), loc.is_remote === true),
      url: str(raw.url),
      job_date: str(raw.published_date).slice(0, 10),
    };
  });
}

export async function fetchPinpoint(slug: string, name: string): Promise<RawJob[]> {
  const data = await getJson(`https://${slug}.pinpointhq.com/postings.json`) as { data?: Array<Record<string, unknown>> };
  return (data.data ?? []).map((raw) => {
    const loc = (raw.location ?? {}) as Record<string, unknown>;
    return {
      external_id: `pp-${slug}-${str(raw.id)}`,
      source: "pinpoint",
      company: name,
      title: str(raw.title),
      location: withRemote(str(loc.name), str(raw.workplace_type) === "remote"),
      url: str(raw.url),
      job_date: "",
    };
  });
}

export async function fetchSmartRecruiters(slug: string, name: string): Promise<RawJob[]> {
  const data = await getJson(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`) as { content?: Array<Record<string, unknown>> };
  return (data.content ?? []).map((raw) => {
    const loc = (raw.location ?? {}) as Record<string, unknown>;
    return {
      external_id: `sr-${slug}-${str(raw.id)}`,
      source: "smartrecruiters",
      company: name,
      title: str(raw.name),
      location: withRemote(str(loc.fullLocation) || joinLoc(loc.city, loc.country), loc.remote === true),
      url: `https://jobs.smartrecruiters.com/${slug}/${str(raw.id)}`,
      job_date: str(raw.releasedDate).slice(0, 10),
    };
  });
}

// Teamtailor has no open JSON API, but every careers site publishes an RSS feed.
export async function fetchTeamtailor(host: string, name: string): Promise<RawJob[]> {
  const xml = await getText(`https://${host}/jobs.rss`);
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const pick = (block: string, tag: string) =>
    (block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? "")
      .replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  return items.map((it) => {
    const link = pick(it, "link");
    const places = [...it.matchAll(/<tt:(?:city|country)>([\s\S]*?)<\/tt:(?:city|country)>/g)].map((m) => m[1].trim());
    const remote = /<(?:tt:)?remoteStatus>\s*(fully|hybrid|temporary)/i.test(it);
    return {
      external_id: `tt-${host}-${pick(it, "guid") || link}`,
      source: "teamtailor",
      company: name,
      title: pick(it, "title"),
      location: withRemote(Array.from(new Set(places)).join(", "), remote),
      url: link,
      job_date: pick(it, "pubDate").slice(0, 16),
    };
  });
}

// Workday's careers sites load jobs from this endpoint 20 at a time. Large
// employers list thousands of jobs, so only the first 500 are read.
const WORKDAY_PAGE = 20;
const WORKDAY_MAX_PAGES = 25;

export async function fetchWorkday(slug: string, name: string): Promise<RawJob[]> {
  const [host, site] = slug.split("/");
  const tenant = host.split(".")[0];
  const endpoint = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
  type Page = { total?: number; jobPostings?: Array<Record<string, unknown>> };
  const page = (offset: number) => getJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ appliedFacets: {}, limit: WORKDAY_PAGE, offset, searchText: "" }),
  }) as Promise<Page>;

  const first = await page(0);
  const pages = Math.min(Math.ceil((first.total ?? 0) / WORKDAY_PAGE), WORKDAY_MAX_PAGES);
  const rest = await Promise.all(Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => page((i + 1) * WORKDAY_PAGE)));

  return [first, ...rest].flatMap((p) => p.jobPostings ?? []).map((raw) => {
    const path = str(raw.externalPath);
    return {
      external_id: `wd-${tenant}-${path}`,
      source: "workday",
      company: name,
      title: str(raw.title),
      location: withRemote(str(raw.locationsText), /remote/i.test(str(raw.remoteType))),
      url: `https://${host}/${site}${path}`,
      job_date: "",
    };
  });
}

export function fetchAts(type: AtsType, slug: string, name: string): Promise<RawJob[]> {
  switch (type) {
    case "greenhouse": return fetchGreenhouse(slug, name);
    case "ashby": return fetchAshby(slug, name);
    case "lever": return fetchLever(slug, name);
    case "workable": return fetchWorkable(slug, name);
    case "recruitee": return fetchRecruitee(slug, name);
    case "personio": return fetchPersonio(slug, name);
    case "bamboohr": return fetchBambooHR(slug, name);
    case "breezy": return fetchBreezy(slug, name);
    case "pinpoint": return fetchPinpoint(slug, name);
    case "smartrecruiters": return fetchSmartRecruiters(slug, name);
    case "teamtailor": return fetchTeamtailor(slug, name);
    case "workday": return fetchWorkday(slug, name);
  }
}

export async function fetchRemotive(): Promise<RawJob[]> {
  const data = await getJson("https://remotive.com/api/remote-jobs") as { jobs?: Array<Record<string, unknown>> };
  return (data.jobs ?? []).map((raw) => ({
    external_id: `rem-${str(raw.id)}`,
    source: "remotive",
    company: str(raw.company_name),
    title: str(raw.title),
    location: str(raw.candidate_required_location, "Anywhere"),
    url: str(raw.url),
    job_date: str(raw.publication_date).slice(0, 10),
  }));
}

export async function fetchWeWorkRemotely(): Promise<RawJob[]> {
  const xml = await getText("https://weworkremotely.com/remote-jobs.rss");
  // Light XML parsing — extract <item>...</item> blocks
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const pick = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    if (!m) return "";
    return m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
  };
  return items.map((it) => {
    const titleRaw = pick(it, "title");
    const link = pick(it, "link");
    const region = pick(it, "region") || "Anywhere";
    const pubDate = pick(it, "pubDate");
    let company = "", title = titleRaw;
    const sep = titleRaw.indexOf(": ");
    if (sep > -1) { company = titleRaw.slice(0, sep).trim(); title = titleRaw.slice(sep + 2).trim(); }
    const jobId = link ? link.replace(/\/$/, "").split("/").pop()! : titleRaw;
    return {
      external_id: `wwr-${jobId}`,
      source: "weworkremotely",
      company,
      title,
      location: region,
      url: link,
      job_date: pubDate.slice(0, 16),
    };
  });
}

export async function fetchWorkingNomads(): Promise<RawJob[]> {
  const data = await getJson("https://www.workingnomads.com/api/exposed_jobs/") as Array<Record<string, unknown>>;
  return (data ?? []).map((raw) => {
    const slug = str(raw.slug);
    return {
      external_id: slug ? `wn-${slug}` : `wn-${str(raw.title)}`,
      source: "workingnomads",
      company: str(raw.company_name),
      title: str(raw.title),
      location: str(raw.location, "Remote"),
      url: str(raw.url),
      job_date: str(raw.pub_date).slice(0, 10),
    };
  });
}
