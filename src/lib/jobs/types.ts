export type RawJob = {
  external_id: string;
  source: string;
  company: string;
  title: string;
  location: string;
  url: string;
  job_date: string;
};

// Company job boards the scanner can read, each identified by a slug.
// Workday slugs are "host/site" and Teamtailor slugs are the careers-site host.
export const ATS_TYPES = [
  "greenhouse", "ashby", "lever", "workable", "recruitee", "personio",
  "bamboohr", "breezy", "pinpoint", "smartrecruiters", "teamtailor", "workday",
] as const;
export type AtsType = (typeof ATS_TYPES)[number];

export const SOURCE_LABELS: Record<string, string> = {
  greenhouse: "Greenhouse",
  ashby: "Ashby",
  lever: "Lever",
  workable: "Workable",
  recruitee: "Recruitee",
  personio: "Personio",
  bamboohr: "BambooHR",
  breezy: "Breezy",
  pinpoint: "Pinpoint",
  smartrecruiters: "SmartRecruiters",
  teamtailor: "Teamtailor",
  workday: "Workday",
  remotive: "Remotive",
  weworkremotely: "We Work Remotely",
  workingnomads: "Working Nomads",
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

// Software-engineer-oriented keyword set for the demo account — distinct
// from DEFAULT_KEYWORD_CONFIG, which reflects the app owner's own support/CX
// job search and would otherwise exclude "engineer"/"developer" outright.
export const DEMO_KEYWORD_CONFIG: KeywordConfig = {
  keywords: {
    software_engineer: ["software engineer", "software developer", "application engineer"],
    frontend: ["frontend engineer", "front-end engineer", "frontend developer", "front-end developer", "ui engineer"],
    backend: ["backend engineer", "back-end engineer", "backend developer", "back-end developer", "api engineer"],
    fullstack: ["full stack engineer", "full-stack engineer", "fullstack engineer", "full stack developer"],
    platform_devops: ["platform engineer", "infrastructure engineer", "devops engineer", "site reliability engineer", "sre"],
    mobile_data: ["ios engineer", "android engineer", "mobile engineer", "data engineer", "machine learning engineer"],
  },
  exclusions: {
    terms: ["intern", "internship"],
    exceptions: [],
  },
  non_english_markers: DEFAULT_KEYWORD_CONFIG.non_english_markers,
  remote_only: false,
  remote_terms: DEFAULT_KEYWORD_CONFIG.remote_terms,
  // EMEA only: drop postings that name a place in the Americas or APAC.
  // Substring-matched against the raw location text, so these stay full
  // words — short codes like "US" would also hit e.g. "Russia". The US
  // state "Georgia" is left out so it doesn't drop the country.
  location_exclude: [
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
    "Delaware","Florida","Hawaii","Idaho","Illinois","Indiana","Iowa",
    "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
    "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
    "New Hampshire","New Jersey","New Mexico","New York","North Carolina",
    "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island",
    "South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
    "Virginia","Washington","West Virginia","Wisconsin","Wyoming",
    "San Francisco","Chicago","Boston","Seattle","Austin","Denver","Atlanta",
    "Miami","Portland","Minneapolis","United States","USA","US Remote",
    "North America","Americas","Canada","Toronto","Vancouver","Montreal",
    "Mexico","Brazil","Argentina","Latin America","LATAM",
    "Japan","Tokyo","South Korea","Korea","Singapore","Sydney","Melbourne","Australia",
    "Hong Kong","India","Bangalore","Mumbai","New Zealand","Auckland","APAC","Asia Pacific",
    "China","Shanghai","Beijing","Taiwan","Philippines","Manila","Vietnam","Indonesia",
    "Jakarta","Thailand","Bangkok",
  ],
};

export const DEFAULT_GREENHOUSE = [
  { slug: "aha", name: "Aha!" },
  { slug: "bitwarden", name: "Bitwarden" },
  { slug: "braze", name: "Braze" },
  { slug: "calendly", name: "Calendly" },
  { slug: "customerio", name: "Customer.io" },
  { slug: "datadog", name: "Datadog" },
  { slug: "gitlab", name: "GitLab" },
  { slug: "klaviyo", name: "Klaviyo" },
  { slug: "pagerduty", name: "PagerDuty" },
  { slug: "planetscale", name: "PlanetScale" },
  { slug: "postman", name: "Postman" },
  { slug: "remotecom", name: "Remote.com" },
  { slug: "typeform", name: "Typeform" },
  { slug: "userflow", name: "Userflow" },
];
export const DEFAULT_ASHBY = [
  { slug: "1password", name: "1Password" },
  { slug: "anomalo", name: "Anomalo" },
  { slug: "ashby", name: "Ashby" },
  { slug: "attio", name: "Attio" },
  { slug: "buffer", name: "Buffer" },
  { slug: "camunda", name: "Camunda" },
  { slug: "clickup", name: "ClickUp" },
  { slug: "close", name: "Close" },
  { slug: "duvo", name: "Duvo" },
  { slug: "float", name: "Float" },
  { slug: "gorgias", name: "Gorgias" },
  { slug: "helpscout", name: "Help Scout" },
  { slug: "iterable", name: "Iterable" },
  { slug: "kit", name: "Kit" },
  { slug: "linear", name: "Linear" },
  { slug: "loom", name: "Loom" },
  { slug: "plain", name: "Plain" },
  { slug: "pleo", name: "Pleo" },
  { slug: "snyk", name: "Snyk" },
  { slug: "spendesk", name: "Spendesk" },
  { slug: "wundergraph", name: "WunderGraph" },
  { slug: "zapier", name: "Zapier" },
];
export const DEFAULT_LEVER = [
  { slug: "15five", name: "15Five" },
  { slug: "activecampaign", name: "ActiveCampaign" },
  { slug: "appfollow", name: "AppFollow" },
  { slug: "articulate", name: "Articulate" },
  { slug: "whereby", name: "Whereby" },
];
export const DEFAULT_MANUAL = [
  { name: "Automattic", url: "https://automattic.com/work-with-us/" },
  { name: "Basecamp", url: "https://37signals.com/jobs" },
  { name: "beehiiv", url: "https://www.beehiiv.com/careers" },
  { name: "Chameleon", url: "https://www.chameleon.io/jobs#jobs" },
  { name: "ChartMogul", url: "https://chartmogul.com/jobs/#open-positions" },
  { name: "Conveyor", url: "https://www.conveyor.com/company/careers" },
  { name: "Fly.io", url: "https://fly.io/jobs/" },
  { name: "Groove", url: "https://www.groovehq.com/careers" },
  { name: "Harvest", url: "https://www.getharvest.com/careers" },
  { name: "Linear", url: "https://linear.app/careers#join-us" },
  { name: "Neon", url: "https://neon.tech/careers" },
  { name: "Perspective", url: "https://www.perspective.co/careers#open-positions" },
  { name: "Rippling", url: "https://www.rippling.com/careers" },
  { name: "SafetyWing", url: "https://safetywing.pinpointhq.com/" },
  { name: "Todoist", url: "https://www.todoist.com/careers#open-roles" },
  { name: "Toggl", url: "https://toggl.com/jobs/" },
  { name: "Tuple", url: "https://tuple.app/jobs" },
  { name: "Xactly", url: "https://careers.xactlycorp.com/jobs" },
];
