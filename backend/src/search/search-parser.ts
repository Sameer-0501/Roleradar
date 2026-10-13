/**
 * Deterministic Natural-Language Search Query Parser.
 *
 * Translates natural-language job search expressions into a structured,
 * debuggable StructuredSearchIntent representation without relying on external
 * LLMs or nondeterministic APIs.
 *
 * Supports:
 * 1. Experience Level (Fresher vs Experienced vs Any).
 * 2. Universal Occupational Categories & Canonical Roles across all 25+ disciplines.
 * 3. Skill Extraction with Canonical Synonyms (e.g. JS -> JavaScript, Postgres -> PostgreSQL).
 * 4. India-First Location & Global Country Normalization.
 * 5. Workplace Mode (Remote, Hybrid, Onsite).
 * 6. Employer / Company Recognition.
 */

import type { ExperienceLevel, WorkplaceType } from '../matching/matching-types.js';
import type {
  OccupationalCategory,
  StructuredSearchIntent,
} from './search-types.js';
import { SOURCE_CATALOG } from '../sources/catalog.js';

// --- SKILL SYNONYMS MAP ---
export const SKILL_SYNONYMS: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  'react.js': 'React',
  reactjs: 'React',
  react: 'React',
  'node.js': 'Node.js',
  nodejs: 'Node.js',
  node: 'Node.js',
  'vue.js': 'Vue',
  vuejs: 'Vue',
  vue: 'Vue',
  'angular.js': 'Angular',
  angularjs: 'Angular',
  angular: 'Angular',
  'next.js': 'Next.js',
  nextjs: 'Next.js',
  next: 'Next.js',
  python: 'Python',
  java: 'Java',
  'spring boot': 'Spring Boot',
  springboot: 'Spring Boot',
  spring: 'Spring Boot',
  go: 'Go',
  golang: 'Go',
  rust: 'Rust',
  'c++': 'C++',
  cpp: 'C++',
  'c#': 'C#',
  csharp: 'C#',
  ruby: 'Ruby',
  rails: 'Ruby on Rails',
  'ruby on rails': 'Ruby on Rails',
  sql: 'SQL',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  mongo: 'MongoDB',
  redis: 'Redis',
  kafka: 'Kafka',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  k8s: 'Kubernetes',
  aws: 'Amazon Web Services',
  'amazon web services': 'Amazon Web Services',
  gcp: 'Google Cloud',
  'google cloud': 'Google Cloud',
  azure: 'Azure',
  graphql: 'GraphQL',
  selenium: 'Selenium',
  cypress: 'Cypress',
  playwright: 'Playwright',
  jira: 'Jira',
  figma: 'Figma',
  tableau: 'Tableau',
  powerbi: 'Power BI',
  'power bi': 'Power BI',
  excel: 'Excel',
  salesforce: 'Salesforce',
  hubspot: 'HubSpot',
};

// --- LOCATION NORMALIZATION MAP ---
export const SEARCH_LOCATIONS: Record<string, { city: string; country: string }> = {
  // India
  bangalore: { city: 'Bangalore', country: 'India' },
  bengaluru: { city: 'Bangalore', country: 'India' },
  blr: { city: 'Bangalore', country: 'India' },
  mumbai: { city: 'Mumbai', country: 'India' },
  bombay: { city: 'Mumbai', country: 'India' },
  chennai: { city: 'Chennai', country: 'India' },
  madras: { city: 'Chennai', country: 'India' },
  hyderabad: { city: 'Hyderabad', country: 'India' },
  hyd: { city: 'Hyderabad', country: 'India' },
  pune: { city: 'Pune', country: 'India' },
  'delhi ncr': { city: 'Delhi NCR', country: 'India' },
  delhi: { city: 'Delhi NCR', country: 'India' },
  'new delhi': { city: 'Delhi NCR', country: 'India' },
  noida: { city: 'Delhi NCR', country: 'India' },
  gurgaon: { city: 'Delhi NCR', country: 'India' },
  gurugram: { city: 'Delhi NCR', country: 'India' },
  ncr: { city: 'Delhi NCR', country: 'India' },
  kolkata: { city: 'Kolkata', country: 'India' },
  calcutta: { city: 'Kolkata', country: 'India' },
  ahmedabad: { city: 'Ahmedabad', country: 'India' },
  kochi: { city: 'Kochi', country: 'India' },
  cochin: { city: 'Kochi', country: 'India' },
  jaipur: { city: 'Jaipur', country: 'India' },
  indore: { city: 'Indore', country: 'India' },
  chandigarh: { city: 'Chandigarh', country: 'India' },
  coimbatore: { city: 'Coimbatore', country: 'India' },
  trivandrum: { city: 'Trivandrum', country: 'India' },
  thiruvananthapuram: { city: 'Trivandrum', country: 'India' },

  // International Cities
  london: { city: 'London', country: 'United Kingdom' },
  manchester: { city: 'Manchester', country: 'United Kingdom' },
  berlin: { city: 'Berlin', country: 'Germany' },
  munich: { city: 'Munich', country: 'Germany' },
  frankfurt: { city: 'Frankfurt', country: 'Germany' },
  toronto: { city: 'Toronto', country: 'Canada' },
  vancouver: { city: 'Vancouver', country: 'Canada' },
  montreal: { city: 'Montreal', country: 'Canada' },
  'san francisco': { city: 'San Francisco', country: 'United States' },
  'new york': { city: 'New York', country: 'United States' },
  seattle: { city: 'Seattle', country: 'United States' },
  austin: { city: 'Austin', country: 'United States' },
  boston: { city: 'Boston', country: 'United States' },
  singapore: { city: 'Singapore', country: 'Singapore' },
  sydney: { city: 'Sydney', country: 'Australia' },
  melbourne: { city: 'Melbourne', country: 'Australia' },
  amsterdam: { city: 'Amsterdam', country: 'Netherlands' },
  paris: { city: 'Paris', country: 'France' },
  dublin: { city: 'Dublin', country: 'Ireland' },
};

// --- COUNTRY NORMALIZATION MAP ---
export const SEARCH_COUNTRIES: Record<string, string> = {
  india: 'India',
  uk: 'United Kingdom',
  'united kingdom': 'United Kingdom',
  britain: 'United Kingdom',
  us: 'United States',
  usa: 'United States',
  'united states': 'United States',
  america: 'United States',
  germany: 'Germany',
  deutschland: 'Germany',
  canada: 'Canada',
  australia: 'Australia',
  singapore: 'Singapore',
  netherlands: 'Netherlands',
  holland: 'Netherlands',
  france: 'France',
  ireland: 'Ireland',
  switzerland: 'Switzerland',
  japan: 'Japan',
  worldwide: 'Worldwide',
  global: 'Worldwide',
};

// --- ROLE PHRASE PATTERNS & CATEGORIES ---
interface RolePattern {
  category: OccupationalCategory;
  canonicalRole: string;
  patterns: RegExp[];
}

export const ROLE_PATTERNS: RolePattern[] = [
  // 1. Software Engineering
  {
    category: 'SOFTWARE_ENGINEERING',
    canonicalRole: 'Software Engineer',
    patterns: [
      /\b(software\s+engineer|software\s+developer|sde|swe|application\s+developer|programmer)\b/i,
      /\b(java\s+developer|java\s+engineer|python\s+developer|python\s+engineer|golang\s+developer|go\s+developer|rust\s+developer|c\+\+\s+developer)\b/i,
      /\b(frontend\s+developer|frontend\s+engineer|front\s*end|ui\s+engineer|web\s+developer)\b/i,
      /\b(backend\s+developer|backend\s+engineer|back\s*end|api\s+developer)\b/i,
      /\b(full\s*stack\s+developer|full\s*stack\s+engineer|fullstack)\b/i,
      /\b(mobile\s+developer|ios\s+developer|android\s+developer|mobile\s+engineer)\b/i,
      /\b(devops\s+engineer|site\s+reliability\s+engineer|sre|platform\s+engineer|cloudops)\b/i,
      /\b(associate\s+developer|associate\s+software\s+engineer|graduate\s+engineer\s+trainee[\s\-]+software|get[\s\-]+software)\b/i,
      /\b(software\s+jobs|developer\s+jobs|coding\s+jobs)\b/i,
    ],
  },
  // 2. Data / AI / ML
  {
    category: 'DATA_AI_ML',
    canonicalRole: 'Data Analyst',
    patterns: [
      /\b(data\s+analyst|business\s+data\s+analyst|analytics\s+analyst|bi\s+analyst|product\s+analyst)\b/i,
    ],
  },
  {
    category: 'DATA_AI_ML',
    canonicalRole: 'Data Scientist',
    patterns: [
      /\b(data\s+scientist|applied\s+scientist|quantitative\s+analyst|data\s+science)\b/i,
    ],
  },
  {
    category: 'DATA_AI_ML',
    canonicalRole: 'Data Engineer',
    patterns: [
      /\b(data\s+engineer|etl\s+developer|big\s+data\s+engineer|data\s+platform\s+engineer)\b/i,
    ],
  },
  {
    category: 'DATA_AI_ML',
    canonicalRole: 'Machine Learning Engineer',
    patterns: [
      /\b(machine\s+learning\s+engineer|ml\s+engineer|ai\s+engineer|deep\s+learning\s+engineer|nlp\s+engineer|computer\s+vision\s+engineer|genai\s+engineer)\b/i,
      /\b(ai\s+jobs|ml\s+jobs|data\s+jobs)\b/i,
    ],
  },
  // 3. QA / Testing
  {
    category: 'QA_TESTING',
    canonicalRole: 'QA Engineer',
    patterns: [
      /\b(qa\s+engineer|quality\s+assurance|sdet|test\s+engineer|automation\s+test|qa\s+automation|software\s+test|manual\s+tester|testing\s+jobs)\b/i,
    ],
  },
  // 4. Cybersecurity
  {
    category: 'CYBERSECURITY',
    canonicalRole: 'Security Engineer',
    patterns: [
      /\b(security\s+engineer|cybersecurity|information\s+security|infosec|soc\s+analyst|appsec|cloud\s+security|security\s+jobs)\b/i,
    ],
  },
  // 5. IT Infrastructure & Cloud
  {
    category: 'IT_INFRASTRUCTURE',
    canonicalRole: 'Cloud Engineer',
    patterns: [
      /\b(cloud\s+engineer|cloud\s+architect|systems\s+administrator|sysadmin|network\s+engineer|database\s+administrator|dba|infrastructure\s+engineer)\b/i,
    ],
  },
  // 6. Hardware & Embedded
  {
    category: 'HARDWARE_EMBEDDED',
    canonicalRole: 'Hardware Engineer',
    patterns: [
      /\b(hardware\s+engineer|embedded\s+engineer|vlsi|asic|fpga|pcb\s+designer|robotics\s+engineer|electrical\s+engineer)\b/i,
    ],
  },
  // 7. Technical Support & DevRel
  {
    category: 'TECHNICAL_SUPPORT',
    canonicalRole: 'Technical Support Engineer',
    patterns: [
      /\b(technical\s+support|tech\s+support|developer\s+relations|devrel|solutions\s+engineer|customer\s+engineer|application\s+support|it\s+support|helpdesk)\b/i,
    ],
  },
  // 8. Product Management
  {
    category: 'PRODUCT',
    canonicalRole: 'Product Manager',
    patterns: [
      /\b(product\s+manager|technical\s+product\s+manager|tpm|apm|associate\s+product\s+manager|product\s+owner|product\s+operations|product\s+jobs)\b/i,
    ],
  },
  // 9. Design & UX / UI
  {
    category: 'DESIGN_UX',
    canonicalRole: 'Product Designer',
    patterns: [
      /\b(product\s+designer|ux\s+designer|ui\s+designer|ux\/ui\s+designer|ui\/ux\s+designer|ux\s+design|product\s+design|user\s+experience|visual\s+designer|design\s+jobs)\b/i,
    ],
  },
  // 10. Finance & Accounting
  {
    category: 'FINANCE_ACCOUNTING',
    canonicalRole: 'Financial Analyst',
    patterns: [
      /\b(financial\s+analyst|finance\s+analyst|finance\s+associate|fp&a|accountant|accounting|auditor|audit\s+associate|tax\s+analyst|treasury|finance\s+jobs|accounting\s+jobs)\b/i,
    ],
  },
  // 11. HR & Recruiting
  {
    category: 'HR_RECRUITING',
    canonicalRole: 'Recruiter',
    patterns: [
      /\b(recruiter|talent\s+acquisition|talent\s+partner|technical\s+recruiter|hr\s+recruiter|recruiting|recruiting\s+coordinator)\b/i,
    ],
  },
  {
    category: 'HR_RECRUITING',
    canonicalRole: 'Human Resources',
    patterns: [
      /\b(human\s+resources|hr\s+associate|hr\s+intern|hrbp|people\s+partner|people\s+operations|hr\s+generalist|hr\s+jobs)\b/i,
    ],
  },
  // 12. Sales & Business Development
  {
    category: 'SALES',
    canonicalRole: 'Account Executive',
    patterns: [
      /\b(account\s+executive|business\s+development|bdr|sdr|sales\s+executive|sales\s+associate|sales\s+manager|enterprise\s+sales|sales\s+jobs)\b/i,
    ],
  },
  // 13. Marketing & Communications
  {
    category: 'MARKETING',
    canonicalRole: 'Marketing Specialist',
    patterns: [
      /\b(marketing|content\s+writer|copywriter|seo\s+specialist|brand\s+manager|growth\s+marketer|product\s+marketer|pmm|public\s+relations|marketing\s+jobs)\b/i,
    ],
  },
  // 14. Operations & Business Ops
  {
    category: 'OPERATIONS',
    canonicalRole: 'Operations Analyst',
    patterns: [
      /\b(operations\s+analyst|operations\s+associate|business\s+operations|bizops|operations\s+manager|program\s+manager|project\s+manager|operations\s+jobs)\b/i,
    ],
  },
  // 15. Customer Success & Support
  {
    category: 'CUSTOMER_SUCCESS',
    canonicalRole: 'Customer Success Manager',
    patterns: [
      /\b(customer\s+success|customer\s+support|client\s+success|customer\s+experience|client\s+partner|tele\s*caller|support\s+jobs)\b/i,
    ],
  },
  // 16. Legal & Compliance
  {
    category: 'LEGAL',
    canonicalRole: 'Legal Counsel',
    patterns: [
      /\b(legal\s+counsel|legal\s+associate|attorney|lawyer|compliance\s+specialist|paralegal|contracts\s+manager|legal\s+jobs)\b/i,
    ],
  },
  // 17. Procurement & Sourcing
  {
    category: 'PROCUREMENT',
    canonicalRole: 'Procurement Specialist',
    patterns: [
      /\b(procurement\s+specialist|sourcing\s+specialist|buyer|purchasing\s+agent|vendor\s+manager|procurement\s+jobs)\b/i,
    ],
  },
  // 18. Supply Chain & Logistics
  {
    category: 'SUPPLY_CHAIN',
    canonicalRole: 'Supply Chain & Logistics',
    patterns: [
      /\b(supply\s+chain|supply\s+chain\s+analyst|supply\s+chain\s+engineer|supply\s+chain\s+specialist|logistics\s+analyst|logistics\s+coordinator|logistics\s+specialist|procurement\s+analyst|procurement\s+specialist|procurement)\b/i,
    ],
  },
  // 19. Consulting & Advisory
  {
    category: 'CONSULTING',
    canonicalRole: 'Management Consultant',
    patterns: [
      /\b(management\s+consultant|management\s+consulting|strategy\s+consultant|strategy\s+analyst|consulting\s+analyst|advisory\s+associate)\b/i,
    ],
  },
  // 20. Research & Science
  {
    category: 'RESEARCH',
    canonicalRole: 'Research Scientist',
    patterns: [
      /\b(research\s+scientist|researcher|postdoc|fellow|research\s+associate|laboratory\s+scientist|research\s+jobs)\b/i,
    ],
  },
  // 21. Engineering - Mechanical
  {
    category: 'ENGINEERING_OTHER',
    canonicalRole: 'Mechanical Engineer',
    patterns: [
      /\b(mechanical\s+engineer|mechanical\s+design\s+engineer|mechanical\s+engineering|mechanical\s+designer|graduate\s+engineer\s+trainee[\s\-]+mechanical|get[\s\-]+mechanical)\b/i,
    ],
  },
  // 22. Engineering - Electrical
  {
    category: 'ENGINEERING_OTHER',
    canonicalRole: 'Electrical Engineer',
    patterns: [
      /\b(electrical\s+engineer|electrical\s+design\s+engineer|electrical\s+engineering|electrical\s+maintenance\s+engineer|graduate\s+engineer\s+trainee[\s\-]+electrical|get[\s\-]+electrical)\b/i,
    ],
  },
  // 23. Engineering - Hardware & Electronics
  {
    category: 'HARDWARE_EMBEDDED',
    canonicalRole: 'Hardware & Electronics Engineer',
    patterns: [
      /\b(hardware\s+engineer|hardware\s+design\s+engineer|electronics\s+engineer|electronics\s+design\s+engineer|vlsi\s+engineer|hardware\s+architect|graduate\s+engineer\s+trainee[\s\-]+hardware|get[\s\-]+hardware|graduate\s+engineer\s+trainee[\s\-]+electronics|get[\s\-]+electronics)\b/i,
    ],
  },
  // 24. Engineering - Civil
  {
    category: 'ENGINEERING_OTHER',
    canonicalRole: 'Civil Engineer',
    patterns: [
      /\b(civil\s+engineer|civil\s+design\s+engineer|civil\s+engineering|graduate\s+engineer\s+trainee[\s\-]+civil|get[\s\-]+civil)\b/i,
    ],
  },
  // 25. Risk & Compliance
  {
    category: 'LEGAL',
    canonicalRole: 'Risk & Compliance',
    patterns: [
      /\b(risk\s+analyst|compliance\s+analyst|compliance\s+specialist|aml\s+analyst|anti-money\s+laundering\s+analyst|financial\s+crime\s+analyst|operational\s+risk\s+analyst|credit\s+risk\s+analyst|risk\s+&\s+compliance|risk\s+and\s+compliance)\b/i,
    ],
  },
];

/**
 * Parses a natural-language search query into a deterministic StructuredSearchIntent.
 */
export function parseSearchQuery(query: string): StructuredSearchIntent {
  const originalQuery = (query || '').trim();
  if (!originalQuery) {
    return {
      originalQuery: '',
      normalizedQuery: '',
      experienceLevel: null,
      roles: [],
      occupationalCategory: null,
      skills: [],
      locations: [],
      country: null,
      workplaceTypes: [],
      companies: [],
      recognizedTokens: [],
      remainingKeywords: [],
      isNaturalLanguage: false,
    };
  }

  const normalized = originalQuery.toLowerCase();
  const recognizedTokens: string[] = [];

  let experienceLevel: ExperienceLevel | 'ANY' | null = null;
  const roles: string[] = [];
  let occupationalCategory: OccupationalCategory | null = null;
  const skills: string[] = [];
  const locations: string[] = [];
  let country: string | null = null;
  const workplaceTypes: WorkplaceType[] = [];
  const companies: string[] = [];

  let workingQuery = ` ${normalized} `;

  // 1. Extract Roles & Categories (First, so compound titles like "product manager" or "sales manager" are preserved)
  for (const roleDef of ROLE_PATTERNS) {
    for (const pattern of roleDef.patterns) {
      if (pattern.test(workingQuery)) {
        if (!roles.includes(roleDef.canonicalRole)) {
          roles.push(roleDef.canonicalRole);
        }
        if (!occupationalCategory) {
          occupationalCategory = roleDef.category;
        }
        const match = workingQuery.match(pattern);
        if (match) {
          recognizedTokens.push(match[0]);
          workingQuery = workingQuery.replace(match[0], ' ');
        }
        break;
      }
    }
  }

  // 2. Extract Experience Level
  const fresherRegex = /\b(fresher|freshers|entry\s*level|graduate|new\s*grad|new\s*graduate|recent\s*graduate|junior|0\s*years?|0\s*-\s*1\s*years?|0\s*-\s*2\s*years?|no\s*experience|intern|internship|trainee|get)\b/i;
  const expRegex = /\b(senior|mid\s*level|lead|principal|staff|director|architect|head|experienced|2\+\s*years?|3\+\s*years?|5\+\s*years?)\b/i;

  if (fresherRegex.test(normalized)) {
    experienceLevel = 'FRESHER';
    const match = workingQuery.match(fresherRegex);
    if (match) {
      recognizedTokens.push(match[0]);
      workingQuery = workingQuery.replace(match[0], ' ');
    }
  } else if (expRegex.test(normalized)) {
    experienceLevel = 'EXPERIENCED';
    const match = workingQuery.match(expRegex);
    if (match) {
      recognizedTokens.push(match[0]);
      workingQuery = workingQuery.replace(match[0], ' ');
    }
  }

  // 3. Extract Workplace Preference
  const workplacePatterns = [
    { type: ['ONSITE', 'HYBRID'] as WorkplaceType[], regex: /\b(onsite\s+or\s+hybrid|hybrid\s+or\s+onsite|office\s+or\s+hybrid)\b/i },
    { type: ['HYBRID', 'REMOTE'] as WorkplaceType[], regex: /\b(hybrid\s+or\s+remote|remote\s+or\s+hybrid)\b/i },
    { type: ['REMOTE'] as WorkplaceType[], regex: /\b(remote|work\s+from\s+home|wfh|fully\s+remote)\b/i },
    { type: ['HYBRID'] as WorkplaceType[], regex: /\b(hybrid)\b/i },
    { type: ['ONSITE'] as WorkplaceType[], regex: /\b(onsite|on-site|in-office|office)\b/i },
  ];

  for (const wp of workplacePatterns) {
    const match = workingQuery.match(wp.regex);
    if (match) {
      workplaceTypes.push(...wp.type);
      recognizedTokens.push(match[0]);
      workingQuery = workingQuery.replace(match[0], ' ');
      break;
    }
  }

  // 4. Extract Locations & Country
  // First check specific cities
  for (const [key, locData] of Object.entries(SEARCH_LOCATIONS)) {
    const locRegex = new RegExp(`\\b${key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (locRegex.test(workingQuery)) {
      if (!locations.includes(locData.city)) {
        locations.push(locData.city);
      }
      if (!country) {
        country = locData.country;
      }
      recognizedTokens.push(key);
      workingQuery = workingQuery.replace(locRegex, ' ');
    }
  }

  // Next check standalone country names
  for (const [key, countryName] of Object.entries(SEARCH_COUNTRIES)) {
    const countryRegex = new RegExp(`\\b${key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (countryRegex.test(workingQuery)) {
      country = countryName;
      recognizedTokens.push(key);
      workingQuery = workingQuery.replace(countryRegex, ' ');
    }
  }

  // 5. Extract Known Companies
  for (const source of SOURCE_CATALOG) {
    const compName = source.companyName.toLowerCase();
    const compRegex = new RegExp(`\\b${compName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (compRegex.test(workingQuery)) {
      companies.push(source.companyName);
      recognizedTokens.push(compName);
      workingQuery = workingQuery.replace(compRegex, ' ');
    }
  }

  // 6. Extract Skills & Canonical Synonyms (scan full normalized query)
  for (const [skillKey, canonicalSkill] of Object.entries(SKILL_SYNONYMS)) {
    if (skillKey === 'go') {
      if (/\b(golang|go\s+developer|go\s+engineer|go\s+backend)\b/i.test(normalized)) {
        if (!skills.includes('Go')) skills.push('Go');
        recognizedTokens.push(skillKey);
      }
      continue;
    }

    const skillRegex = new RegExp(`\\b${skillKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (skillRegex.test(normalized)) {
      if (!skills.includes(canonicalSkill)) {
        skills.push(canonicalSkill);
      }
      recognizedTokens.push(skillKey);
    }
  }

  // 7. Cleanup remaining keywords (remove noise words like "jobs", "in", "for", "at", "with", "openings")
  const noiseWords = new Set(['jobs', 'job', 'in', 'for', 'at', 'with', 'openings', 'opening', 'positions', 'position', 'role', 'roles', 'opportunities', 'opportunity', 'careers', 'career', 'near', 'and', 'or', 'the', 'a', 'an']);

  const rawRemaining = workingQuery
    .split(/\s+/)
    .map((w) => w.trim().replace(/^[^\w]+|[^\w]+$/g, ''))
    .filter((w) => w.length > 0 && !noiseWords.has(w));

  const remainingKeywords = Array.from(new Set(rawRemaining));

  // Determine if natural language was used
  const isNaturalLanguage = recognizedTokens.length > 0 && (
    experienceLevel !== null ||
    workplaceTypes.length > 0 ||
    locations.length > 0 ||
    country !== null ||
    skills.length > 0 ||
    roles.length > 0
  );

  return {
    originalQuery,
    normalizedQuery: normalized,
    experienceLevel,
    roles,
    occupationalCategory,
    skills,
    locations,
    country,
    workplaceTypes,
    companies,
    recognizedTokens,
    remainingKeywords,
    isNaturalLanguage,
  };
}
