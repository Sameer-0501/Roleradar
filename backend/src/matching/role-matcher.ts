/**
 * Deterministic Role Matcher.
 *
 * Evaluates whether a verified job title matches any of the user's selected roles.
 *
 * Matching Hierarchy:
 * 1. Exact canonical role match (case-insensitive)
 * 2. Approved synonym match
 * 3. Approved specialization match
 * 4. Otherwise NO MATCH / UNKNOWN
 *
 * Strict Isolation: Unrelated engineering or non-tech disciplines (e.g. Mechanical,
 * Civil, Electrical, Sales) will NEVER match unrelated software or data roles.
 */

import type { RoleMatchResult } from './matching-types.js';

interface RoleTaxonomyEntry {
  canonical: string;
  synonyms: string[];
  specializations: string[];
  disallowedTokens?: string[];
}

export const ROLE_TAXONOMY: RoleTaxonomyEntry[] = [
  {
    canonical: 'Software Engineer',
    synonyms: [
      'software development engineer',
      'software developer',
      'sde',
      'sde 1',
      'sde 2',
      'sde 3',
      'sde-i',
      'sde-ii',
      'sde-iii',
      'sde i',
      'sde ii',
      'sde iii',
      'member of technical staff',
      'mts',
      'mts 1',
      'mts i',
      'mts-1',
      'mts-i',
      'computer scientist',
      'computer scientist 1',
      'computer scientist i',
      'software eng',
      'applications developer',
      'application developer',
      'software programmer',
      'associate developer',
      'associate software developer',
      'associate engineer',
      'associate application developer',
      'graduate developer',
      'graduate software engineer',
      'junior developer',
      'junior software developer',
      'entry level developer',
      'entry level software developer',
      'software engineer 1',
      'software engineer i',
      'software engineer-1',
      'software engineer-i',
    ],
    specializations: [
      'backend software engineer',
      'frontend software engineer',
      'full stack software engineer',
      'systems software engineer',
      'infrastructure software engineer',
      'senior software engineer',
      'staff software engineer',
      'principal software engineer',
      'lead software engineer',
      'junior software engineer',
      'graduate software engineer',
      'associate software engineer',
      'entry level software engineer',
      'entry-level software engineer',
      'software engineer 1',
      'software engineer i',
      'software engineer 2',
      'software engineer ii',
      'member of technical staff 1',
      'computer scientist 1 (c++)',
      'graduate engineer trainee software',
      'graduate engineer trainee - software',
      'get software',
      'get - software',
      'graduate engineer trainee software engineer',
    ],
    disallowedTokens: ['mechanical', 'civil', 'chemical', 'structural', 'electrical engineer'],
  },
  {
    canonical: 'Frontend Developer',
    synonyms: [
      'frontend engineer',
      'front end developer',
      'front end engineer',
      'front-end developer',
      'front-end engineer',
      'ui engineer',
      'ui developer',
      'client engineer',
      'web developer',
      'react developer',
      'angular developer',
      'vue developer',
    ],
    specializations: [
      'senior frontend developer',
      'senior frontend engineer',
      'lead frontend engineer',
      'junior frontend developer',
    ],
    disallowedTokens: ['mechanical', 'civil', 'hardware'],
  },
  {
    canonical: 'Backend Developer',
    synonyms: [
      'backend engineer',
      'back end developer',
      'back end engineer',
      'back-end developer',
      'back-end engineer',
      'server engineer',
      'server developer',
      'api developer',
      'node js developer',
      'nodejs developer',
      'node.js developer',
      'node developer',
      'java backend developer',
      'python backend developer',
      'go backend developer',
    ],
    specializations: [
      'senior backend developer',
      'senior backend engineer',
      'lead backend engineer',
      'staff backend engineer',
      'junior backend developer',
    ],
    disallowedTokens: ['mechanical', 'civil', 'hardware'],
  },
  {
    canonical: 'Full Stack Developer',
    synonyms: [
      'fullstack developer',
      'full stack engineer',
      'fullstack engineer',
      'full-stack developer',
      'full-stack engineer',
      'full stack software engineer',
    ],
    specializations: [
      'senior full stack developer',
      'senior full stack engineer',
      'lead full stack engineer',
      'junior full stack developer',
    ],
  },
  {
    canonical: 'Java Developer',
    synonyms: [
      'java engineer',
      'core java developer',
      'java/j2ee developer',
      'java software engineer',
      'spring boot developer',
      'java backend engineer',
    ],
    specializations: [
      'senior java developer',
      'senior java engineer',
      'lead java developer',
    ],
  },
  {
    canonical: 'Python Developer',
    synonyms: [
      'python engineer',
      'python software engineer',
      'django developer',
      'flask developer',
      'python backend developer',
    ],
    specializations: [
      'senior python developer',
      'senior python engineer',
      'lead python developer',
    ],
  },
  {
    canonical: 'DevOps Engineer',
    synonyms: [
      'site reliability engineer',
      'sre',
      'devops developer',
      'platform engineer',
      'infrastructure engineer',
      'build and release engineer',
      'cloudops engineer',
      'release engineer',
      // Phase 6: canonical taxonomy display name alias (DevOps & SRE → DevOps Engineer)
      'devops & sre',
    ],
    specializations: [
      'senior devops engineer',
      'lead devops engineer',
      'principal devops engineer',
      'senior sre',
    ],
  },
  {
    canonical: 'Cloud Engineer',
    synonyms: [
      'cloud architect',
      'cloud systems engineer',
      'aws engineer',
      'azure engineer',
      'gcp engineer',
      'cloud infrastructure engineer',
    ],
    specializations: [
      'senior cloud engineer',
      'lead cloud engineer',
      'principal cloud architect',
    ],
  },
  {
    canonical: 'Data Engineer',
    synonyms: [
      'big data engineer',
      'etl developer',
      'data pipeline engineer',
      'data warehouse engineer',
      'data platform engineer',
      'analytics engineer',
    ],
    specializations: [
      'senior data engineer',
      'lead data engineer',
      'principal data engineer',
      'staff data engineer',
      'junior data engineer',
    ],
    disallowedTokens: ['mechanical', 'civil', 'chemical', 'structural'],
  },
  {
    canonical: 'Data Analyst',
    synonyms: [
      'business intelligence analyst',
      'bi analyst',
      'product analyst',
      'analytics specialist',
      'statistical analyst',
      'reporting analyst',
      // NOTE: 'financial analyst' intentionally removed — it is a separate canonical role
      // in the HR/Legal/Finance domain (ROLE_FINANCIAL_ANALYST). Keeping it here caused
      // a lookup collision that prevented Financial Analyst from matching its own entry.
      // Phase 6: canonical taxonomy display name alias (Data Analyst / BI → Data Analyst)
      'data analyst / bi',
    ],
    specializations: [
      'senior data analyst',
      'lead data analyst',
      'junior data analyst',
      'associate data analyst',
    ],
    disallowedTokens: ['mechanical', 'civil', 'chemical', 'structural'],
  },
  {
    canonical: 'Data Scientist',
    synonyms: [
      'applied scientist',
      'data science engineer',
      'research scientist',
      'quantitative analyst',
      'data science specialist',
    ],
    specializations: [
      'senior data scientist',
      'lead data scientist',
      'principal data scientist',
    ],
  },
  {
    canonical: 'Machine Learning Engineer',
    synonyms: [
      'ml engineer',
      'ai engineer',
      'machine learning developer',
      'deep learning engineer',
      'computer vision engineer',
      'nlp engineer',
      'artificial intelligence engineer',
    ],
    specializations: [
      'senior ml engineer',
      'lead machine learning engineer',
      'staff ai engineer',
    ],
  },
  {
    canonical: 'QA Engineer',
    synonyms: [
      'quality assurance engineer',
      'software development engineer in test',
      'sdet',
      'automation test engineer',
      'qa automation engineer',
      'test engineer',
      'quality engineer',
      'software test engineer',
    ],
    specializations: [
      'senior qa engineer',
      'senior sdet',
      'lead qa engineer',
    ],
  },
  {
    canonical: 'Business Analyst',
    synonyms: [
      'business systems analyst',
      'functional analyst',
      'it business analyst',
      'technical business analyst',
    ],
    specializations: [
      'senior business analyst',
      'lead business analyst',
    ],
  },
  {
    canonical: 'Security Engineer',
    synonyms: [
      'information security engineer',
      'cybersecurity engineer',
      'secops engineer',
      'application security engineer',
      'appsec engineer',
      'security specialist',
      'security and automation engineer',
      'infosec grc associate',
      'infosec associate',
      'associate security engineer',
      'cyber security associate',
      'infosec grc associate ii',
    ],
    specializations: [
      'senior security engineer',
      'lead security engineer',
      'associate security engineer',
    ],
  },
  {
    canonical: 'Technical Support Engineer',
    synonyms: [
      'technical support specialist',
      'customer support engineer',
      'customer experience engineer',
      'cx engineer',
      'support engineer',
      'technical support engineer 1',
      'technical support engineer i',
      'tech support engineer',
      'application support engineer',
      'cloud support engineer',
    ],
    specializations: [
      'senior technical support engineer',
      'lead technical support engineer',
      'associate technical support engineer',
      'customer experience engineer, l1',
      'customer experience engineer l1',
      'l1 support engineer',
      'l2 support engineer',
    ],
  },
  {
    canonical: 'IT Support Engineer',
    synonyms: [
      'it support specialist',
      'desktop support engineer',
      'helpdesk engineer',
      'it operations engineer',
      'it specialist',
    ],
    specializations: [
      'senior it support engineer',
      'lead it support engineer',
    ],
  },
  {
    canonical: 'Graduate Engineer Trainee',
    synonyms: [
      'get',
      'graduate trainee',
      'engineering trainee',
      'tech trainee',
      'trainee engineer',
    ],
    specializations: [],
  },
  {
    canonical: 'Product Designer',
    synonyms: [
      'ux designer',
      'ui designer',
      'ux/ui designer',
      'ui/ux designer',
      'ux design',
      'product design',
      'visual designer',
      'user experience designer',
      'interaction designer',
      'ux researcher',
      'design intern',
      'ux design - intern',
    ],
    specializations: [
      'senior product designer',
      'lead product designer',
      'staff designer',
      'principal designer',
      'associate product designer',
    ],
  },
  {
    canonical: 'Financial Analyst',
    synonyms: [
      'finance analyst',
      'finance associate',
      'financial associate',
      'accountant',
      'audit associate',
      'auditor',
      'fp&a analyst',
      'tax analyst',
      'finance intern',
    ],
    specializations: [
      'senior financial analyst',
      'lead financial analyst',
      'finance manager',
    ],
    // NOTE: 'financial analyst' (this entry's canonical) was previously also listed as a synonym
    // of 'Data Analyst'. That caused a lookup collision (Data Analyst entry found first). Fixed in Phase 7.
  },
  {
    canonical: 'Recruiter',
    synonyms: [
      'talent acquisition',
      'talent acquisition specialist',
      'talent partner',
      'technical recruiter',
      'hr recruiter',
      'recruiting coordinator',
      'talent scout',
      'talent acquisition intern',
      'intern-talent acquisition',
    ],
    specializations: [
      'senior recruiter',
      'lead recruiter',
      'principal recruiter',
    ],
  },
  {
    canonical: 'Human Resources',
    synonyms: [
      'hr',
      'hr associate',
      'hr intern',
      'hr payroll-intern',
      'hr payroll intern',
      'people partner',
      'hrbp',
      'people operations',
      'hr generalist',
      'people specialist',
      'admin & operations - internship',
      // Phase 7: canonical taxonomy display name aliases (HR Partner / Generalist → Human Resources)
      'hr partner / generalist',
      'hr partner',
    ],
    specializations: [
      'senior hr generalist',
      'lead hr partner',
      'head of people',
    ],
  },
  {
    canonical: 'Customer Success Manager',
    synonyms: [
      'customer success',
      'customer success associate',
      'client success manager',
      'customer experience associate',
      'client partner',
      'customer support associate',
      'customer support',
      'tele caller associate',
    ],
    specializations: [
      'senior customer success manager',
      'lead customer success manager',
    ],
  },
  {
    canonical: 'Marketing Specialist',
    synonyms: [
      'marketing associate',
      'content marketer',
      'content writer',
      'copywriter',
      'brand associate',
      'growth marketer',
      'product marketing manager',
      'pmm',
      'associate - content',
      'marketing intern',
    ],
    specializations: [
      'senior marketing specialist',
      'lead marketing manager',
      'head of marketing',
    ],
  },
  {
    canonical: 'Operations Analyst',
    synonyms: [
      'operations associate',
      'business operations analyst',
      'bizops analyst',
      'program manager',
      'project manager',
      'operations coordinator',
      'admin & operations',
    ],
    specializations: [
      'senior operations analyst',
      'lead operations manager',
    ],
  },
  {
    canonical: 'Legal Counsel',
    synonyms: [
      'legal associate',
      'corporate counsel',
      'compliance specialist',
      'paralegal',
      'contracts specialist',
    ],
    specializations: [
      'senior legal counsel',
      'lead counsel',
      'general counsel',
    ],
  },
  {
    canonical: 'Intern',
    synonyms: [
      'internship',
      'software intern',
      'engineering intern',
      'tech intern',
      'ai engg intern',
    ],
    specializations: [],
  },
  {
    canonical: 'Associate',
    synonyms: [
      'associate engineer',
      'associate software engineer',
      'associate consultant',
      'associate analyst',
      'associate business development representative',
      'corporate risk and compliance - associate ii',
    ],
    specializations: [],
  },
  {
    canonical: 'Mechanical Engineer',
    synonyms: [
      'mechanical design engineer',
      'mechanical engineering',
      'mechanical designer',
    ],
    specializations: [
      'graduate engineer trainee mechanical',
      'graduate engineer trainee - mechanical',
      'get mechanical',
      'get - mechanical',
    ],
  },
  {
    canonical: 'Electrical Engineer',
    synonyms: [
      'electrical design engineer',
      'electrical engineering',
      'electrical maintenance engineer',
    ],
    specializations: [
      'graduate engineer trainee electrical',
      'graduate engineer trainee - electrical',
      'get electrical',
      'get - electrical',
    ],
  },
  {
    canonical: 'Hardware & Electronics Engineer',
    synonyms: [
      'hardware engineer',
      'hardware design engineer',
      'electronics engineer',
      'electronics design engineer',
      'vlsi engineer',
      'hardware architect',
      'hardware & electronics engineer',
      'hardware and electronics engineer',
    ],
    specializations: [
      'graduate engineer trainee hardware',
      'graduate engineer trainee - hardware',
      'get hardware',
      'get - hardware',
      'graduate engineer trainee electronics',
      'graduate engineer trainee - electronics',
      'get electronics',
      'get - electronics',
    ],
  },
  {
    canonical: 'Civil Engineer',
    synonyms: [
      'civil design engineer',
      'civil engineering',
    ],
    specializations: [
      'graduate engineer trainee civil',
      'graduate engineer trainee - civil',
      'get civil',
      'get - civil',
    ],
  },
  {
    canonical: 'Supply Chain & Logistics',
    synonyms: [
      'supply chain analyst',
      'supply chain engineer',
      'supply chain specialist',
      'supply chain',
      'logistics analyst',
      'logistics coordinator',
      'logistics specialist',
      'procurement analyst',
      'procurement specialist',
      'procurement',
    ],
    specializations: [],
  },
  {
    canonical: 'Management Consultant',
    synonyms: [
      'management consultant',
      'management consulting',
      'strategy consultant',
      'strategy analyst',
      'consulting analyst',
      'advisory associate',
    ],
    specializations: [],
  },
  {
    canonical: 'Risk & Compliance',
    synonyms: [
      'risk analyst',
      'compliance analyst',
      'compliance specialist',
      'aml analyst',
      'anti-money laundering analyst',
      'financial crime analyst',
      'operational risk analyst',
      'credit risk analyst',
      'risk & compliance',
    ],
    specializations: [],
  },
];

export const ROLE_FAMILIES: Record<string, string[]> = {
  'Software Engineer': [
    'Software Engineer',
    'Backend Developer',
    'Frontend Developer',
    'Full Stack Developer',
    'Mobile Developer',
    'iOS Developer',
    'Android Developer',
  ]
};

// Phase 7: ROLE_TAXONOMY entries for canonical roles whose display names were not
// previously represented. These additions ensure canonical display names resolve
// correctly through matchRole() when used as effective roles.
// Each entry is the minimum required to make self-match + common variants work.
const PHASE7_ENTRIES: RoleTaxonomyEntry[] = [
  {
    canonical: 'Mobile Developer',
    synonyms: [
      'ios developer', 'android developer', 'mobile engineer',
      'react native developer', 'flutter developer',
    ],
    specializations: [
      'senior mobile developer', 'lead mobile developer',
      'senior ios developer', 'senior android developer',
    ],
  },
  {
    canonical: 'Product Manager',
    synonyms: [
      'product owner', 'pm',
    ],
    specializations: [
      'senior product manager', 'lead product manager',
      'principal product manager', 'associate product manager',
    ],
    disallowedTokens: ['engineering', 'project', 'director', 'vp'],
  },
  {
    canonical: 'Partnerships & Alliances',
    synonyms: [
      'partnerships and alliances lead', 'partner manager', 'alliances manager',
      // Phase 7: canonical taxonomy display name alias
      'partnerships \u0026 alliances',
    ],
    specializations: [],
  },
  {
    canonical: 'Solutions Architect / Sales Engineer',
    synonyms: [
      'solutions architect', 'solution architect', 'sales engineer',
      'solutions engineer', 'pre-sales engineer',
      // Phase 7: compound name aliases
      'solutions architect / sales engineer',
    ],
    specializations: [],
    disallowedTokens: ['software', 'support'],
  },
  {
    canonical: 'Technical / Program Manager',
    synonyms: [
      'tpm', 'program manager', 'technical program manager',
      // Phase 7: compound name alias
      'technical / program manager',
    ],
    specializations: [],
  },
  {
    // Phase 7: ROLE_BDR_SDR displayName is 'Business Development Rep' — not previously in ROLE_TAXONOMY
    canonical: 'Business Development Rep',
    synonyms: [
      'bdr', 'sdr', 'business development representative', 'sales development representative',
      'business development rep',
    ],
    specializations: [],
  },
];
// Merge Phase 7 entries into ROLE_TAXONOMY at runtime (avoids modifying the frozen canonical array order)
ROLE_TAXONOMY.push(...PHASE7_ENTRIES);

function cleanTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s\-\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns a mathematically safe list of SQL ILIKE patterns to pre-filter job titles.
 * This guarantees no eligible jobs are excluded before in-memory matching.
 */
export function getSafeSqlRolePatterns(userRoles: string[]): string[] {
  if (!userRoles || userRoles.length === 0) return [];

  const expandedRoles = new Set<string>();
  for (const role of userRoles) {
    expandedRoles.add(role);
    const normalizedTarget = cleanTitle(role);
    const entry = ROLE_TAXONOMY.find(
      (e) =>
        e.canonical.toLowerCase() === normalizedTarget ||
        e.synonyms.some((s) => cleanTitle(s) === normalizedTarget)
    );
    const canonicalName = entry ? entry.canonical : role;
    if (ROLE_FAMILIES[canonicalName]) {
      for (const familyRole of ROLE_FAMILIES[canonicalName]) {
        expandedRoles.add(familyRole);
      }
    }
  }

  const patterns = new Set<string>();
  for (const userRole of Array.from(expandedRoles)) {
    const normalizedTarget = cleanTitle(userRole);
    patterns.add(`%${normalizedTarget}%`);
    const entry = ROLE_TAXONOMY.find(
      (e) =>
        e.canonical.toLowerCase() === normalizedTarget ||
        e.synonyms.some((s) => cleanTitle(s) === normalizedTarget)
    );
    if (entry) {
      patterns.add(`%${cleanTitle(entry.canonical)}%`);
      for (const syn of entry.synonyms) {
        patterns.add(`%${cleanTitle(syn)}%`);
      }
      for (const spec of entry.specializations) {
        patterns.add(`%${cleanTitle(spec)}%`);
      }
    }
  }
  return Array.from(patterns);
}

/**
 * Match a job title against a set of preferred user roles.
 */
export function matchRole(jobTitle: string, userRoles: string[]): RoleMatchResult {
  if (!jobTitle || !userRoles || userRoles.length === 0) {
    return { matched: false, reason: 'Missing job title or user roles' };
  }

  if (userRoles.includes('ALL')) {
    return {
      matched: true,
      matchedRole: 'ALL ROLES',
      matchType: 'EXACT',
      reason: 'User selected All Roles filter; skipping role restriction.',
    };
  }

  // Expand roles using ROLE_FAMILIES
  const expandedRoles = new Set<string>();
  for (const role of userRoles) {
    expandedRoles.add(role);
    const normalizedTarget = cleanTitle(role);
    const entry = ROLE_TAXONOMY.find(
      (e) =>
        e.canonical.toLowerCase() === normalizedTarget ||
        e.synonyms.some((s) => cleanTitle(s) === normalizedTarget)
    );
    const canonicalName = entry ? entry.canonical : role;
    
    if (ROLE_FAMILIES[canonicalName]) {
      for (const familyRole of ROLE_FAMILIES[canonicalName]) {
        expandedRoles.add(familyRole);
      }
    }
  }

  const effectiveRoles = Array.from(expandedRoles);

  const normalizedJobTitle = cleanTitle(jobTitle);

  for (const userRole of effectiveRoles) {
    const normalizedUserRole = cleanTitle(userRole);

    // 1. Exact Match
    if (normalizedJobTitle === normalizedUserRole) {
      return {
        matched: true,
        matchedRole: userRole,
        matchType: 'EXACT',
        reason: `Exact match for role "${userRole}"`,
      };
    }

    // Find matching taxonomy entry
    const entry = ROLE_TAXONOMY.find(
      (e) =>
        e.canonical.toLowerCase() === normalizedUserRole ||
        e.synonyms.some((s) => cleanTitle(s) === normalizedUserRole)
    );

    if (entry) {
      // Check disallowed tokens
      if (entry.disallowedTokens && entry.disallowedTokens.some((t) => normalizedJobTitle.includes(t))) {
        continue;
      }

      // 2. Exact match on canonical
      if (cleanTitle(entry.canonical) === normalizedJobTitle) {
        return {
          matched: true,
          matchedRole: userRole,
          matchType: 'SYNONYM',
          reason: `Job title matches canonical role "${entry.canonical}"`,
        };
      }

      // 3. Exact match on synonyms
      const matchedSyn = entry.synonyms.find((s) => cleanTitle(s) === normalizedJobTitle);
      if (matchedSyn) {
        return {
          matched: true,
          matchedRole: userRole,
          matchType: 'SYNONYM',
          reason: `Job title matches approved synonym "${matchedSyn}" for role "${entry.canonical}"`,
        };
      }

      // 4. Specialization exact match
      const matchedSpec = entry.specializations.find((s) => cleanTitle(s) === normalizedJobTitle);
      if (matchedSpec) {
        return {
          matched: true,
          matchedRole: userRole,
          matchType: 'SPECIALIZATION',
          reason: `Job title matches approved specialization "${matchedSpec}" for role "${entry.canonical}"`,
        };
      }

      // 5. Check if normalized title contains canonical role as phrase (e.g. "Senior / Staff Software Engineer")
      const canonicalPhrase = cleanTitle(entry.canonical);
      if (normalizedJobTitle.includes(canonicalPhrase)) {
        return {
          matched: true,
          matchedRole: userRole,
          matchType: 'SPECIALIZATION',
          reason: `Job title "${jobTitle}" contains canonical role "${entry.canonical}"`,
        };
      }

      // 6. Check if normalized title contains approved synonym
      for (const syn of entry.synonyms) {
        const cSyn = cleanTitle(syn);
        const wordRegex = new RegExp(`\\b${cSyn.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        if (wordRegex.test(normalizedJobTitle)) {
          return {
            matched: true,
            matchedRole: userRole,
            matchType: 'SYNONYM',
            reason: `Job title "${jobTitle}" contains approved synonym "${syn}"`,
          };
        }
      }
    } else {
      // Custom user role: fallback to exact or clean phrase match
      if (normalizedJobTitle.includes(normalizedUserRole)) {
        return {
          matched: true,
          matchedRole: userRole,
          matchType: 'EXACT',
          reason: `Job title "${jobTitle}" contains custom role "${userRole}"`,
        };
      }
    }
  }

  return {
    matched: false,
    reason: `Job title "${jobTitle}" does not match any of your preferred roles: ${effectiveRoles.join(', ')}`,
  };
}
