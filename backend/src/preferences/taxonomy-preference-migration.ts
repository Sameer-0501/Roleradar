import { TaxonomyCompatibilityAdapter } from '../matching/taxonomy-compatibility.js';
import { CANONICAL_TAXONOMY } from '../matching/canonical-taxonomy.js';

export type MigrationClassification = 'EXACT' | 'ALIAS' | 'UNMAPPED' | 'AMBIGUOUS' | 'INVALID';

export interface MigrationResult {
  legacyValue: string;
  canonicalRoleId: string | null;
  classification: MigrationClassification;
  confidence: 'DETERMINISTIC' | 'NONE';
}

function normalizeString(val: string): string {
  if (!val) return '';
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Migration layer for evaluating how existing legacy role preferences
 * safely map to the new canonical taxonomy.
 * 
 * Safe, read-only translation.
 */
export class TaxonomyPreferenceMigration {
  
  static evaluateLegacyRole(legacyValue: string): MigrationResult {
    const normalized = normalizeString(legacyValue);
    
    if (!normalized) {
      return {
        legacyValue,
        canonicalRoleId: null,
        classification: 'INVALID',
        confidence: 'NONE'
      };
    }

    // 1. Is it EXACTLY a canonical ID?
    const exactIdMatch = CANONICAL_TAXONOMY.find(r => r.id === legacyValue);
    if (exactIdMatch) {
      return {
        legacyValue,
        canonicalRoleId: exactIdMatch.id,
        classification: 'EXACT',
        confidence: 'DETERMINISTIC'
      };
    }

    // 1b. Is it EXACTLY a canonical display name?
    const exactNameMatch = CANONICAL_TAXONOMY.find(r => normalizeString(r.displayName) === normalized);
    if (exactNameMatch) {
      return {
        legacyValue,
        canonicalRoleId: exactNameMatch.id,
        classification: 'EXACT',
        confidence: 'DETERMINISTIC'
      };
    }

    // 2. Can the adapter resolve it safely via deterministic synonyms/specializations?
    const resolvedRole = TaxonomyCompatibilityAdapter.resolveCanonicalRole(legacyValue);
    if (resolvedRole) {
      return {
        legacyValue,
        canonicalRoleId: resolvedRole.id,
        classification: 'ALIAS',
        confidence: 'DETERMINISTIC'
      };
    }

    // 3. Safety Net: Check for ambiguous/broad terms that shouldn't be mapped to any single canonical role automatically
    const ambiguousTokens = ['manager', 'director', 'vp', 'head', 'lead', 'engineer', 'developer', 'analyst', 'specialist', 'consultant'];
    if (ambiguousTokens.includes(normalized)) {
       return {
        legacyValue,
        canonicalRoleId: null,
        classification: 'AMBIGUOUS',
        confidence: 'NONE'
      };
    }

    // We can also flag strings containing "manager" or "director" as UNMAPPED rather than trying to guess
    // (the resolveCanonicalRole already strictly rejects them from Engineering Manager, but we can return 'UNMAPPED' here)

    return {
      legacyValue,
      canonicalRoleId: null,
      classification: 'UNMAPPED',
      confidence: 'NONE'
    };
  }

  /**
   * Evaluates a set of unique legacy strings and returns an audit report.
   */
  static auditLegacyValues(legacyValues: string[]): {
    total: number;
    exact: number;
    alias: number;
    unmapped: number;
    ambiguous: number;
    invalid: number;
    coveragePercentage: string;
    results: MigrationResult[];
    manualReviewRequired: string[];
  } {
    const results = legacyValues.map(val => this.evaluateLegacyRole(val));
    
    let exact = 0, alias = 0, unmapped = 0, ambiguous = 0, invalid = 0;
    const manualReviewRequired: string[] = [];

    for (const res of results) {
      switch (res.classification) {
        case 'EXACT': exact++; break;
        case 'ALIAS': alias++; break;
        case 'UNMAPPED': 
          unmapped++; 
          manualReviewRequired.push(res.legacyValue);
          break;
        case 'AMBIGUOUS': 
          ambiguous++; 
          manualReviewRequired.push(res.legacyValue);
          break;
        case 'INVALID': invalid++; break;
      }
    }

    const deterministicallyMapped = exact + alias;
    // Only calculate coverage against valid strings
    const validTotal = results.length - invalid;
    const coverage = validTotal > 0 ? ((deterministicallyMapped / validTotal) * 100).toFixed(2) : '100.00';

    return {
      total: results.length,
      exact,
      alias,
      unmapped,
      ambiguous,
      invalid,
      coveragePercentage: `${coverage}%`,
      results,
      manualReviewRequired
    };
  }
}
