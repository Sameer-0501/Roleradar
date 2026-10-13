export interface CanonicalDomain {
  id: string;
  displayName: string;
}

export interface CanonicalRoleDef {
  id: string;
  domainId: string;
  displayName: string;
  isSelectable: boolean;
  synonyms: string[];
  specializations: string[];
  disallowedTokens: string[];
}

export const CANONICAL_DOMAINS: CanonicalDomain[] = [
  { id: 'DOMAIN_ENGINEERING', displayName: 'Engineering & Infrastructure' },
  { id: 'DOMAIN_DATA_AI', displayName: 'Data & AI' },
  { id: 'DOMAIN_PRODUCT_DESIGN', displayName: 'Product & Design' },
  { id: 'DOMAIN_SALES_GTM', displayName: 'Sales & Go-to-Market' },
  { id: 'DOMAIN_CUSTOMER_SUCCESS', displayName: 'Customer Success & Support' },
  { id: 'DOMAIN_IT_SUPPORT', displayName: 'IT & Corporate Systems' },
  { id: 'DOMAIN_BUSINESS_OPS', displayName: 'Business, Operations & Marketing' },
  { id: 'DOMAIN_HR_LEGAL_FINANCE', displayName: 'HR, Legal & Finance' },
];

export const CANONICAL_TAXONOMY: CanonicalRoleDef[] = [
  // ─── 1. ENGINEERING & INFRASTRUCTURE ───────────────────────────────────────
  {
    id: 'ROLE_SOFTWARE_ENGINEER',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Software Engineer',
    isSelectable: true,
    synonyms: [
      'software development engineer', 'software developer', 'sde', 'mts', 
      'member of technical staff', 'computer scientist', 'software eng', 
      'applications developer', 'application developer', 'software programmer',
      'associate developer', 'associate software developer', 'associate engineer',
      'graduate developer', 'graduate software engineer', 'junior developer',
      'junior software developer', 'entry level developer'
    ],
    specializations: ['integrations engineer', 'graduate engineer trainee software', 'get software', 'graduate engineer trainee software engineer'],
    disallowedTokens: ['sales', 'solutions', 'support', 'mechanical', 'civil', 'chemical', 'structural', 'electrical engineer'],
  },
  {
    id: 'ROLE_BACKEND_DEV',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Backend Developer',
    isSelectable: true,
    synonyms: [
      'backend engineer', 'back end developer', 'back end engineer',
      'back-end developer', 'back-end engineer', 'server engineer',
      'server developer', 'api developer', 'node js developer', 'nodejs developer'
    ],
    specializations: [],
    disallowedTokens: ['mechanical', 'civil', 'hardware'],
  },
  {
    id: 'ROLE_FRONTEND_DEV',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Frontend Developer',
    isSelectable: true,
    synonyms: [
      'frontend engineer', 'front end developer', 'front end engineer',
      'front-end developer', 'front-end engineer', 'ui engineer', 'ui developer',
      'client engineer', 'web developer', 'react developer', 'angular developer', 'vue developer'
    ],
    specializations: [],
    disallowedTokens: ['mechanical', 'civil', 'hardware'],
  },
  {
    id: 'ROLE_FULLSTACK_DEV',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Full Stack Developer',
    isSelectable: true,
    synonyms: [
      'fullstack developer', 'full stack engineer', 'fullstack engineer',
      'full-stack developer', 'full-stack engineer'
    ],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_MOBILE_DEV',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Mobile Developer',
    isSelectable: true,
    synonyms: ['ios developer', 'android developer', 'mobile engineer', 'react native developer', 'flutter developer'],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_JAVA_DEV',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Java Developer',
    isSelectable: true,
    synonyms: ['java engineer', 'core java developer', 'java/j2ee developer', 'java software engineer', 'spring boot developer', 'java backend engineer'],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_PYTHON_DEV',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Python Developer',
    isSelectable: true,
    synonyms: ['python engineer', 'python software engineer', 'django developer', 'flask developer', 'python backend developer'],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_DEVOPS_SRE',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'DevOps & SRE',
    isSelectable: true,
    synonyms: [
      'site reliability engineer', 'sre', 'devops developer', 'devops engineer',
      'platform engineer', 'infrastructure engineer', 'build and release engineer',
      'cloudops engineer', 'release engineer'
    ],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_CLOUD_ENG',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Cloud Engineer',
    isSelectable: true,
    synonyms: ['cloud architect', 'cloud systems engineer', 'aws engineer', 'azure engineer', 'gcp engineer', 'cloud infrastructure engineer'],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_SECURITY_ENG',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Security Engineer',
    isSelectable: true,
    synonyms: [
      'information security engineer', 'cybersecurity engineer', 'secops engineer',
      'application security engineer', 'appsec engineer', 'security specialist',
      'security and automation engineer', 'infosec associate'
    ],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_QA_ENG',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'QA & Automation Engineer',
    isSelectable: true,
    synonyms: [
      'qa engineer', 'quality assurance engineer', 'software development engineer in test', 'sdet',
      'automation test engineer', 'qa automation engineer', 'test engineer',
      'quality engineer', 'software test engineer'
    ],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_SYSTEMS_ENG',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Systems Engineer',
    isSelectable: true,
    synonyms: ['system engineer', 'systems software engineer'],
    specializations: [],
    disallowedTokens: ['software', 'sales'],
  },
  {
    id: 'ROLE_ENG_MANAGER',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Engineering Manager',
    isSelectable: true,
    synonyms: ['software engineering manager', 'engineering manager'],
    specializations: [],
    disallowedTokens: ['product', 'project', 'program', 'director', 'vp', 'head', 'marketing'],
  },

  // ─── 2. DATA & AI ──────────────────────────────────────────────────────────
  {
    id: 'ROLE_DATA_SCIENTIST',
    domainId: 'DOMAIN_DATA_AI',
    displayName: 'Data Scientist',
    isSelectable: true,
    synonyms: [
      'applied scientist', 'data science engineer', 'research scientist',
      'quantitative analyst', 'data science specialist'
    ],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_DATA_ENGINEER',
    domainId: 'DOMAIN_DATA_AI',
    displayName: 'Data Engineer',
    isSelectable: true,
    synonyms: [
      'big data engineer', 'etl developer', 'data pipeline engineer',
      'data warehouse engineer', 'data platform engineer', 'analytics engineer'
    ],
    specializations: [],
    disallowedTokens: ['mechanical', 'civil', 'chemical', 'structural'],
  },
  {
    id: 'ROLE_ML_ENG',
    domainId: 'DOMAIN_DATA_AI',
    displayName: 'Machine Learning Engineer',
    isSelectable: true,
    synonyms: [
      'ml engineer', 'ai engineer', 'machine learning developer',
      'deep learning engineer', 'computer vision engineer', 'nlp engineer',
      'artificial intelligence engineer'
    ],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_DATA_ANALYST',
    domainId: 'DOMAIN_DATA_AI',
    displayName: 'Data Analyst / BI',
    isSelectable: true,
    synonyms: [
      'data analyst', 'business intelligence analyst', 'bi analyst',
      'analytics specialist', 'statistical analyst', 'reporting analyst'
    ],
    specializations: ['qlikview developer', 'qlik sense developer'],
    disallowedTokens: ['business', 'systems', 'mechanical', 'civil', 'chemical', 'structural'],
  },

  // ─── 3. PRODUCT & DESIGN ───────────────────────────────────────────────────
  {
    id: 'ROLE_PRODUCT_MANAGER',
    domainId: 'DOMAIN_PRODUCT_DESIGN',
    displayName: 'Product Manager',
    isSelectable: true,
    synonyms: ['product owner', 'pm'],
    specializations: [],
    disallowedTokens: ['engineering', 'project', 'director', 'vp'],
  },
  {
    id: 'ROLE_PRODUCT_DESIGNER',
    domainId: 'DOMAIN_PRODUCT_DESIGN',
    displayName: 'Product Designer',
    isSelectable: true,
    synonyms: [
      'ux designer', 'ui designer', 'ux/ui designer', 'ui/ux designer',
      'ux design', 'visual designer', 'user experience designer',
      'interaction designer', 'ux researcher'
    ],
    specializations: [],
    disallowedTokens: [],
  },

  // ─── 4. SALES & GO-TO-MARKET ───────────────────────────────────────────────
  {
    id: 'ROLE_ACCOUNT_EXECUTIVE',
    domainId: 'DOMAIN_SALES_GTM',
    displayName: 'Account Executive',
    isSelectable: true,
    synonyms: ['account executive', 'enterprise account executive', 'strategic account executive', 'sales executive'],
    specializations: [],
    disallowedTokens: ['vp', 'director', 'head'],
  },
  {
    id: 'ROLE_ACCOUNT_MANAGER',
    domainId: 'DOMAIN_SALES_GTM',
    displayName: 'Account Manager',
    isSelectable: true,
    synonyms: ['account manager', 'enterprise account manager'],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_BDR_SDR',
    domainId: 'DOMAIN_SALES_GTM',
    displayName: 'Business Development Rep',
    isSelectable: true,
    synonyms: ['bdr', 'sdr', 'business development representative', 'sales development representative'],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_PARTNERSHIPS',
    domainId: 'DOMAIN_SALES_GTM',
    displayName: 'Partnerships & Alliances',
    isSelectable: true,
    synonyms: ['partnerships and alliances lead', 'partner manager', 'alliances manager'],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_SOLUTIONS_ARCHITECT',
    domainId: 'DOMAIN_SALES_GTM',
    displayName: 'Solutions Architect / Sales Engineer',
    isSelectable: true,
    synonyms: ['solutions architect', 'solution architect', 'sales engineer', 'solutions engineer', 'pre-sales engineer'],
    specializations: [],
    disallowedTokens: ['software', 'support'],
  },

  // ─── 5. CUSTOMER SUCCESS & SUPPORT ─────────────────────────────────────────
  {
    id: 'ROLE_CUSTOMER_SUCCESS',
    domainId: 'DOMAIN_CUSTOMER_SUCCESS',
    displayName: 'Customer Success Manager',
    isSelectable: true,
    synonyms: [
      'customer success', 'client success manager', 'client partner', 'customer success associate'
    ],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_TECH_SUPPORT',
    domainId: 'DOMAIN_CUSTOMER_SUCCESS',
    displayName: 'Technical Support Engineer',
    isSelectable: true,
    synonyms: [
      'technical support specialist', 'customer support engineer', 'support engineer',
      'cx engineer', 'customer experience engineer', 'application support engineer',
      'cloud support engineer'
    ],
    specializations: [],
    disallowedTokens: ['software', 'sales'],
  },

  // ─── 6. IT & CORPORATE SYSTEMS ─────────────────────────────────────────────
  {
    id: 'ROLE_IT_SUPPORT',
    domainId: 'DOMAIN_IT_SUPPORT',
    displayName: 'IT Support Specialist',
    isSelectable: true,
    synonyms: [
      'it support engineer', 'it support specialist', 'desktop support engineer',
      'helpdesk engineer', 'it operations engineer', 'it specialist', 'it service engineer'
    ],
    specializations: [],
    disallowedTokens: [],
  },

  // ─── 7. BUSINESS, OPERATIONS & MARKETING ───────────────────────────────────
  {
    id: 'ROLE_BUSINESS_ANALYST',
    domainId: 'DOMAIN_BUSINESS_OPS',
    displayName: 'Business Analyst',
    isSelectable: true,
    synonyms: ['business systems analyst', 'functional analyst', 'it business analyst', 'technical business analyst'],
    specializations: [],
    disallowedTokens: ['data', 'product'],
  },
  {
    id: 'ROLE_TPM',
    domainId: 'DOMAIN_BUSINESS_OPS',
    displayName: 'Technical / Program Manager',
    isSelectable: true,
    synonyms: ['tpm', 'program manager', 'technical program manager'],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_OPERATIONS_ANALYST',
    domainId: 'DOMAIN_BUSINESS_OPS',
    displayName: 'Operations Analyst',
    isSelectable: true,
    synonyms: [
      'operations associate', 'business operations analyst', 'bizops analyst',
      'operations coordinator', 'admin & operations'
    ],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_MARKETING',
    domainId: 'DOMAIN_BUSINESS_OPS',
    displayName: 'Marketing Specialist',
    isSelectable: true,
    synonyms: [
      'marketing associate', 'content marketer', 'content writer', 'copywriter',
      'brand associate', 'growth marketer', 'product marketing manager', 'pmm'
    ],
    specializations: [],
    disallowedTokens: ['vp', 'director', 'head'],
  },

  // ─── 8. HR, LEGAL & FINANCE ────────────────────────────────────────────────
  {
    id: 'ROLE_RECRUITER',
    domainId: 'DOMAIN_HR_LEGAL_FINANCE',
    displayName: 'Recruiter',
    isSelectable: true,
    synonyms: [
      'talent acquisition', 'talent acquisition specialist', 'talent partner',
      'technical recruiter', 'hr recruiter', 'recruiting coordinator', 'talent scout'
    ],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_HR_PARTNER',
    domainId: 'DOMAIN_HR_LEGAL_FINANCE',
    displayName: 'HR Partner / Generalist',
    isSelectable: true,
    synonyms: [
      'hr', 'human resources', 'hr associate', 'people partner', 'hrbp',
      'people operations', 'hr generalist', 'people specialist'
    ],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_LEGAL_COUNSEL',
    domainId: 'DOMAIN_HR_LEGAL_FINANCE',
    displayName: 'Legal Counsel',
    isSelectable: true,
    synonyms: [
      'legal associate', 'corporate counsel', 'compliance specialist',
      'paralegal', 'contracts specialist'
    ],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_FINANCIAL_ANALYST',
    domainId: 'DOMAIN_HR_LEGAL_FINANCE',
    displayName: 'Financial Analyst',
    isSelectable: true,
    synonyms: [
      'finance analyst', 'finance associate', 'financial associate',
      'accountant', 'audit associate', 'auditor', 'fp&a analyst', 'tax analyst'
    ],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_MECH_ENG',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Mechanical Engineer',
    isSelectable: true,
    synonyms: [],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_ELEC_ENG',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Electrical Engineer',
    isSelectable: true,
    synonyms: [],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_HARDWARE_ENG',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Hardware & Electronics Engineer',
    isSelectable: true,
    synonyms: [],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_CIVIL_ENG',
    domainId: 'DOMAIN_ENGINEERING',
    displayName: 'Civil Engineer',
    isSelectable: true,
    synonyms: [],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_SUPPLY_CHAIN',
    domainId: 'DOMAIN_BUSINESS_OPS',
    displayName: 'Supply Chain & Logistics',
    isSelectable: true,
    synonyms: [],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_CONSULTANT',
    domainId: 'DOMAIN_BUSINESS_OPS',
    displayName: 'Management Consultant',
    isSelectable: true,
    synonyms: [],
    specializations: [],
    disallowedTokens: [],
  },
  {
    id: 'ROLE_RISK_COMPLIANCE',
    domainId: 'DOMAIN_HR_LEGAL_FINANCE',
    displayName: 'Risk & Compliance',
    isSelectable: true,
    synonyms: [],
    specializations: [],
    disallowedTokens: [],
  }
];
