/**
 * Phase 6 - Canonical Role Resolver
 *
 * Bridges canonical role IDs (e.g. "ROLE_SOFTWARE_ENGINEER") to the
 * legacy display-name strings that the existing matchRole() / getSafeSqlRolePatterns()
 * machinery in role-matcher.ts understands.
 *
 * DESIGN INVARIANTS:
 *  - Only stable canonical IDs are accepted; never display names.
 *  - Only isSelectable === true roles are accepted; non-selectable IDs are silently ignored.
 *  - The result is always a de-duplicated list of display-name strings.
 *  - Custom / unmapped legacy roles are preserved as-is in the merged output.
 *  - The function is pure, synchronous, and deterministic.
 *  - It does NOT modify the matching engine or the canonical taxonomy.
 */

import { TaxonomyCompatibilityAdapter } from './taxonomy-compatibility.js';

/**
 * Resolves a list of canonical role IDs to their display names.
 *
 * - Invalid or non-selectable IDs are silently ignored (no error thrown).
 * - Returns an empty array if no valid IDs are provided.
 */
export function resolveCanonicalRoleIds(canonicalRoleIds: string[]): string[] {
  if (!canonicalRoleIds || canonicalRoleIds.length === 0) return [];

  const resolved: string[] = [];
  for (const id of canonicalRoleIds) {
    const roleDef = TaxonomyCompatibilityAdapter.getCanonicalRoleById(id);
    if (roleDef && roleDef.isSelectable) {
      resolved.push(roleDef.displayName);
    }
  }
  return resolved;
}

/**
 * Merges canonical role display names with legacy role strings, de-duplicating by
 * case-insensitive string equality.
 *
 * Rules:
 *  1. Canonical role display names take the slot; if the legacy array already has
 *     the same string (case-insensitive), it is not added again.
 *  2. Custom / unmapped legacy roles that do not correspond to any canonical display
 *     name are preserved in the output.
 *  3. The order is: canonical names first, then unmapped legacy names.
 *
 * This ensures:
 *  - Legacy-only users: output = legacyRoles (unchanged)
 *  - Canonical-only users: output = canonical display names
 *  - Mixed users: output = canonical display names + unmapped legacy custom roles
 *
 * @param canonicalDisplayNames - display names resolved from canonical IDs
 * @param legacyRoles - legacy role strings from user preferences
 */
export function mergeEffectiveRoles(
  canonicalDisplayNames: string[],
  legacyRoles: string[]
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of canonicalDisplayNames) {
    const key = name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  }

  for (const role of legacyRoles) {
    const key = role.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(role);
    }
  }

  return result;
}
