import { CANONICAL_TAXONOMY, CanonicalRoleDef } from './canonical-taxonomy.js';

/**
 * Normalizes a role string by trimming, lowercasing, and replacing multiple spaces.
 */
function normalizeString(val: string): string {
  if (!val) return '';
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Compatibility Adapter: Phase 2
 * Maps legacy string roles to the new canonical registry deterministically.
 */
export class TaxonomyCompatibilityAdapter {
  
  /**
   * 1. Resolves a legacy/raw role string to a canonical role definition.
   * Deterministic matching based on displayName, synonyms, and specializations.
   * Strictly enforces disallowedTokens to prevent collision (e.g. Director -> Eng Manager).
   */
  static resolveCanonicalRole(legacyRole: string): CanonicalRoleDef | null {
    const normalized = normalizeString(legacyRole);
    if (!normalized) return null;

    for (const role of CANONICAL_TAXONOMY) {
      // 1. Check disallowed tokens first. If any match, this role is immediately disqualified.
      const hasDisallowed = role.disallowedTokens.some(token => 
        normalized.includes(normalizeString(token))
      );
      if (hasDisallowed) {
        continue;
      }

      // 2. Exact match against ID (for when preferences already store IDs or future-proofing)
      if (normalizeString(role.id) === normalized) {
        return role;
      }

      // 3. Exact match against Display Name
      if (normalizeString(role.displayName) === normalized) {
        return role;
      }

      // 4. Exact match against synonyms
      if (role.synonyms.some(syn => normalizeString(syn) === normalized)) {
        return role;
      }

      // 5. Exact match against specializations
      if (role.specializations.some(spec => normalizeString(spec) === normalized)) {
        return role;
      }
    }

    // UNKNOWN / UNMAPPED
    return null;
  }

  /**
   * 2. Resolves a canonical role definition by its immutable ID.
   */
  static getCanonicalRoleById(id: string): CanonicalRoleDef | null {
    if (!id) return null;
    return CANONICAL_TAXONOMY.find(r => r.id === id) || null;
  }

  /**
   * 3. Determines if an ID belongs to a valid, selectable canonical role.
   */
  static isSelectableCanonicalRole(id: string): boolean {
    const role = this.getCanonicalRoleById(id);
    return role ? role.isSelectable : false;
  }

  /**
   * 4. Retrieves a legacy-compatible role representation (typically displayName)
   * from a Canonical ID, useful for backward compatibility with systems expecting strings.
   */
  static getLegacyRepresentation(id: string): string | null {
    const role = this.getCanonicalRoleById(id);
    return role ? role.displayName : null;
  }

  /**
   * 5. Resolves a canonical display name back to a Canonical Role.
   */
  static getCanonicalRoleByDisplayName(displayName: string): CanonicalRoleDef | null {
    const normalized = normalizeString(displayName);
    if (!normalized) return null;
    return CANONICAL_TAXONOMY.find(r => normalizeString(r.displayName) === normalized) || null;
  }
}
