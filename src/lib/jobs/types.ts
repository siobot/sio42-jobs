export type RawJob = {
  external_id: string;
  source: string;
  company: string;
  title: string;
  location: string;
  url: string;
  job_date: string;
};

export type MatchedJob = RawJob & {
  matched_keywords: string[];
  matched_groups: string[];
};

export type KeywordConfig = {
  keywords: Record<string, string[]>;
  exclusions: { terms: string[]; exceptions: string[] };
  non_english_markers: string[];
  remote_only: boolean;
  remote_terms: string[];
  location_exclude: string[];
};

export const DEFAULT_KEYWORD_CONFIG: KeywordConfig = {
  keywords: {
    support_ops: [
      "support operations", "support ops", "cx operations",
      "customer operations", "customer experience",
    ],
    support_roles: [
      "customer support", "technical support", "support specialist",
      "support manager", "support lead", "head of support", "support agent",
    ],
    cx_roles: ["customer service", "cx manager", "cx lead"],
    implementation: [
      "implementation consultant", "implementation specialist",
      "implementation manager", "onboarding specialist", "onboarding manager",
      "professional services", "customer onboarding", "solutions consultant",
    ],
    cx_tools: ["zendesk", "intercom", "fin", "chatbot", "support tooling"],
  },
  exclusions: {
    terms: ["engineer", "developer", "software", "backend", "frontend", "fullstack", "data scientist", "intern"],
    exceptions: [],
  },
  non_english_markers: [
    "(m/w/d)", "(f/m/d)", "(d/m/w)", "(m/f/d)", "(w/m/d)", "(h/f)", "h/f",
    "inklusiver job", "settore", "provincia di", "responsabile", "tecnico di",
    "addetto", "ingegnere", "analista", "coordinatore", "responsable",
    "chargé", "ingénieur", "analyste", "technicien", "sachbearbeiter",
    "leiter", "mitarbeiter", "berater", "werkstudent", "pracownik",
    "specjalista", "kierownik", "analityk", "técnico", "analista de",
    "responsable de", "ingeniero", "medewerker", "analist",
  ],
  remote_only: false,
  remote_terms: ["remote", "anywhere", "distributed", "work from home", "wfh"],
  location_exclude: [
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
    "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
    "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
    "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
    "New Hampshire","New Jersey","New Mexico","New York","North Carolina",
    "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island",
    "South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
    "Virginia","Washington","West Virginia","Wisconsin","Wyoming",
    "San Francisco","Chicago","Boston","Seattle","Austin","Denver","Atlanta",
    "Miami","Portland","Minneapolis","USA, Remote","US Remote","United States",
    "USA","Remote, US","Tokyo","Japan","Seoul","South Korea","Korea","Singapore",
    "Sydney","Australia","APAC","North America","Americas",
  ],
};

export const DEFAULT_GREENHOUSE = [
  { slug: "gitlab", name: "GitLab" },
  { slug: "customerio", name: "Customer.io" },
  { slug: "aha", name: "Aha!" },
  { slug: "userflow", name: "Userflow" },
  { slug: "remotecom", name: "Remote.com" },
  { slug: "calendly", name: "Calendly" },
  { slug: "postman", name: "Postman" },
  { slug: "planetscale", name: "PlanetScale" },
  { slug: "typeform", name: "Typeform" },
  { slug: "bitwarden", name: "Bitwarden" },
  { slug: "klaviyo", name: "Klaviyo" },
  { slug: "braze", name: "Braze" },
  { slug: "datadog", name: "Datadog" },
  { slug: "pagerduty", name: "PagerDuty" },
];
export const DEFAULT_ASHBY = [
  { slug: "linear", name: "Linear" }, { slug: "buffer", name: "Buffer" },
  { slug: "helpscout", name: "Help Scout" }, { slug: "gorgias", name: "Gorgias" },
  { slug: "zapier", name: "Zapier" }, { slug: "close", name: "Close" },
  { slug: "kit", name: "Kit" }, { slug: "camunda", name: "Camunda" },
  { slug: "loom", name: "Loom" }, { slug: "ashby", name: "Ashby" },
  { slug: "plain", name: "Plain" },
  { slug: "attio", name: "Attio" },
  { slug: "duvo", name: "Duvo" },
  { slug: "wundergraph", name: "WunderGraph" },
  { slug: "pleo", name: "Pleo" },
  { slug: "iterable", name: "Iterable" },
  { slug: "float", name: "Float" },
  { slug: "1password", name: "1Password" },
  { slug: "clickup", name: "ClickUp" },
  { slug: "snyk", name: "Snyk" },
  { slug: "spendesk", name: "Spendesk" },
];
export const DEFAULT_LEVER = [
  { slug: "appfollow", name: "AppFollow" }, { slug: "whereby", name: "Whereby" },
  { slug: "15five", name: "15Five" }, { slug: "articulate", name: "Articulate" },
  { slug: "activecampaign", name: "ActiveCampaign" },
];
export const DEFAULT_MANUAL = [
  { name: "Automattic", url: "https://automattic.com/work-with-us/" },
  { name: "Doist", url: "https://doist.com/careers" },
  { name: "Basecamp", url: "https://37signals.com/jobs" },
  { name: "Tuple", url: "https://tuple.app/jobs" },
  { name: "Groove", url: "https://www.groovehq.com/careers" },
  { name: "ChartMogul", url: "https://chartmogul.com/jobs/#open-positions" },
  { name: "Chameleon", url: "https://www.chameleon.io/jobs#jobs" },
  { name: "Perspective", url: "https://www.perspective.co/careers#open-positions" },
  { name: "Linear", url: "https://linear.app/careers#join-us" },
  { name: "SafetyWing", url: "https://safetywing.pinpointhq.com/" },
  { name: "Xactly", url: "https://careers.xactlycorp.com/jobs" },
  { name: "Conveyor", url: "https://www.conveyor.com/company/careers" },
  { name: "Anomalo", url: "https://www.anomalo.com/careers/" },
  { name: "Fly.io", url: "https://fly.io/jobs/" },
  { name: "Neon", url: "https://neon.com/careers" },
  { name: "beehiiv", url: "https://www.beehiiv.com/careers" },
  { name: "Harvest", url: "https://www.getharvest.com/careers" },
  { name: "Toggl", url: "https://toggl.com/jobs/" },
  { name: "Rippling", url: "https://www.rippling.com/careers" },
];
