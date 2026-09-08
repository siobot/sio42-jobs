// Detects whether a pasted careers-page URL is hosted directly on a
// supported ATS (Greenhouse, Ashby, Lever), and derives a display name
// from the page's <title> when one isn't supplied.

export type AtsMatch = { type: "greenhouse" | "ashby" | "lever"; slug: string };

export function parseAtsFromUrl(rawUrl: string): AtsMatch | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  const segs = u.pathname.split("/").filter(Boolean);

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io" || host === "boards-api.greenhouse.io") {
    const idx = segs.indexOf("boards");
    const slug = idx >= 0 ? segs[idx + 1] : segs[0];
    if (slug) return { type: "greenhouse", slug };
  }

  if (host === "jobs.lever.co") {
    if (segs[0]) return { type: "lever", slug: segs[0] };
  }

  if (host === "jobs.ashbyhq.com") {
    if (segs[0]) return { type: "ashby", slug: segs[0] };
  }
  if (host.endsWith(".ashbyhq.com") && host !== "jobs.ashbyhq.com" && host !== "api.ashbyhq.com" && host !== "app.ashbyhq.com") {
    const slug = host.split(".")[0];
    if (slug) return { type: "ashby", slug };
  }

  return null;
}

export async function fetchPageTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JobMonitorBot/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
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
  } catch {
    return null;
  }
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
