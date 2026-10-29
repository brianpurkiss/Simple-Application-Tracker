// Built-in words for the starter Job Types and Company Types, keyed by `starter_key` (see fact_types in
// server/db.ts). They give a brand-new list something to go on before any job is labeled. Kept generic on
// purpose: anything field-specific is learned from the jobs you label instead. Keys with no matching starter
// type (growth, ecommerce on newer installs) are simply unused.
//
// Phrases are lowercase words. Hyphens inside a word are dropped when matching, so "e-commerce" is
// "ecommerce"; stopwords are dropped too, so "chief of staff" is written "chief staff".

/** Job Type words, matched against the title (seniority and company name removed). */
export const JOB_TYPE_WORDS: Record<string, string[]> = {
  product: ["product", "product manager", "product owner", "product management"],
  engineering: ["engineer", "engineering", "developer", "software", "devops", "programmer", "sre"],
  design: ["design", "designer", "ux", "ui", "creative"],
  data: ["data", "analytics", "analyst", "insights", "business intelligence", "scientist"],
  marketing: ["marketing", "marketer", "brand", "seo", "sem", "content", "communications", "lifecycle", "crm", "demand generation", "cmo"],
  growth: ["growth", "acquisition", "retention", "cro", "conversion", "experimentation"],
  ecommerce: ["ecommerce", "e commerce", "ecom", "dtc", "d2c", "direct consumer", "digital commerce", "online store"],
  sales: ["sales", "account executive", "business development", "partnerships", "bdr", "sdr"],
  customer: ["customer success", "customer support", "customer service", "client services", "support"],
  operations: ["operations", "ops", "supply chain", "logistics", "fulfillment", "procurement"],
  finance: ["finance", "financial", "accounting", "accountant", "controller", "treasury", "fp", "cfo"],
  people: ["hr", "human resources", "people", "recruiter", "recruiting", "talent"],
  healthcare: ["nurse", "nursing", "rn", "physician", "clinical", "clinician", "therapist", "pharmacist", "medical", "patient care"],
  education: ["teacher", "teaching", "instructor", "professor", "tutor", "curriculum", "principal school", "education"],
  legal: ["attorney", "lawyer", "paralegal", "counsel", "legal", "compliance"],
  trades: ["electrician", "plumber", "mechanic", "technician", "carpenter", "welder", "hvac", "machinist"],
  general: ["general manager", "gm", "ceo", "coo", "president", "founder", "chief staff", "managing director", "executive director"],
};

/** Company Type words that mean the title itself names the industry. Only explicit words: "commerce" alone is
 * left out because commerce-platform SaaS companies use it too. */
export const COMPANY_TITLE_WORDS: Record<string, string[]> = {
  ecommerce: ["ecommerce", "e commerce", "ecom", "dtc", "d2c", "direct consumer"],
  retail: ["retail"],
  saas: ["saas"],
  b2b: ["b2b"],
  agency: ["agency"],
  marketplace: ["marketplace"],
  fintech: ["fintech"],
  healthcare: ["healthcare", "clinical", "hospital"],
  nonprofit: ["nonprofit", "non profit", "ngo", "government", "public sector"],
};

/** Company Type words counted in a job description. A description only ever makes a type "Likely". */
export const COMPANY_JD_WORDS: Record<string, string[]> = {
  ecommerce: ["ecommerce", "e commerce", "dtc", "d2c", "direct consumer", "shopify", "online store", "subscription box"],
  retail: ["retail", "brick mortar", "stores", "omnichannel"],
  saas: ["saas", "software service", "platform customers", "arr", "subscription software"],
  b2b: ["b2b", "enterprise customers", "enterprise clients"],
  agency: ["agency", "our clients", "client portfolio", "consultancy"],
  marketplace: ["marketplace", "buyers sellers", "two sided"],
  fintech: ["fintech", "payments", "lending", "banking"],
  healthcare: ["healthcare", "patients", "clinical", "hipaa"],
  nonprofit: ["nonprofit", "non profit", "mission driven organization"],
};

/** Words that don't change a match and are skipped on both sides. */
export const FACT_STOPWORDS = new Set(["of", "the", "for", "and", "to", "at", "in", "a", "an", "with", "on", "or"]);
