import type { RawJob } from "./types";

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

export async function fetchDoist(): Promise<RawJob[]> {
  const data = await getJson("https://doist.com/api/jobs") as Array<Record<string, unknown>>;
  return (data ?? []).map((raw) => {
    const id = str(raw.shortcode ?? raw.id ?? raw.title);
    let loc: string = "Remote";
    const l = raw.location;
    if (typeof l === "string") loc = l;
    else if (l && typeof l === "object") {
      const lr = l as Record<string, unknown>;
      loc = str(lr.location_str ?? lr.country ?? "Remote");
      if (lr.telecommuting && loc !== "Remote") loc = `Remote — ${loc}`;
    }
    return {
      external_id: `doist-${id}`,
      source: "doist",
      company: "Doist",
      title: str(raw.title ?? raw.name),
      location: loc,
      url: str(raw.url ?? `https://doist.com/careers/${id}`),
      job_date: str(raw.published_at ?? raw.created_at).slice(0, 10),
    };
  });
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
