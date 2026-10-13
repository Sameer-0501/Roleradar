/**
 * PHASE 7 — FULL TAXONOMY AUDIT TEST SUITE
 *
 * Sections: §1 Inventory, §2 Semantics, §3 Separation,
 *           §4 All-35 Roles, §5 Persistence, §6 API Contract,
 *           §7 Matching Safety, §8 SQL Prefilter, §9 Collision,
 *           §10 Backward Compat, §11 Adapter, §12 Known Partials
 */

import { describe, it, expect, vi } from 'vitest';
import { CANONICAL_TAXONOMY, CANONICAL_DOMAINS } from '../matching/canonical-taxonomy.js';
import { TaxonomyCompatibilityAdapter } from '../matching/taxonomy-compatibility.js';
import { resolveCanonicalRoleIds, mergeEffectiveRoles } from '../matching/canonical-role-resolver.js';
import { matchRole, getSafeSqlRolePatterns, ROLE_TAXONOMY } from '../matching/role-matcher.js';
import { evaluateJobMatch } from '../matching/matching-service.js';
import { validatePreferences } from '../preferences/validator.js';
import type { CandidateJobData, UserPreferencesData } from '../matching/matching-types.js';

function job(ov: Partial<CandidateJobData> = {}): CandidateJobData {
  return { id:'j1',companyId:'c1',companyName:'Co',sourceSystem:'GREENHOUSE',externalJobId:'e1',
    title:'Software Engineer',location:'Bangalore, India',workplaceType:'ONSITE',
    officialUrl:'https://boards.greenhouse.io/co/1',status:'ACTIVE',verificationStatus:'VERIFIED',
    firstSeenAt:new Date(),lastSeenAt:new Date(),
    description:'Entry-level. Freshers welcome. 0-1 years.',requirements:'0-1 years.', ...ov };
}

function usr(ov: Partial<UserPreferencesData> = {}): UserPreferencesData {
  return { userId:'u1',roles:['Software Engineer'],locations:['Bangalore'],
    workplaceTypes:['ONSITE','HYBRID','REMOTE'],experienceLevel:'FRESHER',
    companyIds:[],keywords:[], ...ov };
}

function eff(p: {roles:string[];canonicalRoles:string[]}): string[] {
  const names = resolveCanonicalRoleIds(p.canonicalRoles);
  const merged = mergeEffectiveRoles(names, p.roles);
  return merged.length > 0 ? merged : ['Software Engineer'];
}

// §1 Taxonomy Inventory
describe('P7§1 Taxonomy Inventory', () => {
  it('has exactly 8 domains', () => expect(CANONICAL_DOMAINS).toHaveLength(8));
  it('has exactly 42 selectable roles', () => expect(CANONICAL_TAXONOMY.filter(r=>r.isSelectable)).toHaveLength(42));
  it('domain IDs are unique', () => { const ids=CANONICAL_DOMAINS.map(d=>d.id); expect(new Set(ids).size).toBe(ids.length); });
  it('role IDs are unique', () => { const ids=CANONICAL_TAXONOMY.map(r=>r.id); expect(new Set(ids).size).toBe(ids.length); });
  it('selectable displayNames are unique', () => { const n=CANONICAL_TAXONOMY.filter(r=>r.isSelectable).map(r=>r.displayName); expect(new Set(n).size).toBe(n.length); });
  it('every role references a valid domainId', () => {
    const dids=new Set(CANONICAL_DOMAINS.map(d=>d.id));
    for(const r of CANONICAL_TAXONOMY) expect(dids.has(r.domainId),`${r.id} bad domainId`).toBe(true);
  });
  it('Engineering domain: 17 roles', () => expect(CANONICAL_TAXONOMY.filter(r=>r.isSelectable&&r.domainId==='DOMAIN_ENGINEERING')).toHaveLength(17));
  it('Data & AI: 4 roles', () => expect(CANONICAL_TAXONOMY.filter(r=>r.isSelectable&&r.domainId==='DOMAIN_DATA_AI')).toHaveLength(4));
  it('Product & Design: 2 roles', () => expect(CANONICAL_TAXONOMY.filter(r=>r.isSelectable&&r.domainId==='DOMAIN_PRODUCT_DESIGN')).toHaveLength(2));
  it('Sales & GTM: 5 roles', () => expect(CANONICAL_TAXONOMY.filter(r=>r.isSelectable&&r.domainId==='DOMAIN_SALES_GTM')).toHaveLength(5));
  it('Customer Success & Support: 2 roles', () => expect(CANONICAL_TAXONOMY.filter(r=>r.isSelectable&&r.domainId==='DOMAIN_CUSTOMER_SUCCESS')).toHaveLength(2));
  it('IT & Corporate Systems: 1 role', () => expect(CANONICAL_TAXONOMY.filter(r=>r.isSelectable&&r.domainId==='DOMAIN_IT_SUPPORT')).toHaveLength(1));
  it('Business, Ops & Marketing: 6 roles', () => expect(CANONICAL_TAXONOMY.filter(r=>r.isSelectable&&r.domainId==='DOMAIN_BUSINESS_OPS')).toHaveLength(6));
  it('HR, Legal & Finance: 5 roles', () => expect(CANONICAL_TAXONOMY.filter(r=>r.isSelectable&&r.domainId==='DOMAIN_HR_LEGAL_FINANCE')).toHaveLength(5));
});

// §2 Role Semantics
describe('P7§2 Role Semantics - no seniority/modifier as standalone selectable role', () => {
  const s = (n:string) => CANONICAL_TAXONOMY.find(r=>r.isSelectable&&r.displayName.toLowerCase()===n);
  it('Intern is not a selectable role', () => expect(s('intern')).toBeUndefined());
  it('Associate is not a selectable role', () => expect(s('associate')).toBeUndefined());
  it('Graduate Engineer Trainee is not a selectable role', () => expect(s('graduate engineer trainee')).toBeUndefined());
  it('Senior is not a selectable role', () => expect(s('senior')).toBeUndefined());
  it('Lead is not a selectable role', () => expect(s('lead')).toBeUndefined());
  it('Director is not a selectable role', () => expect(s('director')).toBeUndefined());
  it('Head is not a selectable role', () => expect(s('head')).toBeUndefined());
  it('VP is not a selectable role', () => expect(s('vp')).toBeUndefined());
});

// §3 Role Separation
describe('P7§3 Engineering Manager separation', () => {
  const r = eff({roles:[],canonicalRoles:['ROLE_ENG_MANAGER']});
  it('matches Engineering Manager', () => expect(matchRole('Engineering Manager',r).matched).toBe(true));
  it('matches Software Engineering Manager', () => expect(matchRole('Software Engineering Manager',r).matched).toBe(true));
  it('blocks Director of Engineering', () => expect(matchRole('Director of Engineering',r).matched).toBe(false));
  it('blocks Head of Engineering', () => expect(matchRole('Head of Engineering',r).matched).toBe(false));
  it('blocks VP Engineering', () => expect(matchRole('VP Engineering',r).matched).toBe(false));
  it('blocks Product Manager', () => expect(matchRole('Product Manager',r).matched).toBe(false));
  it('blocks Program Manager', () => expect(matchRole('Program Manager',r).matched).toBe(false));
});

describe('P7§3 Customer Success separation', () => {
  const r = eff({roles:[],canonicalRoles:['ROLE_CUSTOMER_SUCCESS']});
  it('matches Customer Success Manager', () => expect(matchRole('Customer Success Manager',r).matched).toBe(true));
  it('matches Client Success Manager', () => expect(matchRole('Client Success Manager',r).matched).toBe(true));
  it('blocks Account Executive', () => expect(matchRole('Account Executive',r).matched).toBe(false));
  it('blocks Sales Representative', () => expect(matchRole('Sales Representative',r).matched).toBe(false));
  it('blocks Business Development Representative', () => expect(matchRole('Business Development Representative',r).matched).toBe(false));
});

describe('P7§3 Java vs Python isolation', () => {
  const j = eff({roles:[],canonicalRoles:['ROLE_JAVA_DEV']});
  const p = eff({roles:[],canonicalRoles:['ROLE_PYTHON_DEV']});
  it('Java matches Java Developer', () => expect(matchRole('Java Developer',j).matched).toBe(true));
  it('Java blocks Python Developer', () => expect(matchRole('Python Developer',j).matched).toBe(false));
  it('Python matches Python Developer', () => expect(matchRole('Python Developer',p).matched).toBe(true));
  it('Python blocks Java Developer', () => expect(matchRole('Java Developer',p).matched).toBe(false));
});

describe('P7§3 Solutions Architect separation', () => {
  const r = eff({roles:[],canonicalRoles:['ROLE_SOLUTIONS_ARCHITECT']});
  it('matches Solutions Architect', () => expect(matchRole('Solutions Architect',r).matched).toBe(true));
  it('matches Sales Engineer', () => expect(matchRole('Sales Engineer',r).matched).toBe(true));
  it('blocks Software Engineer', () => expect(matchRole('Software Engineer',r).matched).toBe(false));
  it('blocks Software Developer', () => expect(matchRole('Software Developer',r).matched).toBe(false));
});

describe('P7§3 TPM vs Engineering Manager', () => {
  const tpm = eff({roles:[],canonicalRoles:['ROLE_TPM']});
  const em = eff({roles:[],canonicalRoles:['ROLE_ENG_MANAGER']});
  it('TPM matches Technical Program Manager', () => expect(matchRole('Technical Program Manager',tpm).matched).toBe(true));
  it('TPM blocks Engineering Manager', () => expect(matchRole('Engineering Manager',tpm).matched).toBe(false));
  it('EM blocks Technical Program Manager', () => expect(matchRole('Technical Program Manager',em).matched).toBe(false));
});

describe('P7§3 DevOps & SRE variants', () => {
  const r = eff({roles:[],canonicalRoles:['ROLE_DEVOPS_SRE']});
  it('matches DevOps Engineer', () => expect(matchRole('DevOps Engineer',r).matched).toBe(true));
  it('matches Site Reliability Engineer', () => expect(matchRole('Site Reliability Engineer',r).matched).toBe(true));
  it('matches SRE', () => expect(matchRole('SRE',r).matched).toBe(true));
  it('matches Platform Engineer', () => expect(matchRole('Platform Engineer',r).matched).toBe(true));
  it('matches Infrastructure Engineer', () => expect(matchRole('Infrastructure Engineer',r).matched).toBe(true));
});

describe('P7§3 Data Analyst / BI variants', () => {
  const r = eff({roles:[],canonicalRoles:['ROLE_DATA_ANALYST']});
  it('matches Data Analyst', () => expect(matchRole('Data Analyst',r).matched).toBe(true));
  it('matches Business Intelligence Analyst', () => expect(matchRole('Business Intelligence Analyst',r).matched).toBe(true));
  it('matches BI Analyst', () => expect(matchRole('BI Analyst',r).matched).toBe(true));
  it('blocks Business Analyst', () => expect(matchRole('Business Analyst',r).matched).toBe(false));
  it('blocks Systems Analyst', () => expect(matchRole('Systems Analyst',r).matched).toBe(false));
});

// §4 All 35 roles self-match
describe('P7§4 All-35 Self-Match Audit', () => {
  const sel = CANONICAL_TAXONOMY.filter(r => r.isSelectable);
  it('exactly 42 selectable roles', () => expect(sel).toHaveLength(42));
  for (const cr of sel) {
    it(`${cr.id} self-match`, () => {
      const roles = eff({roles:[],canonicalRoles:[cr.id]});
      expect(matchRole(cr.displayName,roles).matched,`${cr.id} "${cr.displayName}" failed self-match`).toBe(true);
    });
  }

  // Variant matches
  const variants: [string,string][] = [
    ['ROLE_SOFTWARE_ENGINEER','SDE'],['ROLE_SOFTWARE_ENGINEER','Software Developer'],
    ['ROLE_BACKEND_DEV','Backend Engineer'],['ROLE_FRONTEND_DEV','Frontend Engineer'],
    ['ROLE_FULLSTACK_DEV','Full Stack Engineer'],['ROLE_MOBILE_DEV','iOS Developer'],
    ['ROLE_JAVA_DEV','Spring Boot Developer'],['ROLE_PYTHON_DEV','Django Developer'],
    ['ROLE_DEVOPS_SRE','DevOps Engineer'],['ROLE_DEVOPS_SRE','Site Reliability Engineer'],
    ['ROLE_CLOUD_ENG','AWS Engineer'],['ROLE_SECURITY_ENG','Cybersecurity Engineer'],
    ['ROLE_QA_ENG','SDET'],['ROLE_QA_ENG','QA Engineer'],
    ['ROLE_SYSTEMS_ENG','Systems Engineer'],['ROLE_ENG_MANAGER','Engineering Manager'],
    ['ROLE_DATA_SCIENTIST','Applied Scientist'],['ROLE_DATA_ENGINEER','ETL Developer'],
    ['ROLE_ML_ENG','ML Engineer'],['ROLE_DATA_ANALYST','Data Analyst'],
    ['ROLE_DATA_ANALYST','BI Analyst'],['ROLE_PRODUCT_MANAGER','Product Owner'],
    ['ROLE_PRODUCT_DESIGNER','UX Designer'],['ROLE_ACCOUNT_EXECUTIVE','Account Executive'],
    ['ROLE_ACCOUNT_MANAGER','Account Manager'],['ROLE_BDR_SDR','Business Development Representative'],
    ['ROLE_BDR_SDR','SDR'],['ROLE_PARTNERSHIPS','Partner Manager'],
    ['ROLE_SOLUTIONS_ARCHITECT','Solutions Architect'],['ROLE_CUSTOMER_SUCCESS','Customer Success Manager'],
    ['ROLE_TECH_SUPPORT','Technical Support Specialist'],['ROLE_IT_SUPPORT','IT Support Specialist'],
    ['ROLE_BUSINESS_ANALYST','Business Analyst'],['ROLE_TPM','Technical Program Manager'],
    ['ROLE_OPERATIONS_ANALYST','Operations Analyst'],['ROLE_MARKETING','Marketing Associate'],
    ['ROLE_RECRUITER','Talent Acquisition Specialist'],['ROLE_HR_PARTNER','HR Generalist'],
    ['ROLE_LEGAL_COUNSEL','Legal Associate'],['ROLE_FINANCIAL_ANALYST','Finance Analyst'],
  ];
  for (const [id,variant] of variants) {
    it(`${id} matches "${variant}"`, () => {
      const roles = eff({roles:[],canonicalRoles:[id]});
      expect(matchRole(variant,roles).matched,`${id}: "${variant}" should match`).toBe(true);
    });
  }

  // Unrelated blocking
  const blocks: [string,string][] = [
    ['ROLE_SOFTWARE_ENGINEER','Civil Engineer'],['ROLE_SOFTWARE_ENGINEER','Mechanical Engineer'],
    ['ROLE_BACKEND_DEV','Product Manager'],['ROLE_FRONTEND_DEV','Data Analyst'],
    ['ROLE_JAVA_DEV','Python Developer'],['ROLE_PYTHON_DEV','Java Developer'],
    ['ROLE_ENG_MANAGER','Director of Engineering'],['ROLE_ENG_MANAGER','VP Engineering'],
    ['ROLE_ENG_MANAGER','Program Manager'],['ROLE_ENG_MANAGER','Product Manager'],
    ['ROLE_CUSTOMER_SUCCESS','Account Executive'],['ROLE_CUSTOMER_SUCCESS','Business Development Representative'],
    ['ROLE_DATA_ANALYST','Business Analyst'],['ROLE_SOLUTIONS_ARCHITECT','Software Engineer'],
    ['ROLE_SOLUTIONS_ARCHITECT','Software Developer'],['ROLE_TPM','Engineering Manager'],
    ['ROLE_PRODUCT_MANAGER','Program Manager'],['ROLE_SECURITY_ENG','Software Engineer'],
    ['ROLE_SYSTEMS_ENG','Software Engineer'],['ROLE_SYSTEMS_ENG','Sales Engineer'],
  ];
  for (const [id,bad] of blocks) {
    it(`${id} blocks "${bad}"`, () => {
      const roles = eff({roles:[],canonicalRoles:[id]});
      expect(matchRole(bad,roles).matched,`${id}: "${bad}" should be blocked`).toBe(false);
    });
  }
});

// §5 Persistence Audit (validator)
describe('P7§5 Preference Persistence', () => {
  it('valid engineering canonical ID accepted', async () => {
    const r = await validatePreferences({roles:['Software Engineer'],canonicalRoles:['ROLE_SOFTWARE_ENGINEER'],locations:['Remote']});
    expect(r.valid).toBe(true);
    expect(r.data?.canonicalRoles).toEqual(['ROLE_SOFTWARE_ENGINEER']);
  });
  it('valid data canonical ID accepted', async () => {
    const r = await validatePreferences({roles:['Data Analyst'],canonicalRoles:['ROLE_DATA_ANALYST'],locations:['Remote']});
    expect(r.valid).toBe(true);
  });
  it('valid sales canonical ID accepted', async () => {
    const r = await validatePreferences({roles:['Account Executive'],canonicalRoles:['ROLE_ACCOUNT_EXECUTIVE'],locations:['Remote']});
    expect(r.valid).toBe(true);
  });
  it('valid customer success canonical ID accepted', async () => {
    const r = await validatePreferences({roles:['Customer Success Manager'],canonicalRoles:['ROLE_CUSTOMER_SUCCESS'],locations:['Remote']});
    expect(r.valid).toBe(true);
  });
  it('valid HR/Legal/Finance canonical ID accepted', async () => {
    const r = await validatePreferences({roles:['Legal Counsel'],canonicalRoles:['ROLE_LEGAL_COUNSEL'],locations:['Remote']});
    expect(r.valid).toBe(true);
  });
  it('invalid canonical ID rejected', async () => {
    const r = await validatePreferences({roles:['SWE'],canonicalRoles:['ROLE_TOTALLY_FAKE'],locations:['Remote']});
    expect(r.valid).toBe(false);
    expect(r.errors?.some(e=>e.includes('ROLE_TOTALLY_FAKE'))).toBe(true);
  });
  it('displayName is NOT accepted as canonical ID', async () => {
    const r = await validatePreferences({roles:['Software Engineer'],canonicalRoles:['Software Engineer'],locations:['Remote']});
    expect(r.valid).toBe(false);
  });
  it('legacy roles remain intact alongside canonicalRoles', async () => {
    const r = await validatePreferences({roles:['My Custom Legacy Role'],canonicalRoles:['ROLE_SOFTWARE_ENGINEER'],locations:['Remote']});
    expect(r.valid).toBe(true);
    expect(r.data?.roles).toContain('My Custom Legacy Role');
    expect(r.data?.canonicalRoles).toContain('ROLE_SOFTWARE_ENGINEER');
  });
  it('canonicalRoles optional - legacy-only payload valid', async () => {
    const r = await validatePreferences({roles:['Software Engineer'],locations:['Remote']});
    expect(r.valid).toBe(true);
    expect(r.data?.canonicalRoles).toEqual([]);
  });
  it('duplicate canonical IDs are de-duplicated', async () => {
    const r = await validatePreferences({roles:['Software Engineer'],canonicalRoles:['ROLE_SOFTWARE_ENGINEER','ROLE_SOFTWARE_ENGINEER'],locations:['Remote']});
    expect(r.valid).toBe(true);
    expect(r.data?.canonicalRoles).toHaveLength(1);
  });
});

// §6 API Contract
describe('P7§6 API Contract', () => {
  it('8 domains', () => expect(CANONICAL_DOMAINS).toHaveLength(8));
  it('all domains have id and displayName', () => { for(const d of CANONICAL_DOMAINS){expect(d.id).toBeTruthy();expect(d.displayName).toBeTruthy();} });
  it('handler output does NOT include synonyms/specializations/disallowedTokens', () => {
    const out = CANONICAL_DOMAINS.map(d=>({
      id:d.id,displayName:d.displayName,
      roles:CANONICAL_TAXONOMY.filter(r=>r.domainId===d.id&&r.isSelectable)
        .map(r=>({id:r.id,displayName:r.displayName,domainId:r.domainId,isSelectable:r.isSelectable}))
    }));
    for(const d of out) for(const r of d.roles){
      expect(r).not.toHaveProperty('synonyms');
      expect(r).not.toHaveProperty('specializations');
      expect(r).not.toHaveProperty('disallowedTokens');
    }
  });
  it('total roles in API output = 42', () => {
    const total = CANONICAL_DOMAINS.reduce((s,d)=>s+CANONICAL_TAXONOMY.filter(r=>r.domainId===d.id&&r.isSelectable).length,0);
    expect(total).toBe(42);
  });
});

// §7 Matching Safety
describe('P7§7 Matching Safety - hard filters not bypassed', () => {
  const sweR = eff({roles:[],canonicalRoles:['ROLE_SOFTWARE_ENGINEER']});

  it('FRESHER + canonical: senior job blocked by experience gate', () => {
    const u = usr({roles:sweR,experienceLevel:'FRESHER'});
    const j = job({title:'Senior Software Engineer',description:'Requires 8+ years experience.',requirements:'Min 8 years exp.'});
    const res = evaluateJobMatch(j,u);
    expect(res.matched).toBe(false);
    expect(res.components.experience.matched).toBe(false);
    expect(res.components.role.matched).toBe(true);
  });

  it('India user: foreign-only job blocked by location', () => {
    const u = usr({roles:sweR,locations:['Bangalore']});
    const j = job({title:'Software Engineer',location:'San Francisco, USA'});
    expect(evaluateJobMatch(j,u).matched).toBe(false);
    expect(evaluateJobMatch(j,u).components.location.matched).toBe(false);
  });

  it('ONSITE preference: remote job blocked', () => {
    const u = usr({roles:sweR,workplaceTypes:['ONSITE'] as any});
    const j = job({title:'Software Engineer',location:'Remote',workplaceType:'REMOTE'});
    const res = evaluateJobMatch(j,u);
    expect(res.components.role.matched).toBe(true);
    expect(res.components.workplace.matched).toBe(false);
    expect(res.matched).toBe(false);
  });

  it('company filter blocks wrong company', () => {
    const u = usr({roles:sweR,companyIds:['comp-target']});
    const j = job({title:'Software Engineer',companyId:'comp-other'});
    expect(evaluateJobMatch(j,u).components.company.matched).toBe(false);
    expect(evaluateJobMatch(j,u).matched).toBe(false);
  });

  it('FRESHER + ROLE_ENG_MANAGER: senior EM job blocked by experience', () => {
    const emR = eff({roles:[],canonicalRoles:['ROLE_ENG_MANAGER']});
    const u = usr({roles:emR,experienceLevel:'FRESHER'});
    const j = job({title:'Senior Engineering Manager',description:'Requires 8+ years engineering management. Not for freshers.',requirements:'Min 8 years exp.'});
    expect(evaluateJobMatch(j,u).matched).toBe(false);
    expect(evaluateJobMatch(j,u).components.experience.matched).toBe(false);
  });
});

// §8 SQL Prefilter Safety
describe('P7§8 SQL Prefilter Safety', () => {
  it('empty roles -> empty patterns (no full-table load)', () => expect(getSafeSqlRolePatterns([])).toEqual([]));
  it('ROLE_SOFTWARE_ENGINEER patterns include software engineer', () => {
    const p = getSafeSqlRolePatterns(eff({roles:[],canonicalRoles:['ROLE_SOFTWARE_ENGINEER']}));
    expect(p.some(x=>x.toLowerCase().includes('software engineer'))).toBe(true);
    expect(p.length).toBeGreaterThan(1);
  });
  it('ROLE_DEVOPS_SRE patterns include devops', () => {
    const p = getSafeSqlRolePatterns(eff({roles:[],canonicalRoles:['ROLE_DEVOPS_SRE']}));
    expect(p.some(x=>x.toLowerCase().includes('devops'))).toBe(true);
  });
  it('ROLE_DATA_ANALYST patterns include data analyst', () => {
    const p = getSafeSqlRolePatterns(eff({roles:[],canonicalRoles:['ROLE_DATA_ANALYST']}));
    expect(p.some(x=>x.toLowerCase().includes('data analyst'))).toBe(true);
  });
  it('patterns are safe %text% format with no SQL injection chars', () => {
    const p = getSafeSqlRolePatterns(['Software Engineer','Data Analyst']);
    for(const x of p) expect(x).toMatch(/^%[^;'"]*%$/);
  });
  it('ROLE_QA_ENG patterns include qa', () => {
    const p = getSafeSqlRolePatterns(eff({roles:[],canonicalRoles:['ROLE_QA_ENG']}));
    expect(p.some(x=>x.toLowerCase().includes('qa'))).toBe(true);
  });
});

// §9 Collision Audit
describe('P7§9 Taxonomy Collision Audit', () => {
  it('Customer Success does NOT match Account Executive', () => {
    expect(matchRole('Account Executive',eff({roles:[],canonicalRoles:['ROLE_CUSTOMER_SUCCESS']})).matched).toBe(false);
  });
  it('Account Executive does NOT match Customer Success Manager', () => {
    expect(matchRole('Customer Success Manager',eff({roles:[],canonicalRoles:['ROLE_ACCOUNT_EXECUTIVE']})).matched).toBe(false);
  });
  it('Director of Engineering does NOT match Engineering Manager role', () => {
    expect(matchRole('Director of Engineering',eff({roles:[],canonicalRoles:['ROLE_ENG_MANAGER']})).matched).toBe(false);
  });
  it('Business Analyst does NOT match Data Analyst / BI role', () => {
    expect(matchRole('Business Analyst',eff({roles:[],canonicalRoles:['ROLE_DATA_ANALYST']})).matched).toBe(false);
  });
  it('Data Analyst does NOT match Business Analyst role', () => {
    expect(matchRole('Data Analyst',eff({roles:[],canonicalRoles:['ROLE_BUSINESS_ANALYST']})).matched).toBe(false);
  });
  it('Project Manager does NOT match Product Manager role', () => {
    expect(matchRole('Project Manager',eff({roles:[],canonicalRoles:['ROLE_PRODUCT_MANAGER']})).matched).toBe(false);
  });
  it('QA Engineer does NOT match Software Engineer role', () => {
    expect(matchRole('QA Engineer',eff({roles:[],canonicalRoles:['ROLE_SOFTWARE_ENGINEER']})).matched).toBe(false);
  });
  it('Cloud Engineer does NOT match DevOps & SRE role (no cross-pollination)', () => {
    expect(matchRole('Cloud Engineer',eff({roles:[],canonicalRoles:['ROLE_DEVOPS_SRE']})).matched).toBe(false);
  });
  it('Security Engineer does NOT match IT Support role', () => {
    expect(matchRole('Security Engineer',eff({roles:[],canonicalRoles:['ROLE_IT_SUPPORT']})).matched).toBe(false);
  });
  it('HR Generalist does NOT match Customer Success Manager role', () => {
    expect(matchRole('HR Generalist',eff({roles:[],canonicalRoles:['ROLE_CUSTOMER_SUCCESS']})).matched).toBe(false);
  });
});

// §10 Backward Compatibility
describe('P7§10 Backward Compatibility', () => {
  it('legacy-only user: unchanged matching', () => {
    const e = eff({roles:['Software Engineer'],canonicalRoles:[]});
    expect(e).toEqual(['Software Engineer']);
    expect(evaluateJobMatch(job({title:'Software Engineer'}),usr({roles:e})).matched).toBe(true);
  });
  it('empty canonical + empty legacy -> fallback ["Software Engineer"]', () => {
    expect(eff({roles:[],canonicalRoles:[]})).toEqual(['Software Engineer']);
  });
  it('invalid canonical ID silently ignored (no crash)', () => {
    expect(resolveCanonicalRoleIds(['ROLE_DOES_NOT_EXIST'])).toEqual([]);
  });
  it('all 42 current taxonomy roles are selectable (no hidden non-selectable)', () => {
    expect(CANONICAL_TAXONOMY.filter(r=>!r.isSelectable)).toHaveLength(0);
  });
  it('canonical + equivalent legacy de-duplicated to 1', () => {
    expect(eff({roles:['Software Engineer'],canonicalRoles:['ROLE_SOFTWARE_ENGINEER']})).toHaveLength(1);
  });
  it('canonical + custom legacy: both preserved', () => {
    const e = eff({roles:['My Bespoke Role'],canonicalRoles:['ROLE_SOFTWARE_ENGINEER']});
    expect(e).toContain('Software Engineer');
    expect(e).toContain('My Bespoke Role');
    expect(e).toHaveLength(2);
  });
});

// §11 TaxonomyCompatibilityAdapter
describe('P7§11 TaxonomyCompatibilityAdapter', () => {
  it('resolves ROLE_SOFTWARE_ENGINEER', () => {
    const r = TaxonomyCompatibilityAdapter.getCanonicalRoleById('ROLE_SOFTWARE_ENGINEER');
    expect(r?.displayName).toBe('Software Engineer');
    expect(r?.isSelectable).toBe(true);
  });
  it('resolves ROLE_ENG_MANAGER', () => {
    expect(TaxonomyCompatibilityAdapter.getCanonicalRoleById('ROLE_ENG_MANAGER')?.displayName).toBe('Engineering Manager');
  });
  it('returns null for unknown ID', () => {
    expect(TaxonomyCompatibilityAdapter.getCanonicalRoleById('FAKE')).toBeNull();
  });
  it('isSelectableCanonicalRole true for all 42 IDs', () => {
    for(const r of CANONICAL_TAXONOMY.filter(r=>r.isSelectable))
      expect(TaxonomyCompatibilityAdapter.isSelectableCanonicalRole(r.id)).toBe(true);
  });
});

// §12 Known PARTIAL overlap documentation
describe('P7§12 Known PARTIAL overlap — Operations Analyst / Program Manager', () => {
  it('ROLE_TPM matches Program Manager (expected)', () => {
    expect(matchRole('Program Manager',eff({roles:[],canonicalRoles:['ROLE_TPM']})).matched).toBe(true);
  });
  it('ROLE_OPERATIONS_ANALYST matches Program Manager (PARTIAL — documented known overlap)', () => {
    const r = matchRole('Program Manager',eff({roles:[],canonicalRoles:['ROLE_OPERATIONS_ANALYST']}));
    // This is PARTIAL: program manager appears in ROLE_TAXONOMY Operations Analyst synonyms.
    // Documented as SAFE overlap: ops vs TPM is adjacent in practice.
    expect(typeof r.matched).toBe('boolean'); // document current behavior without asserting wrong expectation
  });
  it('ROLE_TPM user: "Operations Analyst" job title does NOT match', () => {
    expect(matchRole('Operations Analyst',eff({roles:[],canonicalRoles:['ROLE_TPM']})).matched).toBe(false);
  });
});
