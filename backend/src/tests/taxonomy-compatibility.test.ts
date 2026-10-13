import { describe, it, expect } from 'vitest';
import { TaxonomyCompatibilityAdapter } from '../matching/taxonomy-compatibility.js';
import { CANONICAL_TAXONOMY, CANONICAL_DOMAINS } from '../matching/canonical-taxonomy.js';
import { STANDARD_ROLES } from '../preferences/taxonomy.js';

describe('Phase 2: Canonical Taxonomy Compatibility Adapter', () => {

  it('1. Every one of the 42 canonical selectable roles can be resolved by ID and Display Name', () => {
    expect(CANONICAL_TAXONOMY.length).toBe(42);
    for (const role of CANONICAL_TAXONOMY) {
      // Resolve by ID
      expect(TaxonomyCompatibilityAdapter.getCanonicalRoleById(role.id)).toBe(role);
      
      // Resolve by Display Name
      const resolved = TaxonomyCompatibilityAdapter.resolveCanonicalRole(role.displayName);
      expect(resolved).toBeTruthy();
      expect(resolved?.id).toBe(role.id);
    }
  });

  it('2. Every canonical role has a valid domain', () => {
    const validDomainIds = new Set(CANONICAL_DOMAINS.map(d => d.id));
    expect(validDomainIds.size).toBe(8);
    for (const role of CANONICAL_TAXONOMY) {
      expect(validDomainIds.has(role.domainId)).toBe(true);
    }
  });

  it('3. Canonical IDs are unique', () => {
    const ids = CANONICAL_TAXONOMY.map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('4. Canonical display names are unique', () => {
    const names = CANONICAL_TAXONOMY.map(r => r.displayName.toLowerCase());
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('5. Existing STANDARD_ROLES can be safely recognized (except legacy ones that were explicitly mapped via synonym/specialization)', () => {
    const mappedStandardRoles = [
      'Software Engineer',
      'Backend Developer',
      'Frontend Developer',
      'Full Stack Developer',
      'Java Developer',
      'Python Developer',
      'DevOps Engineer',
      'Cloud Engineer',
      'Data Analyst',
      'Data Scientist',
      'Machine Learning Engineer',
      'QA Engineer',
      'Business Analyst',
      'Product Manager',
      'Security Engineer',
      'Systems Engineer'
    ];
    // Software Developer is mapped as a synonym to Software Engineer
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Software Developer')?.id).toBe('ROLE_SOFTWARE_ENGINEER');

    for (const role of mappedStandardRoles) {
      const resolved = TaxonomyCompatibilityAdapter.resolveCanonicalRole(role);
      expect(resolved).toBeTruthy();
    }
  });

  it('6 & 7. Java and Python Developer resolve correctly to their backward compatible roles', () => {
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Java Developer')?.id).toBe('ROLE_JAVA_DEV');
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Python Developer')?.id).toBe('ROLE_PYTHON_DEV');
  });

  it('8. Engineering Manager resolves correctly', () => {
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Engineering Manager')?.id).toBe('ROLE_ENG_MANAGER');
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('software engineering manager')?.id).toBe('ROLE_ENG_MANAGER');
  });

  it('9, 10, 11. Director/Head/VP of Engineering do NOT resolve to Engineering Manager', () => {
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Director of Engineering')).toBeNull();
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('VP Engineering')).toBeNull();
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Head of Engineering')).toBeNull();
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Vice President Engineering')).toBeNull();
  });

  it('12. Customer Success does not collapse into Sales', () => {
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Customer Success Manager')?.domainId).toBe('DOMAIN_CUSTOMER_SUCCESS');
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Account Executive')?.domainId).toBe('DOMAIN_SALES_GTM');
  });

  it('13. Unknown role strings remain UNKNOWN/UNMAPPED', () => {
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Chief Happiness Officer')).toBeNull();
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Prompt Engineer')).toBeNull();
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Marketing Director')).toBeNull(); // Disallowed token 'director'
  });

  it('14 & 15. Whitespace/casing/empty string handling', () => {
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('')).toBeNull();
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('   ')).toBeNull();
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('  sOFtware  ENGINEER  ')?.id).toBe('ROLE_SOFTWARE_ENGINEER');
  });

  it('16 & 17. No accidental ambiguous cross-mappings', () => {
    // Project Manager != Product Manager
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Project Manager')).toBeNull(); // It has 'project' which is disallowed in Eng Manager & Product Manager
    
    // Technical Support != Software Engineer
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Technical Support Engineer')?.id).toBe('ROLE_TECH_SUPPORT');
    expect(TaxonomyCompatibilityAdapter.resolveCanonicalRole('Technical Support Engineer')?.id).not.toBe('ROLE_SOFTWARE_ENGINEER');
  });

  it('18. Adapter does not mutate canonical registry', () => {
    const initialLength = CANONICAL_TAXONOMY.length;
    TaxonomyCompatibilityAdapter.resolveCanonicalRole('Software Engineer');
    expect(CANONICAL_TAXONOMY.length).toBe(initialLength);
  });
});
