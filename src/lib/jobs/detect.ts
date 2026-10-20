// Detects whether a pasted careers-page URL is hosted on a supported ATS,
// finds ATS boards embedded in a careers page's HTML, and derives a display
// name from the page's <title> when one isn't supplied.
import type { AtsType } from "./types";

export type AtsMatch = { type: AtsType; slug: string };

export function parseAtsFromUrl(rawUrl: string): AtsMatch | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const segs = u.pathname.split("/").filter(Boolean);
  const sub = host.split(".")[0];

  if (/^(boards|job-boards|boards-api)\.greenhouse\.io$/.test(host)) {
    const idx = segs.indexOf("boards");
    const slug = u.searchParams.get("for") ?? (idx >= 0 ? segs[idx + 1] : segs[0]);
    if (slug && slug !== "embed") return { type: "greenhouse", slug };
  }

  if (host === "jobs.lever.co") {
    if (segs[0]) return { type: "lever", slug: segs[0] };
  }

  if (host === "jobs.ashbyhq.com") {
    if (segs[0]) return { type: "ashby", slug: segs[0] };
  }
  if (host.endsWith(".ashbyhq.com") && !["jobs", "api", "app"].includes(sub)) {
    return { type: "ashby", slug: sub };
  }

  if (host === "apply.workable.com") {
    if (segs[0] && segs[0] !== "j" && segs[0] !== "api") return { type: "workable", slug: segs[0] };
  } else if (host.endsWith(".workable.com") && !["apply", "jobs", "help", "resources"].includes(sub)) {
    return { type: "workable", slug: sub };
  }

  if (host.endsWith(".recruitee.com") && !["app", "api", "careers"].includes(sub)) {
    return { type: "recruitee", slug: sub };
  }
  if (/\.jobs\.personio\.(de|com)$/.test(host)) return { type: "personio", slug: sub };
  if (host.endsWith(".bamboohr.com") && !["app", "api"].includes(sub)) return { type: "bamboohr", slug: sub };
  if (host.endsWith(".breezy.hr") && sub !== "app") return { type: "breezy", slug: sub };
  if (host.endsWith(".pinpointhq.com") && sub !== "app") return { type: "pinpoint", slug: sub };

  if (host === "careers.smartrecruiters.com" || host === "jobs.smartrecruiters.com") {
    if (segs[0]) return { type: "smartrecruiters", slug: segs[0] };
  }

  if (host.endsWith(".teamtailor.com") && !["app", "www", "career", "assets-aws"].includes(sub)) {
    return { type: "teamtailor", slug: host };
  }

  // e.g. acme.wd5.myworkdayjobs.com/en-US/External_Careers/job/...
  if (/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/.test(host)) {
    const site = /^[a-z]{2}-[A-Z]{2}$/.test(segs[0] ?? "") ? segs[1] : segs[0];
    if (site && site !== "wday") return { type: "workday", slug: `${host}/${site}` };
  }

  return null;
}

// ATS links as they appear inside careers-page HTML (embeds, "View jobs" buttons).
const EMBEDDED_ATS = new RegExp(
  "https?://(?:" + [
    "(?:boards|job-boards)(?:\\.eu)?\\.greenhouse\\.io/(?:embed/job_board(?:/js)?\\?for=)?[A-Za-z0-9_-]+",
    "jobs\\.lever\\.co/[A-Za-z0-9_.-]+",
    "jobs\\.ashbyhq\\.com/[A-Za-z0-9_.%-]+",
    "apply\\.workable\\.com/[a-z0-9_-]+",
    "[a-z0-9-]+\\.workable\\.com",
    "[a-z0-9-]+\\.recruitee\\.com",
    "[a-z0-9-]+\\.jobs\\.personio\\.(?:de|com)",
    "[a-z0-9-]+\\.bamboohr\\.com",
    "[a-z0-9-]+\\.breezy\\.hr",
    "[a-z0-9-]+\\.pinpointhq\\.com",
    "(?:careers|jobs)\\.smartrecruiters\\.com/[A-Za-z0-9_-]+",
    "[a-z0-9-]+\\.teamtailor\\.com",
    "[a-z0-9-]+\\.wd\\d+\\.myworkdayjobs\\.com/(?:[a-z]{2}-[A-Z]{2}/)?[A-Za-z0-9_-]+",
  ].join("|") + ")",
  "g",
);

export function findAtsInHtml(html: string): AtsMatch[] {
  const seen = new Set<string>();
  const out: AtsMatch[] = [];
  for (const m of html.matchAll(EMBEDDED_ATS)) {
    const parsed = parseAtsFromUrl(m[0].replace(/&amp;/g, "&"));
    if (!parsed) continue;
    const key = `${parsed.type}:${parsed.slug.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

export async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JobMonitorBot/1.0)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export function pageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const decoded = m[1]
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return decoded || null;
}

// Strips generic "careers"/"jobs" framing off a page title to leave just
// the company name, e.g. "Careers at Acme" or "Acme - Jobs" -> "Acme".
export function cleanCompanyNameFromTitle(title: string): string | null {
  let t = title.trim();
  if (!t) return null;

  t = t.replace(/^(careers|jobs|job openings|open positions|current openings|hiring)\s+(at|@)\s+/i, "");
  t = t.replace(/\s*[-|·•—]\s*(careers|jobs|job openings|open positions|current openings|hiring|we're hiring|work with us)\s*$/i, "");
  t = t.replace(/^(careers|jobs)\s*[-|·•—]\s*/i, "");
  t = t.trim();

  return t || null;
}
