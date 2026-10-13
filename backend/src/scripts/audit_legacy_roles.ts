// No DB imports needed for this environment
import { STANDARD_ROLES } from '../preferences/taxonomy.js';
import { ROLE_TAXONOMY } from '../matching/role-matcher.js';
import { TaxonomyPreferenceMigration } from '../preferences/taxonomy-preference-migration.js';

async function main() {
  console.log("Starting Phase 3A Audit...");

  // 1. Gather Code-Defined Inventory
  const codeDefinedSet = new Set<string>();
  
  // STANDARD_ROLES
  STANDARD_ROLES.forEach(r => codeDefinedSet.add(r));
  
  // ROLE_TAXONOMY (Canonical + Synonyms + Specializations)
  ROLE_TAXONOMY.forEach(entry => {
    codeDefinedSet.add(entry.canonical);
    entry.synonyms.forEach(s => codeDefinedSet.add(s));
    entry.specializations.forEach(s => codeDefinedSet.add(s));
  });

  // Additional common ones from tests/hardcodes
  const additional = [
    'Director of Engineering',
    'Head of Engineering',
    'VP Engineering',
    'Vice President Engineering',
    'Engineering Director',
    'Sales Manager',
    'Project Manager',
    'Technical Support'
  ];
  additional.forEach(a => codeDefinedSet.add(a));

  const codeDefinedValues = Array.from(codeDefinedSet);

  let dbValues: string[] = [];
  console.log("Database access is unavailable in this environment (missing DATABASE_URL). Skipping database inventory.");

  // Combine for full audit
  const allUniqueSet = new Set<string>([...codeDefinedValues, ...dbValues]);
  const allUniqueValues = Array.from(allUniqueSet);

  console.log(`\n=== AUDIT RESULTS ===`);
  console.log(`Code-Defined Inventory Count: ${codeDefinedValues.length}`);
  console.log(`Database Inventory Count: ${dbValues.length}`);
  console.log(`Total Unique Combined Inventory: ${allUniqueValues.length}`);

  // Run audit
  const auditReport = TaxonomyPreferenceMigration.auditLegacyValues(allUniqueValues);

  console.log(JSON.stringify({
    codeDefinedCount: codeDefinedValues.length,
    databaseCount: dbValues.length,
    totalUnique: allUniqueValues.length,
    auditReport,
  }, null, 2));

  process.exit(0);
}

main().catch(console.error);
