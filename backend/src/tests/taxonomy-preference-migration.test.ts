import { describe, it, expect } from 'vitest';
import { TaxonomyPreferenceMigration } from '../preferences/taxonomy-preference-migration.js';
import { CANONICAL_TAXONOMY } from '../matching/canonical-taxonomy.js';
import { STANDARD_ROLES } from '../preferences/taxonomy.js';

describe('Phase 3: Safe Preference Migration Strategy', () => {

  it('1. Every one of the 42 canonical roles is migration-resolvable where its canonical display name is used as a legacy preference', () => {
    expect(CANONICAL_TAXONOMY.length).toBe(42);
    for (const role of CANONICAL_TAXONOMY) {
      const result = TaxonomyPreferenceMigration.evaluateLegacyRole(role.displayName);
      expect(result.canonicalRoleId).toBe(role.id);
      expect(result.classification).toBe('EXACT');
      expect(result.confidence).toBe('DETERMINISTIC');
    }
  });

  it('2. Existing STANDARD_ROLES mappings', () => {
    // Software Developer is an ALIAS of Software Engineer
    const result = TaxonomyPreferenceMigration.evaluateLegacyRole('Software Developer');
    expect(result.canonicalRoleId).toBe('ROLE_SOFTWARE_ENGINEER');
    expect(result.classification).toBe('ALIAS');

    const exactResult = TaxonomyPreferenceMigration.evaluateLegacyRole('QA Engineer');
    expect(exactResult.canonicalRoleId).toBe('ROLE_QA_ENG');
    expect(exactResult.classification).toBe('ALIAS'); // QA Engineer is a synonym for 'QA & Automation Engineer'
  });

  it('3 & 4. Java Developer and Python Developer migrate correctly', () => {
    const javaResult = TaxonomyPreferenceMigration.evaluateLegacyRole('Java Developer');
    expect(javaResult.canonicalRoleId).toBe('ROLE_JAVA_DEV');
    expect(javaResult.classification).toBe('EXACT');

    const pythonResult = TaxonomyPreferenceMigration.evaluateLegacyRole('Python Developer');
    expect(pythonResult.canonicalRoleId).toBe('ROLE_PYTHON_DEV');
    expect(pythonResult.classification).toBe('EXACT');
  });

  it('5. Software Engineer migrates correctly', () => {
    const sweResult = TaxonomyPreferenceMigration.evaluateLegacyRole('Software Engineer');
    expect(sweResult.canonicalRoleId).toBe('ROLE_SOFTWARE_ENGINEER');
    expect(sweResult.classification).toBe('EXACT');
  });

  it('6 & 7. Business Analyst and Customer Success Manager migrate correctly', () => {
    expect(TaxonomyPreferenceMigration.evaluateLegacyRole('Business Analyst').canonicalRoleId).toBe('ROLE_BUSINESS_ANALYST');
    expect(TaxonomyPreferenceMigration.evaluateLegacyRole('Customer Success Manager').canonicalRoleId).toBe('ROLE_CUSTOMER_SUCCESS');
  });

  it('8. Engineering Manager migrates correctly', () => {
    const emResult = TaxonomyPreferenceMigration.evaluateLegacyRole('Engineering Manager');
    expect(emResult.canonicalRoleId).toBe('ROLE_ENG_MANAGER');
    expect(emResult.classification).toBe('EXACT');
  });

  it('9, 10, 11. Director/Head/VP of Engineering must NOT map to Engineering Manager', () => {
    const directorResult = TaxonomyPreferenceMigration.evaluateLegacyRole('Director of Engineering');
    expect(directorResult.canonicalRoleId).toBeNull();
    expect(directorResult.classification).toBe('UNMAPPED');

    expect(TaxonomyPreferenceMigration.evaluateLegacyRole('Head of Engineering').canonicalRoleId).toBeNull();
    expect(TaxonomyPreferenceMigration.evaluateLegacyRole('VP Engineering').canonicalRoleId).toBeNull();
  });

  it('12. Project Manager must NOT automatically become Product Manager', () => {
    const result = TaxonomyPreferenceMigration.evaluateLegacyRole('Project Manager');
    expect(result.canonicalRoleId).toBeNull();
    expect(result.classification).toBe('UNMAPPED');
  });

  it('13. Technical Support must NOT become Software Engineer', () => {
    const result = TaxonomyPreferenceMigration.evaluateLegacyRole('Technical Support Engineer');
    expect(result.canonicalRoleId).toBe('ROLE_TECH_SUPPORT');
    expect(result.classification).toBe('EXACT'); // Exact match for canonical display name
  });

  it('14 & 15. Empty string and Whitespace-only string', () => {
    const emptyResult = TaxonomyPreferenceMigration.evaluateLegacyRole('');
    expect(emptyResult.classification).toBe('INVALID');

    const whitespaceResult = TaxonomyPreferenceMigration.evaluateLegacyRole('   ');
    expect(whitespaceResult.classification).toBe('INVALID');
  });

  it('16. Unknown role', () => {
    const result = TaxonomyPreferenceMigration.evaluateLegacyRole('Chief Happiness Officer');
    expect(result.canonicalRoleId).toBeNull();
    expect(result.classification).toBe('UNMAPPED');
  });

  it('17. Ambiguous role', () => {
    const result = TaxonomyPreferenceMigration.evaluateLegacyRole('Manager');
    expect(result.canonicalRoleId).toBeNull();
    expect(result.classification).toBe('AMBIGUOUS');
  });

  it('18. Case normalization', () => {
    const result = TaxonomyPreferenceMigration.evaluateLegacyRole('  sOFtwAre ENgineeR  ');
    expect(result.canonicalRoleId).toBe('ROLE_SOFTWARE_ENGINEER');
    expect(result.classification).toBe('EXACT');
  });

  it('19. Existing legacy aliases', () => {
    const result = TaxonomyPreferenceMigration.evaluateLegacyRole('QlikView Developer');
    expect(result.canonicalRoleId).toBe('ROLE_DATA_ANALYST');
    expect(result.classification).toBe('ALIAS'); // It's a specialization, resolving via alias
  });

  it('20. Migration does not mutate the canonical taxonomy', () => {
    const initialLength = CANONICAL_TAXONOMY.length;
    TaxonomyPreferenceMigration.evaluateLegacyRole('Software Engineer');
    expect(CANONICAL_TAXONOMY.length).toBe(initialLength);
  });

  it('21. Migration does not mutate the original legacy preference', () => {
    const original = "Software Developer";
    const result = TaxonomyPreferenceMigration.evaluateLegacyRole(original);
    expect(result.legacyValue).toBe("Software Developer"); // Exact original string preserved
  });
  
  it('Audit function produces correct totals without mutations', () => {
    const report = TaxonomyPreferenceMigration.auditLegacyValues([
      'Software Engineer',
      'Backend Developer',
      'Software Developer',
      'Director of Engineering',
      'Manager',
      ''
    ]);

    expect(report.total).toBe(6);
    expect(report.exact).toBe(2);
    expect(report.alias).toBe(1);
    expect(report.unmapped).toBe(1);
    expect(report.ambiguous).toBe(1);
    expect(report.invalid).toBe(1);
  });
});
